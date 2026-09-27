// ESLint plugin `workoutlab` with rule `no-raw-colour` (D-0019).
import { findRawColours, MESSAGE } from "./colour-patterns.js";

/** JSX attributes whose values are links or ids, never colours. */
const IGNORED_JSX_ATTRS = new Set(["href", "to", "id", "htmlFor"]);

function inIgnoredJsxAttribute(node) {
  let current = node.parent;
  while (
    current &&
    (current.type === "TemplateLiteral" || current.type === "JSXExpressionContainer")
  ) {
    current = current.parent;
  }
  return (
    current?.type === "JSXAttribute" &&
    current.name?.type === "JSXIdentifier" &&
    IGNORED_JSX_ATTRS.has(current.name.name)
  );
}

/** @type {import("eslint").Rule.RuleModule} */
const noRawColour = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw colour values outside @workoutlab/design-tokens (hex, rgb(), hsl(), hwb(), lab(), lch(), oklab(), oklch()).",
    },
    schema: [],
    messages: { rawColour: MESSAGE },
  },
  create(context) {
    function check(node, text) {
      if (typeof text !== "string" || text.length === 0) return;
      if (inIgnoredJsxAttribute(node)) return;
      for (const { value } of findRawColours(text)) {
        context.report({ node, messageId: "rawColour", data: { value } });
      }
    }
    return {
      Literal(node) {
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};

const plugin = {
  meta: { name: "eslint-plugin-workoutlab", version: "0.0.0" },
  rules: { "no-raw-colour": noRawColour },
};

export default plugin;
