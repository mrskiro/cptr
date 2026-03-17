import path from "node:path";

import { type BrowserContext, type Worker, chromium, test as base } from "@playwright/test";

const pathToExtension = path.resolve(".output/chrome-mv3");

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  backgroundWorker: Worker;
}>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright fixture API requires this signature
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      headless: true,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        "--window-size=1280,800",
      ],
      viewport: { width: 1280, height: 800 },
      acceptDownloads: true,
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: "https://calect.com",
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ backgroundWorker }, use) => {
    const extensionId = backgroundWorker.url().split("/")[2];
    await use(extensionId);
  },
  backgroundWorker: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker");
    await use(worker);
  },
});

export const expect = test.expect;
