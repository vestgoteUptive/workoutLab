// T-0419 AC-3 (numbers from engine calls), AC-4 (before → after), AC-5 (next up) and AC-6
// (now = ended_at) — UF-03.3, D-0068 §1, D-0142 §4. The engine functions are the real ones,
// spied; AC-4's order test and AC-5 stub `balance` for one mount.
import { cleanup, waitFor } from "@testing-library/react";
import * as engine from "@workoutlab/engine";
import type { BalanceResult } from "@workoutlab/engine";
import type { HistorySet } from "@workoutlab/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../../../lib/i18n/en.js";
import type { OfflineDb } from "../../../lib/offline/db.js";
import {
  ENDED_AT,
  ENDED_AT_44,
  LATER,
  NOW,
  S1,
  S1_SETS,
  TZ,
  areaBalance,
  balanceResult,
} from "./fixtures.js";
import {
  freshDb,
  part,
  renderSummary,
  rowAreas,
  rowTexts,
  seedLibraryAndTargets,
  seedQueued,
  seedSession,
  signIn,
  signOut,
  snapshot,
  waitReal,
  seedAll,
} from "./helpers.js";

vi.mock("@workoutlab/engine", (orig) => import("./mocks.js").then((m) => m.engineSpies(orig)));
vi.mock("../../../lib/offline/history.js", (orig) =>
  import("./mocks.js").then((m) => m.historySpies(orig)),
);
vi.mock("../../../lib/offline/queue.js", (orig) =>
  import("./mocks.js").then((m) => m.queueSpies(orig)),
);

const balanceSpy = vi.mocked(engine.balance);
const normalizeSpy = vi.mocked(engine.normalizeHistory);
const hardSpy = vi.mocked(engine.isHardSet);

let db: OfflineDb;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  db = freshDb();
  signIn();
  balanceSpy.mockClear();
  normalizeSpy.mockClear();
  hardSpy.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  // `mockReset` would drop the real implementation the factory wrapped; a `mockImplementationOnce`
  // a test didn't use up is cleared this way instead.
  balanceSpy.mockClear();
  signOut();
});

async function ended(): Promise<void> {
  await waitFor(() => expect(part("next-up")).not.toBeNull());
}

const JUDGEMENT = /\b(over|under|within)\b/i;

describe("AC-3 numbers from engine calls (D-0068 §1)", () => {
  it("S1 ended at 11:52:40: Time 52 min next to 45 min budget, Exercises 2, Sets 7", async () => {
    await seedAll(db);
    renderSummary(S1);
    await ended();
    expect(part("time")).toHaveTextContent(/^52 min$/);
    expect(part("budget")).toHaveTextContent(/^45 min budget$/);
    expect(part("exercises")).toHaveTextContent(/^2$/);
    // The isWarmup back-squat set isn't a hard set: 4 + 3, not 8.
    expect(part("sets")).toHaveTextContent(/^7$/);
    expect(normalizeSpy).toHaveBeenCalled();
    expect(hardSpy).toHaveBeenCalled();
    // isHardSet saw the warm-up set and said no.
    const warmupCall = hardSpy.mock.calls.findIndex(([s]) => s.clientId === "S1-back-squat-w");
    expect(warmupCall).toBeGreaterThanOrEqual(0);
    expect(hardSpy.mock.results[warmupCall]!.value).toBe(false);
  });

  it("no judgement copy: no over, under or within, even 52 min on a 45 min budget", async () => {
    await seedAll(db);
    renderSummary(S1);
    await ended();
    const text = document.querySelector('[data-screen-id="UF-03.3"]')!.textContent ?? "";
    expect(text).not.toMatch(JUDGEMENT);
    // CONTRAST: the regex does catch a judgement word.
    const planted = `${text} over budget`;
    expect(planted).toMatch(JUDGEMENT);
  });

  it("the pair: ended at 11:44:59 reads 44 min (floor, not round)", async () => {
    await seedAll(db, { endedAt: ENDED_AT_44 });
    renderSummary(S1);
    await ended();
    expect(part("time")).toHaveTextContent(/^44 min$/);
  });

  it("the pair: with the warm-up set flagged as a hard set, Sets would read 8 (isHardSet decides)", async () => {
    await seedSession(db);
    await seedQueued(
      db,
      S1_SETS.map((s) => ({ ...s, isWarmup: false })),
    );
    await seedLibraryAndTargets(db);
    renderSummary(S1);
    await ended();
    expect(part("sets")).toHaveTextContent(/^8$/);
  });
});

