const noUseEffect = {
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "useEffect") {
          context.report({
            message:
              "useEffect is for syncing with external systems only. Do not use it for event handlers or data transformations. https://ja.react.dev/learn/you-might-not-need-an-effect",
            node,
          });
        }
      },
    };
  },
};

const noUseRef = {
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "useRef") {
          context.report({
            message:
              "useRef is for DOM references only. Do not use it to mirror state or work around stale closures. https://ja.react.dev/learn/referencing-values-with-refs",
            node,
          });
        }
      },
    };
  },
};

const plugin = {
  meta: { name: "custom-rules" },
  rules: { "no-use-effect": noUseEffect, "no-use-ref": noUseRef },
};

export default plugin;
