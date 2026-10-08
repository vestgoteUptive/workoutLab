// T-0578 (D-0205 §9) AC1, AC7, AC9 on the session seam: the plan write (device first, queued), the
// machine event after it, reload, and the sync body. fake-indexeddb, no network.
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { S1, STARTED_AT_MS, USER_A } from "./fixtures.js";
import { flushReal, freshDb, seedSession, signIn, storedFocus, useFakeClock } from "./helpers.js";
import { probe, session } from "./probe.js";
import { call, renderSession } from "./session-helpers.js";
import { dispatched, stores } from "./store-spy.js";
import { NOW, PAUSED_NEXT, PLAN_P, paused } from "./t0578-fixtures.js";

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
    expect(STARTED_AT_MS).toBeGreaterThan(0);
  });
});
