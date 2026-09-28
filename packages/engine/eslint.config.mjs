import base from "../../eslint.config.mjs";

// Rule 0 purity (D-0024, D-0034 §8): engine source never reads the clock or randomness.
// `new Date(<iso or ms>)` with an argument is allowed; tests may use all of these.
const PURITY_MESSAGE = "Engine code is pure (rule 0): take `now`/`seed` as inputs.";

export default [
  ...base,
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.name='Date'][callee.property.name='now']",
          message: `Date.now() is banned. ${PURITY_MESSAGE}`,
        },
        {
          selector: "CallExpression[callee.type='Identifier'][callee.name='Date']",
          message: `Date() is banned. ${PURITY_MESSAGE}`,
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: `new Date() without an argument is banned. ${PURITY_MESSAGE}`,
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.name='Math'][callee.property.name='random']",
          message: `Math.random() is banned. ${PURITY_MESSAGE}`,
        },
        {
          selector: "CallExpression[callee.property.name='localeCompare']",
          message: "localeCompare is locale-dependent; compare code units (D-0034 §5).",
        },
      ],
    },
  },
];
