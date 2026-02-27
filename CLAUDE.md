# cptr

Arc-like screenshot tool (OSS). Hover to auto-detect DOM elements, highlight, and capture per-node.

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
```

## Architecture

- Monorepo: pnpm workspace + Turbo
- `apps/extension` — Chrome extension (WXT + Preact + Tailwind CSS v4)
  - Popup: React 19
  - Content Script: Preact (lightweight, ~10KB overhead)

## Tech Stack

- WXT 0.20.18 (Vite-based Chrome extension framework)
- Preact (content script), React 19 (popup), TypeScript, Tailwind CSS v4
- oxlint + oxfmt
- pnpm

## WXT

- Entrypoints live under `entrypoints/`. File naming conventions auto-generate manifest.json
- Vite plugins go in `wxt.config.ts` `vite` option
- Manifest settings go in `wxt.config.ts` `manifest`
- Content Script UI has 3 modes: Integrated (no isolation), Shadow Root (style isolation), IFrame (full isolation)
- Shadow Root UI requires `cssInjectionMode: "ui"` to inject CSS into shadow DOM
- `createShadowRootUi` returns `{ shadowHost, uiContainer, shadow }` — no `wrapper` property

## Content Script Design

- Mount/unmount via `ui.mount()` / `ui.remove()` controls component lifecycle — do not use internal state to toggle visibility
- Use `useEffect` for DOM event subscribe/unsubscribe — cleanup handles removal on unmount
- Use `AbortController` with `addEventListener` signal option to group related listeners and abort them together when no longer needed
- Overlay click-to-close belongs on the JSX element's `onClick`, not in a global document click handler
- SVG overlay cutout uses `fill-rule="evenodd"` (same technique as Driver.js/Shepherd.js)

## oxfmt

- v0.35.0 renamed settings: `experimentalSortImports` → `sortImports`, `experimentalSortPackageJson` → `sortPackageJson`
- Group names: `type-import`, `value-builtin`, `value-external`, `type-internal`, `value-internal`, etc.
