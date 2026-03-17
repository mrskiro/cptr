/** @jsxImportSource preact */
// eslint-disable-next-line simple-import-sort/imports -- pragma must be first
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-preact";
import { userEvent } from "vitest/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { App, hitTestAnnotation } from "./App";
import "./style.css";

// WXT extension API is not available in test browser
(globalThis as Record<string, unknown>).browser = fakeBrowser;

// Suppress audio in tests
vi.mock("../../sound", () => ({ playCaptureSound: vi.fn() }));

const DUMMY_DATA_URL = (() => {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 400;
  return canvas.toDataURL("image/png");
})();

const simulateCapture = async (screen: ReturnType<typeof render>) => {
  fakeBrowser.runtime.onMessage.addListener(() => Promise.resolve({ dataUrl: DUMMY_DATA_URL }));

  document.dispatchEvent(new MouseEvent("mousedown", { clientX: 10, clientY: 10, bubbles: true }));
  await new Promise((r) => setTimeout(r, 250));
  document.dispatchEvent(
    new MouseEvent("mousemove", { clientX: 350, clientY: 350, bubbles: true }),
  );
  document.dispatchEvent(new MouseEvent("mouseup", { clientX: 350, clientY: 350, bubbles: true }));

  await expect.element(screen.getByRole("img", { name: "Annotation editor" })).toBeVisible();
};

// Yield to Preact's microtask re-render between synthetic dispatchEvent calls.
// Real browser events are dispatched as separate macrotasks (with microtask flushes in between),
// but dispatchEvent is synchronous — state updates are not applied before the next call.
// Used only for simulateDrag (no coordinate-based drag API in vitest-browser).
const flush = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

const simulateClick = async (container: HTMLElement, x: number, y: number) => {
  const area = container.querySelector(
    "[role='img'][aria-label='Annotation editor']",
  ) as HTMLElement;
  await userEvent.click(area, { position: { x, y } });
};

const simulateDrag = async (
  container: HTMLElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
) => {
  const area = container.querySelector(
    "[role='img'][aria-label='Annotation editor']",
  ) as HTMLElement;
  const rect = area.getBoundingClientRect();
  const fromX = rect.left + from.x;
  const fromY = rect.top + from.y;
  area.dispatchEvent(
    new MouseEvent("mousedown", { clientX: fromX, clientY: fromY, bubbles: true }),
  );
  await flush();
  await flush();
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
  await flush();
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

  it("renders overlay", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await expect.element(screen.getByLabelText("Screen overlay")).toBeVisible();
  });
});

describe("Text tool", () => {
  afterEach(() => {
    document.documentElement.style.cursor = "";
    fakeBrowser.reset();
  });

  it("shows input field when clicking area", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "text" }).element());
    await simulateClick(screen.container, 50, 50);

    await expect.element(screen.getByRole("textbox")).toBeVisible();
  });

  it("adds text annotation on Enter", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    expect(screen.container.querySelector("text")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "text" }).element());
    await simulateClick(screen.container, 50, 50);
    await expect.element(screen.getByRole("textbox")).toBeVisible();

    await userEvent.fill(screen.getByRole("textbox").element(), "Hello");
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => {
      expect(screen.container.querySelector("text")?.textContent).toBe("Hello");
    });
  });

  it("cancels text input on Escape", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "text" }).element());
    await simulateClick(screen.container, 50, 50);
    await expect.element(screen.getByRole("textbox")).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByRole("textbox")).not.toBeInTheDocument();
  });

  it("switches to select mode after confirming text", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "text" }).element());
    await simulateClick(screen.container, 50, 50);
    await expect.element(screen.getByRole("textbox")).toBeVisible();

    await userEvent.fill(screen.getByRole("textbox").element(), "Hello");
    await userEvent.keyboard("{Enter}");

    await expect
      .element(screen.getByRole("button", { name: "select", pressed: true }))
      .toBeVisible();
  });

  it("does not add annotation for empty text", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "text" }).element());
    await simulateClick(screen.container, 50, 50);
    await expect.element(screen.getByRole("textbox")).toBeVisible();

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByRole("textbox")).not.toBeInTheDocument();
    expect(screen.container.querySelector("text")).toBeNull();
  });

  it("commits text on blur", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "text" }).element());
    await simulateClick(screen.container, 50, 50);
    await expect.element(screen.getByRole("textbox")).toBeVisible();

    await userEvent.fill(screen.getByRole("textbox").element(), "BlurText");
    screen.getByRole("textbox").element().blur();

    await vi.waitFor(() => {
      expect(screen.container.querySelector("text")?.textContent).toBe("BlurText");
    });
  });
});

