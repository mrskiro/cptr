import AppKit

final class OverlayWindow: NSWindow {
    var onSelection: ((CGRect) -> Void)?

    init() {
        guard let screen = NSScreen.main else {
            super.init(contentRect: .zero, styleMask: .borderless, backing: .buffered, defer: false)
            return
        }
        super.init(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
        level = .screenSaver
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        ignoresMouseEvents = false
        isReleasedWhenClosed = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        let overlayView = OverlayView()
        overlayView.onSelection = { [weak self] rect in
            self?.onSelection?(rect)
            self?.close()
        }
        overlayView.onCancel = { [weak self] in
            self?.close()
        }
        contentView = overlayView
    }

    override var canBecomeKey: Bool { true }
}

final class OverlayView: NSView {
    var onSelection: ((CGRect) -> Void)?
    var onCancel: (() -> Void)?

    private var dragOrigin: NSPoint?
    private var currentRect: NSRect?

    override var acceptsFirstResponder: Bool { true }

    override func resetCursorRects() {
        addCursorRect(bounds, cursor: .crosshair)
    }

    override func mouseDown(with event: NSEvent) {
        dragOrigin = convert(event.locationInWindow, from: nil)
        currentRect = nil
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
        let screenRect = CGRect(
            x: screen.frame.origin.x + rect.origin.x,
            y: screen.frame.origin.y + screen.frame.height - rect.origin.y - rect.height,
            width: rect.width,
            height: rect.height
        )
        onSelection?(screenRect)
    }

    override func keyDown(with event: NSEvent) {
        if event.keyCode == 53 { // ESC
            onCancel?()
        }
    }

    override func draw(_ dirtyRect: NSRect) {
        guard let rect = currentRect else { return }
        NSColor.white.withAlphaComponent(0.2).setFill()
        NSBezierPath(rect: rect).fill()
        NSColor.white.withAlphaComponent(0.8).setStroke()
        let border = NSBezierPath(rect: rect)
        border.lineWidth = 1
        border.stroke()
    }
}
