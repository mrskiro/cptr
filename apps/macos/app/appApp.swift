import AppKit
import KeyboardShortcuts
import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var overlayWindow: OverlayWindow?
    private var previewWindow: PreviewWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        KeyboardShortcuts.onKeyUp(for: .capture) { [weak self] in
            self?.showOverlay()
        }
    }

    private func showPreview(image: NSImage, anchor: NSPoint, captureRect: CGRect) {
        let window = PreviewWindow(image: image)

        let primaryHeight = NSScreen.screens.first(where: { $0.frame.origin == .zero })?.frame.height
            ?? NSScreen.screens[0].frame.height
        let cocoaY = primaryHeight - captureRect.origin.y - captureRect.height
        let anchorOnRight = anchor.x > captureRect.origin.x + captureRect.width / 2
        let anchorOnTop = anchor.y > cocoaY + captureRect.height / 2

        let frame = window.frame
        let originX = anchorOnRight ? anchor.x - frame.width : anchor.x
        let originY = anchorOnTop ? anchor.y - frame.height : anchor.y
        window.setFrameOrigin(NSPoint(x: originX, y: originY))

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        previewWindow = window
    }

    private func showOverlay() {
        previewWindow?.close()
        previewWindow = nil
        overlayWindow?.close()
        overlayWindow = nil
        let window = OverlayWindow()
        window.onSelection = { [weak self] rect, endpoint in
            Task { @MainActor in
                do {
                    let image = try await CaptureService.capture(rect: rect)
                    self?.showPreview(image: image, anchor: endpoint, captureRect: rect)
                } catch {
                    FileHandle.standardError.write(Data("Capture failed: \(error)\n".utf8))
                }
            }
        }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        overlayWindow = window
    }
}

@main
struct appApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        MenuBarExtra("cptr", systemImage: "camera.viewfinder") {
            SettingsLink()
                .keyboardShortcut(",")
            Divider()
            Button("Quit") {
                NSApplication.shared.terminate(nil)
            }
            .keyboardShortcut("q")
        }
        Settings {
            SettingsView()
        }
    }
}
