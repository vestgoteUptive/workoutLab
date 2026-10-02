// T-0304e AC-3 (set writes, D-0071 §5, NFR-OFF-2, NFR-SYNC-1) and AC-4 (`replaceItem`, D-0071
// §5 §6: the whole stored row, only the current or a later item).
import { act, fireEvent, screen } from "@testing-library/react";
import Dexie from "dexie";
import type { SessionPlan } from "@workoutlab/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { initialFocusState, type FocusState } from "../machine.js";
import type { SeamAction } from "../seams.js";
import type { FocusSession } from "../session.js";
import { BENCH, P1, PLANK, ROW, S1, STARTED_AT, STARTED_AT_MS, USER_A } from "./fixtures.js";
import { flushReal, freshDb, seedSession, signIn, storedFocus, useFakeClock } from "./helpers.js";
import { probe, session } from "./probe.js";
import { call, deferred, renderSession } from "./session-helpers.js";
import { countOf, dispatched, lastStore, stores } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./offline-spies.js").then((m) => m.offlineSpies(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));
vi.mock("../views.js", (orig) => import("./probe.js").then((m) => m.probedViews(orig)));

const NOW = STARTED_AT_MS + 10 * 60_000;
const KEY = `wl-focus:${S1}`;

const recordSpy = vi.mocked(offline.recordSet);
const editSpy = vi.mocked(offline.editSet);
const deleteSpy = vi.mocked(offline.deleteSet);
const upsertSpy = vi.mocked(offline.upsertSession);

function seedFocus(state: Partial<FocusState>): void {
  window.localStorage.setItem(
    KEY,
    JSON.stringify({ ...initialFocusState(S1, P1, NOW), timer: null, ...state }),
  );
}

function setInput(itemIndex: number, setIndex: number, extra: Record<string, unknown> = {}) {
  const exerciseId = P1.items[itemIndex]!.exerciseId;
  return {
    sessionId: S1,
    itemIndex,
    exerciseId,
    setIndex,
    kind: "reps" as const,
    reps: 6,
    weightKg: 80,
    isWarmup: false,
    backoff: false,
    ...extra,
  };
}

beforeEach(async () => {
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  probe.current = null;
  for (const spy of [recordSpy, editSpy, deleteSpy, upsertSpy]) spy.mockClear();
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AC-3 recordSet", () => {
  it("calls lib/offline recordSet once with the input, lists the entry, and a fresh Dexie sees the row", async () => {
    seedFocus({ phase: "set" });
    await renderSession();
    const input = setInput(0, 0);
    const logged = await call(() => session().recordSet(input));
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith(input);
    expect(session().loggedSets.map((s) => s.clientId)).toEqual([logged.clientId]);

    const fresh = new Dexie(offline.offlineDb().name);
    await fresh.open();
    const rows = await fresh.table("sets").toArray();
    fresh.close();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      clientId: logged.clientId,
      sessionId: S1,
      exerciseId: "bench-press",
      setIndex: 0,
      reps: 6,
      weightKg: 80,
      status: "queued",
    });
  });

  it("phase set + the current set → SET_RECORDED (confirm)", async () => {
    seedFocus({ phase: "set" });
    await renderSession();
    await call(() => session().recordSet(setInput(0, 0)));
    expect(countOf("SET_RECORDED")).toBe(1);
    expect(session().state.phase).toBe("confirm");
  });

  it("phase timed + the current set → TIMED_RECORDED (rest)", async () => {
    // T-0304c (D-0119 §1): a stored `timed` carries its position + hold timer.
    seedFocus({
      phase: "timed",
      itemIndex: 3,
      setIndex: 0,
      timer: { startedAtMs: NOW, durationS: 53, pausedMs: 0 },
    });
    await renderSession();
    const input = {
      ...setInput(3, 0),
      kind: "timed" as const,
      reps: null,
      weightKg: null,
      durationS: 50,
    };
    await call(() => session().recordSet(input));
    expect(countOf("TIMED_RECORDED")).toBe(1);
    expect(session().state.phase).toBe("rest");
    expect(session().loggedSets[0]).toMatchObject({ itemIndex: 3, durationS: 50 });
  });

  it("the pair: a log for item 2 while in set of item 0 leaves the phase set, only loggedSets changes", async () => {
    seedFocus({ phase: "set" });
    await renderSession();
    const before = storedFocus();
    await call(() => session().recordSet(setInput(2, 0, { weightKg: 40 })));
    await flushReal();
    expect(session().state.phase).toBe("set");
    expect(session().currentItemIndex).toBe(0);
    expect(session().currentSetIndex).toBe(0);
    expect(countOf("SET_RECORDED")).toBe(0);
    expect(countOf("TIMED_RECORDED")).toBe(0);
    expect(session().loggedSets).toHaveLength(1);
    expect(storedFocus()).toEqual({ ...before, loggedSets: session().loggedSets });
  });

  it("phase set + another set of the current item → no transition", async () => {
    seedFocus({ phase: "set" });
    await renderSession();
    await call(() => session().recordSet(setInput(0, 1)));
    expect(session().state.phase).toBe("set");
    expect(countOf("SET_RECORDED")).toBe(0);
  });

  it("phase timed + a set of another item → no transition", async () => {
    // T-0304c (D-0119 §1): a stored `timed` carries its position + hold timer.
    seedFocus({
      phase: "timed",
      itemIndex: 3,
      setIndex: 0,
      timer: { startedAtMs: NOW, durationS: 53, pausedMs: 0 },
    });
    await renderSession();
    await call(() => session().recordSet(setInput(1, 0)));
    expect(session().state.phase).toBe("timed");
    expect(countOf("TIMED_RECORDED")).toBe(0);
  });

  it("null weight (zero history) is stored and listed as null", async () => {
    seedFocus({ phase: "set", itemIndex: 2, setIndex: 0 });
    await renderSession();
    const logged = await call(() =>
      session().recordSet(setInput(2, 0, { weightKg: null, reps: 10 })),
    );
    expect(session().loggedSets[0]!.weightKg).toBeNull();
    const row = await offline.offlineDb().sets.get(`${USER_A}:${logged.clientId}`);
    expect(row!.weightKg).toBeNull();
  });
});