describe("Arrow tool", () => {
  afterEach(() => {
    document.documentElement.style.cursor = "";
    fakeBrowser.reset();
  });

  it("adds arrow annotation by dragging", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "arrow" }).element());
    await simulateDrag(screen.container, { x: 50, y: 50 }, { x: 150, y: 150 });

    await vi.waitFor(() => {
      expect(screen.container.querySelector("line")).not.toBeNull();
    });
  });

  it("switches to select mode after adding arrow", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "arrow" }).element());
    await simulateDrag(screen.container, { x: 50, y: 50 }, { x: 150, y: 150 });

    await expect
      .element(screen.getByRole("button", { name: "select", pressed: true }))
      .toBeVisible();
  });
});

describe("Rect tool", () => {
  afterEach(() => {
    document.documentElement.style.cursor = "";
    fakeBrowser.reset();
  });

  it("adds rect annotation by dragging", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "rect" }).element());
    await simulateDrag(screen.container, { x: 30, y: 30 }, { x: 90, y: 90 });

    await vi.waitFor(() => {
      const svg = screen.container.querySelector("svg.absolute");
      expect(svg?.querySelectorAll(":scope > g").length).toBe(1);
    });
  });

  it("switches to select mode after adding rect", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "rect" }).element());
    await simulateDrag(screen.container, { x: 30, y: 30 }, { x: 90, y: 90 });

    await expect
      .element(screen.getByRole("button", { name: "select", pressed: true }))
      .toBeVisible();
  });
});

describe("Selection", () => {
  afterEach(() => {
    document.documentElement.style.cursor = "";
    fakeBrowser.reset();
  });

  it("selects text annotation by clicking on it", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "text" }).element());
    await simulateClick(screen.container, 100, 100);
    await expect.element(screen.getByRole("textbox")).toBeVisible();
    await userEvent.fill(screen.getByRole("textbox").element(), "ClickMe");
    await userEvent.keyboard("{Enter}");

    // Deselect
    await simulateClick(screen.container, 10, 10);
    await expect
      .element(screen.getByRole("button", { name: "#FF3B30", pressed: true }))
      .not.toBeInTheDocument();

    // Click on the text annotation
    await simulateClick(screen.container, 110, 110);

    await expect
      .element(screen.getByRole("button", { name: "#FF3B30", pressed: true }))
      .toBeVisible();
  });

  it("selects arrow annotation by clicking on it", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "arrow" }).element());
    await simulateDrag(screen.container, { x: 20, y: 20 }, { x: 80, y: 80 });

    // Deselect (avoid AnnotationMenu area at top)
    await simulateClick(screen.container, 200, 150);
    await expect
      .element(screen.getByRole("button", { name: "#FF3B30", pressed: true }))
      .not.toBeInTheDocument();

    // Click on the arrow line (midpoint ~50,50)
    await simulateClick(screen.container, 50, 50);

    await expect
      .element(screen.getByRole("button", { name: "#FF3B30", pressed: true }))
      .toBeVisible();
  });

  it("selects rect annotation by clicking on its edge", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "rect" }).element());
    await simulateDrag(screen.container, { x: 20, y: 20 }, { x: 80, y: 80 });

    // Deselect (avoid AnnotationMenu area at top)
    await simulateClick(screen.container, 200, 150);
    await expect
      .element(screen.getByRole("button", { name: "#FF3B30", pressed: true }))
      .not.toBeInTheDocument();

    // Click on rect edge (top edge, midpoint)
    await simulateClick(screen.container, 50, 20);

    await expect
      .element(screen.getByRole("button", { name: "#FF3B30", pressed: true }))
      .toBeVisible();
  });

  it("deselects annotation by clicking empty space", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "arrow" }).element());
    await simulateDrag(screen.container, { x: 20, y: 200 }, { x: 80, y: 260 });
    await expect
      .element(screen.getByRole("button", { name: "#FF3B30", pressed: true }))
      .toBeVisible();

    await simulateClick(screen.container, 200, 150);

    await expect
      .element(screen.getByRole("button", { name: "#FF3B30", pressed: true }))
      .not.toBeInTheDocument();
  });
});

