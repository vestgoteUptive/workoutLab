import base from "../../eslint.config.mjs";
import react from "eslint-plugin-react";

export default [
  ...base,
  {
    // The build/CLI scripts (gen-icons, check-bundle-size) are plain Node, not browser code.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", Buffer: "readonly" },
    },
  },
  {
    // Every user-facing string comes from `src/lib/i18n/en.ts` (NFR-I18N-1, D-0045 §12).
    files: ["src/**/*.tsx"],
    ignores: ["**/*.test.tsx", "**/*.spec.tsx"],
    plugins: { react },
    rules: {
      "react/jsx-no-literals": [
        "error",
        {
          noStrings: true,
          allowedStrings: ["·", "×", "/", "–", "−", "+", "%"],
          ignoreProps: true,
        },
      ],
    },
  },
];
