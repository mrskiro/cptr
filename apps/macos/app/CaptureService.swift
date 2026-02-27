import AppKit
import ScreenCaptureKit

enum CaptureService {
    static func capture(rect: CGRect) async throws -> NSImage {
        let content = try await SCShareableContent.current
        guard let display = content.displays.first(where: { display in
            CGRect(x: CGFloat(display.frame.origin.x),
                   y: CGFloat(display.frame.origin.y),
                   width: CGFloat(display.width),
                   height: CGFloat(display.height)).contains(rect)
        }) ?? content.displays.first else {
            throw CaptureError.noDisplay
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()
        config.sourceRect = CGRect(
            x: rect.origin.x - display.frame.origin.x,
            y: rect.origin.y - display.frame.origin.y,
            width: rect.width,
            height: rect.height
        )
        config.width = Int(rect.width * NSScreen.main!.backingScaleFactor)
        config.height = Int(rect.height * NSScreen.main!.backingScaleFactor)
        config.showsCursor = false

        let cgImage = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
        return NSImage(cgImage: cgImage, size: NSSize(width: rect.width, height: rect.height))
    }

    enum CaptureError: Error {
        case noDisplay
    }
}