describe("Delete", () => {
  afterEach(() => {
    document.documentElement.style.cursor = "";
    fakeBrowser.reset();
  });

  it("deletes selected text annotation with Delete key", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "text" }).element());
    await simulateClick(screen.container, 50, 200);
    await expect.element(screen.getByRole("textbox")).toBeVisible();
    await userEvent.fill(screen.getByRole("textbox").element(), "DeleteMe");
    await userEvent.keyboard("{Enter}");

    // Deselect
    await simulateClick(screen.container, 200, 150);
    await expect
      .element(screen.getByRole("button", { name: "#FF3B30", pressed: true }))
      .not.toBeInTheDocument();

    // Re-select by clicking on text
    await simulateClick(screen.container, 60, 208);
    await expect
      .element(screen.getByRole("button", { name: "#FF3B30", pressed: true }))
      .toBeVisible();

    await userEvent.keyboard("{Delete}");

    await vi.waitFor(() => {
      expect(screen.container.querySelector("text")).toBeNull();
    });
  });

  it("deletes selected arrow annotation with Delete key", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "arrow" }).element());
    await simulateDrag(screen.container, { x: 20, y: 200 }, { x: 80, y: 260 });

    // Deselect
    await simulateClick(screen.container, 200, 150);
    await expect
      .element(screen.getByRole("button", { name: "#FF3B30", pressed: true }))
      .not.toBeInTheDocument();

    // Re-select by clicking on arrow midpoint
    await simulateClick(screen.container, 50, 230);
    await expect
      .element(screen.getByRole("button", { name: "#FF3B30", pressed: true }))
      .toBeVisible();

    await userEvent.keyboard("{Delete}");

    await vi.waitFor(() => {
      expect(screen.container.querySelector("line")).toBeNull();
    });
  });

  it("deletes selected rect annotation with Delete key", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "rect" }).element());
    await simulateDrag(screen.container, { x: 100, y: 100 }, { x: 200, y: 200 });
    await expect
      .element(screen.getByRole("button", { name: "select", pressed: true }))
      .toBeVisible();

    await userEvent.keyboard("{Delete}");

    await vi.waitFor(() => {
      const svg = screen.container.querySelector("svg.absolute");
      expect(svg?.querySelectorAll(":scope > g").length).toBe(0);
    });
  });

  it("deletes selected annotation with Backspace key", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "arrow" }).element());
    await simulateDrag(screen.container, { x: 20, y: 200 }, { x: 80, y: 260 });
    await expect
      .element(screen.getByRole("button", { name: "select", pressed: true }))
      .toBeVisible();

    await userEvent.keyboard("{Backspace}");

    await vi.waitFor(() => {
      expect(screen.container.querySelector("line")).toBeNull();
    });
  });
});

