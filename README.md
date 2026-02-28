# cptr

Screenshot tool for macOS and Chrome.

## macOS App

Hotkey-driven screenshot tool with annotation.

**Status:** In development

### Features

- Menu bar app (no Dock icon)
- Global hotkey (Cmd+Shift+2) to start capture
- Drag to select region
- Preview window with annotation tools
  - Arrow, rectangle, text
  - Color picker (red, black, white, blue)
  - Fill toggle for rectangles
  - Select, move, and recolor annotations
- Copy to clipboard (Cmd+C)

### Tech

Swift, AppKit, ScreenCaptureKit, Carbon API

### Requirements

- macOS 14+
- Xcode 16+

### Roadmap

- [ ] Undo (Cmd+Z)
- [ ] Customizable hotkey
- [ ] Window / fullscreen capture
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
