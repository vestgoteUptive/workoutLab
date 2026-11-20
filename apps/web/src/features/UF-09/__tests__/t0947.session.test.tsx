// T-0947 (D-0245, D-0246 §2 §12) on the session seam: `ctx.insertItem` and `ctx.timeLeftS`.
// The engine runs for real (spied); IndexedDB is fake-indexeddb; no network.
import { cleanup } from "@testing-library/react";
import { timeCheck, type InsertResult } from "@workoutlab/engine";
import type { SessionPlan } from "@workoutlab/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as engine from "@workoutlab/engine";
import * as offline from "../../../lib/offline/index.js";
import { S1, USER_A } from "./fixtures.js";
import { freshDb, seedSession, signIn, storedFocus, useFakeClock } from "./helpers.js";
import { probe, session } from "./probe.js";
import { call, renderSession } from "./session-helpers.js";
import { LIB, NOW, PAUSED_REST, PLAN_P, logged, pausedP, startedFor } from "./t0947-fixtures.js";

const order = vi.hoisted(() => [] as string[]);
const insertCalls = vi.hoisted(() => ({ n: 0 }));

vi.mock("@workoutlab/engine", async (orig) => {
  const actual = (await orig()) as typeof import("@workoutlab/engine");
  return { ...actual, insertItem: vi.fn(actual.insertItem) };
});
vi.mock("../../../lib/offline/index.js", async (orig) => {
  const { offlineSpies } = await import("./offline-spies.js");
  const m = await offlineSpies(orig);
  const actual = await orig<typeof import("../../../lib/offline/index.js")>();
  return {
    ...m,
    loadLibrary: vi.fn(async () => (await import("./t0947-fixtures.js")).LIB),
    upsertSession: vi.fn(async (row: Parameters<typeof actual.upsertSession>[0]) => {
      await actual.upsertSession(row);
      order.push("write");
    }),
  };
});
vi.mock("../store.js", async (orig) => {
  const actual = (await orig()) as typeof import("../store.js");
  return {
    ...actual,
    createFocusStore(options: Parameters<typeof actual.createFocusStore>[0]) {
      const store = actual.createFocusStore(options);
      return {
        ...store,
        insertItem(...args: Parameters<typeof store.insertItem>) {
          order.push("event");
          insertCalls.n += 1;
          return store.insertItem(...args);
        },
      };
    },
  };
});
vi.mock("../views.js", (orig) => import("./probe.js").then((m) => m.probedViews(orig)));

const KEY = `wl-focus:${S1}`;
const upsertSpy = vi.mocked(offline.upsertSession);
const insertSpy = vi.mocked(engine.insertItem);
const ids = (p: SessionPlan) => p.items.map((i) => i.exerciseId);

const PROFILE = {
  goal: "build_muscle",
  level: "beginner",
  equipment: ["barbell", "rack", "bench", "dumbbell", "cable", "machine", "pullup-bar"],
  rhythmMin: 3,
  rhythmMax: 4,
  priorityAreas: [],
  onboardedAt: "2026-08-02T10:00:00Z",
  planUpdatedAt: "2026-08-02T10:00:00Z",
};

async function stored() {
  return (await offline.offlineDb().sessions.get(S1))!;
}

async function open(
  state: object,
  over: { elapsedS?: number; plan?: SessionPlan; warmup?: boolean } = {},
) {
  window.localStorage.setItem(KEY, JSON.stringify(state));
  await seedSession({
    plan: over.plan ?? PLAN_P,
    started_at: startedFor(over.elapsedS ?? 600),
    warmup_in_budget: over.warmup ?? true,
  });
  await renderSession();
  upsertSpy.mockClear();
  insertSpy.mockClear();
  order.length = 0;
  insertCalls.n = 0;
}

beforeEach(async () => {
  window.localStorage.clear();
  probe.current = null;
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await offline.offlineDb().profileCache.put({ userId: USER_A, profile: PROFILE as never });
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  order.length = 0;
  insertCalls.n = 0;
  insertSpy.mockClear();
  upsertSpy.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AC4 add during a rest (B1)", () => {
  it("engine gets atIndex 1 and leftS 945, the write lands before the event, the plan has 4 items", async () => {
    await open(PAUSED_REST);
    expect(session().timeLeftS()).toBe(945);
    const result = await call(() => session().insertItem("lateral-raise"));
    expect(result).toEqual({ status: "added", name: "Lateral raise", afterName: "Bench press" });
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy.mock.calls[0]![2]).toEqual({ atIndex: 1, leftS: 945 });
    expect(order).toEqual(["write", "event"]);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const row = (await stored()).row;
    expect(ids(row.plan as SessionPlan)).toEqual([
      "bench-press",
      "lateral-raise",
      "inverted-row",
      "leg-extension",
    ]);
    expect(ids(session().plan)).toEqual(ids(row.plan as SessionPlan));
    expect(session().plan.items).toHaveLength(4);
    expect(session().plan.mainLiftId).toBe("bench-press");
    expect(session().loggedSets.map((s) => s.itemIndex)).toEqual([0, 0]);
    expect(session().state).toMatchObject({ phase: "paused", resumePhase: "rest", itemIndex: 0 });
    // B1's item: lateral-raise × 3, first_time, 375 s.
    expect(session().plan.items[1]).toMatchObject({
      sets: 3,
      costS: 375,
      prefill: { weightKg: null, reps: 10, kind: "first_time" },
    });
  });

  it("the focus state is written with the shifted indices and the new plan is what a reload sees", async () => {
    await open({
      ...PAUSED_REST,
      resumePhase: "set",
      timer: null,
      setIndex: 2,
      loggedSets: [logged(0, 0, "bench-press"), logged(2, 0, "leg-extension")],
    });
    await call(() => session().insertItem("lateral-raise"));
    expect((storedFocus()!.loggedSets as { itemIndex: number }[]).map((s) => s.itemIndex)).toEqual([
      0, 3,
    ]);
  });
});