describe("AC-3 editSet / deleteSet", () => {
  it("editSet(clientId, {reps: 5}) calls editSet once and updates that entry", async () => {
    seedFocus({ phase: "set" });
    await renderSession();
    const a = await call(() => session().recordSet(setInput(0, 0)));
    const b = await call(() => session().recordSet(setInput(0, 1)));
    await call(() => session().editSet(a.clientId, { reps: 5 }));
    expect(editSpy).toHaveBeenCalledTimes(1);
    expect(editSpy).toHaveBeenCalledWith(a.clientId, { reps: 5 });
    const [first, second] = session().loggedSets;
    expect(first).toMatchObject({ clientId: a.clientId, reps: 5, weightKg: 80, setIndex: 0 });
    expect(second).toMatchObject({ clientId: b.clientId, reps: 6 });
  });

  it("deleteSet(clientId) calls deleteSet once and removes the entry", async () => {
    seedFocus({ phase: "set" });
    await renderSession();
    const a = await call(() => session().recordSet(setInput(0, 0)));
    const b = await call(() => session().recordSet(setInput(0, 1)));
    await call(() => session().deleteSet(a.clientId));
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledWith(a.clientId);
    expect(session().loggedSets.map((s) => s.clientId)).toEqual([b.clientId]);
  });

  it.each([
    [
      "recordSet",
      () => recordSpy.mockRejectedValueOnce(new Error("idb")),
      (s: FocusSession) => s.recordSet(setInput(0, 1)),
    ],
    [
      "editSet",
      () => editSpy.mockRejectedValueOnce(new Error("idb")),
      (s: FocusSession) => s.editSet(s.loggedSets[0]!.clientId, { reps: 5 }),
    ],
    [
      "deleteSet",
      () => deleteSpy.mockRejectedValueOnce(new Error("idb")),
      (s: FocusSession) => s.deleteSet(s.loggedSets[0]!.clientId),
    ],
  ] as const)(
    "a rejected %s rejects from the hook and leaves loggedSets unchanged",
    async (_name, reject, run) => {
      seedFocus({ phase: "set" });
      await renderSession();
      await call(() => session().recordSet(setInput(0, 0)));
      const before = session().loggedSets;
      const storedBefore = storedFocus();
      reject();
      let error: unknown;
      await act(async () => {
        await run(session()).catch((e: unknown) => {
          error = e;
        });
      });
      await flushReal();
      expect(error).toBeInstanceOf(Error);
      expect(session().loggedSets).toEqual(before);
      expect(storedFocus()).toEqual(storedBefore);
    },
  );
});

