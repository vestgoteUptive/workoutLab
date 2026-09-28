// Rules 5–6: deficit, attention and recovery (UF-10.1, UF-10.2). AC15–AC20.
import { describe, expect, it } from "vitest";
import { balance, recoveringAreas } from "../src/index.js";
import { F_TARGETS, HOUR, LIBRARY, NOW, TZ, setsAt, setsOn, shift } from "./fixtures/common.js";
import { areaOf } from "./helpers.js";

const run = (history: Parameters<typeof balance>[0], now = NOW) =>
  balance(history, F_TARGETS, LIBRARY, now, TZ);

describe("rule-5 deficit and attention", () => {
  it("R5-E1 (AC15, returning after 10 days off) 4 RDL sets on 09-17 only", () => {
    const r = run(setsOn(4, "romanian-deadlift", "2026-09-17"));
    const ham = areaOf(r, "hamstrings");
    expect(ham.deficit).toBe(0.75);
    expect(ham.lastTrainedDate).toBe("2026-09-17");
    expect(ham.needsAttention).toBe(true);
    const glutes = areaOf(r, "glutes");
    expect(glutes.deficit).toBe(0.9);
    expect(glutes.needsAttention).toBe(true);
    const chest = areaOf(r, "chest");
    expect(chest.deficit).toBe(1);
    expect(chest.lastTrainedDate).toBeNull();
    expect(chest.needsAttention).toBe(true);
  });

  it("R5-E2 (AC16) the same sets 4 days ago don't need attention", () => {
    const r = run(setsOn(4, "romanian-deadlift", "2026-09-23"));
    expect(areaOf(r, "hamstrings").needsAttention).toBe(false);
    expect(areaOf(r, "glutes").needsAttention).toBe(false);
    expect(areaOf(r, "chest").needsAttention).toBe(true);
  });

  it("R5-E3 (AC17, boundary) deficit 0.5 at 6 days needs attention; 8.5 or 5 days doesn't", () => {
    const legCurl = setsOn(8, "leg-curl", "2026-09-21");
    const ham = areaOf(run(legCurl), "hamstrings");
    expect(ham.deficit).toBe(0.5);
    expect(ham.needsAttention).toBe(true);

    const plusSquat = areaOf(
      run([...legCurl, ...setsOn(1, "back-squat", "2026-09-21")]),
      "hamstrings",
    );
    expect(plusSquat.load).toBe(8.5);
    expect(plusSquat.deficit).toBe(0.46875);
    expect(plusSquat.needsAttention).toBe(false);

    expect(areaOf(run(setsOn(8, "leg-curl", "2026-09-22")), "hamstrings").needsAttention).toBe(
      false,
    );
  });

  it("R5-E4 (AC18, zero history) every deficit is 1 and nothing needs attention", () => {
    for (const a of run([]).areas) {
      expect(a.deficit).toBe(1);
      expect(a.needsAttention).toBe(false);
    }
  });
});

describe("rule-6 recovery", () => {
  it("R6-E1, R6-E2 (AC19) ≥ 6 weighted hard sets in the last 48 h", () => {
    const recent = setsAt(6, "back-squat", shift(NOW, -47 * HOUR));
    expect(recoveringAreas(recent, LIBRARY, NOW)).toEqual(["glutes", "quads"]);
    const r = run(recent);
    expect(areaOf(r, "quads").recovering).toBe(true);
    expect(areaOf(r, "glutes").recovering).toBe(true);
    expect(areaOf(r, "hamstrings").recovering).toBe(false);
    expect(areaOf(r, "core").recovering).toBe(false);

    const older = setsAt(6, "back-squat", shift(NOW, -49 * HOUR));
    expect(recoveringAreas(older, LIBRARY, NOW)).toEqual([]);
    expect(run(older).areas.some((a) => a.recovering)).toBe(false);
  });

  it("rule-6 (AC20) the window is (now − 48 h, now] in absolute time", () => {
    expect(
      recoveringAreas(setsAt(6, "back-squat", "2026-09-25T12:00:00+02:00"), LIBRARY, NOW),
    ).not.toContain("quads");
    expect(
      recoveringAreas(setsAt(6, "back-squat", "2026-09-25T12:00:01+02:00"), LIBRARY, NOW),
    ).toContain("quads");
    expect(recoveringAreas(setsAt(6, "back-squat", shift(NOW, 60_000)), LIBRARY, NOW)).toEqual([]);
  });

  it("rule-6 (AC20) recovery ignores the DST change (absolute hours)", () => {
    const now = "2026-10-26T12:00:00+01:00";
    expect(
      recoveringAreas(setsAt(6, "back-squat", "2026-10-24T12:30:00+02:00"), LIBRARY, now),
    ).not.toContain("quads");
    expect(
      recoveringAreas(setsAt(6, "back-squat", "2026-10-24T13:30:00+02:00"), LIBRARY, now),
    ).toContain("quads");
  });

  it("rule-6 tombstoned and warm-up sets don't make an area recover", () => {
    const at = shift(NOW, -2 * HOUR);
    const warm = setsAt(6, "back-squat", at, { isWarmup: true });
    const dead = setsAt(6, "back-squat", at, { deletedAt: at, tag: "x" });
    expect(recoveringAreas([...warm, ...dead], LIBRARY, NOW)).toEqual([]);
  });
});
