// T-0936 UF-08.2 AC1 (B18, D-0237 §1, D-0239 §15): every existing engine example that calls
// `suggest` gives the same committed result with `autoMainLift` and `fill` both `true`.
//
// `suggest` is wrapped for this file only: each call without the switches also runs with both
// `true`, the two results must be deep-equal, and the wrapper returns the `true`/`true` result, so
// every committed expectation in the re-run example files below is asserted against it. The
// example files are imported, which registers their tests again in this file.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it, vi } from "vitest";

const b18 = vi.hoisted(() => ({ calls: 0, mismatches: [] as string[] }));

vi.mock("../src/session.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../src/session.js")>();
  const suggest: typeof orig.suggest = (history, targets, profile, library, si, now, tz) => {
    const absent = orig.suggest(history, targets, profile, library, si, now, tz);
    if ("autoMainLift" in si || "fill" in si) return absent;
    const both = orig.suggest(
      history,
      targets,
      profile,
      library,
      { ...si, autoMainLift: true, fill: true },
      now,
      tz,
    );
    b18.calls++;
    if (!isDeepStrictEqual(both, absent) && b18.mismatches.length < 5) {
      b18.mismatches.push(JSON.stringify(si));
    }
    return both;
  };
  return { ...orig, suggest };
});

// The example files (every R*-E* that calls `suggest`). rule-15-suggest-without-records mocks
// modules of its own and is left out; it asserts that records never changes `suggest`.
import "./apply-swap-histories.test.js";
import "./rule-0-2-favorites-histories.test.js";
import "./rule-0-2-favorites.test.js";
import "./rule-12-2-remove-item.test.js";
import "./rule-12-apply-swap.test.js";
import "./rule-12-swaps.test.js";
import "./rule-13-shuffle.test.js";
import "./rule-14-suggest.test.js";
import "./rule-15-records-histories.test.js";
import "./rule-6-1-avoid-areas.test.js";
import "./rule-7-energy.test.js";
import "./rule-7-goal-reps.test.js";
import "./rule-7-histories.test.js";
import "./rule-7-session.test.js";
import "./t0204-qa-mutation-gaps.test.js";
import "./t0205-qa-mutation-gaps.test.js";
import "./t0219-timed-cost.test.js";
import "./t0220-backoff-floor.test.js";
import "./t0226-fits-budget.test.js";
import "./t0235-drop-floor-cap.test.js";
import "./t0243-level-downgrade.test.js";
import "./t0533-rankswaps-exclude.test.js";
import "./t0534-excluded-out-areas.test.js";

// Registered after the imported files' tests, so it runs last.
describe("B18 over every existing example (T-0936 AC1)", () => {
  it("rule-7 (AC1) B18: every existing suggest example gives a deep-equal result with both switches true", () => {
    expect(b18.mismatches).toEqual([]);
    // Not vacuous: the wrapper saw the examples' calls.
    expect(b18.calls).toBeGreaterThan(1000);
  });

  it("rule-7 (AC1) B18: the imported files are every engine test file that calls suggest(, minus the documented exclusions", () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const self = path.basename(fileURLToPath(import.meta.url));
    // rule-15-suggest-without-records mocks modules of its own; the rule-7-switches* files are
    // T-0936's own tests, which set the switches explicitly (this file is one of them).
    const excluded = (f: string): boolean =>
      f === "rule-15-suggest-without-records.test.ts" || f.startsWith("rule-7-switches");
    const callers = readdirSync(testDir)
      .filter((f) => f.endsWith(".test.ts") && !excluded(f))
      .filter((f) => readFileSync(path.join(testDir, f), "utf8").includes("suggest("))
      .sort();
    const imported = [
      ...readFileSync(path.join(testDir, self), "utf8").matchAll(
        /^import "\.\/([\w.-]+)\.test\.js";$/gm,
      ),
    ]
      .map((m) => `${m[1] ?? ""}.test.ts`)
      .sort();
    expect(callers.length).toBeGreaterThan(20);
    expect(imported).toEqual(callers);
  });
});
