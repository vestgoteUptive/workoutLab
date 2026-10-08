// T-0421 UF-05.1, through the real engine: AC-1 (engine order), AC-3 (reason chips), AC-6
// (apply through the engine), AC-7 (real engine results), AC-9 offline and AC-10 (the applied
// plan round-trips through `parseSessionPlan`, D-0093 §7).
//
// `rankSwaps` and `applySwap` are the real engine functions wrapped in spies; the cache is a real
// `lib/offline` IndexedDB (fake-indexeddb). Nothing is stubbed.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import * as engine from "@workoutlab/engine";
import { parseSessionPlan } from "@workoutlab/shared";
import type { HistorySet, SwapReason, Workout } from "@workoutlab/engine";
import {
  NOW,
  TZ,
  fLibrary,
  fProfile,
  sessionOf,
  sessionSets,
  w5,
  wBackoff,
  wR7E4,
  wTimed,
  withPrefill,
} from "./fixtures.js";
import {
  freezeClock,
  mountSheet,
  row,
  rowIds,
  rowRadio,
  seedCache,
  setOnline,
  settle,
  signOut,
} from "./harness.js";

const NOW_ISO = new Date(NOW).toISOString();

let rankSpy: MockInstance<typeof engine.rankSwaps>;
let applySpy: MockInstance<typeof engine.applySwap>;

beforeEach(() => {
  freezeClock();
  rankSpy = vi.spyOn(engine, "rankSwaps");
  applySpy = vi.spyOn(engine, "applySwap");
});

