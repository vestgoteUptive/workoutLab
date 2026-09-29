import base from "../../eslint.config.mjs";
import react from "eslint-plugin-react";

export default [
  ...base,
  {
    // The build/CLI scripts (check-bundle-size) are plain Node, not browser code.
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
  {
    // C-01 Body map is never shown during a workout (principle 1, D-0045 §4, AC-D11):
    // UF-03, UF-08 and UF-09 may not import components/body-map.
    files: ["src/features/UF-03/**", "src/features/UF-08/**", "src/features/UF-09/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(^|/)components/body-map(/|$)",
              message:
                "C-01 Body map is not allowed in UF-03/UF-08/UF-09 (principle 1: one task on screen during a workout, D-0045 §4).",
            },
          ],
        },
      ],
    },
  },
];
