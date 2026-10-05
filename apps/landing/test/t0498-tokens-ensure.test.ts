import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// T-0498: global setup must build packages/design-tokens/dist/tokens.css (via
// apps/web/ensure-tokens-css.mjs) before either Astro build, and fail loudly — naming
// @workoutlab/design-tokens and ensure-tokens-css — if that build fails. Behaviour (a fresh
// worktree, a stale CSS, a failing build) is covered by recorded runs in the ticket's log: the
// global setup spawns a real build and can't be unit-tested without nesting a vitest process.
// This is the one part that is: source shape.

const globalSetupPath = fileURLToPath(new URL("./global-setup.ts", import.meta.url));
const source = readFileSync(globalSetupPath, "utf8");

describe("T-0498 AC-1 global setup wiring", () => {
  it("T-0498 AC-1 references ensure-tokens-css.mjs before the first Astro build call", () => {
    const ensureIndex = source.indexOf("ensure-tokens-css.mjs");
    const buildCallIndex = source.indexOf("await buildInto(");
    expect(ensureIndex).toBeGreaterThanOrEqual(0);
    expect(buildCallIndex).toBeGreaterThanOrEqual(0);
    expect(ensureIndex).toBeLessThan(buildCallIndex);
  });

  it("T-0498 AC-1 checks the exit status and throws on failure", () => {
    expect(source).toMatch(/status\s*!==\s*0/);
    const statusCheckIndex = source.search(/status\s*!==\s*0/);
    const throwIndex = source.indexOf("throw new Error", statusCheckIndex);
    expect(throwIndex).toBeGreaterThan(statusCheckIndex);
  });

  it("T-0498 AC-1 resolves the ensure script from landingRoot via apps/web", () => {
    expect(source).toMatch(
      /join\(\s*landingRoot\s*,\s*["']\.\.["']\s*,\s*["']web["']\s*,\s*["']ensure-tokens-css\.mjs["']\s*\)/,
    );
  });

  it("T-0498 AC-1 the thrown error names the tokens package and the script", () => {
    const errorBlockMatch = source.match(/throw new Error\(([\s\S]*?)\);/);
    expect(errorBlockMatch).not.toBeNull();
    const errorBlock = errorBlockMatch?.[1] ?? "";
    expect(errorBlock).toContain("@workoutlab/design-tokens");
    expect(errorBlock).toContain("ensure-tokens-css");
  });
});