describe("AC5 atIndex clamp (D-0246 §12)", () => {
  it("on the last item the add is appended: atIndex = items.length", async () => {
    await open(
      pausedP("set", {
        itemIndex: 2,
        setIndex: 1,
        loggedSets: [
          ...[0, 1, 2, 3].map((i) => logged(0, i, "bench-press")),
          ...[0, 1, 2].map((i) => logged(1, i, "inverted-row")),
          logged(2, 0, "leg-extension"),
        ],
      }),
      { elapsedS: 1500 },
    );
    const result = await call(() => session().insertItem("biceps-curl"));
    expect(result.status).toBe("added");
    expect(insertSpy.mock.calls[0]![2]).toEqual({ atIndex: 3, leftS: 1095 });
    expect(ids(session().plan)[3]).toBe("biceps-curl");
  });

  it("a 0-item plan clamps atIndex to 0", async () => {
    await open(pausedP("getReady", { itemIndex: 0 }), { plan: { ...PLAN_P, items: [] } });
    insertSpy.mockReturnValueOnce({ refused: "time" });
    await call(() => session().insertItem("lateral-raise"));
    expect(insertSpy.mock.calls[0]![2].atIndex).toBe(0);
  });
});

describe("AC6 pause in the warm-up (B7)", () => {
  it("atIndex 1, leftS 975, and the warm-up is still the restored phase", async () => {
    await open(
      pausedP("warmup", {
        warmupStartedAtMs: NOW - 5000 - 60_000,
      }),
      { elapsedS: 60 },
    );
    expect(session().timeLeftS()).toBe(975);
    const result = await call(() => session().insertItem("lateral-raise"));
    expect(result.status).toBe("added");
    expect(insertSpy.mock.calls[0]![2]).toEqual({ atIndex: 1, leftS: 975 });
    expect(session().state).toMatchObject({ phase: "paused", resumePhase: "warmup" });
    expect(session().plan.items[0]!.exerciseId).toBe("bench-press");
  });
});

describe("AC7 pause from UF-09.6", () => {
  it("on inverted-row (itemIndex 1) atIndex is 2", async () => {
    await open(
      pausedP("next", {
        itemIndex: 1,
        loggedSets: [0, 1, 2, 3].map((i) => logged(0, i, "bench-press")),
      }),
      { elapsedS: 800 },
    );
    const result = await call(() => session().insertItem("lateral-raise"));
    expect(result).toMatchObject({ status: "added", afterName: "Inverted row" });
    expect(insertSpy.mock.calls[0]![2].atIndex).toBe(2);
    expect(ids(session().plan)).toEqual([
      "bench-press",
      "inverted-row",
      "lateral-raise",
      "leg-extension",
    ]);
  });
});

