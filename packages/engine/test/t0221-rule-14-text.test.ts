// T-0221 UF-09.3 UF-09.4 UF-08.2: rule 14 states the D-0057 §2/§4/§6 and D-0062
// §1/§2/§4/§5 build defaults (D-0132 §1). Per D-0096 §2 this pins only T-0221's own content
// positively; the T-0205 guard (narrowed by D-0132 §2) still compares the R14 example lines
// with main. The AC5 tests pin the stated facts that no earlier engine test pinned; each
// expectation is derived by hand from the new rule 14 text and runs on today's src/**.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  prefill,
  type HistorySet,
  type LibraryExercise,
  type PrefillPrevious,
  type PrefillResult,
  type PrefillSlot,
} from "../src/index.js";
import { LIBRARY, NOW, TZ, setsWithReps, type SetEntry } from "./fixtures/common.js";
import {
  RULE14_D0132,
  RULE14_PINNED,
  rule14GuardDiff,
  rule14GuardedLines,
  rule14Section,
} from "./fixtures/rule14-pinned-d0132.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(TEST_DIR, "..", "..", "..");
const DOC = readFileSync(path.join(REPO_DIR, "docs", "engine-rules.md"), "utf8");

function rule14(): string[] {
  const section = rule14Section(DOC);
  expect(section).not.toBeNull();
  return (section as string).split("\n");
}

function one(lines: readonly string[], prefix: string): string {
  const found = lines.filter((l) => l.startsWith(prefix));
  expect(found, prefix).toHaveLength(1);
  return found[0] as string;
}

const BLOCK = "**Edge cases (D-0057, D-0062, D-0132):**";
const BULLETS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["- **Bodyweight (D-0057 §2):**", ["externalLoad: false", "high reps", "increase"]],
  [
    "- **Usable sets (D-0057 §3, D-0062 §2, §3):**",
    ["reps are null", "step 1 applies", "older session"],
  ],
  ["- **Drop floor (D-0057 §4, D-0062 §4):**", ["incrementKg ?? 2.5", "one increment", "0 + inc"]],
  [
    "- **Carry (D-0062 §1):**",
    ["> 0", "externalLoad: true", "exercise", "weight-1.0 area", '["none"]', "3 decimals"],
  ],
  [
    "- **Timed (D-0057 §6, D-0062 §5):**",
    ["[15, 120]", "10–20", "clamp(min)", "hold_after_break", "hold", "floor5", "unclamped"],
  ],
];

describe("T-0221 rule 14 text (D-0132 §1)", () => {
  it("T-0221 AC1 rule-14 steps 2 and 5 floor the drop at one increment; step 4 states bodyweight", () => {
    const lines = rule14();
    expect(one(lines, "2. ")).toContain("max(inc, floorInc(0.9 W))");
    expect(one(lines, "5. ")).toContain("max(inc, floorInc(0.9 W))");
    const step4 = one(lines, "4. ");
    expect(step4).toContain("bodyweight");
    expect(step4).toContain("high reps");
  });

  it("T-0221 AC1 AC2 rule-14 steps 2, 4, 5 and the edge-case block are byte-identical to the D-0132 text", () => {
    const lines = rule14();
    expect(one(lines, "2. ")).toBe(RULE14_D0132.step2);
    expect(one(lines, "4. ")).toBe(RULE14_D0132.step4);
    expect(one(lines, "5. ")).toBe(RULE14_D0132.step5);
    const block = lines.indexOf(one(lines, BLOCK));
    expect(lines[block]).toBe(RULE14_D0132.edgeCases);
    expect(lines.slice(block + 1, block + 6)).toEqual([...RULE14_D0132.bullets]);
    // CommonMark: a blank line keeps the bold block line out of the timed paragraph.
    expect(lines[block - 1]).toBe("");
    expect(lines[block - 2]?.startsWith("For timed sets")).toBe(true);
  });

  it("T-0221 AC2 rule-14 has one edge-case block between the timed paragraph and R14-E1", () => {
    const lines = rule14();
    const at = lines.filter((l) => l.startsWith(BLOCK));
    expect(at).toHaveLength(1);
    const block = lines.indexOf(at[0] as string);
    const timed = lines.findIndex((l) => l.startsWith("For timed sets"));
    const e1 = lines.findIndex((l) => l.startsWith("- **R14-E1"));
    expect(timed).toBeGreaterThan(-1);
    expect(block).toBeGreaterThan(timed);
    expect(e1).toBeGreaterThan(block);
  });

  it("T-0221 AC2 rule-14 the block's five bullets follow it in order, each with its tokens", () => {
    const lines = rule14();
    const block = lines.findIndex((l) => l.startsWith(BLOCK));
    expect(block).toBeGreaterThan(-1);
    BULLETS.forEach(([prefix, tokens], i) => {
      const line = lines[block + 1 + i] ?? "";
      expect(line.startsWith(prefix), `bullet ${i}: ${line}`).toBe(true);
      for (const t of tokens) expect(line, `${prefix} ${t}`).toContain(t);
    });
    // Exactly five: the next line is not another edge-case bullet.
    const next = lines[block + 1 + BULLETS.length] ?? "";
    expect(next.startsWith("- **R14-E") || next === "").toBe(true);
  });

  it("T-0221 AC3 rule-14 the heading, Last performance, steps 1/3/6/7, timed paragraph and R14-E1…E9 match the pinned fixture", () => {
    const lines = rule14();
    expect(one(lines, "## 14.")).toBe(RULE14_PINNED.heading);
    expect(one(lines, "**Last performance**")).toBe(RULE14_PINNED.lastPerformance);
    expect(one(lines, "1. ")).toBe(RULE14_PINNED.step1);
    expect(one(lines, "3. ")).toBe(RULE14_PINNED.step3);
    expect(one(lines, "6. ")).toBe(RULE14_PINNED.step6);
    expect(one(lines, "7. ")).toBe(RULE14_PINNED.step7);
    expect(one(lines, "For timed sets")).toBe(RULE14_PINNED.timed);
    expect(lines.filter((l) => l.startsWith("- **R14-E"))).toEqual([...RULE14_PINNED.examples]);
    expect(RULE14_PINNED.examples).toHaveLength(9);
  });

  it("T-0221 AC6 the Traceability table has exactly one T-0221 row and it cites D-0132", () => {
    const table = DOC.slice(DOC.indexOf("## Traceability"));
    const rows = table.split("\n").filter((l) => /^\|.*\|\s*T-0221\s*\|$/.test(l));
    expect(rows).toEqual(["| 14 text: D-0057 §2/§4/§6, D-0062 §1/§2/§4/§5 (D-0132) | T-0221 |"]);
  });
});

