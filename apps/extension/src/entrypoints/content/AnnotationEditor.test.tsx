/** @jsxImportSource preact */
// eslint-disable-next-line simple-import-sort/imports -- pragma must be first
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-preact";
import { userEvent } from "vitest/browser";

import { AnnotationEditor } from "./AnnotationEditor";

const DUMMY_DATA_URL = (() => {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 300;
  return canvas.toDataURL("image/png");
})();
const DUMMY_CROP_RECT = new DOMRect(0, 0, 400, 300);

const setup = async () => {
  const result = render(
    <AnnotationEditor dataUrl={DUMMY_DATA_URL} cropRect={DUMMY_CROP_RECT} onClose={vi.fn()} />,
  );
  await vi.waitFor(() => {
    expect(result.container.querySelector("canvas")).not.toBeNull();
  });
  return result;
};

const getToolButtons = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("button")).filter((b) => b.className.includes("w-7"));

/** Canvas uses addEventListener, so we dispatch mouse events directly with coordinates */
const clickCanvas = (canvas: HTMLCanvasElement, x: number, y: number) => {
  const rect = canvas.getBoundingClientRect();
  canvas.dispatchEvent(
    new MouseEvent("mousedown", { clientX: rect.left + x, clientY: rect.top + y, bubbles: true }),
  );
  document.dispatchEvent(
    new MouseEvent("mouseup", { clientX: rect.left + x, clientY: rect.top + y, bubbles: true }),
  );
};

/** Create a text annotation at (x, y) and return to select mode */
const addTextAnnotation = async (container: HTMLElement, x: number, y: number, text: string) => {
  const toolButtons = getToolButtons(container);
  await userEvent.click(toolButtons[2]); // text tool
  clickCanvas(container.querySelector("canvas")!, x, y);
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

describe("AnnotationEditor - Text tool", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows input field when clicking canvas with text tool active", async () => {
    const { container } = await setup();
    await userEvent.click(getToolButtons(container)[2]); // text tool

    const canvas = container.querySelector("canvas")!;
    clickCanvas(canvas, 50, 50);

    await vi.waitFor(() => {
      expect(container.querySelector("input[type='text']")).not.toBeNull();
    });
  });

  it("adds text annotation on Enter", async () => {
    const { container } = await setup();
    await userEvent.click(getToolButtons(container)[2]);

    clickCanvas(container.querySelector("canvas")!, 50, 50);

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
    const { container } = await setup();
    await userEvent.click(getToolButtons(container)[2]);

    clickCanvas(container.querySelector("canvas")!, 50, 50);

    await vi.waitFor(() => {
      expect(container.querySelector("input[type='text']")).not.toBeNull();
    });

    await userEvent.keyboard("{Escape}");

    await vi.waitFor(() => {
      expect(container.querySelector("input[type='text']")).toBeNull();
    });
  });

  it("switches to select mode after confirming text", async () => {
    const { container } = await setup();
    await userEvent.click(getToolButtons(container)[2]);

    clickCanvas(container.querySelector("canvas")!, 50, 50);

    await vi.waitFor(() => {
      expect(container.querySelector("input[type='text']")).not.toBeNull();
    });

    const input = container.querySelector("input[type='text']") as HTMLInputElement;
    await userEvent.fill(input, "Hello");
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => {
      const canvas = container.querySelector("canvas")!;
      expect(canvas.className).toContain("cursor-default");
    });
  });

  it("deletes auto-selected text annotation with Delete key", async () => {
    const { container } = await setup();
    // Create text at (50, 50) — auto-selected after Enter
    await addTextAnnotation(container, 50, 50, "DeleteMe");

    // Delete the auto-selected annotation
    await userEvent.keyboard("{Delete}");

    // Verify: clicking the same spot in select mode should NOT start a drag
    // (no annotation to hit). Click somewhere else first to deselect, then click on (50,50).
    const canvas = container.querySelector("canvas")!;
    clickCanvas(canvas, 200, 200); // click elsewhere to deselect
    await vi.waitFor(() => {
      // Should still be in select mode
      expect(canvas.className).toContain("cursor-default");
    });

    // Switch to text tool and click same spot — input should appear (no annotation blocking)
    await userEvent.click(getToolButtons(container)[2]);
    clickCanvas(canvas, 50, 50);
    await vi.waitFor(() => {
      expect(container.querySelector("input[type='text']")).not.toBeNull();
    });
  });

  it("selects text annotation by clicking on it in select mode", async () => {
    const { container } = await setup();
    // Create text at (100, 100)
    await addTextAnnotation(container, 100, 100, "ClickMe");

    // Click elsewhere to deselect
    const canvas = container.querySelector("canvas")!;
    clickCanvas(canvas, 10, 10);

    // Click on the text annotation (within TEXT_BOX_W=200, TEXT_BOX_H=24 from start)
    clickCanvas(canvas, 110, 110);

    // Delete should remove it (proving it was selected)
    await userEvent.keyboard("{Delete}");

    // Verify deleted: switch to text tool and click same spot — input should appear
    await userEvent.click(getToolButtons(container)[2]);
    clickCanvas(canvas, 100, 100);
    await vi.waitFor(() => {
      expect(container.querySelector("input[type='text']")).not.toBeNull();
    });
  });
});
