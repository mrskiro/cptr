import AppKit

enum AnnotationTool {
    case arrow
    case text
    case rect
}

struct Annotation {
    let tool: AnnotationTool
    var color: NSColor
    let filled: Bool
    var start: NSPoint
    var end: NSPoint
    var text: String?

    func hitTest(_ point: NSPoint, tolerance: CGFloat = 6) -> Bool {
        switch tool {
        case .arrow:
            return distanceToLine(from: start, to: end, point: point) < tolerance
        case .rect:
            let rect = NSRect(
                x: min(start.x, end.x), y: min(start.y, end.y),
                width: abs(end.x - start.x), height: abs(end.y - start.y)
            )
            return filled ? rect.contains(point) : rect.insetBy(dx: -tolerance, dy: -tolerance).contains(point) && !rect.insetBy(dx: tolerance, dy: tolerance).contains(point)
        case .text:
            let textRect = NSRect(x: start.x, y: start.y, width: 200, height: 24)
            return textRect.contains(point)
        }
    }

    private func distanceToLine(from a: NSPoint, to b: NSPoint, point p: NSPoint) -> CGFloat {
        let dx = b.x - a.x
        let dy = b.y - a.y
        let lengthSq = dx * dx + dy * dy
        guard lengthSq > 0 else { return hypot(p.x - a.x, p.y - a.y) }
        let t = max(0, min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
        let proj = NSPoint(x: a.x + t * dx, y: a.y + t * dy)
        return hypot(p.x - proj.x, p.y - proj.y)
    }
}

private enum DragMode {
    case move(origin: NSPoint)
    case resizeStart
    case resizeEnd
}

final class AnnotationView: NSView {
    var currentTool: AnnotationTool = .arrow
    var currentColor: NSColor = .red
    var rectFilled = false

    private let image: NSImage
    private var annotations: [Annotation] = []
    private var undoStack: [[Annotation]] = []
    private var redoStack: [[Annotation]] = []
    private var activeAnnotation: Annotation?
    private var activeTextField: NSTextField?
    private var activeTextColor: NSColor?
    private(set) var selectedIndex: Int?
    private var dragMode: DragMode?
    private var dragSnapshotSaved = false
    private let handleSize: CGFloat = 8

    init(image: NSImage) {
        self.image = image
        super.init(frame: .zero)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    override var isFlipped: Bool { true }

    override var acceptsFirstResponder: Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        let clipPath = NSBezierPath(roundedRect: bounds, xRadius: 8, yRadius: 8)
        clipPath.addClip()
        image.draw(in: bounds)
        for (i, annotation) in annotations.enumerated() {
            drawAnnotation(annotation)
            if i == selectedIndex {
                drawSelectionIndicator(annotation)
            }
        }
        if let active = activeAnnotation {
            drawAnnotation(active)
        }
    }

    private func drawSelectionIndicator(_ annotation: Annotation) {
        guard annotation.tool != .text else {
            let rect = NSRect(x: annotation.start.x, y: annotation.start.y, width: 200, height: 24)
            let path = NSBezierPath(rect: rect.insetBy(dx: -4, dy: -4))
            path.lineWidth = 1
            NSColor.controlAccentColor.withAlphaComponent(0.5).setStroke()
            let pattern: [CGFloat] = [4, 4]
            path.setLineDash(pattern, count: 2, phase: 0)
            path.stroke()
            return
        }
        drawHandle(at: annotation.start)
        drawHandle(at: annotation.end)
    }

    private func drawHandle(at point: NSPoint) {
        let rect = NSRect(x: point.x - handleSize / 2, y: point.y - handleSize / 2, width: handleSize, height: handleSize)
        NSColor.white.setFill()
        NSBezierPath(ovalIn: rect).fill()
        NSColor.controlAccentColor.setStroke()
        let path = NSBezierPath(ovalIn: rect)
        path.lineWidth = 1.5
        path.stroke()
    }

