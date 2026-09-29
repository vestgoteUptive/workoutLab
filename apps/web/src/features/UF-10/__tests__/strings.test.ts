// @vitest-environment node
// T-0307a AC-A21: every user-facing string UF-10 renders comes from `en.uf10`
// (`lib/i18n/flows/uf-10.ts`, this ticket's own file) or from an existing `en.*` / design-token
// label — and `lib/i18n/en.ts` is NOT modified by this ticket.
//
// "en.ts is not modified" is implemented as the ticket specifies:
//   1. no file under `features/UF-10/**` declares a user-facing literal (the existing
//      `react/jsx-no-literals` rule, which must stay green), and
//   2. `flows/uf-10.ts` is non-empty with every key this feature uses reachable as `en.uf10.*`.
// Plus a direct source check that `en.ts`'s own content is byte-identical to main's.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { attentionLegend, coverageLegend } from "@workoutlab/design-tokens";
import { en } from "../../../lib/i18n/en.js";
import { uf10 } from "../../../lib/i18n/flows/uf-10.js";

const WEB_ROOT = process.cwd();
const FEATURE_DIR = resolve(WEB_ROOT, "src/features/UF-10");
const REPO_ROOT = resolve(WEB_ROOT, "../..");

/** Every non-test source file in the feature. */
function featureSources(): string[] {
  return readdirSync(FEATURE_DIR)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((f) => resolve(FEATURE_DIR, f));
}

describe("AC-A21 the strings live in this ticket's own flow file", () => {
  it("flows/uf-10.ts is non-empty and keeps the `export const uf10 = {…} as const` shape", () => {
    const source = readFileSync(
      resolve(WEB_ROOT, "src/lib/i18n/flows/uf-10.ts"),
      "utf8",
    );
    expect(source).toMatch(/export const uf10 = \{[\s\S]+\} as const;/);
    expect(Object.keys(uf10).length).toBeGreaterThan(0);
  });

  it("en.uf10 is reference-equal to the flows/uf-10.ts export", () => {
    expect(en.uf10).toBe(uf10);
  });

  it("every key the feature uses is reachable as en.uf10.*", () => {
    const used = new Set<string>();
    for (const file of featureSources()) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\ben\.uf10\.(\w+)/g)) used.add(match[1]!);
    }
    // The feature really does read its own catalogue (a screen that hard-coded everything
    // would have an empty set here and pass the loop below vacuously).
    expect(used.size).toBeGreaterThan(10);
    for (const key of used) {
      expect(uf10, key).toHaveProperty(key);
    }
  });

  it("no key in flows/uf-10.ts is dead", () => {
    // Keeps the file honest in the other direction: an unused string is copy nobody reviewed.
    const source = featureSources()
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    const unused = Object.keys(uf10).filter((key) => !source.includes(`en.uf10.${key}`));
    expect(unused).toEqual([]);
  });

  it("the feature does not duplicate a string that already exists elsewhere", () => {
    // Area names, `load / target` and the legend copy are reused, never re-declared (AC-A21).
    const values = Object.values(uf10).filter((v): v is string => typeof v === "string");
    const existing = [
      ...Object.values(en.bodyMap.areas),
      en.bodyMap.legendName,
      en.bodyMap.hardSets,
      en.bodyMap.of,
      en.bodyMap.mapName,
      en.offline.ariaLabel,
      en.offline.notSyncedYet,
      ...coverageLegend.map((e) => e.label),
      ...coverageLegend.map((e) => e.srLabel),
      attentionLegend.label,
      attentionLegend.srLabel,
    ];
    expect(values.filter((v) => existing.includes(v))).toEqual([]);
  });

  it("the feature reuses the shared area names and load/target label rather than its own", () => {
    const source = featureSources()
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    expect(source).toContain("en.bodyMap.areas[");
    expect(source).toContain("en.bodyMap.loadOfTarget(");
    // And the legend/attention token copy comes from the design tokens, not a local constant.
    expect(source).toContain("attentionLegend");
    expect(source).toContain("coverageLegend");
  });
});

/**
 * `main` is present in this worktree and in CI's full checkout, but a shallow clone may not
 * have it. These three assertions are about a *lane boundary*, so silently skipping them would
 * be worse than useless — `hasMain()` therefore fails loudly with what it found instead of
 * quietly passing.
 */
