// @vitest-environment node
// T-0307a AC-A21: every user-facing string UF-10 renders comes from `en.uf10`
// (`lib/i18n/flows/uf-10.ts`, this ticket's own file) or from an existing `en.*` / design-token
// label — and `lib/i18n/en.ts` is NOT modified by this ticket.
//
// "en.ts is not modified" is implemented as the ticket specifies:
//   1. no file under `features/UF-10/**` declares a user-facing literal (the existing
//      `react/jsx-no-literals` rule, which must stay green), and
//   2. `flows/uf-10.ts` is non-empty with every key this feature uses reachable as `en.uf10.*`.
// Plus a hermetic check that no uf10-owned string is declared in `en.ts`.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { attentionLegend, coverageLegend } from "@workoutlab/design-tokens";
import { en } from "../../../lib/i18n/en.js";
import { uf10 } from "../../../lib/i18n/flows/uf-10.js";

const WEB_ROOT = process.cwd();
const FEATURE_DIR = resolve(WEB_ROOT, "src/features/UF-10");

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
    const values: string[] = [];
    for (const v of Object.values(uf10)) if (typeof v === "string") values.push(v);
    const existing: string[] = [
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
    // And the legend copy comes from the design tokens, not a local constant.
    expect(source).toContain("coverageLegend");
  });
});

describe("AC-A21 lib/i18n/en.ts carries none of this feature's copy", () => {
  // Hermetic on purpose: no git, no branch names. The lane boundary itself is T-0320's
  // mechanical check; this asserts the string-level consequence.
  it("no uf10 string value is declared in en.ts (it lives in flows/uf-10.ts only)", () => {
    const enSource = readFileSync(resolve(WEB_ROOT, "src/lib/i18n/en.ts"), "utf8");
    const own: string[] = [];
    // Long strings only: short labels ("Plan") legitimately exist in en.ts already.
    for (const v of Object.values(uf10)) if (typeof v === "string" && v.length > 15) own.push(v);
    expect(own.length).toBeGreaterThan(2);
    expect(own.filter((v) => enSource.includes(v))).toEqual([]);
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