    private func handleHitTest(_ point: NSPoint, handle: NSPoint) -> Bool {
        hypot(point.x - handle.x, point.y - handle.y) < handleSize
    }

    private func drawAnnotation(_ annotation: Annotation) {
        switch annotation.tool {
        case .arrow:
            drawArrow(from: annotation.start, to: annotation.end, color: annotation.color)
        case .rect:
            drawRect(annotation)
        case .text:
            if let text = annotation.text {
                drawText(text, at: annotation.start, color: annotation.color)
            }
        }
    }

    private func drawArrow(from start: NSPoint, to end: NSPoint, color: NSColor) {
        let path = NSBezierPath()
        path.move(to: start)
        path.line(to: end)
        path.lineWidth = 2
        color.setStroke()
        path.stroke()

        let angle = atan2(end.y - start.y, end.x - start.x)
        let headLength: CGFloat = 12
        let headAngle: CGFloat = .pi / 6

        let head = NSBezierPath()
        head.move(to: end)
        head.line(to: NSPoint(x: end.x - headLength * cos(angle - headAngle), y: end.y - headLength * sin(angle - headAngle)))
        head.line(to: NSPoint(x: end.x - headLength * cos(angle + headAngle), y: end.y - headLength * sin(angle + headAngle)))
        head.close()
        color.setFill()
        head.fill()
    }

    private func drawRect(_ annotation: Annotation) {
        let rect = rectFromPoints(annotation.start, annotation.end)
        let path = NSBezierPath(rect: rect)
        if annotation.filled {
            annotation.color.setFill()
            path.fill()
        } else {
            path.lineWidth = 2
            annotation.color.setStroke()
            path.stroke()
        }
    }

