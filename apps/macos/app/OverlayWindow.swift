import AppKit

final class OverlayWindow: NSWindow {
    var onSelection: ((CGRect, NSPoint) -> Void)?
    var onCancel: (() -> Void)?

    init() {
        let mouseLocation = NSEvent.mouseLocation
        let screen = NSScreen.screens.first(where: { $0.frame.contains(mouseLocation) }) ?? NSScreen.main
        guard let screen else {
            fatalError("No screen available")
        }
        super.init(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
        level = .screenSaver
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        ignoresMouseEvents = false
        isReleasedWhenClosed = false
        acceptsMouseMovedEvents = true
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        let overlayView = OverlayView()
        overlayView.onSelection = { [weak self] rect, endpoint in
            self?.onSelection?(rect, endpoint)
        }
        overlayView.onCancel = { [weak self] in
            self?.onCancel?()
        }
        contentView = overlayView
    }

    override var canBecomeKey: Bool { true }

    override func close() {
        if let view = contentView {
            for area in view.trackingAreas { view.removeTrackingArea(area) }
            view.discardCursorRects()
        }
        super.close()
    }
}

final class OverlayView: NSView {
    var onSelection: ((CGRect, NSPoint) -> Void)?
    var onCancel: (() -> Void)?

    private var dragOrigin: NSPoint?
    private var currentRect: NSRect?
    private var mousePosition: NSPoint?

    override var acceptsFirstResponder: Bool { true }

    override func resetCursorRects() {
        addCursorRect(bounds, cursor: .crosshair)
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas { removeTrackingArea(area) }
        addTrackingArea(NSTrackingArea(
            rect: bounds,
            options: [.activeAlways, .mouseMoved, .inVisibleRect],
            owner: self
        ))
    }

    override func mouseMoved(with event: NSEvent) {
        mousePosition = convert(event.locationInWindow, from: nil)
        needsDisplay = true
    }

    override func mouseDown(with event: NSEvent) {
        dragOrigin = convert(event.locationInWindow, from: nil)
        currentRect = nil
        mousePosition = nil
        needsDisplay = true
    }

    override func mouseDragged(with event: NSEvent) {
        guard let origin = dragOrigin else { return }
        let current = convert(event.locationInWindow, from: nil)
        currentRect = NSRect(
            x: min(origin.x, current.x),
            y: min(origin.y, current.y),
            width: abs(current.x - origin.x),
            height: abs(current.y - origin.y)
        )
        needsDisplay = true
    }

    override func mouseUp(with event: NSEvent) {
        guard let rect = currentRect, rect.width > 1, rect.height > 1 else {
            onCancel?()
            return
        }
        guard let screen = window?.screen else { return }
        let current = convert(event.locationInWindow, from: nil)
        let screenRect = CGRect(
            x: screen.frame.origin.x + rect.origin.x,
            y: screen.frame.origin.y + screen.frame.height - rect.origin.y - rect.height,
            width: rect.width,
            height: rect.height
        )
        let endpoint = NSPoint(
            x: screen.frame.origin.x + current.x,
            y: screen.frame.origin.y + current.y
        )
        onSelection?(screenRect, endpoint)
    }

    override func keyDown(with event: NSEvent) {
        if event.keyCode == 53 { // ESC
            onCancel?()
        }
    }

    override func draw(_ dirtyRect: NSRect) {
        if let pos = mousePosition {
            NSColor.white.withAlphaComponent(0.6).setStroke()
            let horizontal = NSBezierPath()
            horizontal.move(to: NSPoint(x: 0, y: pos.y))
            horizontal.line(to: NSPoint(x: bounds.width, y: pos.y))
            horizontal.lineWidth = 1
            horizontal.stroke()

            let vertical = NSBezierPath()
            vertical.move(to: NSPoint(x: pos.x, y: 0))
            vertical.line(to: NSPoint(x: pos.x, y: bounds.height))
            vertical.lineWidth = 1
            vertical.stroke()
        }

        if let rect = currentRect {
            NSColor.black.withAlphaComponent(0.2).setFill()
            NSBezierPath(rect: rect).fill()
            NSColor.white.withAlphaComponent(0.8).setStroke()
            let border = NSBezierPath(rect: rect)
            border.lineWidth = 1
            border.stroke()
        }
    }
}
