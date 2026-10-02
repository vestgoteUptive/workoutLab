// @vitest-environment node
// T-0386 AC2-AC3 (UF-08.1, D-0115 §4): in a fall-back repeated hour, a picked finish time uses
// the earliest of its two instants that is strictly after `now`; both at or before `now` rejects.
// Spring-forward gaps are out of scope; one row pins today's reading so it can't drift silently.
import { describe, expect, it } from "vitest";
import { finishToBudget } from "../time.js";

const ok = (budgetMin: number) => ({ kind: "ok", budgetMin });
const rejected = { kind: "rejected" };

describe("AC2 Europe/Stockholm, 2026-10-25 (02:00–02:59 occurs twice)", () => {
  const TZ = "Europe/Stockholm";
  it.each([
    ["2026-10-25T00:10:00Z", "02:30", ok(20), "02:10 CEST: the first occurrence (00:30Z)"],
    ["2026-10-25T00:45:00Z", "02:30", ok(45), "02:45 CEST: the first has passed, so 01:30Z"],
    ["2026-10-25T01:40:00Z", "02:30", rejected, "02:40 CET: both occurrences have passed"],
    ["2026-10-24T23:30:00Z", "02:30", ok(60), "01:30 CEST: the earliest, not the later one"],
    ["2026-10-25T00:10:00Z", "03:00", ok(110), "02:10 CEST → 03:00 CET is 110 min of real time"],
  ])("now %s, %s → %j (%s)", (now, value, expected) => {
    expect(finishToBudget(value, now, TZ)).toEqual(expected);
  });
});

describe("AC3 America/New_York, 2026-11-01 (01:00–01:59 occurs twice)", () => {
  const TZ = "America/New_York";
  it.each([
    ["2026-11-01T05:10:00Z", "01:30", ok(20), "01:10 EDT: the first occurrence (05:30Z)"],
    ["2026-11-01T05:45:00Z", "01:30", ok(45), "01:45 EDT: the first has passed, so 06:30Z"],
    ["2026-11-01T06:40:00Z", "01:30", rejected, "01:40 EST: both occurrences have passed"],
    ["2026-11-01T05:10:00Z", "02:00", ok(110), "01:10 EDT → 02:00 EST is 110 min of real time"],
  ])("now %s, %s → %j (%s)", (now, value, expected) => {
    expect(finishToBudget(value, now, TZ)).toEqual(expected);
  });
});

describe("contrast: an ordinary hour on the same days has one occurrence", () => {
  it("Stockholm 2026-10-25 at 00:10Z, 01:30 (before the repeated hour, passed) is rejected", () => {
    expect(finishToBudget("01:30", "2026-10-25T00:10:00Z", "Europe/Stockholm")).toEqual(rejected);
  });

  it("Stockholm 2026-10-25 at 01:40Z (02:40 CET), 03:10 → 30", () => {
    expect(finishToBudget("03:10", "2026-10-25T01:40:00Z", "Europe/Stockholm")).toEqual(ok(30));
  });
});

describe("out of scope (D-0115 §4): a spring-forward gap keeps today's reading", () => {
  it("Stockholm 2026-03-29 at 01:30 CET, 02:30 (doesn't exist) → 60, as before T-0386", () => {
    expect(finishToBudget("02:30", "2026-03-29T00:30:00Z", "Europe/Stockholm")).toEqual(ok(60));
  });
});
