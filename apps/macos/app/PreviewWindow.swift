import AppKit

final class PreviewWindow: NSWindow {
    private let image: NSImage

    init(image: NSImage) {
        self.image = image
        let size = image.size
        let toolbarHeight: CGFloat = 40
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: size.width, height: size.height + toolbarHeight),
            styleMask: [.titled, .closable, .resizable],
            backing: .buffered,
            defer: false
        )
        title = "cptr"
        isReleasedWhenClosed = false
        center()

        let imageView = NSImageView(image: image)
        imageView.imageScaling = .scaleProportionallyUpOrDown

        let copyButton = NSButton(title: "Copy", target: self, action: #selector(onCopy))
        copyButton.bezelStyle = .toolbar

        let toolbar = NSStackView(views: [copyButton])
        toolbar.orientation = .horizontal
        toolbar.edgeInsets = NSEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)

        let container = NSStackView(views: [imageView, toolbar])
        container.orientation = .vertical
        container.spacing = 0
        contentView = container
    }

    override func keyDown(with event: NSEvent) {
        if event.keyCode == 53 { // ESC
            close()
            return
        }
        if event.modifierFlags.contains(.command), event.charactersIgnoringModifiers == "c" {
            copyToClipboard()
            return
        }
        super.keyDown(with: event)
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }

    @objc private func onCopy() {
        copyToClipboard()
    }

    private func copyToClipboard() {
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.writeObjects([image])
    }
}
