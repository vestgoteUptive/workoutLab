// Shared ESLint flat config for every package. Package-level eslint.config.mjs files
// should `import base from "../../eslint.config.mjs"` (or the appropriate relative path)
// and extend the exported array with their own overrides.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import workoutlab from "./packages/design-tokens/eslint-plugin/index.js";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.output/**",
      "**/.astro/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Colours come only from @workoutlab/design-tokens (D-0019). That package turns this
    // off in its own eslint.config.mjs, because patterns resolve per loaded config.
    plugins: { workoutlab },
    rules: { "workoutlab/no-raw-colour": "error" },
  },
  {
    // Specs compare browser-computed colours, which a browser reports only as rgb()/rgba()
    // strings, so they must spell that form (D-0228 §2). Every other rule still applies.
    files: ["tests/e2e/**"],
    rules: { "workoutlab/no-raw-colour": "off" },
  },
  {
    // The repo-hygiene checks (T-0004, D-0023) are plain Node scripts, run outside any
    // package's own eslint.config.mjs.
    files: [".github/scripts/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly" },
    },
  },
  {
    // The prod scripts (T-0508, D-0190 §6): plain Node ESM, not part of any package.
    files: ["infra/scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
        URL: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
  },
);
