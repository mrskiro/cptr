/** @jsxImportSource preact */
// eslint-disable-next-line simple-import-sort/imports -- pragma must be first
import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "vitest-browser-preact";
import { userEvent } from "vitest/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { App } from "./App";

describe("App", () => {
  afterEach(() => {
    document.documentElement.style.cursor = "";
    fakeBrowser.reset();
  });

  it("sets crosshair cursor on mount", () => {
    render(<App onClose={vi.fn()} />);
    expect(document.documentElement.style.cursor).toBe("crosshair");
  });

  it("calls onClose on Escape key", async () => {
    const onClose = vi.fn();
    render(<App onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose on other keys", async () => {
    const onClose = vi.fn();
    render(<App onClose={onClose} />);
    await userEvent.keyboard("{Enter}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders SVG overlay", () => {
    const screen = render(<App onClose={vi.fn()} />);
    expect(screen.container.querySelector("svg")).not.toBeNull();
  });
});
