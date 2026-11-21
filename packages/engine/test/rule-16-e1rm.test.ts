// T-0961 UF-06.2: rule 16 estimated 1RM, examples R16-E1 to R16-E10 and R16-E12 (AC1-AC5, AC8, AC9,
// AC12). Display-only: see rule-16-e1rm-histories.test.ts for the simulated histories.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { estimatedOneRepMax, type HistorySet, type LibraryExercise } from "../src/index.js";
import { LIBRARY, deepFreeze } from "./fixtures/common.js";
import { mk, round3 } from "./fixtures/e1rm.js";

const SQ = "back-squat";
const S1 = "S1";
const T = (h: string, m = "00") => `2026-09-01T${h}:${m}:00+02:00`;
const e1 = (h: HistorySet[], id = SQ) => estimatedOneRepMax(deepFreeze(h), LIBRARY, id);
const vals = (h: HistorySet[]) => e1(h).map((p) => [p.weightKg, p.reps, round3(p.e1rm)]);

describe("rule-16 formula (AC1)", () => {
  it("rule-16 R16-E1 (AC1) 100 x 8 gives 126.667", () => {
    const [p] = e1([mk(SQ, S1, T("10"), 100, 8)]);
    expect(p?.e1rm).toBeCloseTo(126.6667, 4);
    expect(p?.e1rm).toBe((100 * 38) / 30);
    expect(p).toMatchObject({ sessionId: S1, weightKg: 100, reps: 8, completedAt: T("10") });
  });
  it("rule-16 R16-E2 (AC1) 100 x 1 is plain Epley 103.333; 90 x 10 is 120", () => {
    expect(vals([mk(SQ, S1, T("10"), 100, 1)])).toEqual([[100, 1, 103.333]]);
    expect(vals([mk(SQ, S1, T("10"), 90, 10)])).toEqual([[90, 10, 120]]);
  });
  it("rule-16 (AC1) the output is not rounded", () => {
    expect(e1([mk(SQ, S1, T("10"), 100, 8)])[0]?.e1rm).not.toBe(126.667);
  });
});

describe("rule-16 valid sets (AC2, AC3)", () => {
  it("rule-16 R16-E3 (AC2) only 60 x 15 gives no point", () => {
    expect(e1([mk(SQ, S1, T("10"), 60, 15)])).toEqual([]);
  });
  it("rule-16 R16-E3 (AC2) 100 x 10 and 60 x 15 in one session give 100 x 10 (133.333)", () => {
    expect(vals([mk(SQ, S1, T("10"), 60, 15), mk(SQ, S1, T("10", "05"), 100, 10)])).toEqual([
      [100, 10, 133.333],
    ]);
  });
  it("rule-16 (AC2) rep range edges: 10 counts, 11 and 0 do not", () => {
    expect(e1([mk(SQ, S1, T("10"), 50, 10)])).toHaveLength(1);
    expect(e1([mk(SQ, S1, T("10"), 50, 11)])).toEqual([]);
    expect(e1([mk(SQ, S1, T("10"), 50, 0)])).toEqual([]);
  });
  it.each<[string, number | null, number | null]>([
    ["weight 0", 0, 8],
    ["reps 0", 100, 0],
    ["reps null", 100, null],
    ["weight null", null, 8],
    ["negative weight", -100, 8],
    ["NaN weight", Number.NaN, 8],
    ["infinite weight", Number.POSITIVE_INFINITY, 8],
    ["non-integer reps", 100, 7.5],
    ["NaN reps", 100, Number.NaN],
    ["negative reps", 100, -3],
  ])("rule-16 R16-E4 (AC2) ignores %s", (_n, w, r) => {
    expect(e1([mk(SQ, S1, T("10"), w, r)])).toEqual([]);
    // and a valid set beside it still gives its own point
    expect(vals([mk(SQ, S1, T("10"), w, r), mk(SQ, S1, T("10", "05"), 80, 5)])).toEqual([
      [80, 5, 93.333],
    ]);
  });
  it("rule-16 R16-E5 (AC3) a warm-up set, a tombstone and a live set: the live set", () => {
    expect(
      vals([
        mk(SQ, S1, T("10"), 130, 1, { isWarmup: true }),
        mk(SQ, S1, T("10", "01"), 120, 5, { deletedAt: T("11") }),
        mk(SQ, S1, T("10", "02"), 100, 8),
      ]),
    ).toEqual([[100, 8, 126.667]]);
  });
  it.each([
    ["an unknown exercise", "no-such-lift"],
    ["a timed exercise", "plank"],
    ["a bodyweight exercise", "push-up"],
    ["a warm-up move", "wu-scap-push-up"],
  ])("rule-16 R16-E6 (AC3) %s gives []", (_n, id) => {
    const h = [mk(id, S1, T("10"), 50, 8, { durationS: 45 }), mk(id, "S2", T("11"), 60, 8)];
    expect(e1(h, id)).toEqual([]);
  });
  it("rule-16 R16-E6 (AC3) zero history and an empty library give []", () => {
    expect(e1([])).toEqual([]);
    expect(estimatedOneRepMax([mk(SQ, S1, T("10"), 100, 8)], [], SQ)).toEqual([]);
  });
  it("rule-16 R16-E6 (AC3) an exercise with external load but timed, or without load, is excluded by its flags", () => {
    const base = LIBRARY.find((e) => e.id === SQ) as LibraryExercise;
    const h = [mk(SQ, S1, T("10"), 100, 8)];
    expect(estimatedOneRepMax(h, [{ ...base, timed: true }], SQ)).toEqual([]);
    expect(estimatedOneRepMax(h, [{ ...base, externalLoad: false }], SQ)).toEqual([]);
    expect(estimatedOneRepMax(h, [{ ...base, kind: "warmup" }], SQ)).toEqual([]);
    expect(estimatedOneRepMax(h, [base], SQ)).toHaveLength(1);
  });
  it("rule-16 (AC3) sets of other exercises are not read", () => {
    expect(e1([mk("bench-press", S1, T("10"), 100, 8)])).toEqual([]);
  });
});