describe("AC-3 the next set follows the live sets", () => {
  it("sets 0 and 1 logged through the hook → the next set is 2 (via Save, rest and skip)", async () => {
    seedFocus({ phase: "set" });
    await renderSession();
    await call(() => session().recordSet(setInput(0, 0)));
    await call(() => session().recordSet(setInput(0, 1)));
    act(() => lastStore().dispatch({ type: "SAVED", atMs: Date.now() }));
    expect(session().state.phase).toBe("rest");
    expect(session().currentSetIndex).toBe(2);
    act(() => session().skipRest());
    expect(session().state).toMatchObject({ phase: "set", itemIndex: 0, setIndex: 2 });
  });

  it("through a keepsClockRunning overlay: 0 and 1 logged → close() → set 2; delete 0 → close() → set 0", async () => {
    let ctx: FocusSession | null = null;
    const listView: SeamAction = {
      id: "list-view",
      label: "List view",
      keepsClockRunning: true,
      render: (c) => {
        ctx = c;
        return <p data-testid="overlay" />;
      },
    };
    seedFocus({ phase: "paused", resumePhase: "set", pausedAtMs: NOW });
    await renderSession({ seams: { pause: [listView] } });
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    await flushReal();
    const a = await call(() => ctx!.recordSet(setInput(0, 0)));
    await call(() => ctx!.recordSet(setInput(0, 1)));
    act(() => ctx!.close());
    await flushReal();
    expect(storedFocus()).toMatchObject({ phase: "set", itemIndex: 0, setIndex: 2 });

    fireEvent.click(screen.getByRole("button", { name: "Pause workout" }));
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    await call(() => ctx!.deleteSet(a.clientId));
    act(() => ctx!.close());
    await flushReal();
    expect(storedFocus()).toMatchObject({ phase: "set", itemIndex: 0, setIndex: 0 });
  });
});

const PUSH_UP = {
  ...BENCH,
  exerciseId: "push-up",
  prefill: { weightKg: 0, reps: 8, durationS: null, kind: "first_time" as const },
};
const SIDE_PLANK = { ...PLANK, exerciseId: "side-plank", isMain: true };

describe("AC-4 replaceItem", () => {
  it("writes {...row, plan: {...plan, items: [i0, item, i2, i3]}} once, with every other column unchanged", async () => {
    seedFocus({ phase: "set" });
    await renderSession();
    const before = (await offline.offlineDb().sessions.get(S1))!.row;
    const newRow = { ...ROW, exerciseId: "dumbbell-row" };
    await call(() => session().replaceItem(1, newRow));
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const plan = before.plan as SessionPlan;
    expect(upsertSpy).toHaveBeenCalledWith({
      ...before,
      plan: { ...plan, items: [plan.items[0], newRow, plan.items[2], plan.items[3]] },
    });
    const written = upsertSpy.mock.calls[0]![0];
    for (const key of [
      "started_at",
      "time_budget_min",
      "energy",
      "warmup_in_budget",
      "ended_at",
    ] as const) {
      expect(written[key], key).toEqual(before[key]);
    }
    expect(written.started_at).toBe(STARTED_AT);
    expect(session().plan.items[1]).toEqual(newRow);
    expect(session().row).toEqual((await offline.offlineDb().sessions.get(S1))!.row);
  });

  it("after the write: the hook's plan and the persisted focus state follow the new item; logged sets keep their exerciseId", async () => {
    seedFocus({ phase: "set" });
    await renderSession();
    await call(() => session().recordSet(setInput(0, 0)));
    act(() => lastStore().dispatch({ type: "SAVED", atMs: Date.now() }));
    act(() => session().skipRest());
    expect(session().state).toMatchObject({ phase: "set", setIndex: 1 });

    await call(() => session().replaceItem(0, SIDE_PLANK));
    expect(session().plan.items[0]).toEqual(SIDE_PLANK);
    // A timed item: the current step becomes `timed`, at the same set index.
    expect(storedFocus()).toMatchObject({ phase: "timed", itemIndex: 0, setIndex: 1 });
    expect(session().loggedSets[0]!.exerciseId).toBe("bench-press");
    expect((storedFocus()!.loggedSets as { exerciseId: string }[])[0]!.exerciseId).toBe(
      "bench-press",
    );
  });

  it("the replaced plan is what a reload walks (persisted in IndexedDB)", async () => {
    seedFocus({ phase: "set" });
    const view = await renderSession();
    await call(() => session().replaceItem(2, { ...PUSH_UP, isMain: false }));
    view.unmount();
    probe.current = null;
    await renderSession();
    expect(session().plan.items[2]!.exerciseId).toBe("push-up");
  });

  it("mainLiftId: the third argument sets it; without it, it is unchanged", async () => {
    seedFocus({ phase: "set" });
    await renderSession();
    await call(() => session().replaceItem(0, PUSH_UP, "push-up"));
    expect(session().plan.mainLiftId).toBe("push-up");
    expect((upsertSpy.mock.calls[0]![0].plan as SessionPlan).mainLiftId).toBe("push-up");

    await call(() => session().replaceItem(0, BENCH));
    expect(session().plan.mainLiftId).toBe("push-up");
    expect((upsertSpy.mock.calls[1]![0].plan as SessionPlan).mainLiftId).toBe("push-up");
  });

  it("an index before the current item rejects with RangeError and writes nothing; the current index succeeds", async () => {
    seedFocus({ phase: "set", itemIndex: 1 });
    await renderSession();
    let error: unknown;
    await act(async () => {
      await session()
        .replaceItem(0, PUSH_UP)
        .catch((e: unknown) => {
          error = e;
        });
    });
    await flushReal();
    expect(error).toBeInstanceOf(RangeError);
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(session().plan.items[0]).toEqual(BENCH);

    await call(() => session().replaceItem(1, { ...PUSH_UP, isMain: false }));
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(session().plan.items[1]!.exerciseId).toBe("push-up");
  });
});