describe("Color", () => {
  afterEach(() => {
    document.documentElement.style.cursor = "";
    fakeBrowser.reset();
  });

  it("changes color of selected annotation", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "arrow" }).element());
    await simulateDrag(screen.container, { x: 20, y: 60 }, { x: 80, y: 100 });

    await expect
      .element(screen.getByRole("button", { name: "#FF3B30", pressed: true }))
      .toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "#000000" }).element());

    await expect
      .element(screen.getByRole("button", { name: "#000000", pressed: true }))
      .toBeVisible();
    await vi.waitFor(() => {
      expect(screen.container.querySelector("line[stroke='#000000']")).not.toBeNull();
    });
  });

  it("changes default color for new annotations", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    // Select black via an annotation, then delete it
    await userEvent.click(screen.getByRole("button", { name: "arrow" }).element());
    await simulateDrag(screen.container, { x: 20, y: 200 }, { x: 80, y: 260 });
    await expect.element(screen.getByRole("button", { name: "#000000" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "#000000" }).element());

    // Deselect, re-select, delete
    await simulateClick(screen.container, 200, 150);
    await expect
      .element(screen.getByRole("button", { name: "#000000", pressed: true }))
      .not.toBeInTheDocument();
    await simulateClick(screen.container, 50, 230);
    await expect
      .element(screen.getByRole("button", { name: "#000000", pressed: true }))
      .toBeVisible();
    await userEvent.keyboard("{Delete}");

    // Draw new arrow — should use black
    await userEvent.click(screen.getByRole("button", { name: "arrow" }).element());
    await simulateDrag(screen.container, { x: 20, y: 20 }, { x: 80, y: 80 });

    await vi.waitFor(() => {
      expect(screen.container.querySelector("line[stroke='#000000']")).not.toBeNull();
    });
  });
});

describe("Fill", () => {
  afterEach(() => {
    document.documentElement.style.cursor = "";
    fakeBrowser.reset();
  });

  it("toggles fill on selected rect", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "rect" }).element());
    await simulateDrag(screen.container, { x: 20, y: 60 }, { x: 80, y: 100 });

    await expect
      .element(screen.getByRole("button", { name: "Toggle fill", pressed: false }))
      .toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Toggle fill" }).element());

    await expect
      .element(screen.getByRole("button", { name: "Toggle fill", pressed: true }))
      .toBeVisible();
  });

  it("filled rect is selectable by clicking inside", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "rect" }).element());
    await simulateDrag(screen.container, { x: 20, y: 60 }, { x: 80, y: 100 });

    await expect.element(screen.getByRole("button", { name: "Toggle fill" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Toggle fill" }).element());

    // Deselect
    await simulateClick(screen.container, 5, 5);
    await expect
      .element(screen.getByRole("button", { name: "#FF3B30", pressed: true }))
      .not.toBeInTheDocument();

    // Click center of filled rect
    await simulateClick(screen.container, 50, 80);

    await expect
      .element(screen.getByRole("button", { name: "#FF3B30", pressed: true }))
      .toBeVisible();
  });
});

describe("Move", () => {
  afterEach(() => {
    document.documentElement.style.cursor = "";
    fakeBrowser.reset();
  });

  it("moves annotation by dragging", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "arrow" }).element());
    await simulateDrag(screen.container, { x: 50, y: 200 }, { x: 150, y: 200 });
    await expect
      .element(screen.getByRole("button", { name: "select", pressed: true }))
      .toBeVisible();

    // Click on the annotation to select, then drag using simulateDrag pattern
    await simulateClick(screen.container, 100, 200);

    await simulateDrag(screen.container, { x: 100, y: 200 }, { x: 120, y: 220 });

    await vi.waitFor(() => {
      const line = screen.container.querySelector("svg.absolute line:not([stroke='transparent'])");
      expect(Number(line?.getAttribute("x1"))).toBe(70);
      expect(Number(line?.getAttribute("y1"))).toBe(220);
      expect(Number(line?.getAttribute("x2"))).toBe(170);
      expect(Number(line?.getAttribute("y2"))).toBe(220);
    });
  });
});