function gitOut(args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

function changedFiles(): string[] {
  // Three dots: `main..HEAD` also lists commits that landed on main after the fork, which has
  // already read as a false lane violation once (`.squad/state.md`).
  return gitOut(["diff", "--name-only", "main...HEAD"]).split("\n").filter(Boolean);
}

describe("AC-A21 lib/i18n/en.ts is not modified by this ticket", () => {
  it("`main` is available, so the three lane assertions below are real", () => {
    expect(gitOut(["rev-parse", "--verify", "main"]).trim()).toMatch(/^[0-9a-f]{40}$/);
    // And the diff is non-empty, so "no lib/ file changed" is not an artefact of an empty diff.
    expect(changedFiles().length).toBeGreaterThan(0);
  });

  it("en.ts is byte-identical to main's", () => {
    // The direct check. `lib/i18n/en.ts` is web-shell's and is explicitly in this ticket's
    // "Not yours" list; T-0320 will make this mechanical for every lane, but until it merges
    // this asserts it for UF-10.
    // The merge-base, not the tip of main: main moves on (T-0334 edits shared files), and a
    // later change there is not this ticket's edit.
    const base = gitOut(["merge-base", "main", "HEAD"]).trim();
    const committed = gitOut(["show", `${base}:apps/web/src/lib/i18n/en.ts`]);
    const current = readFileSync(resolve(WEB_ROOT, "src/lib/i18n/en.ts"), "utf8");
    expect(current).toBe(committed);
  });

  it("this ticket touches no file under lib/ other than flows/uf-10.ts", () => {
    expect(changedFiles().filter((f) => f.startsWith("apps/web/src/lib/"))).toEqual([
      "apps/web/src/lib/i18n/flows/uf-10.ts",
    ]);
  });

  it("every file this ticket changed is inside its declared lane", () => {
    // The ticket's "Paths you may change", asserted mechanically from this lane (T-0320 will
    // generalise it): `features/UF-10/**`, `lib/i18n/flows/uf-10.ts`,
    // `tests/e2e/uf-10-balance.spec.ts` and the triage note this build had to file.
    const allowed = (file: string): boolean =>
      file.startsWith("apps/web/src/features/UF-10/") ||
      file === "apps/web/src/lib/i18n/flows/uf-10.ts" ||
      file === "tests/e2e/uf-10-balance.spec.ts" ||
      file.startsWith(".squad/triage/");
    expect(changedFiles().filter((f) => !allowed(f))).toEqual([]);
  });

  it("this ticket touches no other flow's string file", () => {
    // The guarantee that makes the five Phase 3 feature lanes parallel (D-0071 §1).
    expect(changedFiles().filter((f) => f.startsWith("apps/web/src/lib/i18n/flows/"))).toEqual([
      "apps/web/src/lib/i18n/flows/uf-10.ts",
    ]);
  });
});

describe("AC-A21 no user-facing literal is declared in the feature", () => {
  const eslint = new ESLint({ cwd: WEB_ROOT });

  it("react/jsx-no-literals is green across features/UF-10 (the rule must stay green)", async () => {
    const results = await eslint.lintFiles([FEATURE_DIR]);
    const literals = results.flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId === "react/jsx-no-literals")
        .map((m) => `${r.filePath}:${m.line} ${m.message}`),
    );
    expect(literals).toEqual([]);
  });

  it("CONTRAST: the same rule DOES fire on a planted literal in this folder", async () => {
    // Without this, "no literals" could mean the rule does not apply to `features/UF-10/**`.
    const [result] = await eslint.lintText(
      "export const X = () => <p>Nothing logged in the last 14 days.</p>;\n",
      { filePath: resolve(FEATURE_DIR, "planted.tsx") },
    );
    expect(result!.messages.filter((m) => m.fatal)).toEqual([]);
    expect(result!.messages.filter((m) => m.ruleId === "react/jsx-no-literals")).not.toHaveLength(
      0,
    );
  });

  it("the CSS carries no raw hex: colours and fonts come only from design tokens", async () => {
    const css = readFileSync(resolve(FEATURE_DIR, "balance.css"), "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).toMatch(/var\(--wl-color-/);
    expect(css).toMatch(/var\(--wl-font-/);
  });

  it("no TS/TSX file in the feature carries a raw hex colour either", () => {
    for (const file of featureSources()) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    }
  });
});
