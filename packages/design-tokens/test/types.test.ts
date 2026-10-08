import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { tokens, type ColorName, type CoverageStep } from "../src/index";
import { pkgRoot } from "./helpers";

const ALL_NAMES = [
  "bg",
  "bg-focus",
  "surface",
  "surface-2",
  "line",
  "line-strong",
  "text",
  "text-muted",
  "accent",
  "accent-hover",
  "warn",
  "on-accent",
  "coverage-0",
  "coverage-1",
  "coverage-2",
  "coverage-3",
  "coverage-4",
] as const satisfies readonly ColorName[];

describe("AC8 types", () => {
  it("rejects unknown colour names at compile time", () => {
    // @ts-expect-error coverage-5 is not a token (checked by `pnpm typecheck`).
    const missing = tokens.color["coverage-5"];
    expect(missing).toBeUndefined();
  });
  it("ColorName equals the flat (string-valued) keys of tokens.color", () => {
    expectTypeOf<ColorName>().toEqualTypeOf<(typeof ALL_NAMES)[number]>();
    const flat = Object.entries(tokens.color).filter(([, v]) => typeof v === "string");
    expect(flat.map(([k]) => k)).toEqual([...ALL_NAMES]);
  });
  it("CoverageStep is 0..4", () => {
    expectTypeOf<CoverageStep>().toEqualTypeOf<0 | 1 | 2 | 3 | 4>();
  });
  it("src/index.ts contains no colour literal", () => {
    const src = readFileSync(resolve(pkgRoot, "src/index.ts"), "utf8");
    expect(src).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(src).not.toMatch(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i);
  });
});