describe("Resize", () => {
  afterEach(() => {
    document.documentElement.style.cursor = "";
    fakeBrowser.reset();
  });

  it("resizes annotation via handle drag", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "arrow" }).element());
    await simulateDrag(screen.container, { x: 50, y: 200 }, { x: 150, y: 200 });
    await expect
      .element(screen.getByRole("button", { name: "select", pressed: true }))
      .toBeVisible();

    // Drag from the end handle position (150,200) to (180,200)
    await simulateDrag(screen.container, { x: 150, y: 200 }, { x: 180, y: 200 });

    await vi.waitFor(() => {
      const line = screen.container.querySelector("svg.absolute line:not([stroke='transparent'])");
      expect(Number(line?.getAttribute("x1"))).toBe(50);
      expect(Number(line?.getAttribute("x2"))).toBe(180);
    });
  });
});

describe("Menu", () => {
  afterEach(() => {
    document.documentElement.style.cursor = "";
    fakeBrowser.reset();
  });

  it("copies screenshot to clipboard", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    const writeSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { write: writeSpy },
      writable: true,
      configurable: true,
    });

    (screen.getByRole("button", { name: "Copy" }).element() as HTMLElement).click();

    await vi.waitFor(() => {
      expect(writeSpy).toHaveBeenCalledOnce();
    });
  });

  it("saves screenshot as download", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    (screen.getByRole("button", { name: "Save" }).element() as HTMLElement).click();

    await vi.waitFor(() => {
      expect(clickSpy).toHaveBeenCalledOnce();
    });

    clickSpy.mockRestore();
  });

  it("returns to capture mode on Retake", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await expect.element(screen.getByRole("img", { name: "Annotation editor" })).toBeVisible();

    (screen.getByRole("button", { name: "Retake" }).element() as HTMLElement).click();

    await expect
      .element(screen.getByRole("img", { name: "Annotation editor" }))
      .not.toBeInTheDocument();
  });
});

describe("Undo/Redo", () => {
  afterEach(() => {
    document.documentElement.style.cursor = "";
    fakeBrowser.reset();
  });

  it("undoes adding an annotation", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "arrow" }).element());
    await simulateDrag(screen.container, { x: 20, y: 20 }, { x: 80, y: 80 });

    await userEvent.keyboard("{Meta>}{z}{/Meta}");

    await vi.waitFor(() => {
      expect(screen.container.querySelector("line")).toBeNull();
    });
  });

  it("redoes after undo", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "text" }).element());
    await simulateClick(screen.container, 50, 50);
    await expect.element(screen.getByRole("textbox")).toBeVisible();
    await userEvent.fill(screen.getByRole("textbox").element(), "RedoMe");
    await userEvent.keyboard("{Enter}");

    await userEvent.keyboard("{Meta>}{z}{/Meta}");
    await vi.waitFor(() => {
      expect(screen.container.querySelector("text")).toBeNull();
    });

    await userEvent.keyboard("{Meta>}{Shift>}{z}{/Shift}{/Meta}");

    await vi.waitFor(() => {
      expect(screen.container.querySelector("text")?.textContent).toBe("RedoMe");
    });
  });

  it("undoes deletion", async () => {
    const screen = render(<App onClose={vi.fn()} />);
    await simulateCapture(screen);

    await userEvent.click(screen.getByRole("button", { name: "text" }).element());
    await simulateClick(screen.container, 50, 50);
    await expect.element(screen.getByRole("textbox")).toBeVisible();
    await userEvent.fill(screen.getByRole("textbox").element(), "BringBack");
    await userEvent.keyboard("{Enter}");

    // Select and delete
    await simulateClick(screen.container, 10, 10);
    await simulateClick(screen.container, 60, 60);
    await userEvent.keyboard("{Delete}");
    await vi.waitFor(() => {
      expect(screen.container.querySelector("text")).toBeNull();
    });

    await userEvent.keyboard("{Meta>}{z}{/Meta}");

    await vi.waitFor(() => {
      expect(screen.container.querySelector("text")?.textContent).toBe("BringBack");
    });
  });
});

