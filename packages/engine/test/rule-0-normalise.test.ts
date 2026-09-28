// Rule 0: history normalisation and purity (UF-10.1). AC1–AC4.
import { describe, expect, it } from "vitest";
import { balance, normalizeHistory, type HistorySet } from "../src/index.js";
import { F_TARGETS, LIBRARY, NOW, TZ, deepFreeze, setsAt } from "./fixtures/common.js";
import { balancedHistory } from "./fixtures/histories.js";
import { areaOf } from "./helpers.js";

const at = (hhmm: string) => `2026-09-25T${hhmm}:00+02:00`;

function row(clientId: string, editedAt: string, extra: Partial<HistorySet> = {}): HistorySet {
  return {
    clientId,
    sessionId: "s1",
    exerciseId: "back-squat",
    isWarmup: false,
    completedAt: at("10:00"),
    editedAt,
    deletedAt: null,
    reps: 8,
    weightKg: 100,
    durationS: null,
    ...extra,
  };
}

describe("rule-0 history normalisation", () => {
  it("R0-E2 (AC1) keeps the newest edit per clientId and drops tombstoned rows, in any input order", () => {
    const rows: HistorySet[] = [
      row("c1", at("10:00"), { reps: 8 }),
      row("c1", at("10:05"), { reps: 6 }),
      row("c2", at("10:00")),
      row("c2", at("10:05"), { deletedAt: at("10:05") }),
    ];
    const out = normalizeHistory(rows);
    expect(out).toHaveLength(1);
    expect(out[0]?.clientId).toBe("c1");
    expect(out[0]?.reps).toBe(6);
    expect(normalizeHistory([...rows].reverse())).toEqual(out);
  });

  it("rule-0 compares edited_at as instants, not strings", () => {
    const out = normalizeHistory([
      row("c1", "2026-09-25T08:30:00Z", { reps: 5 }), // 10:30 local, the newer edit
      row("c1", "2026-09-25T10:05:00+02:00", { reps: 9 }),
    ]);
    expect(out.map((r) => r.reps)).toEqual([5]);
  });

  it("rule-0 AC2 (NFR-SYNC-2) a queued tombstone adds 0 load, replays are idempotent, and a newer live row revives the set", () => {
    const server = row("c1", at("10:00"));
    const tomb = row("c1", at("10:05"), { pending: true, deletedAt: at("10:05") });
    const r1 = balance([server, tomb], F_TARGETS, LIBRARY, NOW, TZ);
    for (const area of ["quads", "glutes", "hamstrings", "core"] as const) {
      const a = areaOf(r1, area);
      expect(a.load).toBe(0);
      expect(a.days.every((d) => d === 0)).toBe(true);
      expect(a.contributors).toEqual([]);
      expect(a.lastTrainedDate).toBeNull();
    }
    expect(balance([server, tomb, tomb], F_TARGETS, LIBRARY, NOW, TZ)).toEqual(r1);
    const revived = row("c1", at("10:10"), { pending: true });
    expect(
      areaOf(balance([server, tomb, revived], F_TARGETS, LIBRARY, NOW, TZ), "quads").load,
    ).toBe(1);
  });

  it("rule-0 AC3 equal edited_at: the server row beats a queued row; between queued rows the tombstone wins", () => {
    const server = row("c1", at("10:00"));
    const queuedTomb = row("c1", at("10:00"), { pending: true, deletedAt: at("10:00") });
    expect(areaOf(balance([server, queuedTomb], F_TARGETS, LIBRARY, NOW, TZ), "quads").load).toBe(
      1,
    );
    expect(areaOf(balance([queuedTomb, server], F_TARGETS, LIBRARY, NOW, TZ), "quads").load).toBe(
      1,
    );

    const queuedLive = row("c1", at("10:00"), { pending: true });
    expect(
      areaOf(balance([queuedLive, queuedTomb], F_TARGETS, LIBRARY, NOW, TZ), "quads").load,
    ).toBe(0);
    expect(
      areaOf(balance([queuedTomb, queuedLive], F_TARGETS, LIBRARY, NOW, TZ), "quads").load,
    ).toBe(0);
  });

  it("rule-0 equal edited_at and equal kind: the first row in input order wins", () => {
    const a = row("c1", at("10:00"), { reps: 3 });
    const b = row("c1", at("10:00"), { reps: 4 });
    expect(normalizeHistory([a, b])[0]?.reps).toBe(3);
    expect(normalizeHistory([b, a])[0]?.reps).toBe(4);
  });

  it("rule-0 normalisation never mutates its input", () => {
    const rows = deepFreeze(setsAt(3, "back-squat", at("10:00")));
    expect(() => normalizeHistory(rows)).not.toThrow();
  });

  it("rule-0 rejects an instant without an offset (it would depend on the host zone)", () => {
    expect(() =>
      normalizeHistory([row("c1", "2026-09-25T10:00:00"), row("c1", at("10:00"))]),
    ).toThrow(RangeError);
  });
});

describe("rule-0 purity of balance()", () => {
  it("R0-E1 (AC4, applied to balance) same input gives the same output, frozen inputs work, and history order is irrelevant", () => {
    const first = balance(balancedHistory, F_TARGETS, LIBRARY, NOW, TZ);
    expect(balance(balancedHistory, F_TARGETS, LIBRARY, NOW, TZ)).toEqual(first);

    const frozenHistory = deepFreeze(structuredClone(balancedHistory));
    const frozenTargets = deepFreeze(structuredClone(F_TARGETS));
    const frozenLibrary = deepFreeze(structuredClone(LIBRARY));
    let frozenResult: unknown;
    expect(() => {
      frozenResult = balance(frozenHistory, frozenTargets, frozenLibrary, NOW, TZ);
    }).not.toThrow();
    expect(frozenResult).toEqual(first);

    expect(balance([...balancedHistory].reverse(), F_TARGETS, LIBRARY, NOW, TZ)).toEqual(first);
  });
});
