import AppKit

final class PreviewWindow: NSWindow {
    private let image: NSImage
    private let annotationView: AnnotationView
    private var fillButton: NSButton!
    private var toolButtons: [NSButton] = []

    init(image: NSImage) {
        self.image = image
        self.annotationView = AnnotationView(image: image)

        let maxWidth: CGFloat = 320
        let maxHeight: CGFloat = 220
        let scale = min(1.0, min(maxWidth / image.size.width, maxHeight / image.size.height))
        let previewWidth = image.size.width * scale
        let previewHeight = image.size.height * scale
        let padding: CGFloat = 12
        let toolbarHeight: CGFloat = 40
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: previewWidth + padding * 2, height: previewHeight + padding * 2 + toolbarHeight),
            styleMask: [.titled, .closable, .resizable],
            backing: .buffered,
            defer: false
        )
        title = "cptr"
        isReleasedWhenClosed = false

        let imageContainer = NSView()
        annotationView.translatesAutoresizingMaskIntoConstraints = false
        imageContainer.addSubview(annotationView)
        NSLayoutConstraint.activate([
            annotationView.topAnchor.constraint(equalTo: imageContainer.topAnchor, constant: padding),
            annotationView.bottomAnchor.constraint(equalTo: imageContainer.bottomAnchor, constant: -padding),
            annotationView.leadingAnchor.constraint(equalTo: imageContainer.leadingAnchor, constant: padding),
            annotationView.trailingAnchor.constraint(equalTo: imageContainer.trailingAnchor, constant: -padding),
        ])

        let toolbar = makeToolbar()
        let container = NSStackView(views: [imageContainer, toolbar])
        container.orientation = .vertical
        container.spacing = 0
        contentView = container

        updateToolSelection()
    }

    private func makeToolbar() -> NSView {
        let bg = NSView()
        bg.wantsLayer = true
        bg.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor

        let arrowBtn = makeToolButton(symbol: "arrow.up.right", tag: 0, action: #selector(selectTool(_:)), tooltip: "Arrow")
        let rectBtn = makeToolButton(symbol: "rectangle", tag: 1, action: #selector(selectTool(_:)), tooltip: "Rectangle")
        let textBtn = makeToolButton(symbol: "textformat", tag: 2, action: #selector(selectTool(_:)), tooltip: "Text")
        toolButtons = [arrowBtn, rectBtn, textBtn]

        fillButton = makeToggleButton(symbol: "rectangle.fill", action: #selector(toggleFill), tooltip: "Fill")

        let tools = NSStackView(views: [arrowBtn, rectBtn, textBtn, makeSeparator(), fillButton])
        tools.orientation = .horizontal
        tools.spacing = 2

        let redBtn = makeColorButton(color: .systemRed, tag: 0, action: #selector(selectColor(_:)))
        let blackBtn = makeColorButton(color: .black, tag: 1, action: #selector(selectColor(_:)))
        let whiteBtn = makeColorButton(color: .white, tag: 2, action: #selector(selectColor(_:)))
        let blueBtn = makeColorButton(color: .systemBlue, tag: 3, action: #selector(selectColor(_:)))

        let colors = NSStackView(views: [redBtn, blackBtn, whiteBtn, blueBtn])
        colors.orientation = .horizontal
        colors.spacing = 4

        let copyBtn = NSButton(image: NSImage(systemSymbolName: "doc.on.doc", accessibilityDescription: "Copy")!, target: self, action: #selector(onCopy))
        copyBtn.bezelStyle = .toolbar
        copyBtn.isBordered = false
        copyBtn.toolTip = "Copy (⌘C)"

        let spacer = NSView()
        spacer.setContentHuggingPriority(.defaultLow, for: .horizontal)

        let bar = NSStackView(views: [tools, makeSeparator(), colors, spacer, copyBtn])
        bar.orientation = .horizontal
        bar.spacing = 8
        bar.edgeInsets = NSEdgeInsets(top: 6, left: 8, bottom: 6, right: 8)

        bar.translatesAutoresizingMaskIntoConstraints = false
        bg.addSubview(bar)
        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo: bg.topAnchor),
            bar.bottomAnchor.constraint(equalTo: bg.bottomAnchor),
            bar.leadingAnchor.constraint(equalTo: bg.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: bg.trailingAnchor),
        ])
        return bg
    }

    private func makeToolButton(symbol: String, tag: Int, action: Selector, tooltip: String) -> NSButton {
        let btn = NSButton(image: NSImage(systemSymbolName: symbol, accessibilityDescription: tooltip)!, target: self, action: action)
        btn.bezelStyle = .toolbar
        btn.isBordered = false
        btn.tag = tag
        btn.toolTip = tooltip
        btn.widthAnchor.constraint(equalToConstant: 28).isActive = true
        btn.heightAnchor.constraint(equalToConstant: 28).isActive = true
        return btn
    }

    private func makeToggleButton(symbol: String, action: Selector, tooltip: String) -> NSButton {
        let btn = NSButton(image: NSImage(systemSymbolName: symbol, accessibilityDescription: tooltip)!, target: self, action: action)
        btn.bezelStyle = .toolbar
        btn.isBordered = false
        btn.toolTip = tooltip
        btn.setButtonType(.toggle)
        btn.widthAnchor.constraint(equalToConstant: 28).isActive = true
        btn.heightAnchor.constraint(equalToConstant: 28).isActive = true
        return btn
    }

    private func makeColorButton(color: NSColor, tag: Int, action: Selector) -> NSButton {
        let btn = NSButton(frame: .zero)
        btn.wantsLayer = true
        btn.layer?.backgroundColor = color.cgColor
        btn.layer?.cornerRadius = 10
        btn.layer?.borderWidth = color == .white ? 1 : 0
        btn.layer?.borderColor = NSColor.separatorColor.cgColor
        btn.isBordered = false
        btn.title = ""
        btn.tag = tag
        btn.target = self
        btn.action = action
        btn.widthAnchor.constraint(equalToConstant: 20).isActive = true
        btn.heightAnchor.constraint(equalToConstant: 20).isActive = true
        return btn
    }

    private func makeSeparator() -> NSView {
        let sep = NSView()
        sep.wantsLayer = true
        sep.layer?.backgroundColor = NSColor.separatorColor.cgColor
        sep.widthAnchor.constraint(equalToConstant: 1).isActive = true
        sep.heightAnchor.constraint(equalToConstant: 20).isActive = true
        return sep
    }

    private func updateToolSelection() {
        let tools: [AnnotationTool] = [.arrow, .rect, .text]
        for (i, btn) in toolButtons.enumerated() {
            btn.contentTintColor = annotationView.currentTool == tools[i] ? .controlAccentColor : .secondaryLabelColor
        }
        fillButton.isHidden = annotationView.currentTool != .rect
    }

    // MARK: - Actions

    @objc private func selectTool(_ sender: NSButton) {
        let tools: [AnnotationTool] = [.arrow, .rect, .text]
        annotationView.currentTool = tools[sender.tag]
        updateToolSelection()
    }

    @objc private func toggleFill(_ sender: NSButton) {
        annotationView.rectFilled = sender.state == .on
    }

    private static let colors: [NSColor] = [.systemRed, .black, .white, .systemBlue]

    @objc private func selectColor(_ sender: NSButton) {
        let color = Self.colors[sender.tag]
        annotationView.currentColor = color
        annotationView.updateSelectedColor(color)
    }

    @objc private func onCopy() {
        copyToClipboard()
    }

    // MARK: - Keyboard

    override func keyDown(with event: NSEvent) {
        if event.keyCode == 53 {
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

    private func copyToClipboard() {
        let rendered = annotationView.renderToImage()
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.writeObjects([rendered])
        close()
    }
}
