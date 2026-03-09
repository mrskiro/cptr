/** @jsxImportSource preact */
// eslint-disable-next-line simple-import-sort/imports -- pragma must be first
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-preact";
import { userEvent } from "vitest/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { App } from "./App";
import "./style.css";

// WXT extension API is not available in test browser
(globalThis as Record<string, unknown>).browser = fakeBrowser;

// Suppress audio in tests
vi.mock("../../sound", () => ({ playCaptureSound: vi.fn() }));

const DUMMY_DATA_URL = (() => {
  const canvas = document.createElement("canvas");
  canvas.width = 140;
  canvas.height = 200;
  return canvas.toDataURL("image/png");
})();

/**
 * Simulate drag-capture: hold mousedown 200ms+ to enter drag mode, then release.
 * Drag capture uses coordinates directly (no elementsFromPoint), avoiding
 * the SVG overlay interception issue in tests.
 */
const simulateCapture = async (container: HTMLElement) => {
  fakeBrowser.runtime.onMessage.addListener(() =>
    Promise.resolve({ dataUrl: DUMMY_DATA_URL }),
  );

  // Drag from (10,10) to (120,120) — creates a 110x110 canvas
  document.dispatchEvent(
    new MouseEvent("mousedown", { clientX: 10, clientY: 10, bubbles: true }),
  );
  // Wait for hold timer (200ms) to activate drag mode
  await new Promise((r) => setTimeout(r, 250));
  document.dispatchEvent(
    new MouseEvent("mousemove", { clientX: 120, clientY: 120, bubbles: true }),
  );
  document.dispatchEvent(
    new MouseEvent("mouseup", { clientX: 120, clientY: 120, bubbles: true }),
  );

  await vi.waitFor(() => {
    expect(container.querySelector("canvas")).not.toBeNull();
  });

  return container.querySelector("canvas")!;
};

const getToolButton = (container: HTMLElement, tool: string) =>
  container.querySelector(`[data-tool="${tool}"]`) as HTMLElement;

/** Canvas uses addEventListener with coordinates — dispatchEvent is appropriate here */
const clickCanvas = (canvas: HTMLCanvasElement, x: number, y: number) => {
  const rect = canvas.getBoundingClientRect();
  canvas.dispatchEvent(
    new MouseEvent("mousedown", { clientX: rect.left + x, clientY: rect.top + y, bubbles: true }),
  );
  document.dispatchEvent(
    new MouseEvent("mouseup", { clientX: rect.left + x, clientY: rect.top + y, bubbles: true }),
  );
};

const dragCanvas = (
  canvas: HTMLCanvasElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
) => {
  const rect = canvas.getBoundingClientRect();
  canvas.dispatchEvent(
    new MouseEvent("mousedown", {
      clientX: rect.left + from.x,
      clientY: rect.top + from.y,
      bubbles: true,
    }),
  );
  document.dispatchEvent(
    new MouseEvent("mousemove", {
      clientX: rect.left + to.x,
      clientY: rect.top + to.y,
      bubbles: true,
    }),
  );
  document.dispatchEvent(
    new MouseEvent("mouseup", {
      clientX: rect.left + to.x,
      clientY: rect.top + to.y,
      bubbles: true,
    }),
  );
};

const clickTool = async (container: HTMLElement, tool: string) => {
  await userEvent.click(getToolButton(container, tool));
};

const addTextAnnotation = async (
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  text: string,
) => {
  await clickTool(container, "text");
  clickCanvas(canvas, x, y);
  await vi.waitFor(() => {
    expect(container.querySelector("input[type='text']")).not.toBeNull();
  });
  const input = container.querySelector("input[type='text']") as HTMLInputElement;
  await userEvent.fill(input, text);
  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() => {
    expect(container.querySelector("input[type='text']")).toBeNull();
  });
};

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

