import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "cptr",
    permissions: ["activeTab", "clipboardWrite"],
    commands: {
      "toggle-capture": {
        suggested_key: {
          default: "Ctrl+Shift+S",
          mac: "Command+Shift+S",
        },
        description: "Toggle capture mode",
      },
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
