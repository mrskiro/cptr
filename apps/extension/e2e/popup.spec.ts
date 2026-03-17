import { expect, test } from "./fixtures";

test.describe("Popup", () => {
  test("opens and displays a screenshot", async ({ context, extensionId }) => {
    const bgPage = await context.newPage();
    await bgPage.goto("https://calect.com");
    await bgPage.waitForLoadState("networkidle");

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    const preview = popup.getByAltText("Screenshot preview");
    await expect(preview).toBeVisible({ timeout: 5000 });
  });

  test("hue slider persists to storage", async ({ context, extensionId }) => {
    const bgPage = await context.newPage();
    await bgPage.goto("https://calect.com");
    await bgPage.waitForLoadState("networkidle");

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.getByAltText("Screenshot preview")).toBeVisible({
      timeout: 5000,
    });

    const slider = popup.locator('input[type="range"]');
    await slider.fill("180");

    await popup.reload();
    await expect(popup.getByAltText("Screenshot preview")).toBeVisible({
      timeout: 5000,
    });
    await expect(slider).toHaveValue("180");
  });
});
