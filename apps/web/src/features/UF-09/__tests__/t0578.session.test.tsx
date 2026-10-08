// T-0578 (D-0205 §9) AC1, AC7, AC9 on the session seam: the plan write (device first, queued), the
// machine event after it, reload, and the sync body. fake-indexeddb, no network.
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { S1, USER_A } from "./fixtures.js";
import { flushReal, freshDb, seedSession, signIn, storedFocus, useFakeClock } from "./helpers.js";
import { probe, session } from "./probe.js";
import { call, renderSession } from "./session-helpers.js";
import { dispatched, lastStore, stores } from "./store-spy.js";
import { NOW, PAUSED_NEXT, PLAN_P, logged, paused } from "./t0578-fixtures.js";

const spy = await vi.hoisted(async () => {
  const m = await import("../../../lib/offline/__tests__/supabase-spy.js");
  return m.createSupabaseSpy();
});
vi.mock("../../../lib/auth/client.js", async (orig) => ({
  ...((await orig()) as object),
  supabase: { from: spy.from },
}));
vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./offline-spies.js").then((m) => m.offlineSpies(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));
vi.mock("../views.js", (orig) => import("./probe.js").then((m) => m.probedViews(orig)));

const KEY = `wl-focus:${S1}`;
const upsertSpy = vi.mocked(offline.upsertSession);
const ids = (plan: { items: { exerciseId: string }[] }) => plan.items.map((i) => i.exerciseId);

async function storedPlan() {
  const entry = await offline.offlineDb().sessions.get(S1);
  return entry!;
}

function seedFocus(state: object): void {
  window.localStorage.setItem(KEY, JSON.stringify(state));
}

