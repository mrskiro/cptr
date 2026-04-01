import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/auto-icons"],
  autoIcons: {
    baseIconPath: "assets/icon.svg",
  },
  srcDir: "src",
  manifest: {
    name: "cptr",
    permissions: ["activeTab", "clipboardWrite", "storage"],
    ...(process.env.E2E && { host_permissions: ["<all_urls>"] }),
    commands: {
      "toggle-capture": {
        suggested_key: {
          default: "Alt+Shift+S",
        },
        description: "Toggle capture mode",
      },
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
