import type { Page, Worker } from "@playwright/test";

import { expect, test } from "./fixtures";

const sendToggleCapture = (worker: Worker) =>
  worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    await chrome.tabs.sendMessage(tab.id!, { type: "toggle-capture" });
  });

const captureElement = async (page: Page, worker: Worker, selector: string) => {
  await sendToggleCapture(worker);
  await expect(page.locator("cptr-overlay")).toBeAttached({ timeout: 3000 });

  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} not found`);

  await page.mouse.move(box.x + 4, box.y + 4);
  await page.waitForTimeout(300);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.up();

  await expect(page.getByRole("img", { name: "Annotation editor" })).toBeVisible({ timeout: 5000 });
};

test.describe("Content Script lifecycle", () => {
  test("toggle-capture mounts the overlay", async ({ context, backgroundWorker }) => {
    const page = await context.newPage();
    await page.goto("https://calect.com");
    await page.waitForLoadState("networkidle");
    await sendToggleCapture(backgroundWorker);
    await expect(page.locator("cptr-overlay")).toBeAttached({
      timeout: 3000,
    });
  });

  test("second toggle removes the overlay", async ({ context, backgroundWorker }) => {
    const page = await context.newPage();
    await page.goto("https://calect.com");
    await page.waitForLoadState("networkidle");
    await sendToggleCapture(backgroundWorker);
    await expect(page.locator("cptr-overlay")).toBeAttached({
      timeout: 3000,
    });
    await sendToggleCapture(backgroundWorker);
    await expect(page.locator("cptr-overlay")).not.toBeAttached({
      timeout: 3000,
    });
  });

  test("click element shows annotation editor", async ({ context, backgroundWorker }) => {
    const page = await context.newPage();
    await page.goto("https://calect.com");
    await page.waitForLoadState("networkidle");
    await captureElement(page, backgroundWorker, "section >> nth=2");
  });
});

test.describe("Capture image integrity", () => {
  test("preview matches clipboard", async ({ context, backgroundWorker }) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 1200 });
    await page.goto("https://calect.com");
    await page.waitForLoadState("networkidle");

    await captureElement(page, backgroundWorker, "section >> nth=2");

    // Hide toolbar so it doesn't interfere with the screenshot
    await page.evaluate(() => {
      const host = document.querySelector("cptr-overlay");
      if (!host?.shadowRoot) return;
      for (const btn of host.shadowRoot.querySelectorAll('button[aria-label="select"]')) {
        const toolbar = btn.parentElement;
        if (toolbar instanceof HTMLElement) toolbar.style.visibility = "hidden";
      }
    });

    // Preview: screenshot of what the user sees
    const editorBox = await page.getByRole("img", { name: "Annotation editor" }).boundingBox();
    if (!editorBox) throw new Error("editor not found");
    const preview = await page.screenshot({ clip: editorBox });

    // Clipboard: click Copy, read from clipboard
    await page.getByRole("button", { name: "Copy" }).click();
    await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible({ timeout: 3000 });
    const clipboardDataUrl = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes("image/png")) {
          const blob = await item.getType("image/png");
          const reader = new FileReader();
          return new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        }
      }
      return null;
    });
    expect(clipboardDataUrl).toBeTruthy();

    // Pixel comparison
    const previewBase64 = `data:image/png;base64,${preview.toString("base64")}`;
    const result = await page.evaluate(
      ({ a, b }) => {
        const load = (src: string) =>
          new Promise<HTMLImageElement>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = src;
          });
        return Promise.all([load(a), load(b)]).then(([imgA, imgB]) => {
          const w = Math.max(imgA.width, imgB.width);
          const h = Math.max(imgA.height, imgB.height);
          const c1 = document.createElement("canvas");
          const c2 = document.createElement("canvas");
          c1.width = c2.width = w;
          c1.height = c2.height = h;
          c1.getContext("2d")!.drawImage(imgA, 0, 0, w, h);
          c2.getContext("2d")!.drawImage(imgB, 0, 0, w, h);
          const d1 = c1.getContext("2d")!.getImageData(0, 0, w, h).data;
          const d2 = c2.getContext("2d")!.getImageData(0, 0, w, h).data;
          let diff = 0;
          for (let i = 0; i < d1.length; i += 4) {
            const dr = Math.abs(d1[i] - d2[i]);
            const dg = Math.abs(d1[i + 1] - d2[i + 1]);
            const db = Math.abs(d1[i + 2] - d2[i + 2]);
            if (dr + dg + db > 15) diff++;
          }
          return {
            diffPercent: Math.round((diff / (w * h)) * 10000) / 100,
            sizeA: `${imgA.width}x${imgA.height}`,
            sizeB: `${imgB.width}x${imgB.height}`,
          };
        });
      },
      { a: previewBase64, b: clipboardDataUrl! },
    );

    expect(
      result.diffPercent,
      `preview ${result.sizeA} vs clipboard ${result.sizeB}: ${result.diffPercent}% diff`,
    ).toBeLessThan(5);
  });
});

test.describe("Export", () => {
  test("Copy writes PNG to clipboard", async ({ context, backgroundWorker }) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 1200 });
    await page.goto("https://calect.com");
    await page.waitForLoadState("networkidle");

    await captureElement(page, backgroundWorker, "section >> nth=2");

    await page.getByRole("button", { name: "Copy" }).click();
    await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible({ timeout: 3000 });

    const hasPng = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      return items.some((item) => item.types.includes("image/png"));
    });
    expect(hasPng).toBe(true);
  });
});