// ---- AC4: the narrowed T-0205 guard (D-0132 §2), on in-memory docs ----

const MEMO = [
  "# rules",
  "## 13. Shuffle",
  "text",
  "## 14. Progression and pre-fill (UF-09.3)",
  "**Last performance** is the hard sets.",
  "1. No history.",
  "2. `gap ≥ 21`: `floorInc(0.9 W)`.",
  "For timed sets, the first time.",
  "- **R14-E1** a.",
  "- **R14-E5** 100 × 5, 5, 4 on 09-20: 90 × 6 (`deload`).",
  "",
  "## Required tests",
  "x",
].join("\n");

describe("T-0221 the narrowed T-0205 guard (D-0132 §2)", () => {
  it("T-0221 AC4 the guard reads only the heading, Last performance and R14 example lines", () => {
    expect(rule14GuardedLines(MEMO)).toEqual([
      "## 14. Progression and pre-fill (UF-09.3)",
      "**Last performance** is the hard sets.",
      "- **R14-E1** a.",
      "- **R14-E5** 100 × 5, 5, 4 on 09-20: 90 × 6 (`deload`).",
    ]);
    expect(rule14GuardDiff(MEMO, MEMO)).toEqual([]);
  });

  it("T-0221 AC4 a doc that changes one R14-E5 character fails the guard", () => {
    const changed = MEMO.replace("90 × 6 (`deload`)", "90 × 7 (`deload`)");
    expect(changed).not.toBe(MEMO);
    expect(rule14GuardDiff(changed, MEMO)).toHaveLength(1);
  });

  it("T-0221 AC4 a doc that adds an edge-case bullet passes the guard", () => {
    const added = MEMO.replace(
      "For timed sets, the first time.\n",
      `For timed sets, the first time.\n${BLOCK}\n- **Bodyweight (D-0057 §2):** W is 0.\n`,
    );
    expect(added).not.toBe(MEMO);
    expect(rule14GuardDiff(added, MEMO)).toEqual([]);
  });

  it("T-0221 AC4 a doc that edits steps 2 and 5 passes the guard; a changed heading or a dropped example fails", () => {
    const steps = MEMO.replace("`floorInc(0.9 W)`", "`max(inc, floorInc(0.9 W))`");
    expect(rule14GuardDiff(steps, MEMO)).toEqual([]);
    expect(rule14GuardDiff(MEMO.replace("(UF-09.3)", "(UF-09.4)"), MEMO)).toHaveLength(1);
    expect(rule14GuardDiff(MEMO.replace("- **R14-E1** a.\n", ""), MEMO).length).toBeGreaterThan(0);
    expect(rule14GuardDiff(MEMO.replace("## 14.", "## 15."), MEMO).length).toBeGreaterThan(0);
  });
});

// ---- AC5: stated facts with no earlier test (D-0132 §3) ----

const MAIN: PrefillSlot = { repsMin: 6, repsMax: 8 };
const COMPOUND: PrefillSlot = { repsMin: 8, repsMax: 12 };
const TIMED: PrefillSlot = { repsMin: null, repsMax: null };

function ex(id: string): LibraryExercise {
  const found = LIBRARY.find((e) => e.id === id);
  if (found === undefined) throw new Error(`no ${id} in LIBRARY`);
  return found;
}