describe("AC-4 before → after (D-0068 §1, D-0013)", () => {
  function stubBalance(before: BalanceResult, after: BalanceResult): void {
    balanceSpy.mockImplementationOnce(() => before).mockImplementationOnce(() => after);
  }

  it("order and format: the rows are the changed areas in after.areas order, chest unchanged is out", async () => {
    await seedAll(db);
    stubBalance(
      balanceResult([
        areaBalance("quads", { load: 2, target: 20 }),
        areaBalance("glutes", { load: 1, target: 20 }),
        areaBalance("hamstrings", { load: 0, target: 16 }),
        areaBalance("chest", { load: 3, target: 18 }),
      ]),
      balanceResult([
        areaBalance("hamstrings", { load: 3, target: 16 }),
        areaBalance("quads", { load: 6, target: 20 }),
        areaBalance("chest", { load: 3, target: 18 }),
        areaBalance("glutes", { load: 3.5, target: 20 }),
      ]),
    );
    renderSummary(S1);
    await ended();
    expect(rowTexts()).toEqual([
      "Hamstrings 0 → 3 / 16",
      "Quads 2 → 6 / 20",
      "Glutes 1 → 3.5 / 20",
    ]);
  });

  it("the calls: before has no S1 set, after has every S1 set normalizeHistory keeps; both at ended_at", async () => {
    await seedAll(db);
    renderSummary(S1);
    await ended();
    expect(balanceSpy).toHaveBeenCalledTimes(2);
    const [beforeCall, afterCall] = balanceSpy.mock.calls as unknown as [
      [HistorySet[], unknown, unknown, string, string],
      [HistorySet[], unknown, unknown, string, string],
    ];
    expect(beforeCall[0].filter((s) => s.sessionId === S1)).toEqual([]);
    expect(beforeCall[0].length).toBeGreaterThan(0); // S0 is there

    const normalized = normalizeSpy.mock.results.at(-1)!.value as HistorySet[];
    const keptS1 = normalized.filter((s) => s.sessionId === S1);
    expect(keptS1).toHaveLength(S1_SETS.length);
    expect(afterCall[0].filter((s) => s.sessionId === S1)).toEqual(keptS1);

    for (const call of [beforeCall, afterCall]) {
      expect(call[3]).toBe(ENDED_AT);
      expect(call[4]).toBe(TZ);
    }
  });

  it("real engine: the rows are exactly the changed areas in after.areas order; quads in, chest out", async () => {
    await seedAll(db);
    renderSummary(S1);
    await ended();
    const before = balanceSpy.mock.results[0]!.value as BalanceResult;
    const after = balanceSpy.mock.results[1]!.value as BalanceResult;
    const loadBefore = new Map(before.areas.map((a) => [a.area, a.load]));
    const changed = after.areas.filter((a) => a.load !== loadBefore.get(a.area)).map((a) => a.area);
    expect(rowAreas()).toEqual(changed);
    expect([...changed].sort()).toEqual(["core", "glutes", "hamstrings", "quads"]);
    expect(rowAreas()).not.toContain("chest");
    // S0 (10 days earlier, in the window) makes quads' before 4, not 0.
    expect(rowTexts()).toContain("Quads 4 → 8 / 20");
  });

  it("zero history: with S0 removed, every listed row's before reads 0", async () => {
    await seedSession(db);
    await seedQueued(db, S1_SETS);
    await seedLibraryAndTargets(db);
    renderSummary(S1);
    await ended();
    expect(rowTexts().length).toBe(4);
    for (const text of rowTexts()) expect(text).toMatch(/^\S+ 0 → /);
    expect(rowTexts()).toContain("Quads 0 → 4 / 20");
  });
});

describe("AC-5 next up (D-0068 §1)", () => {
  function stubAfter(after: BalanceResult): void {
    const before = balanceResult([]);
    balanceSpy.mockImplementationOnce(() => before).mockImplementationOnce(() => after);
  }

  it('after starting calves (0), chest (0), back (4) reads "Next up: Calves, Chest"', async () => {
    await seedAll(db);
    stubAfter(
      balanceResult([
        areaBalance("calves", { coverageStep: 0 }),
        areaBalance("chest", { coverageStep: 0 }),
        areaBalance("back", { coverageStep: 4 }),
        areaBalance("quads", { coverageStep: 1 }),
      ]),
    );
    renderSummary(S1);
    await ended();
    expect(part("next-up")).toHaveTextContent(/^Next up: Calves, Chest$/);
  });

  it('every step 4 reads "Every area is on target"', async () => {
    await seedAll(db);
    stubAfter(
      balanceResult([
        areaBalance("calves", { coverageStep: 4 }),
        areaBalance("chest", { coverageStep: 4 }),
        areaBalance("back", { coverageStep: 4 }),
      ]),
    );
    renderSummary(S1);
    await ended();
    expect(part("next-up")).toHaveTextContent(new RegExp(`^${en.uf03.allOnTarget}$`));
  });

  it('the pair: one area below 4 reads "Next up: {that area}"', async () => {
    await seedAll(db);
    stubAfter(
      balanceResult([
        areaBalance("calves", { coverageStep: 4 }),
        areaBalance("back", { coverageStep: 3 }),
        areaBalance("chest", { coverageStep: 4 }),
      ]),
    );
    renderSummary(S1);
    await ended();
    expect(part("next-up")).toHaveTextContent(/^Next up: Back$/);
  });
});

describe("AC-6 now = ended_at: a reload gives the same numbers (D-0142 §4)", () => {
  it("a cold remount 10 days later shows exactly the same Time, Exercises, Sets, rows and Next up", async () => {
    await seedAll(db);
    renderSummary(S1);
    await ended();
    const first = snapshot();
    expect(first.rows.length).toBeGreaterThan(0);
    cleanup();

    vi.setSystemTime(new Date(LATER));
    balanceSpy.mockClear();
    renderSummary(S1);
    await ended();
    await waitReal(50);
    expect(snapshot()).toEqual(first);
    // CONTRAST: at the later clock, the engine's own window would have dropped S0, so a `now`
    // from the device clock would give a different before.
    const [history, targets, library] = balanceSpy.mock.calls[0]!;
    const atLater = engine.balance(history, targets, library, new Date(LATER).toISOString(), TZ);
    const quadsLater = atLater.areas.find((a) => a.area === "quads")!.load;
    expect(quadsLater).not.toBe(4);
  });
});
