import AppKit
import ScreenCaptureKit

enum CaptureService {
    static func capture(rect: CGRect) async throws -> NSImage {
        let content = try await SCShareableContent.current
        guard let display = content.displays.first(where: { display in
            display.frame.intersects(rect)
        }) ?? content.displays.first else {
            throw CaptureError.noDisplay
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()
        config.width = display.width
        config.height = display.height
        config.showsCursor = false

        let fullImage = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)

        let displayScale = CGFloat(display.width) / display.frame.width
        let cropRect = CGRect(
            x: (rect.origin.x - display.frame.origin.x) * displayScale,
            y: (rect.origin.y - display.frame.origin.y) * displayScale,
            width: rect.width * displayScale,
            height: rect.height * displayScale
        )

        guard let cropped = fullImage.cropping(to: cropRect) else {
            throw CaptureError.captureFailed
        }
        return NSImage(cgImage: cropped, size: NSSize(width: rect.width, height: rect.height))
    }

    enum CaptureError: Error {
        case noDisplay
        case captureFailed
    }
}
