import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tailwindcss()],
  optimizeDeps: {
    include: ["wxt/testing/fake-browser"],
    exclude: ["@playwright/test"],
  },
  test: {
    exclude: ["e2e/**"],
    browser: {
      provider: playwright(),
      enabled: true,
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});
