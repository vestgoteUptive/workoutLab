// T-0587 (D-0211 §1): the additive Cobalt tokens plan.ink-on-raise, plan.scrim, radius.progress,
// space.option-bleed and meta.planCoverage. AC1 values, AC2 CSS, AC3 contrast, AC4 planCoverage,
// AC5 colour guard, AC6 docs.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, expectTypeOf, it } from "vitest";
import raw from "../src/tokens.json";
import type { RadiusName, SpaceName, StateColorName, Tokens } from "../src/index";
import before from "./fixtures/tokens.before-T-0587.json";
import { contrast, pkgRoot, repoRoot, runCli } from "./helpers";

type Raw = typeof raw;

/** Every leaf of a JSON value as `path → value` (arrays by index). */
function leaves(v: unknown, path = "", out = new Map<string, unknown>()): Map<string, unknown> {
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) leaves(x, path ? `${path}.${k}` : k, out);
  } else out.set(path, v);
  return out;
}

const ADDED = new Map<string, unknown>([
  ["color.plan.ink-on-raise", "#DDE3FF"],
  ["color.plan.scrim", "#0E1652"],
  ["radius.progress", 2],
  ["space.option-bleed", 18],
  ["meta.planCoverage.0.requiresLabel", true],
  ["meta.planCoverage.1.requiresLabel", true],
  ["meta.planCoverage.2.requiresLabel", false],
  ["meta.planCoverage.3.requiresLabel", false],
  ["meta.planCoverage.4.requiresLabel", false],
]);

/** Throws unless `next` = the pre-change tokens plus exactly ADDED (additive change). */
function checkAdditive(next: unknown): void {
  const old = leaves(before);
  const now = leaves(next);
  for (const [k, v] of old) expect(now.get(k), `existing ${k} unchanged`).toEqual(v);
  const added = [...now.keys()].filter((k) => !old.has(k));
  expect(added.sort(), "added keys").toEqual([...ADDED.keys()].sort());
  for (const [k, v] of ADDED) expect(now.get(k), `new ${k}`).toEqual(v);
}

describe("AC1 the four additive values (D-0211 §1)", () => {
  it("tokens.json = the pre-change tokens plus exactly the new keys", () => {
    checkAdditive(raw);
    expect(raw.color.plan["ink-on-raise"]).toBe("#DDE3FF");
    expect(raw.color.plan.scrim).toBe("#0E1652");
    for (const hex of [raw.color.plan["ink-on-raise"], raw.color.plan.scrim])
      expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    expect(raw.radius.progress).toBe(2);
    expect(raw.space["option-bleed"]).toBe(18);
    expect(typeof raw.radius.progress).toBe("number");
    expect(typeof raw.space["option-bleed"]).toBe("number");
  });
  it("planted fault: a changed existing value fails", () => {
    const faulty = structuredClone(raw);
    faulty.radius.segment = 2;
    expect(() => checkAdditive(faulty)).toThrow(/existing radius\.segment unchanged/);
  });
  it("planted fault: a lowercase new hex fails", () => {
    const faulty = structuredClone(raw);
    faulty.color.plan.scrim = "#0e1652";
    expect(() => checkAdditive(faulty)).toThrow(/new color\.plan\.scrim/);
  });
  it("planted fault: a removed key fails", () => {
    const faulty: Record<string, unknown> = structuredClone(raw);
    delete (faulty.space as Record<string, unknown>)["top-safe"];
    expect(() => checkAdditive(faulty)).toThrow(/existing space\.top-safe unchanged/);
  });
  it("types widen to the new keys", () => {
    expectTypeOf<"plan-ink-on-raise">().toMatchTypeOf<StateColorName<"plan">>();
    expectTypeOf<"plan-scrim">().toMatchTypeOf<StateColorName<"plan">>();
    expectTypeOf<"progress">().toMatchTypeOf<RadiusName>();
    expectTypeOf<"option-bleed">().toMatchTypeOf<SpaceName>();
    expectTypeOf<Tokens["meta"]["planCoverage"][number]>().toEqualTypeOf<{
      requiresLabel: boolean;
    }>();
  });
});