// T-0410 (UF-09.3, UF-09.9, NFR-SYNC-1): the in-flight recordSet key is
// `${source}:${itemIndex}:${setIndex}:${exerciseId}`, so only a true repeat of a pending write
// (a remounted Done set) is merged; another exercise at that position, or a List-view log, is not.
describe("T-0410 recordSet in-flight dedupe key", () => {
  /** Holds the next `lib/offline` `recordSet` until `release()`, then runs the real write. */
  function holdNextRecord() {
    const real = recordSpy.getMockImplementation()!;
    const gate = deferred<void>();
    recordSpy.mockImplementationOnce(async (input) => {
      await gate.promise;
      return real(input);
    });
    return { release: () => gate.resolve() };
  }

  async function both(a: Promise<unknown>, b: Promise<unknown>, release: () => void) {
    release();
    const out = await call(() => Promise.all([a, b]));
    return out as [{ clientId: string }, { clientId: string }];
  }

  it("T-0410 AC3 the same input twice with no source → one lib/offline write, one clientId", async () => {
    seedFocus({ phase: "set" });
    await renderSession();
    const { release } = holdNextRecord();
    const input = setInput(0, 0);
    const a = session().recordSet(input);
    const b = session().recordSet(input);
    const [ra, rb] = await both(a, b, release);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(ra.clientId).toBe(rb.clientId);
    expect(session().loggedSets).toHaveLength(1);
  });

  it("T-0410 AC3 the same input twice with source list → one lib/offline write, one clientId", async () => {
    seedFocus({ phase: "set" });
    await renderSession();
    const { release } = holdNextRecord();
    const input = { ...setInput(0, 0), source: "list" as const };
    const a = session().recordSet(input);
    const b = session().recordSet(input);
    const [ra, rb] = await both(a, b, release);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy.mock.calls[0]![0]).not.toHaveProperty("source");
    expect(ra.clientId).toBe(rb.clientId);
  });

  it("T-0410 AC4 a pending bench-press write at (0, 0) does not swallow a db-row write at (0, 0)", async () => {
    seedFocus({ phase: "paused", resumePhase: "set", pausedAtMs: NOW });
    await renderSession();
    const { release } = holdNextRecord();
    const a = session().recordSet(setInput(0, 0));
    const b = session().recordSet(setInput(0, 0, { exerciseId: "db-row" }));
    const [ra, rb] = await both(a, b, release);
    expect(recordSpy).toHaveBeenCalledTimes(2);
    expect(recordSpy.mock.calls.map((c) => c[0].exerciseId)).toEqual(["bench-press", "db-row"]);
    expect(ra.clientId).not.toBe(rb.clientId);
    const listed = session().loggedSets;
    expect(listed).toHaveLength(2);
    expect(listed.filter((s) => s.clientId === ra.clientId)).toHaveLength(1);
    expect(listed.filter((s) => s.clientId === rb.clientId)).toHaveLength(1);
  });

  it("T-0410 AC5 a pending focus write does not swallow a List-view log of the same set; source never reaches lib/offline", async () => {
    seedFocus({ phase: "paused", resumePhase: "set", pausedAtMs: NOW });
    await renderSession();
    const { release } = holdNextRecord();
    const input = setInput(0, 0);
    const a = session().recordSet(input);
    const b = session().recordSet({ ...input, source: "list" });
    const [ra, rb] = await both(a, b, release);
    expect(recordSpy).toHaveBeenCalledTimes(2);
    expect(ra.clientId).not.toBe(rb.clientId);
    for (const [arg] of recordSpy.mock.calls) {
      expect(arg).not.toHaveProperty("source");
      expect(arg).toEqual(input);
    }
  });

  it("T-0410 AC6 once the held write resolves, the same key writes again", async () => {
    seedFocus({ phase: "set" });
    await renderSession();
    const { release } = holdNextRecord();
    const input = setInput(0, 0);
    const a = session().recordSet(input);
    release();
    const ra = await call(() => a);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    const rb = await call(() => session().recordSet(input));
    expect(recordSpy).toHaveBeenCalledTimes(2);
    expect(rb.clientId).not.toBe(ra.clientId);
  });
});
