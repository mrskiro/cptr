import KeyboardShortcuts
import SwiftUI

extension KeyboardShortcuts.Name {
    static let capture = Self("capture", default: .init(.two, modifiers: [.command, .shift]))
}

struct SettingsView: View {
    var body: some View {
        Form {
            KeyboardShortcuts.Recorder("Capture Shortcut:", name: .capture)
        }
        .padding()
        .onAppear {
            NSApp.activate(ignoringOtherApps: true)
        }
    }
}