describe("Annotation — Text tool", () => {
  afterEach(() => {
    document.documentElement.style.cursor = "";
    fakeBrowser.reset();
  });

  it("shows input field when clicking canvas with text tool", async () => {
    const { container } = render(<App onClose={vi.fn()} />);
    const canvas = await simulateCapture(container);

    await clickTool(container, "text");
    clickCanvas(canvas, 50, 50);

    await vi.waitFor(() => {
      expect(container.querySelector("input[type='text']")).not.toBeNull();
    });
  });

  it("adds text annotation on Enter", async () => {
    const { container } = render(<App onClose={vi.fn()} />);
    const canvas = await simulateCapture(container);

    await clickTool(container, "text");
    clickCanvas(canvas, 50, 50);
    await vi.waitFor(() => {
      expect(container.querySelector("input[type='text']")).not.toBeNull();
    });

    const input = container.querySelector("input[type='text']") as HTMLInputElement;
    await userEvent.fill(input, "Hello");
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => {
      expect(container.querySelector("input[type='text']")).toBeNull();
    });
  });

  it("cancels text input on Escape", async () => {
    const { container } = render(<App onClose={vi.fn()} />);
    const canvas = await simulateCapture(container);

    await clickTool(container, "text");
    clickCanvas(canvas, 50, 50);
    await vi.waitFor(() => {
      expect(container.querySelector("input[type='text']")).not.toBeNull();
    });

    await userEvent.keyboard("{Escape}");

    await vi.waitFor(() => {
      expect(container.querySelector("input[type='text']")).toBeNull();
    });
  });

  it("switches to select mode after confirming text", async () => {
    const { container } = render(<App onClose={vi.fn()} />);
    const canvas = await simulateCapture(container);

    await clickTool(container, "text");
    clickCanvas(canvas, 50, 50);
    await vi.waitFor(() => {
      expect(container.querySelector("input[type='text']")).not.toBeNull();
    });

    const input = container.querySelector("input[type='text']") as HTMLInputElement;
    await userEvent.fill(input, "Hello");
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => {
      expect(canvas.className).toContain("cursor-default");
    });
  });

  it("deletes selected text annotation with Delete key", async () => {
    const { container } = render(<App onClose={vi.fn()} />);
    const canvas = await simulateCapture(container);

    await addTextAnnotation(container, canvas, 50, 50, "DeleteMe");
    await userEvent.keyboard("{Delete}");

    // Verify deleted: text tool click on same spot → input appears
    await clickTool(container, "text");
    clickCanvas(canvas, 50, 50);
    await vi.waitFor(() => {
      expect(container.querySelector("input[type='text']")).not.toBeNull();
    });
  });

  it("selects text annotation by clicking on it in select mode", async () => {
    const { container } = render(<App onClose={vi.fn()} />);
    const canvas = await simulateCapture(container);

    await addTextAnnotation(container, canvas, 100, 100, "ClickMe");

    // Click elsewhere to deselect
    clickCanvas(canvas, 10, 10);

    // Click on the text annotation area
    clickCanvas(canvas, 110, 110);

    // Delete should remove it (proving it was selected)
    await userEvent.keyboard("{Delete}");

    // Verify deleted
    await clickTool(container, "text");
    clickCanvas(canvas, 100, 100);
    await vi.waitFor(() => {
      expect(container.querySelector("input[type='text']")).not.toBeNull();
    });
  });
});

describe("Annotation — Arrow tool", () => {
  afterEach(() => {
    document.documentElement.style.cursor = "";
    fakeBrowser.reset();
  });

  it("adds arrow annotation by dragging and switches to select mode", async () => {
    const { container } = render(<App onClose={vi.fn()} />);
    const canvas = await simulateCapture(container);

    await clickTool(container, "arrow"); // arrow tool
    dragCanvas(canvas, { x: 50, y: 50 }, { x: 150, y: 150 });

    await vi.waitFor(() => {
      expect(canvas.className).toContain("cursor-default");
    });
  });
});

describe("Annotation — Rect tool", () => {
  afterEach(() => {
    document.documentElement.style.cursor = "";
    fakeBrowser.reset();
  });

  it("adds rect annotation by dragging and switches to select mode", async () => {
    const { container } = render(<App onClose={vi.fn()} />);
    const canvas = await simulateCapture(container);

    await clickTool(container, "rect"); // rect tool
    dragCanvas(canvas, { x: 30, y: 30 }, { x: 130, y: 130 });

    await vi.waitFor(() => {
      expect(canvas.className).toContain("cursor-default");
    });
  });
});