describe("hitTestAnnotation", () => {
  it("arrow: hits point on the line", () => {
    const arrow = {
      kind: "arrow" as const,
      color: "#000",
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
    };
    expect(hitTestAnnotation(arrow, { x: 50, y: 0 })).toBe(true);
    expect(hitTestAnnotation(arrow, { x: 50, y: 5 })).toBe(true);
  });

  it("arrow: misses point far from the line", () => {
    const arrow = {
      kind: "arrow" as const,
      color: "#000",
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
    };
    expect(hitTestAnnotation(arrow, { x: 50, y: 20 })).toBe(false);
  });

  it("arrow: hits endpoints", () => {
    const arrow = {
      kind: "arrow" as const,
      color: "#000",
      start: { x: 10, y: 10 },
      end: { x: 90, y: 10 },
    };
    expect(hitTestAnnotation(arrow, { x: 10, y: 10 })).toBe(true);
    expect(hitTestAnnotation(arrow, { x: 90, y: 10 })).toBe(true);
  });

  it("arrow: misses point beyond endpoint", () => {
    const arrow = {
      kind: "arrow" as const,
      color: "#000",
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
    };
    expect(hitTestAnnotation(arrow, { x: 120, y: 0 })).toBe(false);
  });

  it("arrow: zero-length hits nearby point", () => {
    const arrow = {
      kind: "arrow" as const,
      color: "#000",
      start: { x: 50, y: 50 },
      end: { x: 50, y: 50 },
    };
    expect(hitTestAnnotation(arrow, { x: 53, y: 50 })).toBe(true);
    expect(hitTestAnnotation(arrow, { x: 60, y: 50 })).toBe(false);
  });

  it("text: hits inside the text box", () => {
    const text = {
      kind: "text" as const,
      color: "#000",
      start: { x: 10, y: 10 },
      end: { x: 10, y: 10 },
      text: "hello",
    };
    expect(hitTestAnnotation(text, { x: 50, y: 20 })).toBe(true);
  });

  it("text: misses outside the text box", () => {
    const text = {
      kind: "text" as const,
      color: "#000",
      start: { x: 10, y: 10 },
      end: { x: 10, y: 10 },
      text: "hello",
    };
    expect(hitTestAnnotation(text, { x: 5, y: 20 })).toBe(false);
  });

  it("rect filled: hits inside", () => {
    const rect = {
      kind: "rect" as const,
      color: "#000",
      filled: true,
      start: { x: 10, y: 10 },
      end: { x: 110, y: 110 },
    };
    expect(hitTestAnnotation(rect, { x: 60, y: 60 })).toBe(true);
  });

  it("rect filled: misses outside", () => {
    const rect = {
      kind: "rect" as const,
      color: "#000",
      filled: true,
      start: { x: 10, y: 10 },
      end: { x: 110, y: 110 },
    };
    expect(hitTestAnnotation(rect, { x: 5, y: 60 })).toBe(false);
  });

  it("rect unfilled: hits the edge", () => {
    const rect = {
      kind: "rect" as const,
      color: "#000",
      filled: false,
      start: { x: 10, y: 10 },
      end: { x: 110, y: 110 },
    };
    expect(hitTestAnnotation(rect, { x: 10, y: 60 })).toBe(true);
  });

  it("rect unfilled: misses the center", () => {
    const rect = {
      kind: "rect" as const,
      color: "#000",
      filled: false,
      start: { x: 10, y: 10 },
      end: { x: 110, y: 110 },
    };
    expect(hitTestAnnotation(rect, { x: 60, y: 60 })).toBe(false);
  });
});
