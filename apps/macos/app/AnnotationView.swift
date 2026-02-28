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

final class AnnotationView: NSView {
    var currentTool: AnnotationTool = .arrow
    var currentColor: NSColor = .red
    var rectFilled = false

    private let image: NSImage
    private var annotations: [Annotation] = []
    private var activeAnnotation: Annotation?
    private var activeTextField: NSTextField?
    private(set) var selectedIndex: Int?
    private var dragOffset: NSPoint?

    init(image: NSImage) {
        self.image = image
        super.init(frame: .zero)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    override var isFlipped: Bool { true }

    override var acceptsFirstResponder: Bool { true }

    override func draw(_ dirtyRect: NSRect) {
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
        let rect: NSRect
        switch annotation.tool {
        case .arrow:
            rect = NSRect(
                x: min(annotation.start.x, annotation.end.x),
                y: min(annotation.start.y, annotation.end.y),
                width: abs(annotation.end.x - annotation.start.x),
                height: abs(annotation.end.y - annotation.start.y)
            )
        case .rect:
            rect = rectFromPoints(annotation.start, annotation.end)
        case .text:
            rect = NSRect(x: annotation.start.x, y: annotation.start.y, width: 200, height: 24)
        }
        let path = NSBezierPath(rect: rect.insetBy(dx: -4, dy: -4))
        path.lineWidth = 1
        NSColor.controlAccentColor.withAlphaComponent(0.5).setStroke()
        let pattern: [CGFloat] = [4, 4]
        path.setLineDash(pattern, count: 2, phase: 0)
        path.stroke()
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

    // MARK: - Mouse events

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)

        // Hit test existing annotations (reverse order = topmost first)
        for i in annotations.indices.reversed() {
            if annotations[i].hitTest(point) {
                selectedIndex = i
                dragOffset = point
                needsDisplay = true
                return
            }
        }
        selectedIndex = nil
        dragOffset = nil

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
            return
        }

        activeAnnotation = Annotation(
            tool: currentTool, color: currentColor, filled: rectFilled,
            start: point, end: point
        )
    }

    override func mouseDragged(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)

        if let i = selectedIndex, let origin = dragOffset {
            let dx = point.x - origin.x
            let dy = point.y - origin.y
            annotations[i].start.x += dx
            annotations[i].start.y += dy
            annotations[i].end.x += dx
            annotations[i].end.y += dy
            dragOffset = point
            needsDisplay = true
            return
        }

        guard activeAnnotation != nil else { return }
        activeAnnotation?.end = point
        needsDisplay = true
    }

    override func mouseUp(with event: NSEvent) {
        if selectedIndex != nil {
            dragOffset = nil
            return
        }
        guard var annotation = activeAnnotation else { return }
        annotation.end = convert(event.locationInWindow, from: nil)
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
        annotations.append(Annotation(
            tool: .text, color: currentColor, filled: false,
            start: textField.frame.origin, end: textField.frame.origin, text: textField.stringValue
        ))
        textField.removeFromSuperview()
        activeTextField = nil
        needsDisplay = true
    }

    func updateSelectedColor(_ color: NSColor) {
        guard let i = selectedIndex else { return }
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
            let scaled = Annotation(
                tool: annotation.tool, color: annotation.color, filled: annotation.filled,
                start: flipY(annotation.start),
                end: flipY(annotation.end),
                text: annotation.text
            )
            drawAnnotation(scaled)
        }
        rendered.unlockFocus()
        return rendered
    }
}