// --- Built CSS
const tmp = mkdtempSync(join(tmpdir(), "wl-tokens-t0587-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const out = join(tmp, "tokens.css");
const build = spawnSync(
  process.execPath,
  [resolve(pkgRoot, "scripts/build-css.mjs"), "--out", out],
  { encoding: "utf8" },
);
const css = build.status === 0 ? readFileSync(out, "utf8") : "";

describe("AC2 tokens.css", () => {
  it("emits the four new variables", () => {
    expect(build.status, build.stderr).toBe(0);
    for (const line of [
      "--wl-color-plan-ink-on-raise: #DDE3FF;",
      "--wl-color-plan-scrim: #0E1652;",
      "--wl-radius-progress: 2px;",
      "--wl-space-option-bleed: 18px;",
    ])
      expect(css).toContain(`  ${line}\n`);
  });
  it("every emitted variable name is unique", () => {
    const names = [...css.matchAll(/^\s*(--wl-[a-z0-9-]+):/gm)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
  });
  it("meta is not emitted as CSS", () => {
    expect(css).not.toMatch(/planCoverage|requiresLabel|--wl-meta/);
  });
});

// --- AC3 contrast (WCAG 2.2, D-0209 §1 rounding)
/** Throws unless ink-on-raise on raise rounds to ≥ 4.9 and clears 4.5 unrounded. */
function checkInkOnRaise(t: Raw): void {
  const r = contrast(t.color.plan["ink-on-raise"], t.color.plan.raise);
  expect(
    Math.round(r * 10) / 10,
    `ink-on-raise on raise ${r.toFixed(3)} ≥ 4.9`,
  ).toBeGreaterThanOrEqual(4.9);
  expect(r, `ink-on-raise on raise ${r.toFixed(3)} ≥ 4.5`).toBeGreaterThanOrEqual(4.5);
}

describe("AC3 contrast on plan.raise (D-0211 §4)", () => {
  it("plan.ink-on-raise on plan.raise ≥ 4.9 at one decimal and ≥ 4.5 unrounded", () => {
    checkInkOnRaise(raw);
  });
  it("plan.ink-muted on plan.raise stays below 4.5 (text on raise never uses ink-muted)", () => {
    expect(contrast(raw.color.plan["ink-muted"], raw.color.plan.raise)).toBeLessThan(4.5);
  });
  it("planted fault: ink-on-raise #C9D3FF fails", () => {
    const faulty = structuredClone(raw);
    faulty.color.plan["ink-on-raise"] = "#C9D3FF";
    expect(() => checkInkOnRaise(faulty)).toThrow(/ink-on-raise on raise 4\.21\d ≥ 4\.9/);
  });
});

// --- AC4 planCoverage flags
const stops = [...css.matchAll(/--wl-color-plan-coverage-(\d+):\s*(#[0-9A-F]{6});/g)].map(
  (m) => m[2] as string,
);
/** Throws unless each requiresLabel = contrast(step on plan.bg) < 3. */
function checkPlanCoverage(meta: readonly { requiresLabel: boolean }[], bg: string): void {
  expect(stops).toHaveLength(5);
  expect(meta, "one flag per step").toHaveLength(stops.length);
  stops.forEach((hex, n) => {
    expect(Object.keys(meta[n] ?? {}), `step ${n} keys`).toEqual(["requiresLabel"]);
    expect(meta[n]?.requiresLabel, `step ${n} requiresLabel`).toBe(contrast(hex, bg) < 3);
  });
}

describe("AC4 meta.planCoverage (D-0211 §1)", () => {
  it("each requiresLabel = contrast of --wl-color-plan-coverage-n on plan.bg < 3", () => {
    checkPlanCoverage(raw.meta.planCoverage, raw.color.plan.bg);
  });
  it("both values occur: step 0 needs a label, step 4 does not", () => {
    expect(raw.meta.planCoverage[0]?.requiresLabel).toBe(true);
    expect(contrast(stops[0] as string, raw.color.plan.bg)).toBeLessThan(3);
    expect(raw.meta.planCoverage[4]?.requiresLabel).toBe(false);
    expect(contrast(stops[4] as string, raw.color.plan.bg)).toBeGreaterThanOrEqual(3);
  });
  it.each([0, 1, 2, 3, 4])("planted fault: flipping step %i fails", (n) => {
    const faulty = raw.meta.planCoverage.map((e, i) =>
      i === n ? { requiresLabel: !e.requiresLabel } : e,
    );
    expect(() => checkPlanCoverage(faulty, raw.color.plan.bg)).toThrow(
      new RegExp(`step ${n} requiresLabel`),
    );
  });
});

describe("AC5 colour guards stay green", () => {
  it("wl-check-colours exits 0 on the tokens src and the apps", () => {
    const res = runCli([
      resolve(pkgRoot, "src"),
      resolve(repoRoot, "apps/web"),
      resolve(repoRoot, "apps/landing"),
    ]);
    expect(res.status, res.stdout + res.stderr).toBe(0);
  });
  it(".github/scripts/auth-templates.test.mjs passes against the new tokens.json", () => {
    const res = spawnSync(
      process.execPath,
      ["--test", resolve(repoRoot, ".github/scripts/auth-templates.test.mjs")],
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(res.status, res.stdout + res.stderr).toBe(0);
  });
});

describe("AC6 design-system.md lists the additions", () => {
  const md = readFileSync(resolve(repoRoot, "Design-docs/docs/design/design-system.md"), "utf8");
  it("has a row for each new token with its value and use, and the 4.9 ratio", () => {
    expect(md).toMatch(/^\| `plan\.ink-on-raise` \| `#DDE3FF` \| Labels on `plan\.raise` tiles/m);
    expect(md).toMatch(/^\| `plan\.scrim` \| `#0E1652` \| Sheet dim, at 45 %/m);
    expect(md).toContain("`--wl-radius-progress` 2 px");
    expect(md).toContain("`--wl-space-option-bleed` 18 px");
    expect(md).toContain("| `plan.ink-on-raise` on `plan.raise` | 4.9 | 4.5 |");
    expect(md).toContain("`meta.planCoverage[n].requiresLabel`");
    expect(md).toContain("D-0211");
  });
});
