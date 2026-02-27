/** @jsxImportSource preact */
import { render } from "preact";

import { App } from "./App";
import "./style.css";

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: "cptr-overlay",
      position: "inline",
      anchor: "body",
      onMount: (container) => {
        render(<App onClose={() => ui.remove()} />, container);
        return container;
      },
      onRemove: (container) => {
        if (container) render(null, container);
      },
    });

    browser.runtime.onMessage.addListener((message) => {
      if (message.type !== "toggle-capture") return;
      if (ui.mounted) {
        ui.remove();
      } else {
        ui.mount();
      }
    });

    ctx.onInvalidated(() => {
      if (ui.mounted) ui.remove();
    });
  },
});
