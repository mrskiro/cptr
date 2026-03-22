import react from "@mrskiro/oxlint-config/react";
import vitest from "@mrskiro/oxlint-config/vitest";
import { defineConfig } from "oxlint";

export default defineConfig({
  ...react,
  plugins: [...react.plugins, ...vitest.plugins],
  rules: {
    ...react.rules,
    ...vitest.rules,
    "react/forbid-dom-props": [
      "error",
      {
        forbid: [
          {
            propName: "style",
            message:
              "style attribute is only allowed for properties determined dynamically at runtime",
          },
        ],
      },
    ],
  },
});
