// AC-A8 (NFR-I18N-1): every user-facing string must come from the catalogue. This exercises
// the same rule + options as `apps/web/eslint.config.mjs`.
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import react from "eslint-plugin-react";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const options = [
  {
    noStrings: true,
    allowedStrings: ["·", "×", "/", "–", "−", "+", "%"],
    ignoreProps: true,
  },
];

describe("AC-A8 react/jsx-no-literals catalogue enforcement", () => {
  ruleTester.run("jsx-no-literals", react.rules["jsx-no-literals"], {
    valid: [
      { code: "const el = <span>·</span>", options },
      { code: "const el = <span>×</span>", options },
    ],
    invalid: [{ code: "const el = <p>Hello</p>", options, errors: 1 }],
  });
});