beforeEach(async () => {
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  probe.current = null;
  spy.calls.length = 0;
  spy.from.mockClear();
  upsertSpy.mockClear();
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession({ plan: PLAN_P, started_at: new Date(NOW - 1_500_000).toISOString() });
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AC1 online", () => {
  it("writes the new order, then the machine goes to next for item 1 with 60 s; no time check", async () => {
    seedFocus(PAUSED_NEXT);
    await renderSession();
    const result = await call(() => session().doLater());
    expect(result).toEqual({ ok: true, name: "inverted-row" });
    const row = (await storedPlan()).row;
    const plan = row.plan as typeof PLAN_P;
    expect(ids(plan)).toEqual(["bench-press", "leg-extension", "inverted-row"]);
    expect(plan.mainLiftId).toBe("bench-press");
    expect(plan.items.map((i) => i.prefill)).toEqual([
      PLAN_P.items[0]!.prefill,
      PLAN_P.items[2]!.prefill,
      PLAN_P.items[1]!.prefill,
    ]);
    const s = session();
    expect(s.plan.items.map((i) => i.exerciseId)).toEqual(ids(plan));
    expect(s.state).toMatchObject({ phase: "next", itemIndex: 1 });
    expect(s.state.timer).toMatchObject({ durationS: 60, startedAtMs: NOW });
    expect(s.loggedSets.map((x) => x.itemIndex)).toEqual([0, 0, 0, 0]);
    expect(dispatched.map((e) => e.type)).not.toContain("CHECK_RESOLVED");
    expect(storedFocus()).toMatchObject({ phase: "next", itemIndex: 1 });
  });

  it("unavailable (not paused): no write, ok false", async () => {
    seedFocus({ ...PAUSED_NEXT, phase: "next", resumePhase: null, pausedAtMs: null });
    await renderSession();
    upsertSpy.mockClear();
    expect(await call(() => session().doLater())).toEqual({ ok: false, reason: "unavailable" });
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});

describe("AC7 offline and reload", () => {
  it("queues the write with no request, a rebuilt store restores leg-extension, the flush carries the order", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    seedFocus(PAUSED_NEXT);
    await renderSession();
    await call(() => session().doLater());
    const entry = await storedPlan();
    expect(entry.pending).toBe(true);
    expect(ids(entry.row.plan as typeof PLAN_P)).toEqual([
      "bench-press",
      "leg-extension",
      "inverted-row",
    ]);
    expect(spy.calls).toEqual([]);

    cleanup();
    stores.length = 0;
    probe.current = null;
    await renderSession();
    expect(session().plan.items.map((i) => i.exerciseId)).toEqual([
      "bench-press",
      "leg-extension",
      "inverted-row",
    ]);
    expect(session().state).toMatchObject({ phase: "next", itemIndex: 1 });
    expect(session().loggedSets).toHaveLength(4);

    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    await offline.flush(USER_A);
    const call0 = spy.calls.find((c) => c.table === "sessions")!;
    const body = call0.rows[0] as { plan: typeof PLAN_P };
    expect(ids(body.plan)).toEqual(["bench-press", "leg-extension", "inverted-row"]);
  });
});

describe("AC9 write failure", () => {
  it("rejects: plan, pause and sets unchanged, the caller gets a failure", async () => {
    seedFocus(PAUSED_NEXT);
    await renderSession();
    const before = session().state;
    const boom = new Error("disk full");
    upsertSpy.mockRejectedValueOnce(boom);
    const result = await call(() => session().doLater());
    expect(result).toEqual({ ok: false, reason: "failed", error: boom });
    expect(session().state).toBe(before);
    expect(session().state.phase).toBe("paused");
    expect(session().plan.items.map((i) => i.exerciseId)).toEqual(ids(PLAN_P));
    expect(ids((await storedPlan()).row.plan as typeof PLAN_P)).toEqual(ids(PLAN_P));
    expect(storedFocus()).toMatchObject({ phase: "paused", resumePhase: "next" });
  });

  it("resumed while the write was in flight: the old order is written back, nothing moves", async () => {
    seedFocus(paused("next", { itemIndex: 1, loggedSets: PAUSED_NEXT.loggedSets }));
    await renderSession();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const real = upsertSpy.getMockImplementation()!;
    upsertSpy.mockImplementationOnce(async (r) => {
      await gate;
      return real(r);
    });
    const pending = call(() => session().doLater());
    await flushReal();
    session().resume();
    release();
    const result = await pending;
    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(ids((await storedPlan()).row.plan as typeof PLAN_P)).toEqual(ids(PLAN_P));
    expect(session().plan.items.map((i) => i.exerciseId)).toEqual(ids(PLAN_P));
  });

  /** Holds the next row write open; returns the way to release it. */
  function holdNextWrite(): () => void {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const real = upsertSpy.getMockImplementation()!;
    upsertSpy.mockImplementationOnce(async (r) => {
      await gate;
      return real(r);
    });
    return release;
  }

  it("a set logged on the current item mid-write: unavailable, the old order written back", async () => {
    seedFocus(PAUSED_NEXT);
    await renderSession();
    const release = holdNextWrite();
    const pending = call(() => session().doLater());
    await flushReal();
    lastStore().dispatch({ type: "SET_LOGGED", set: logged(1, 0), atMs: NOW });
    release();
    expect(await pending).toEqual({ ok: false, reason: "unavailable" });
    expect(ids((await storedPlan()).row.plan as typeof PLAN_P)).toEqual(ids(PLAN_P));
    expect(session().plan.items.map((i) => i.exerciseId)).toEqual(ids(PLAN_P));
    expect(session().state.phase).toBe("paused");
  });

  it("a swap landing mid-write is not undone: unavailable, the swapped plan is the store's", async () => {
    seedFocus(PAUSED_NEXT);
    await renderSession();
    const release = holdNextWrite();
    const pending = call(() => session().doLater());
    await flushReal();
    const swapped = {
      ...PLAN_P,
      items: PLAN_P.items.map((it, k) => (k === 2 ? { ...it, exerciseId: "leg-curl" } : it)),
    };
    lastStore().replacePlan(swapped, 2, NOW);
    release();
    expect(await pending).toEqual({ ok: false, reason: "unavailable" });
    expect(session().plan.items.map((i) => i.exerciseId)).toEqual(ids(swapped));
    expect(session().state.phase).toBe("paused");
  });

  it("an unavailable call does not replace a pending plan write that finish() waits for", async () => {
    const { createFocusActions, createSessionWrites } = await import("../session.js");
    const { createFocusStore } = await import("../store.js");
    const { CTX_P } = await import("./t0578-fixtures.js");
    const running = {
      ...PAUSED_NEXT,
      phase: "next",
      resumePhase: null,
      pausedAtMs: null,
    } as typeof PAUSED_NEXT;
    const store = createFocusStore({ sessionId: S1, ctx: CTX_P, initial: running, storage: null });
    const writes = createSessionWrites();
    const trim = new Promise<void>(() => undefined);
    writes.plan = trim;
    const actions = createFocusActions({
      sessionId: S1,
      store,
      storage: null,
      onRow: () => undefined,
      navigate: () => undefined,
      writes,
    });
    expect(await actions.doLater()).toEqual({ ok: false, reason: "unavailable" });
    expect(writes.plan).toBe(trim);
  });
});

describe("the skipped-ids key (restore realign) is removed with the focus state", () => {
  const SKIPPED = `wl-focus-skipped:${S1}`;
  it("finish() removes it", async () => {
    seedFocus(PAUSED_NEXT);
    window.localStorage.setItem(SKIPPED, '["bench-press"]');
    await renderSession();
    window.localStorage.setItem(SKIPPED, '["bench-press"]');
    await call(() => session().finish());
    expect(window.localStorage.getItem(SKIPPED)).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("opening an ended session removes it", async () => {
    await seedSession({ plan: PLAN_P, ended_at: new Date(NOW - 1000).toISOString() });
    seedFocus(PAUSED_NEXT);
    window.localStorage.setItem(SKIPPED, '["bench-press"]');
    await renderSession();
    expect(window.localStorage.getItem(SKIPPED)).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});
