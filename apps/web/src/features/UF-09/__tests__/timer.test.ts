// @vitest-environment node
// T-0304a AC-2 (NFR-TIME-1, D-0066 §1 §11): wall-clock timer maths, pause accounting, elapsed,
// warm-up time, and a source test that no file in features/UF-09 counts ticks.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { focusReducer, initialFocusState, type FocusEvent, type FocusState } from "../machine.js";
import { elapsedS, formatClock, remainingS } from "../timer.js";
import { tickCountingMatches } from "./tick-scan.js";
import { L1, P1, S1, STARTED_AT_MS } from "./fixtures.js";

const CTX = { plan: P1, library: L1 };
const FEATURE_DIR = resolve(__dirname, "..");

describe("AC-2 remainingS", () => {
  const t = { startedAtMs: 0, durationS: 120, pausedMs: 0 };
  it("is wall-clock: 30 at 90 000, 0 at 120 000, 0 at 200 000", () => {
    expect(remainingS(t, 90_000)).toBe(30);
    expect(remainingS(t, 120_000)).toBe(0);
    expect(remainingS(t, 200_000)).toBe(0);
    expect(remainingS(t, 119_999)).toBe(1);
  });
  it("pausedMs 15 000 at 90 000 → 45 (the pair: 30 without it)", () => {
    expect(remainingS({ ...t, pausedMs: 15_000 }, 90_000)).toBe(45);
    expect(remainingS(t, 90_000)).toBe(30);
  });
  it("formats m:ss", () => {
    expect([formatClock(30), formatClock(1), formatClock(120), formatClock(0)]).toEqual([
      "0:30",
      "0:01",
      "2:00",
      "0:00",
    ]);
  });
});

function reduce(s: FocusState, e: FocusEvent): FocusState {
  return focusReducer(s, e, CTX);
}

describe("AC-2 pause accounting", () => {
  it("pausing at t and resuming at t + 20 000 adds exactly 20 000 to timer.pausedMs and workoutPausedMs", () => {
    const t = 1_000_000;
    const rest: FocusState = {
      ...initialFocusState(S1, P1, 0),
      phase: "rest",
      timer: { startedAtMs: t - 30_000, durationS: 120, pausedMs: 5_000 },
      workoutPausedMs: 7_000,
    };
    const paused = reduce(rest, { type: "PAUSE", atMs: t });
    const resumed = reduce(paused, { type: "RESUME", atMs: t + 20_000 });
    expect(resumed.timer!.pausedMs - rest.timer!.pausedMs).toBe(20_000);
    expect(resumed.workoutPausedMs - rest.workoutPausedMs).toBe(20_000);
    expect(remainingS(resumed.timer!, t + 20_000)).toBe(remainingS(rest.timer!, t));
  });
});

describe("AC-2 elapsedS", () => {
  const S = STARTED_AT_MS;
  const base = {
    startedAtMs: S,
    workoutPausedMs: 120_000,
    pausedAtMs: null,
    warmupSpentMs: 160_000,
  };
  it("warm-up off budget: 1500 at S + 1 780 000", () => {
    expect(elapsedS({ ...base, warmupInBudget: false }, S + 1_780_000)).toBe(1500);
  });
  it("the pair, warm-up in budget: 1660", () => {
    expect(elapsedS({ ...base, warmupInBudget: true }, S + 1_780_000)).toBe(1660);
  });
  it("doesn't grow while paused (pausedAtMs + 0 and + 60 000); the pair grows when not paused", () => {
    const pausedAtMs = S + 1_000_000;
    const paused = { ...base, pausedAtMs, warmupInBudget: true };
    expect(elapsedS(paused, pausedAtMs + 60_000)).toBe(elapsedS(paused, pausedAtMs));
    const running = { ...base, warmupInBudget: true };
    expect(elapsedS(running, pausedAtMs + 60_000) - elapsedS(running, pausedAtMs)).toBe(60);
  });
});

