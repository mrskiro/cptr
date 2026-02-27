import SwiftUI

@main
struct appApp: App {
    var body: some Scene {
        MenuBarExtra("cptr", systemImage: "camera.viewfinder") {
            Button("Quit") {
                NSApplication.shared.terminate(nil)
            }
            .keyboardShortcut("q")
        }
    }
}
