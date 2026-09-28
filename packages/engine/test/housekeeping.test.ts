// Housekeeping: placeholders, traceability, public API, contract sentence. AC34–AC36.
// T-0202: the D-0041 §1 rename in engine-rules.md (AC26) and rule 9 traceability/API (AC27).
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  AREAS,
  areaLoads,
  balance,
  checkinSessions,
  deriveTargets,
  evaluateCheckin,
  previewTargets,
  isHardSet,
  localDate,
  normalizeHistory,
  primaryAreas,
  recoveringAreas,
  windowOf,
  type Area,
  type CheckinAnswer,
  type CheckinEvaluation,
  type CheckinPeriod,
  type CheckinProfile,
  type CheckinSession,
  type EngineProfile,
} from "@workoutlab/engine";
import { F_PROFILE } from "./fixtures/common.js";

const ENGINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = path.resolve(ENGINE_DIR, "..", "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const ALL_IDS = [
  "R0-E1",
  "R0-E2",
  "R1-E1",
  "R2-E1",
  "R3-E1",
  "R3-E2",
  "R3-E3",
  "R3-E4",
  "R4-E1",
  "R4-E2",
  "R4-E3",
  "R4-E4",
  "R4-E5",
  "R5-E1",
  "R5-E2",
  "R5-E3",
  "R5-E4",
  "R6-E1",
  "R6-E2",
  "R11-E1",
  "R11-E2",
  "R11-E3",
  "R11-E4",
];

describe("housekeeping", () => {
  it("rule-0 (AC34) no placeholder marker or literal-only expect in packages/engine", () => {
    // Built from parts so this file doesn't match its own search.
    const marker = new RegExp("@" + "placeholder");
    const literal = new RegExp(
      "\\bexpect" + "\\(\\s*(true|1|\"[^\"]*\"|'[^']*'|null|undefined)\\s*\\)",
    );
    const offenders = walk(ENGINE_DIR)
      .filter((f) => /\.(ts|mjs|js|json)$/.test(f))
      .filter((f) => {
        const text = readFileSync(f, "utf8");
        return marker.test(text) || literal.test(text);
      });
    expect(offenders).toEqual([]);
  });

  it("rule-0 (AC34) each of the 22 example ids appears in an it()/test() title", () => {
    // The ticket says "22 ids", but its list (R0-E1 … R11-E4) expands to these 23; all are checked.
    expect(new Set(ALL_IDS).size).toBe(23);
    const titles: string[] = [];
    const titleRe = /\b(?:it|test)(?:\.each\([\s\S]*?\))?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;
    for (const f of walk(path.join(ENGINE_DIR, "test")).filter((p) => p.endsWith(".test.ts"))) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(titleRe)) titles.push(m[2] ?? "");
    }
    const missing = ALL_IDS.filter(
      (id) => !titles.some((t) => new RegExp(`(^|[^\\w-])${id}(?![\\w])`).test(t)),
    );
    expect(missing).toEqual([]);
  });

  it("rule-0 (AC35) the public API imports from @workoutlab/engine", () => {
    expect(AREAS).toEqual([
      "chest",
      "back",
      "shoulders",
      "arms",
      "core",
      "glutes",
      "quads",
      "hamstrings",
      "calves",
    ]);
    for (const fn of [
      normalizeHistory,
      primaryAreas,
      isHardSet,
      localDate,
      windowOf,
      areaLoads,
      deriveTargets,
      recoveringAreas,
      balance,
    ]) {
      expect(typeof fn).toBe("function");
    }
  });

  it("rule-0 (AC36) rule 0 of engine-rules.md states the equal-edited_at tie-break and cites D-0034", () => {
    const doc = readFileSync(path.join(REPO_DIR, "docs", "engine-rules.md"), "utf8");
    const start = doc.indexOf("## 0. Purity and inputs");
    const end = doc.indexOf("## 1. ", start);
    const rule0 = doc.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(rule0).toMatch(/same `client_id` and `edited_at`/);
    expect(rule0).toMatch(/server row beats a queued row/);
    expect(rule0).toMatch(/tombstone beats a live row/);
    expect(rule0).toMatch(/first row in input order wins/);
    expect(rule0).toContain("D-0034");
  });

  it("rule-0 (AC27) engine source never calls localeCompare", () => {
    for (const f of walk(path.join(ENGINE_DIR, "src"))) {
      expect(readFileSync(f, "utf8")).not.toMatch(/localeCompare/);
    }
  });
});

// ---- T-0202 (rule 9) ----

const RULES_PATH = "docs/engine-rules.md";

/** The three D-0041 §1 edits as [before, after] fragments. */
const RENAMES: Array<[string, string]> = [
  ["onboarded and `plan_updated_at` 2026-08-02", "onboarded and `plan_changed_at` 2026-08-02"],
  [
    "local date of profile.plan_updated_at)",
    "local date of `profiles.plan_changed_at` (engine field `planUpdatedAt`, D-0035, D-0041))",
  ],
  ["`plan_updated_at` 2026-09-20", "`plan_changed_at` 2026-09-20"],
];

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_DIR, encoding: "utf8" });
}

/**
 * The diff that made the rename. Before merge it is the branch diff against the merge base
 * with main (the ticket's `git diff main`); once the rename is on main, it is the commit that
 * removed `plan_updated_at`, so the check keeps working after merge.
 */
