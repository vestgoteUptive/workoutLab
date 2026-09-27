import base from "../../eslint.config.mjs";

export default [
  ...base,
  {
    // This package is the one place colour values may appear (D-0019).
    rules: { "workoutlab/no-raw-colour": "off" },
  },
  {
    files: ["bin/**/*.js", "eslint-plugin/**/*.js", "scripts/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly" },
    },
  },
];