describe("rule-16 best set per session (AC4)", () => {
  it("rule-16 R16-E7 (AC4) 100 x 8 (126.667) beats 105 x 5 (122.5): one point", () => {
    expect(vals([mk(SQ, S1, T("10"), 105, 5), mk(SQ, S1, T("10", "05"), 100, 8)])).toEqual([
      [100, 8, 126.667],
    ]);
  });
  it("rule-16 R16-E7 (AC4) a lighter back-off set never beats the top set", () => {
    expect(
      vals([mk(SQ, S1, T("10"), 100, 5), mk(SQ, S1, T("10", "10"), 80, 8, { clientId: "z" })]),
    ).toEqual([[100, 5, 116.667]]);
  });
  it("rule-16 R16-E8 (AC4) equal sets at 10:00 and 10:05: the 10:00 set", () => {
    const [p] = e1([
      mk(SQ, "S2", T("10", "05"), 100, 8, { clientId: "a" }),
      mk(SQ, "S2", T("10"), 100, 8, { clientId: "b" }),
    ]);
    expect(p?.clientId).toBe("b");
    expect(p?.completedAt).toBe(T("10"));
  });
  it("rule-16 R16-E8 (AC4) equal sets at one instant: the smaller clientId", () => {
    for (const order of [
      ["m", "c"],
      ["c", "m"],
    ] as const) {
      const rows = order.map((c) => mk(SQ, "S2", T("10"), 100, 8, { clientId: c }));
      expect(e1(rows)[0]?.clientId).toBe("c");
    }
  });
  it("rule-16 (AC4) equal e1RM from different weight x reps ties: 100 x 6 and 90 x 10 (both 3600)", () => {
    const [p] = e1([
      mk(SQ, S1, T("10", "05"), 90, 10, { clientId: "a" }),
      mk(SQ, S1, T("10"), 100, 6, { clientId: "b" }),
    ]);
    expect(p?.clientId).toBe("b");
  });
  it("rule-16 (AC4) one point per session across several sessions, oldest first", () => {
    const pts = e1([
      mk(SQ, "B", T("12"), 100, 8),
      mk(SQ, "A", T("10"), 90, 8),
      mk(SQ, "A", T("10", "05"), 80, 8),
    ]);
    expect(pts.map((p) => p.sessionId)).toEqual(["A", "B"]);
  });
  it("rule-16 (AC4) sessions with the same completedAt sort by clientId", () => {
    const pts = e1([
      mk(SQ, "A", T("10"), 100, 8, { clientId: "z" }),
      mk(SQ, "B", T("10"), 100, 8, { clientId: "y" }),
    ]);
    expect(pts.map((p) => p.clientId)).toEqual(["y", "z"]);
  });
});