function renameDiff(): string {
  const base = git("merge-base", "HEAD", "main").trim();
  if (git("show", `${base}:${RULES_PATH}`).includes("plan_updated_at")) {
    return git("diff", "-U0", "--no-color", base, "--", RULES_PATH);
  }
  const commit = git(
    "log",
    "-1",
    "--format=%H",
    "-S",
    "plan_updated_at",
    "main",
    "--",
    RULES_PATH,
  ).trim();
  return git("diff", "-U0", "--no-color", `${commit}^`, commit, "--", RULES_PATH);
}

function changedLines(diff: string): { removed: string[]; added: string[] } {
  const removed: string[] = [];
  const added: string[] = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("--- a/") || line.startsWith("+++ b/")) continue;
    if (line.startsWith("-")) removed.push(line.slice(1));
    else if (line.startsWith("+")) added.push(line.slice(1));
  }
  return { removed, added };
}

const RULE9_IDS = Array.from({ length: 13 }, (_, i) => `R9-E${i + 1}`);
const UF11_ACS = [1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14, 16, 17].map((n) => `UF-11 AC${n}`);

function testTitles(): string[] {
  const titles: string[] = [];
  const titleRe = /\b(?:it|test)(?:\.each\([\s\S]*?\))?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;
  for (const f of walk(path.join(ENGINE_DIR, "test")).filter((p) => p.endsWith(".test.ts"))) {
    for (const m of readFileSync(f, "utf8").matchAll(titleRe)) titles.push(m[2] ?? "");
  }
  return titles;
}

describe("housekeeping T-0202 (rule 9)", () => {
  it("rule-9 (AC26) engine-rules.md says plan_changed_at in F-profile, rule 9 Reset and R9-E13 (D-0041 §1)", () => {
    const doc = readFileSync(path.join(REPO_DIR, RULES_PATH), "utf8");
    expect(doc.match(/plan_updated_at/g) ?? []).toEqual([]);
    const fProfile = doc.split("\n").find((l) => l.startsWith("- **F-profile:**")) ?? "";
    expect(fProfile).toContain("`plan_changed_at` 2026-08-02");
    const reset = doc.split("\n").find((l) => l.startsWith("- **Reset:**")) ?? "";
    expect(reset).toContain(
      "local date of `profiles.plan_changed_at` (engine field `planUpdatedAt`, D-0035, D-0041)",
    );
    const e13 = doc.split("\n").find((l) => l.startsWith("- **R9-E13")) ?? "";
    expect(e13).toContain("`plan_changed_at` 2026-09-20");
  });

  it("rule-9 (AC26) the rename diff changes exactly those 3 lines", () => {
    const { removed, added } = changedLines(renameDiff());
    expect(removed).toHaveLength(3);
    expect(added).toHaveLength(3);
    RENAMES.forEach(([before, after], i) => {
      const old = removed[i] ?? "";
      expect(old).toContain(before);
      expect(added[i]).toBe(old.replace(before, after));
    });
  });

  it("rule-9 (AC27) every R9 id and UF-11 AC id appears in a test title; T-0200 ids still do", () => {
    const titles = testTitles();
    const has = (id: string) => titles.some((t) => new RegExp(`(^|[^\\w-])${id}(?![\\w])`).test(t));
    expect(RULE9_IDS.filter((id) => !has(id))).toEqual([]);
    expect(UF11_ACS.filter((id) => !has(id))).toEqual([]);
    expect(ALL_IDS.filter((id) => !has(id))).toEqual([]);
  });

  it("rule-9 (AC27) evaluateCheckin, checkinSessions and previewTargets are public; CheckinEvaluation is the D-0037 §8 shape", () => {
    for (const fn of [evaluateCheckin, checkinSessions, previewTargets]) {
      expect(typeof fn).toBe("function");
    }
    expectTypeOf<CheckinEvaluation>().toEqualTypeOf<{
      periods: CheckinPeriod[];
      proposal: {
        direction: "down" | "up";
        rhythmMin: number;
        rhythmMax: number;
        previewTargets: { area: Area; setsPer14d: number }[];
      } | null;
      nextCheckinDate: string;
    }>();
    expectTypeOf<CheckinPeriod>().toEqualTypeOf<{
      index: number;
      start: string;
      end: string;
      completed: number;
      status: "under" | "on_plan" | "over";
    }>();
    expectTypeOf<CheckinSession>().toEqualTypeOf<{
      id: string;
      startedAt: string;
      hardSetCount: number;
    }>();
    expectTypeOf<CheckinAnswer>().toEqualTypeOf<{ answeredAt: string | null }>();
    expectTypeOf<EngineProfile>().toExtend<CheckinProfile>();
  });

  it("rule-9 (AC27) a full EngineProfile and PlanCheckin-shaped rows are accepted", () => {
    const profile: EngineProfile = F_PROFILE;
    const planCheckin = {
      id: "P1",
      periodIndex: 3,
      completedPrev: 4,
      completedLast: 3,
      rhythmMinBefore: 3,
      rhythmMaxBefore: 4,
      proposedMin: 2,
      proposedMax: 3,
      proposedAt: "2026-09-27T09:00:00Z",
      answer: null,
      answeredAt: null,
    };
    const r = evaluateCheckin(
      [],
      profile,
      [planCheckin],
      "2026-09-27T12:00:00+02:00",
      "Europe/Stockholm",
    );
    expect(r.nextCheckinDate).toBe("2026-10-11");
    expect(r.periods.map((p) => p.index)).toEqual([2, 3]);
  });
});