afterEach(() => {
  signOut();
  setOnline(true);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function chip(name: string): HTMLInputElement {
  return within(screen.getByRole("radiogroup", { name: "Reason" })).getByRole("radio", { name });
}

async function useButton(): Promise<HTMLElement> {
  return screen.findByRole("button", { name: /^Use / });
}

/** Opens the sheet on `workout`/`itemIndex`, picks `reason` and `candidateId`, taps Use and
 *  returns what `onApply` received. */
async function swapThrough(
  workout: Workout,
  itemIndex: number,
  reasonChip: string,
  candidateId: string,
): Promise<Workout> {
  const m = mountSheet(workout, itemIndex);
  await rowIds();
  fireEvent.click(chip(reasonChip));
  await waitFor(() => expect(row(candidateId)).not.toBeNull());
  fireEvent.click(rowRadio(candidateId));
  fireEvent.click(await useButton());
  await waitFor(() => expect(m.onApply).toHaveBeenCalledTimes(1));
  return m.onApply.mock.calls[0]![0];
}

const R12_E1 = [
  "db-row",
  "inverted-row",
  "lat-pulldown",
  "seated-cable-row",
  "straight-arm-pulldown",
];

describe("AC-1 engine order, reason null (R12-E1)", () => {
  it("opens on Best match with the rule 12 order and one Best match tag", async () => {
    await seedCache();
    const workout = w5();
    mountSheet(workout, 1);

    expect(await rowIds()).toEqual(R12_E1);
    expect(chip("Best match")).toBeChecked();
    expect(rankSpy).toHaveBeenCalled();
    const first = rankSpy.mock.calls[0]!;
    expect(first.slice(0, 2)).toEqual(["barbell-row", null]);
    expect(first[2]).toBe(workout);
    expect(first.slice(6)).toEqual([NOW_ISO, TZ, []]);

    const tagged = R12_E1.filter((id) => row(id).querySelector('[data-tag="best-match"]'));
    expect(tagged).toEqual(["db-row"]);
    expect(within(row("db-row")).getByText("Best match")).toBeInTheDocument();
  });
});

describe("AC-3 the reason chips re-rank", () => {
  it("is one radiogroup with exactly the five chips", async () => {
    await seedCache();
    mountSheet(w5(), 1);
    await rowIds();
    const group = screen.getByRole("radiogroup", { name: "Reason" });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((r) => r.closest("label")!.textContent),
    ).toEqual(["Best match", "Equipment taken", "Discomfort", "Variety", "Short on time"]);
  });

  it("Short on time renders R12-E2 and Discomfort renders R12-E4", async () => {
    await seedCache();
    mountSheet(w5(), 1);
    await rowIds();

    fireEvent.click(chip("Short on time"));
    await waitFor(async () =>
      expect(await rowIds()).toEqual([
        "straight-arm-pulldown",
        "db-row",
        "inverted-row",
        "lat-pulldown",
        "seated-cable-row",
      ]),
    );
    expect(rankSpy.mock.calls.at(-1)!.slice(0, 2)).toEqual(["barbell-row", "short_on_time"]);
    expect(chip("Short on time")).toBeChecked();
    expect(chip("Best match")).not.toBeChecked();

    fireEvent.click(chip("Discomfort"));
    await waitFor(async () =>
      expect(await rowIds()).toEqual([
        "lat-pulldown",
        "seated-cable-row",
        "straight-arm-pulldown",
        "db-row",
        "inverted-row",
      ]),
    );
    expect(rankSpy.mock.calls.at(-1)!.slice(0, 2)).toEqual(["barbell-row", "discomfort"]);

    // Back to Best match re-ranks with null again.
    fireEvent.click(chip("Best match"));
    await waitFor(async () => expect(await rowIds()).toEqual(R12_E1));
    expect(rankSpy.mock.calls.at(-1)!.slice(0, 2)).toEqual(["barbell-row", null]);
  });

  it.each([
    ["Equipment taken", "equipment_taken"],
    ["Variety", "variety"],
  ] as const)("%s passes %s", async (label, reason) => {
    await seedCache();
    mountSheet(w5(), 1);
    await rowIds();
    fireEvent.click(chip(label));
    await waitFor(() =>
      expect(rankSpy.mock.calls.at(-1)!.slice(0, 2)).toEqual(["barbell-row", reason]),
    );
  });
});

describe("AC-6 apply through the engine (D-0071 §7)", () => {
  it("Variety → db-row: applySwap once with the prop, and onApply gets its return value", async () => {
    await seedCache();
    const workout = w5();
    const m = mountSheet(workout, 1);
    await rowIds();
    fireEvent.click(chip("Variety"));
    await waitFor(() => expect(rankSpy.mock.calls.at(-1)![1]).toBe("variety"));
    fireEvent.click(rowRadio("db-row"));
    fireEvent.click(await screen.findByRole("button", { name: "Use Db row" }));

    await waitFor(() => expect(m.onApply).toHaveBeenCalledTimes(1));
    expect(applySpy).toHaveBeenCalledTimes(1);
    const args = applySpy.mock.calls[0]!;
    expect(args[0]).toBe(workout);
    expect(args.slice(1, 4)).toEqual(["barbell-row", "db-row", "variety"]);
    expect(args[4]).toEqual([]);
    expect(args[5]).toEqual(fProfile());
    // The cached library, in IndexedDB key order.
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    expect([...args[6]].sort(byId)).toEqual(fLibrary().sort(byId));
    expect(args.slice(7)).toEqual([NOW_ISO, "Europe/Stockholm"]);
    expect(m.onApply.mock.calls[0]![0]).toBe(applySpy.mock.results[0]!.value);
    // rankSwaps also got the prop itself: the sheet computes no totals.
    for (const call of rankSpy.mock.calls) expect(call[2]).toBe(workout);
  });

  it("under Best match the reason passed is null", async () => {
    await seedCache();
    const m = mountSheet(w5(), 1);
    await rowIds();
    fireEvent.click(rowRadio("lat-pulldown"));
    fireEvent.click(await screen.findByRole("button", { name: "Use Lat pulldown" }));
    await waitFor(() => expect(m.onApply).toHaveBeenCalledTimes(1));
    expect(applySpy.mock.calls[0]!.slice(1, 4)).toEqual(["barbell-row", "lat-pulldown", null]);
  });

  it("with no row picked, Use applies the first (Best match) row", async () => {
    await seedCache();
    const m = mountSheet(w5(), 1);
    await rowIds();
    expect(rowRadio("db-row")).toBeChecked();
    fireEvent.click(await screen.findByRole("button", { name: "Use Db row" }));
    await waitFor(() => expect(m.onApply).toHaveBeenCalledTimes(1));
    expect(applySpy.mock.calls[0]![2]).toBe("db-row");
  });
});

describe("AC-7 real engine results (R12-E7, R12-E8, R14-E3)", () => {
  it("main slot: bench-press → push-up under Equipment taken keeps isMain and moves mainLiftId", async () => {
    await seedCache();
    const result = await swapThrough(w5(), 0, "Equipment taken", "push-up");
    expect(result.plan.items[0]!.exerciseId).toBe("push-up");
    expect(result.plan.items[0]!.isMain).toBe(true);
    expect(result.plan.mainLiftId).toBe("push-up");
  });

  it("contrast: an accessory slot keeps isMain false and mainLiftId bench-press", async () => {
    await seedCache();
    const result = await swapThrough(w5(), 1, "Best match", "db-row");
    expect(result.plan.items[1]!.isMain).toBe(false);
    expect(result.plan.mainLiftId).toBe("bench-press");
  });

  it("carry: lat-pulldown at 50 kg → seated-cable-row with no history is 50 kg carry", async () => {
    await seedCache();
    const workout = withPrefill(
      sessionOf([
        ["bench-press", 4, true],
        ["lat-pulldown", 3],
        ["leg-extension", 2],
      ]),
      1,
      { weightKg: 50, reps: 8, kind: "increase" },
    );
    const result = await swapThrough(workout, 1, "Best match", "seated-cable-row");
    expect(result.plan.items[1]!.prefill).toMatchObject({ weightKg: 50, kind: "carry" });
  });

  it("no carry: barbell-row at 60 kg → db-row is null kg first_time", async () => {
    await seedCache();
    const result = await swapThrough(
      withPrefill(w5(), 1, { weightKg: 60 }),
      1,
      "Best match",
      "db-row",
    );
    expect(result.plan.items[1]!.prefill).toMatchObject({ weightKg: null, kind: "first_time" });
  });

  it("10 days off: db-row last done 12 days ago (cached) gives hold_after_break", async () => {
    await seedCache({
      history: sessionSets("2026-09-15", "db-row", [
        [24, 8],
        [24, 8],
        [24, 8],
      ]),
    });
    const result = await swapThrough(w5(), 1, "Best match", "db-row");
    expect(result.plan.items[1]!.prefill.kind).toBe("hold_after_break");
    expect(result.plan.items[1]!.prefill.weightKg).toBe(24);
  });

  it("contrast: db-row last done 3 days ago is not a break", async () => {
    await seedCache({
      history: sessionSets("2026-09-24", "db-row", [
        [24, 8],
        [24, 8],
        [24, 8],
      ]),
    });
    const result = await swapThrough(w5(), 1, "Best match", "db-row");
    expect(result.plan.items[1]!.prefill.kind).not.toBe("hold_after_break");
  });
});

describe("AC-9 offline: ranks from IndexedDB with no network call", () => {
  it("renders AC-1 with navigator.onLine false and no fetch", async () => {
    setOnline(false);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await seedCache();
    const m = mountSheet(w5(), 1);
    expect(await rowIds()).toEqual(R12_E1);
    fireEvent.click(await useButton());
    await waitFor(() => expect(m.onApply).toHaveBeenCalledTimes(1));
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the queue counts: a queued (offline-logged) set feeds the ranking's history", async () => {
    setOnline(false);
    await seedCache();
    const { recordSet } = await import("../../../lib/offline/queue.js");
    await recordSet(
      {
        sessionId: "22222222-2222-4222-8222-222222222222",
        exerciseId: "db-row",
        setIndex: 0,
        kind: "reps",
        reps: 8,
        weightKg: 24,
        isWarmup: false,
        backoff: false,
      },
      { now: new Date("2026-09-15T10:00:00+02:00") },
    );
    const m = mountSheet(w5(), 1);
    await rowIds();
    fireEvent.click(rowRadio("db-row"));
    fireEvent.click(await useButton());
    await waitFor(() => expect(m.onApply).toHaveBeenCalledTimes(1));
    const history = applySpy.mock.calls[0]![4] as HistorySet[];
    expect(history.map((s) => [s.exerciseId, s.pending])).toEqual([["db-row", true]]);
    expect(m.onApply.mock.calls[0]![0].plan.items[1]!.prefill.kind).toBe("hold_after_break");
  });
});

describe("AC-10 the applied plan round-trips through parseSessionPlan (D-0093 §7)", () => {
  const H_P = sessionSets("2026-09-24", "plank", [
    { durationS: 115 },
    { durationS: 115 },
    { durationS: 115 },
  ]);
  const H_B = sessionSets("2026-09-24", "bench-press", [
    [80, 8],
    [80, 7],
    [80, 6],
  ]);

  interface Case {
    name: string;
    history: HistorySet[];
    workout: () => Workout;
    itemIndex: number;
    chip: string;
    reason: SwapReason | null;
    candidateId: string;
    check(result: Workout): void;
  }

  const CASES: Case[] = [
    {
      name: "R12-E6 accessory, zero history",
      history: [],
      workout: wR7E4,
      itemIndex: 1,
      chip: "Variety",
      reason: "variety",
      candidateId: "barbell-row",
      check: (r) => {
        expect(r.plan.items[1]).toMatchObject({
          exerciseId: "barbell-row",
          sets: 3,
          repsMin: 8,
          repsMax: 12,
          prefill: { weightKg: null, kind: "first_time" },
        });
        expect([r.itemsTotalS, r.totalS, r.unusedS]).toEqual([1545, 1725, 75]);
      },
    },
    {
      name: "R12-E8 main slot",
      history: [],
      workout: wR7E4,
      itemIndex: 0,
      chip: "Equipment taken",
      reason: "equipment_taken",
      candidateId: "push-up",
      check: (r) => {
        expect(r.plan.items[0]).toMatchObject({ exerciseId: "push-up", isMain: true, sets: 4 });
        expect(r.plan.items[0]!.reasons[0]).toEqual({ code: "main_lift" });
        expect(r.plan.mainLiftId).toBe("push-up");
      },
    },
    {
      name: "R12-E9 timed candidate (plank into a dead-bug slot)",
      history: H_P,
      workout: wTimed,
      itemIndex: 1,
      chip: "Short on time",
      reason: "short_on_time",
      candidateId: "plank",
      check: (r) => {
        expect(r.plan.items[1]).toMatchObject({
          exerciseId: "plank",
          sets: 2,
          durationS: 120,
          repsMin: null,
          prefill: { kind: "add_rep" },
        });
        expect([r.itemsTotalS, r.totalS, r.unusedS]).toEqual([1140, 1320, 60]);
      },
    },
    {
      name: "R12-E10 back-off slot",
      history: H_B,
      workout: () => wBackoff(H_B),
      itemIndex: 0,
      chip: "Best match",
      reason: null,
      candidateId: "db-bench-press",
      check: (r) => {
        expect(r.plan.items[0]).toMatchObject({
          exerciseId: "db-bench-press",
          backoff: { weightKg: 72, reps: 6 },
          prefill: { weightKg: 80, kind: "carry" },
        });
        expect(r.unusedS).toBe(15);
      },
    },
  ];

  it.each(CASES)("$name", async (c) => {
    await seedCache({ history: c.history });
    const workout = c.workout();
    const result = await swapThrough(workout, c.itemIndex, c.chip, c.candidateId);

    // The engine's own result, computed independently of the sheet.
    const expected = engine.applySwap(
      workout,
      workout.plan.items[c.itemIndex]!.exerciseId,
      c.candidateId,
      c.reason,
      c.history,
      fProfile(),
      fLibrary(),
      NOW,
      TZ,
    );
    expect(result).toStrictEqual(expected);
    c.check(result);

    const direct = parseSessionPlan(result.plan);
    expect(direct.ok).toBe(true);
    // As stored: through JSON, the way `sessions.plan` is written and read back.
    const stored = parseSessionPlan(JSON.parse(JSON.stringify(result.plan)));
    expect(stored).toEqual({ ok: true, plan: result.plan });
  });

  it("contrast: parseSessionPlan rejects a plan with a broken item (the check can fail)", () => {
    const plan = w5().plan;
    const broken = { ...plan, items: [{ ...plan.items[0]!, sets: "4" }] };
    expect(parseSessionPlan(JSON.parse(JSON.stringify(broken))).ok).toBe(false);
  });
});

describe("AC-5 with the real engine (R12-E11): an over-budget candidate is listed and applied", () => {
  it("leg-extension → back-squat is tagged Over your time and Use applies it", async () => {
    await seedCache();
    const m = mountSheet(wR7E4(), 2);
    const ids = await rowIds();
    expect(ids).toContain("back-squat");
    expect(within(row("back-squat")).getByText("Over your time")).toBeInTheDocument();
    fireEvent.click(rowRadio("back-squat"));
    fireEvent.click(await screen.findByRole("button", { name: "Use Back squat" }));
    await waitFor(() => expect(m.onApply).toHaveBeenCalledTimes(1));
    const result = m.onApply.mock.calls[0]![0];
    expect([result.itemsTotalS, result.totalS, result.unusedS]).toEqual([1665, 1845, 0]);
  });
});
