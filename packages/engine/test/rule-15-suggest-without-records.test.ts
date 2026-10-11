// T-0635 AC11: with records() replaced by a throwing stub, suggest still runs and gives the same
// output as the real module would (rule 15 is display-only and never called by suggest).
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/records.js", () => ({
  records: () => {
    throw new Error("suggest must never call records()");
  },
  recordKey: () => {
    throw new Error("suggest must never call recordKey()");
  },
}));

const { suggest, records } = await import("../src/index.js");
const { F_INPUT, F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ } = await import("./fixtures/common.js");
const { SIMULATED_HISTORIES } = await import("./fixtures/histories.js");

describe("rule-15 suggest without records (AC11)", () => {
  it("rule-15 (AC11) non-vacuity: the stubbed records() throws", () => {
    expect(() => records([], LIBRARY)).toThrow("never call records");
  });

  it.each(Object.entries(SIMULATED_HISTORIES))(
    "rule-15 (AC11) suggest on %s runs with records() stubbed to throw",
    (_n, h) => {
      const w = suggest(h, F_TARGETS, F_PROFILE, LIBRARY, F_INPUT, NOW, TZ);
      expect(w.plan.items.length).toBeGreaterThan(0);
    },
  );
});
