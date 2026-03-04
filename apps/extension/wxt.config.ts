import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  manifest: {
    name: "cptr",
    permissions: ["activeTab", "clipboardWrite", "storage"],
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