describe("AC8 refusals", () => {
  it.each(["time", "items_cap"] as const)(
    "%s: no write, no event, reason and leftS",
    async (reason) => {
      await open(PAUSED_REST);
      insertSpy.mockReturnValueOnce({ refused: reason } as InsertResult);
      const result = await call(() => session().insertItem("lateral-raise"));
      expect(result).toEqual({ status: "refused", reason, leftS: 945 });
      expect(upsertSpy).not.toHaveBeenCalled();
      expect(insertCalls.n).toBe(0);
      expect(ids(session().plan)).toEqual(ids(PLAN_P));
    },
  );

  it("the real engine refuses with no time left (budget gone)", async () => {
    await open(PAUSED_REST, { elapsedS: 2600 });
    const result = await call(() => session().insertItem("lateral-raise"));
    expect(result).toMatchObject({ status: "refused", reason: "time" });
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});

describe("AC9 blocked (D-0246 §2)", () => {
  it("a plan item, skipped or not", async () => {
    await open({ ...PAUSED_REST, skippedItems: [1] });
    for (const id of ["inverted-row", "bench-press"]) {
      expect(await call(() => session().insertItem(id))).toEqual({ status: "blocked" });
    }
    expect(insertSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(insertCalls.n).toBe(0);
  });

  it("bench-press with 2 logged sets, swapped for db-bench-press", async () => {
    const swapped = {
      ...PLAN_P,
      items: [{ ...PLAN_P.items[0]!, exerciseId: "db-bench-press" }, ...PLAN_P.items.slice(1)],
    };
    await open(
      pausedP("rest", {
        itemIndex: 0,
        setIndex: 1,
        timer: { startedAtMs: NOW - 15_000, durationS: 120, pausedMs: 0 },
        loggedSets: [logged(0, 0, "bench-press"), logged(0, 1, "bench-press")],
      }),
      { plan: swapped },
    );
    expect(await call(() => session().insertItem("bench-press"))).toEqual({ status: "blocked" });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(insertCalls.n).toBe(0);
    expect(ids((await stored()).row.plan as SessionPlan)).toEqual(ids(swapped));
  });

  it("outside a plain pause: blocked, no write", async () => {
    await open(pausedP("timeCheck", { itemIndex: 1 }));
    expect(await call(() => session().insertItem("lateral-raise"))).toEqual({ status: "blocked" });
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});

describe("AC10 write fails (B15)", () => {
  it("failed: plan and indices unchanged, no event", async () => {
    await open({
      ...PAUSED_REST,
      resumePhase: "set",
      timer: null,
      loggedSets: [logged(2, 0, "leg-extension")],
    });
    const before = session().state;
    upsertSpy.mockRejectedValueOnce(new Error("disk full"));
    expect(await call(() => session().insertItem("lateral-raise"))).toEqual({ status: "failed" });
    expect(insertCalls.n).toBe(0);
    expect(session().state).toBe(before);
    expect(ids(session().plan)).toEqual(ids(PLAN_P));
    expect(ids((await stored()).row.plan as SessionPlan)).toEqual(ids(PLAN_P));
  });
});

describe("AC11 killed between the plan write and the focus-state write (B14)", () => {
  it("reloads paused with four items and both bench sets on bench-press", async () => {
    const before = {
      ...PAUSED_REST,
      resumePhase: "set",
      timer: null,
      setIndex: 2,
      loggedSets: [
        logged(0, 0, "bench-press"),
        logged(0, 1, "bench-press"),
        logged(2, 0, "leg-extension"),
      ],
    };
    await open(before);
    const focusBefore = window.localStorage.getItem(KEY)!;
    await call(() => session().insertItem("lateral-raise"));
    // The kill: the plan write landed, the focus-state write did not.
    window.localStorage.setItem(KEY, focusBefore);
    cleanup();
    probe.current = null;
    await renderSession();
    expect(session().plan.items).toHaveLength(4);
    expect(session().state).toMatchObject({ phase: "paused", resumePhase: "set" });
    expect(session().loggedSets.map((s) => [s.exerciseId, s.itemIndex])).toEqual([
      ["bench-press", 0],
      ["bench-press", 0],
      ["leg-extension", 3],
    ]);
  });

  it("when focus state and plan agree the restore is D-0111 §7 as before", async () => {
    await open({
      ...PAUSED_REST,
      resumePhase: "set",
      timer: null,
      loggedSets: [logged(2, 0, "leg-extension")],
    });
    await call(() => session().insertItem("lateral-raise"));
    cleanup();
    probe.current = null;
    await renderSession();
    expect(session().loggedSets.map((s) => s.itemIndex)).toEqual([3]);
    expect(session().plan.items).toHaveLength(4);
  });
});

describe("AC12 offline", () => {
  it("queues the write (device first) and the result is added", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    await open(PAUSED_REST);
    const result = await call(() => session().insertItem("lateral-raise"));
    expect(result.status).toBe("added");
    const entry = await stored();
    expect(entry.pending).toBe(true);
    expect(ids(entry.row.plan as SessionPlan)).toContain("lateral-raise");
  });
});

describe("AC13 rule 8 counts the added item (B17)", () => {
  it("bench-press ending at 1300 s: remainingS 1200, behindS -200, no UF-09.8", async () => {
    await open(PAUSED_REST);
    await call(() => session().insertItem("lateral-raise"));
    const result = timeCheck(session().workout, { elapsedS: 1300, nextItemIndex: 1 });
    const items = session().plan.items.slice(1);
    expect(items.reduce((sum, i) => sum + i.costS, 0)).toBe(1200);
    expect(result.behindS).toBe(-200);
    expect(result.show).toBe(false);
  });
});

describe("timeLeftS read", () => {
  it("is negative when behind, which refuses every add", async () => {
    await open(PAUSED_REST, { elapsedS: 2700 });
    expect(session().timeLeftS()).toBe(-330 - 555 - 270 + 0);
  });

  it("ignores the warm-up when it is not in the budget", async () => {
    await open(pausedP("getReady"), { warmup: false, elapsedS: 0 });
    expect(session().timeLeftS()).toBe(2700 - 720 - 555 - 270);
  });
});

void LIB;
