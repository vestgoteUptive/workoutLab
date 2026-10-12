import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { tokens, type CoverageStep, type FontRole } from "../src/index";
import { pkgRoot } from "./helpers";

describe("AC8 types", () => {
  it("rejects unknown colour names at compile time", () => {
    // @ts-expect-error coverage-5 is not a token (checked by `pnpm typecheck`).
    const missing = tokens.color["coverage-5"];
    expect(missing).toBeUndefined();
  });
  it("T-0625: no flat colour key, and FontRole is plan | session", () => {
    // @ts-expect-error the flat Chalk & Iron bg is retired (checked by `pnpm typecheck`).
    const bg = tokens.color.bg;
    expect(bg).toBeUndefined();
    expectTypeOf<FontRole>().toEqualTypeOf<"plan" | "session">();
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
