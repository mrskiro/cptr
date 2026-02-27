# cptr

Arc風のスクリーンショットツール（OSS）。ホバーでDOM要素を自動検出・ハイライトし、ノード単位でキャプチャ。

## コマンド

```bash
pnpm dev                       # Turbo経由で全apps起動
pnpm -F @cptr/extension dev    # 拡張のみ起動
pnpm build                     # 全appsビルド
pnpm check-types               # 型チェック
pnpm lint                      # oxlint (--deny-warnings)
pnpm lint:fix                  # oxlint fix + oxfmt
pnpm format                    # oxfmt
pnpm format:check              # oxfmt --check
```

## アーキテクチャ

- monorepo: pnpm workspace + Turbo
- `apps/extension` — Chrome拡張（WXT + React + Tailwind CSS v4）

## 技術スタック

- WXT 0.20.18（Viteベース Chrome拡張フレームワーク）
- React 19, TypeScript, Tailwind CSS v4
- oxlint + oxfmt
- pnpm

## WXT

- entrypointsは`entrypoints/`配下。ファイル名規約でmanifest.jsonが自動生成される
- Viteプラグインは`wxt.config.ts`の`vite`オプションで追加
- manifest設定は`wxt.config.ts`の`manifest`で定義
- Content Script UIは3方式: Integrated（隔離なし）、Shadow Root（スタイル隔離）、IFrame（完全隔離）
- Shadow Root UIでは`cssInjectionMode: "ui"`を設定してCSSを隔離する

## Content Script開発の注意点

- `document.elementFromPoint()`はオーバーレイ要素も返す（`pointer-events: none`でも）。取得前にオーバーレイをdisplay:noneにして回避
- オーバーレイくり抜きはSVG path + `fill-rule="evenodd"`で実装（Driver.js/Shepherd.jsと同じ手法）。clip-pathやbox-shadowは非推奨

## oxfmt

- v0.35.0で設定名が変更: `experimentalSortImports` → `sortImports`, `experimentalSortPackageJson` → `sortPackageJson`
- グループ名: `type-import`, `value-builtin`, `value-external`, `type-internal`, `value-internal` 等