    private func drawText(_ text: String, at point: NSPoint, color: NSColor) {
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 16, weight: .medium),
            .foregroundColor: color,
        ]
        (text as NSString).draw(at: point, withAttributes: attrs)
    }

    private func rectFromPoints(_ a: NSPoint, _ b: NSPoint) -> NSRect {
        NSRect(
            x: min(a.x, b.x),
            y: min(a.y, b.y),
            width: abs(b.x - a.x),
            height: abs(b.y - a.y)
        )
    }

    // MARK: - Undo/Redo

    private func saveSnapshot() {
        undoStack.append(annotations)
        if undoStack.count > 50 { undoStack.removeFirst() }
        redoStack.removeAll()
    }

    func undo() {
        guard let snapshot = undoStack.popLast() else { return }
        redoStack.append(annotations)
        annotations = snapshot
        selectedIndex = nil
        needsDisplay = true
    }

    func redo() {
        guard let snapshot = redoStack.popLast() else { return }
        undoStack.append(annotations)
        annotations = snapshot
        selectedIndex = nil
        needsDisplay = true
    }

    // MARK: - Mouse events

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)

        // Check resize handles on selected annotation first
        if let i = selectedIndex, annotations[i].tool != .text {
            if handleHitTest(point, handle: annotations[i].start) {
                dragSnapshotSaved = false
                dragMode = .resizeStart
                needsDisplay = true
                return
            }
            if handleHitTest(point, handle: annotations[i].end) {
                dragSnapshotSaved = false
                dragMode = .resizeEnd
                needsDisplay = true
                return
            }
        }

        // Hit test existing annotations (reverse order = topmost first)
        for i in annotations.indices.reversed() {
            if annotations[i].hitTest(point) {
                dragSnapshotSaved = false
                selectedIndex = i
                dragMode = .move(origin: point)
                needsDisplay = true
                return
            }
        }
        selectedIndex = nil
        dragMode = nil

        if currentTool == .text {
            commitTextField()
            let textField = NSTextField(frame: NSRect(x: point.x, y: point.y, width: 200, height: 24))
            textField.isBordered = false
            textField.drawsBackground = false
            textField.font = .systemFont(ofSize: 16, weight: .medium)
            textField.textColor = currentColor
            textField.focusRingType = .none
            textField.target = self
            textField.action = #selector(textFieldDidEndEditing)
            addSubview(textField)
            window?.makeFirstResponder(textField)
            activeTextField = textField
            activeTextColor = currentColor
            return
        }

        activeAnnotation = Annotation(
            tool: currentTool, color: currentColor, filled: rectFilled,
            start: point, end: point
        )
    }

    override func mouseDragged(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)

        if let i = selectedIndex, let mode = dragMode {
            if !dragSnapshotSaved {
                saveSnapshot()
                dragSnapshotSaved = true
            }
            switch mode {
            case .move(let origin):
                let dx = point.x - origin.x
                let dy = point.y - origin.y
                annotations[i].start.x += dx
                annotations[i].start.y += dy
                annotations[i].end.x += dx
                annotations[i].end.y += dy
                dragMode = .move(origin: point)
            case .resizeStart:
                annotations[i].start = point
            case .resizeEnd:
                annotations[i].end = point
            }
            needsDisplay = true
            return
        }

        guard activeAnnotation != nil else { return }
        activeAnnotation?.end = point
        needsDisplay = true
    }

    override func mouseUp(with event: NSEvent) {
        if selectedIndex != nil {
            dragMode = nil
            needsDisplay = true
            return
        }
        guard var annotation = activeAnnotation else { return }
        annotation.end = convert(event.locationInWindow, from: nil)
        saveSnapshot()
        annotations.append(annotation)
        activeAnnotation = nil
        needsDisplay = true
    }

    @objc private func textFieldDidEndEditing() {
        commitTextField()
    }

    private func commitTextField() {
        guard let textField = activeTextField, !textField.stringValue.isEmpty else {
            activeTextField?.removeFromSuperview()
            activeTextField = nil
            return
        }
        saveSnapshot()
        annotations.append(Annotation(
            tool: .text, color: activeTextColor ?? currentColor, filled: false,
            start: textField.frame.origin, end: textField.frame.origin, text: textField.stringValue
        ))
        textField.removeFromSuperview()
        activeTextField = nil
        activeTextColor = nil
        needsDisplay = true
    }

    override func keyDown(with event: NSEvent) {
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        if flags == .command, event.charactersIgnoringModifiers == "z" {
            undo()
            return
        }
        if flags == [.command, .shift], event.charactersIgnoringModifiers?.lowercased() == "z" {
            redo()
            return
        }
        if event.keyCode == 51 || event.keyCode == 117 {
            deleteSelected()
            return
        }
        super.keyDown(with: event)
    }

    func deleteSelected() {
        guard let i = selectedIndex else { return }
        saveSnapshot()
        annotations.remove(at: i)
        selectedIndex = nil
        needsDisplay = true
    }

    func updateSelectedColor(_ color: NSColor) {
        guard let i = selectedIndex else { return }
        saveSnapshot()
        annotations[i].color = color
        needsDisplay = true
    }

    // MARK: - Render

    func renderToImage() -> NSImage {
        let size = image.size
        let rendered = NSImage(size: size)
        rendered.lockFocus()
        image.draw(in: NSRect(origin: .zero, size: size))

        let scaleX = size.width / bounds.width
        let scaleY = size.height / bounds.height

        // AnnotationView is flipped (Y: top→bottom) but lockFocus context is not (Y: bottom→top)
        let flipY = { (p: NSPoint) -> NSPoint in
            NSPoint(x: p.x * scaleX, y: size.height - p.y * scaleY)
        }

        for annotation in annotations {
            var start = flipY(annotation.start)
            let end = flipY(annotation.end)
            // Text baseline correction: in non-flipped context, text draws upward from point
            if annotation.tool == .text {
                let fontSize: CGFloat = 16
                start.y -= fontSize * scaleY
            }
            let scaled = Annotation(
                tool: annotation.tool, color: annotation.color, filled: annotation.filled,
                start: start,
                end: end,
                text: annotation.text
            )
            drawAnnotation(scaled)
        }
        rendered.unlockFocus()
        return rendered
    }
}
