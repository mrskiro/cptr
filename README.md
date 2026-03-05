# cptr

Screenshot tool for macOS and Chrome.

## macOS App

Hotkey-driven screenshot tool with annotation.

**Status:** In development

### Features

- Menu bar app (no Dock icon)
- Global hotkey (Cmd+Shift+2 by default, customizable via Settings)
- Drag to select region
- Preview window with annotation tools
  - Arrow, rectangle, text
  - Color picker (red, black, white, blue)
  - Fill toggle for rectangles
  - Select, move, and recolor annotations
- Undo / Redo (Cmd+Z / Cmd+Shift+Z)
- Copy to clipboard (Cmd+C)

### Tech

Swift, AppKit, ScreenCaptureKit, [KeyboardShortcuts](https://github.com/sindresorhus/KeyboardShortcuts)

### Requirements

- macOS 14+
- Xcode 16+

### Roadmap

- [ ] Code signing + notarization
- [ ] Auto-update (Sparkle)

## Chrome Extension

Hover to detect and capture DOM elements.

**Status:** In development

### Features

- Hover to highlight DOM elements
- Click to capture element
- Drag to select area
- Copy to clipboard

### Tech

WXT, Preact, TypeScript, Tailwind CSS v4

### Requirements

- Node.js 18+
- pnpm

### Roadmap

- [ ] Annotation (arrow, rectangle, text — align with macOS app)
- [ ] Right-click context menu ("Capture this element")
- [ ] Chrome Web Store publication
- [ ] Scroll capture (full-page screenshot)
- [ ] Export format options (JPEG, WebP)
