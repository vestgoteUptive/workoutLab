import base from "../../eslint.config.mjs";

export default [
  ...base,
  {
    // lighthouserc.cjs is plain CommonJS config, not app code (D-0046 §10).
    files: ["*.cjs"],
    languageOptions: {
      globals: { module: "readonly", require: "readonly" },
    },
  },
];