const pf = (
  id: string,
  slot: PrefillSlot,
  history: readonly HistorySet[],
  previous: PrefillPrevious | null = null,
): PrefillResult => prefill(ex(id), slot, history, LIBRARY, NOW, TZ, previous);
const S = (date: string, id: string, entries: readonly SetEntry[]): HistorySet[] =>
  setsWithReps(date, id, entries);
const x = (w: number | null, r: number | null, n = 1): SetEntry[] =>
  Array.from({ length: n }, () => [w, r] as const);
const secs = (...d: Array<number | null>): SetEntry[] => d.map((durationS) => ({ durationS }));
const res = (
  weightKg: number | null,
  reps: number | null,
  kind: PrefillResult["kind"],
  durationS: number | null = null,
): PrefillResult => ({ weightKg, reps, durationS, kind });

describe("T-0221 rule 14 edge-case facts (D-0132 §3)", () => {
  it("T-0221 AC5 rule-14 Timed: plank 130, 130 s on 09-15 (gap 12) → clamp(130) = 120 s hold_after_break", () => {
    expect(pf("plank", TIMED, S("2026-09-15", "plank", secs(130, 130)))).toEqual(
      res(null, null, "hold_after_break", 120),
    );
  });

  it("T-0221 AC5 rule-14 Timed: plank 10, 10 s on 09-24 → clamp(15) = 15 s add_rep (clamped up)", () => {
    expect(pf("plank", TIMED, S("2026-09-24", "plank", secs(10, 10)))).toEqual(
      res(null, null, "add_rep", 15),
    );
  });

  it("T-0221 AC5 rule-14 Timed: plank 200 s on 09-01 (gap 26) → clamp(floor5(180)) = 120 s reentry", () => {
    expect(pf("plank", TIMED, S("2026-09-01", "plank", secs(200)))).toEqual(
      res(null, null, "reentry", 120),
    );
  });

  it("T-0221 AC5 rule-14 Timed: the first time is defaultDurationS, unclamped (10 s and 150 s)", () => {
    for (const d of [10, 150]) {
      const hold: LibraryExercise = { ...ex("plank"), id: `hold-${d}`, defaultDurationS: d };
      const lib = [...LIBRARY, hold];
      expect(prefill(hold, TIMED, [], lib, NOW, TZ, null)).toEqual(
        res(null, null, "first_time", d),
      );
    }
  });

  it("T-0221 AC5 rule-14 Drop floor: back-squat 0 kg × 12, 12, 12 on 09-24, 8–12 slot → 0 + inc = 2.5 × 8 increase", () => {
    const h = S("2026-09-24", "back-squat", x(0, 12, 3));
    expect(pf("back-squat", COMPOUND, h, null)).toEqual(res(2.5, 8, "increase"));
  });

  it("T-0221 AC5 rule-14 Drop floor: a loaded lift at W = 0 gives 0 in steps 6 and 7", () => {
    // Step 6: one session with minReps 5 < low 6 → 0 × 6 hold.
    expect(pf("back-squat", MAIN, S("2026-09-24", "back-squat", x(0, 5, 3)))).toEqual(
      res(0, 6, "hold"),
    );
    // Step 7: minReps 7 → 0 × min(8, 8) add_rep.
    expect(pf("back-squat", MAIN, S("2026-09-24", "back-squat", x(0, 7, 3)))).toEqual(
      res(0, 8, "add_rep"),
    );
  });

  it("T-0221 AC5 rule-14 Bodyweight: every set with non-null reps counts as at W, whatever weight was logged", () => {
    // push-up 5 kg × 12, 12, 12: W is 0, all three sets are at W with reps 12 ≥ high 12 →
    // step 4, 0 × 12 increase. A null weight reads the same.
    expect(pf("push-up", COMPOUND, S("2026-09-24", "push-up", x(5, 12, 3)))).toEqual(
      res(0, 12, "increase"),
    );
    expect(pf("push-up", COMPOUND, S("2026-09-24", "push-up", x(null, 12, 3)))).toEqual(
      res(0, 12, "increase"),
    );
    // Mixed stray weights: the 5 kg set's 9 reps count too → minReps 9 → 0 × 10 add_rep.
    const h = S("2026-09-24", "push-up", [...x(10, 12), ...x(5, 9), ...x(null, 12)]);
    expect(pf("push-up", COMPOUND, h)).toEqual(res(0, 10, "add_rep"));
  });

  it("T-0221 AC5 rule-14 Usable sets: W counts a reps-null set, so a heavier reps-null set leaves no usable set at W → step 1", () => {
    // W = 110 (the reps-null set); no set at 110 has reps → step 1, first_time null × 6.
    const h = S("2026-09-24", "back-squat", [...x(110, null), ...x(100, 8, 2)]);
    expect(pf("back-squat", MAIN, h)).toEqual(res(null, 6, "first_time"));
  });
});
