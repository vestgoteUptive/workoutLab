import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import plugin from "../eslint-plugin/index.js";

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

const reported = [{ message: /@workoutlab\/design-tokens/ }];

describe("AC11 workoutlab/no-raw-colour", () => {
  ruleTester.run("no-raw-colour", plugin.rules["no-raw-colour"], {
    invalid: [
      'const c = "#D4F25A"',
      'const c = "#fff"',
      'const c = "#12121080"',
      '<div style={{ color: "#fff" }} />',
      "const s = `border: 2px solid #FF8A3D`",
      '"rgb(212, 242, 90)"',
      '"rgba(0,0,0,0.5)"',
      '"hsl(72 85% 65%)"',
      '"oklch(0.9 0.17 125)"',
    ].map((code) => ({ code, errors: reported })),
    valid: [
      '"var(--wl-color-accent)"',
      "tokens.color.accent",
      '"color-mix(in oklch, var(--wl-color-accent) 40%, transparent)"',
      '<a href="#add">',
      '<a href="#section-2">',
      '"#1"',
      '"currentColor"',
    ].map((code) => ({ code: code.startsWith("<a") ? `${code}x</a>` : code })),
  });
});