describe("rule-16 determinism and offline-merged (AC5, AC9)", () => {
  const rows = [
    mk(SQ, "A", T("10"), 100, 8),
    mk(SQ, "A", T("10", "05"), 105, 5),
    mk(SQ, "B", "2026-09-04T10:00:00+02:00", 102.5, 8),
    mk(SQ, "C", "2026-09-08T10:00:00+02:00", 60, 15),
    mk(SQ, "D", "2026-09-09T10:00:00+02:00", 110, 3),
  ];
  it("rule-16 R16-E9 (AC5) shuffled input order gives identical output", () => {
    const expected = e1(rows);
    expect(expected).toHaveLength(3);
    expect(e1([...rows].reverse())).toEqual(expected);
    expect(e1([rows[3], rows[1], rows[4], rows[0], rows[2]] as HistorySet[])).toEqual(expected);
  });
  it("rule-16 R16-E9 (AC5) a replayed row with an older editedAt changes nothing", () => {
    const stale = { ...(rows[0] as HistorySet), editedAt: "2026-08-01T00:00:00+02:00", reps: 3 };
    expect(e1([...rows, stale])).toEqual(e1(rows));
    expect(e1([stale, ...rows])).toEqual(e1(rows));
  });
  it("rule-16 R16-E9 (AC5) the same input twice is deep-equal and the input is not mutated", () => {
    const frozen = deepFreeze(structuredClone(rows));
    expect(estimatedOneRepMax(frozen, LIBRARY, SQ)).toEqual(
      estimatedOneRepMax(frozen, LIBRARY, SQ),
    );
  });
  it("rule-16 R16-E12 (AC9) queued, tombstoned and rejected rows give the clean history's points", () => {
    const clean = [mk(SQ, "A", T("10"), 100, 8), mk(SQ, "B", T("12"), 105, 6)];
    const server = [
      ...clean,
      mk(SQ, "A", T("10", "05"), 120, 5, { clientId: "gone" }),
      mk(SQ, "B", T("12", "05"), 90, 8, { clientId: "rej" }),
    ];
    const queue: HistorySet[] = [
      // queued replay of a server row (same clientId, same editedAt): the server row wins
      { ...(clean[0] as HistorySet), pending: true },
      // queued tombstone of the server row `gone`
      {
        ...(server[2] as HistorySet),
        pending: true,
        editedAt: "2026-09-02T00:00:00+02:00",
        deletedAt: "2026-09-02T00:00:00+02:00",
      },
      // a rejected row is dropped by the caller; its tombstone arrives as the queue's last word
      {
        ...(server[3] as HistorySet),
        pending: true,
        editedAt: "2026-09-03T00:00:00+02:00",
        deletedAt: "2026-09-03T00:00:00+02:00",
      },
    ];
    expect(e1([...server, ...queue])).toEqual(e1(clean));
    expect(e1([...queue, ...server])).toEqual(e1(clean));
    expect(e1(clean)).toHaveLength(2);
  });
});

describe("rule-16 isolation (AC8)", () => {
  const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
  function importsOf(f: string): string[] {
    const file = ts.createSourceFile(
      f,
      readFileSync(path.join(SRC, f), "utf8"),
      ts.ScriptTarget.Latest,
    );
    return file.statements.flatMap((st) =>
      (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) &&
      st.moduleSpecifier !== undefined &&
      ts.isStringLiteral(st.moduleSpecifier) &&
      st.moduleSpecifier.text.startsWith("./")
        ? [st.moduleSpecifier.text.slice(2).replace(/\.js$/, ".ts")]
        : [],
    );
  }
  function reachable(entry: string): Set<string> {
    const seen = new Set<string>();
    const stack = [entry];
    while (stack.length > 0) {
      const f = stack.pop() as string;
      if (seen.has(f)) continue;
      seen.add(f);
      stack.push(...importsOf(f));
    }
    return seen;
  }
  const core = readdirSync(SRC).filter(
    (f) => f.endsWith(".ts") && !["e1rm.ts", "records.ts", "index.ts"].includes(f),
  );

  it("rule-16 (AC8) non-vacuity: the core module list is long and index.ts reaches e1rm.ts", () => {
    expect(core.length).toBeGreaterThan(15);
    expect(core).toContain("session.ts");
    expect(reachable("index.ts").has("e1rm.ts")).toBe(true);
    expect(importsOf("e1rm.ts")).toContain("history.ts");
  });
  it("rule-16 (AC8) e1rm.ts does not reach records.ts", () => {
    expect(reachable("e1rm.ts").has("records.ts")).toBe(false);
  });
  it.each(core)("rule-16 (AC8) %s does not reach e1rm.ts", (f) => {
    expect(reachable(f).has("e1rm.ts")).toBe(false);
  });
  it("rule-16 (AC8) records.ts does not reach e1rm.ts", () => {
    expect(reachable("records.ts").has("e1rm.ts")).toBe(false);
  });
  it("rule-16 (AC8) e1rm.ts has no Date.now() or new Date()", () => {
    const src = readFileSync(path.join(SRC, "e1rm.ts"), "utf8");
    expect(src).not.toMatch(/Date\.now\s*\(/);
    expect(src).not.toMatch(/new\s+Date\b/);
    expect(src).not.toMatch(/Math\.random/);
  });
});

describe("rule-16 rule text (AC12)", () => {
  const rules = readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "docs",
      "engine-rules.md",
    ),
    "utf8",
  );
  it("rule-16 (AC12) rule 15 says the e1RM number is never on Today", () => {
    const r15 = rules.slice(rules.indexOf("## 15. Records"), rules.indexOf("## 16."));
    expect(r15).toContain("never on Today");
    expect(r15).not.toContain("never the e1RM number");
  });
  it("rule-16 (AC12) rule 16 exists with R16-E1 to R16-E13, each a named test in this folder", () => {
    expect(rules).toContain("## 16. Estimated one-rep max");
    const testText = readdirSync(path.dirname(fileURLToPath(import.meta.url)))
      .filter((f) => f.startsWith("rule-16-") && f.endsWith(".test.ts"))
      .map((f) => readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), f), "utf8"))
      .join("\n");
    for (let n = 1; n <= 13; n++) {
      expect(rules).toContain(`**R16-E${n}**`);
      expect(testText).toContain(`rule-16 R16-E${n} `);
    }
  });
});