describe("AC-2 warmupSpentMs", () => {
  it("enter at 5 000, pause at 50 000, resume at 70 000, leave at 185 000 → 160 000", () => {
    let s = initialFocusState(S1, P1, 0);
    s = reduce(s, { type: "COUNTDOWN_END", atMs: 5_000 });
    s = reduce(s, { type: "WARMUP_NEXT", atMs: 45_000 });
    s = reduce(s, { type: "PAUSE", atMs: 50_000 });
    s = reduce(s, { type: "RESUME", atMs: 70_000 });
    s = reduce(s, { type: "WARMUP_NEXT", atMs: 105_000 });
    s = reduce(s, { type: "WARMUP_NEXT", atMs: 145_000 });
    expect(s.phase).toBe("warmup");
    s = reduce(s, { type: "WARMUP_NEXT", atMs: 185_000 });
    expect(s.phase).toBe("next");
    expect(s.warmupSpentMs).toBe(160_000);
  });
  it("the pair: with no pause it is the whole wall time (180 000)", () => {
    let s = initialFocusState(S1, P1, 0);
    s = reduce(s, { type: "COUNTDOWN_END", atMs: 5_000 });
    for (const atMs of [45_000, 85_000, 125_000, 185_000])
      s = reduce(s, { type: "WARMUP_NEXT", atMs });
    expect(s.warmupSpentMs).toBe(180_000);
  });
  it("a pause outside the warm-up doesn't count against it", () => {
    let s = initialFocusState(S1, P1, 0);
    s = reduce(s, { type: "PAUSE", atMs: 1_000 });
    s = reduce(s, { type: "RESUME", atMs: 31_000 });
    s = reduce(s, { type: "COUNTDOWN_END", atMs: 35_000 });
    for (const atMs of [75_000, 115_000, 155_000, 195_000])
      s = reduce(s, { type: "WARMUP_NEXT", atMs });
    expect(s.warmupSpentMs).toBe(160_000);
  });
});

function featureSources(dir: string = FEATURE_DIR): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "__tests__" || name === "__e2e__") continue;
      out.push(...featureSources(path));
    } else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

describe("AC-2 no tick counting (source test)", () => {
  it("no .ts/.tsx non-test file in features/UF-09 decrements or increments a timer value", () => {
    const files = featureSources();
    expect(files.map((f) => relative(FEATURE_DIR, f)).sort()).toEqual(
      expect.arrayContaining(["machine.ts", "timer.ts", "store.ts", "host.tsx", "use-rerender.ts"]),
    );
    for (const file of files)
      expect(tickCountingMatches(readFileSync(file, "utf8")), file).toEqual([]);
  });

  it.each([
    "remaining--;",
    "let x = --remaining;",
    "state.timer.durationS--;",
    "seconds -= 1;",
    "countdown += 1;",
    "++secs;",
    "setRemaining((n) => n - 1);",
    "setSeconds(s => s + 1);",
    "remainingS++",
  ])("a planted %s turns it red", (planted) => {
    const clean = readFileSync(join(FEATURE_DIR, "timer.ts"), "utf8");
    expect(tickCountingMatches(clean)).toEqual([]);
    expect(tickCountingMatches(`${clean}\n${planted}\n`).length).toBeGreaterThan(0);
  });

  it.each([
    'const c = "var(--wl-color-accent)";',
    "const c = `var(--wl-timer-ring)`;",
    "// remaining-- in a comment",
    "for (let i = 0; i < n; i += 1) {}",
    "const remainingMs = durationS * 1000 - 1;",
    "timer.durationS + 15",
  ])("does not match %s", (code) => {
    expect(tickCountingMatches(code)).toEqual([]);
  });

  it("setInterval appears only in the host's re-render hook", () => {
    const withInterval = featureSources()
      .filter((f) => /\bsetInterval\s*\(/.test(readFileSync(f, "utf8")))
      .map((f) => relative(FEATURE_DIR, f));
    expect(withInterval).toEqual(["use-rerender.ts"]);
    const hook = readFileSync(join(FEATURE_DIR, "use-rerender.ts"), "utf8");
    // Its callback only stores `Date.now()` to trigger a render.
    expect(hook).toMatch(/setInterval\(\(\) => setRenderedAt\(Date\.now\(\)\), RERENDER_MS\)/);
  });
});
