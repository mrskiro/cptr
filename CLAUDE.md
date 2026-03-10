# cptr

## Commands

```bash
pnpm dev                       # Start all apps via Turbo
pnpm -F @cptr/extension dev    # Start extension only
pnpm build                     # Build all apps
pnpm check-types               # Type check
pnpm lint                      # oxlint (--deny-warnings)
pnpm lint:fix                  # oxlint fix + oxfmt
pnpm format                    # oxfmt
pnpm format:check              # oxfmt --check
xcodebuild -project apps/macos/app.xcodeproj -scheme app build  # macOS app
```

## WXT Gotchas

- Shadow Root UI requires `cssInjectionMode: "ui"` to inject CSS into shadow DOM
- `createShadowRootUi` returns `{ shadowHost, uiContainer, shadow }` — no `wrapper` property
- Non-entrypoint files must NOT be in `entrypoints/` — WXT treats all files there as entry points and requires a default export
- WxtVitest plugin (`WxtVitest()`) is incompatible with browser mode — use `wxt/testing/fake-browser` directly
- `/** @jsxImportSource preact */` pragma must stay on line 1 — oxfmt import sorting can reorder it below imports, breaking JSX types

## Content Script Design

- Mount/unmount via `ui.mount()` / `ui.remove()` controls component lifecycle — do not use internal state to toggle visibility
- Overlay click-to-close belongs on the JSX element's `onClick`, not in a global document click handler

## macOS App

- ScreenCaptureKit: sourceRect + width/height causes blurry output due to internal scaling. Capture full display, then crop via CGImage.cropping(to:)
