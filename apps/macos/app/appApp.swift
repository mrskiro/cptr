import AppKit
import Carbon
import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var hotKeyRef: EventHotKeyRef?
    private var overlayWindow: OverlayWindow?
    private var previewWindow: PreviewWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        registerHotkey()
    }

    private func registerHotkey() {
        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let handler: EventHandlerUPP = { _, _, userData -> OSStatus in
            let delegate = Unmanaged<AppDelegate>.fromOpaque(userData!).takeUnretainedValue()
            DispatchQueue.main.async { delegate.showOverlay() }
            return noErr
        }
        let selfPtr = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(GetApplicationEventTarget(), handler, 1, &eventType, selfPtr, nil)

        let hotKeyID = EventHotKeyID(signature: OSType(0x63707472), id: 1)
        let modifiers = UInt32(cmdKey | shiftKey)
        let keyCode: UInt32 = 0x13 // '2' key
        RegisterEventHotKey(keyCode, modifiers, hotKeyID, GetApplicationEventTarget(), 0, &hotKeyRef)
    }

    private func showPreview(image: NSImage) {
        let window = PreviewWindow(image: image)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        previewWindow = window
    }

    private func showOverlay() {
        overlayWindow?.close()
        let window = OverlayWindow()
        window.onSelection = { [weak self] rect in
            Task { @MainActor in
                do {
                    let image = try await CaptureService.capture(rect: rect)
                    self?.showPreview(image: image)
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
            Button("Quit") {
                NSApplication.shared.terminate(nil)
            }
            .keyboardShortcut("q")
        }
    }
}
