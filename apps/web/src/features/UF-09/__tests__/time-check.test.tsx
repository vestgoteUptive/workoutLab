// T-0304d AC-1–AC-5 (UF-09.8, rule 8, D-0024, D-0066 §11, D-0120 §1–§5, NFR-TIME-2, NFR-TIME-4):
// the check point calls the REAL engine `timeCheck` once (a spy wraps it), UF-09.8 shows its
// answer, an applied option is written as the engine's whole item list, and a restore re-runs
// the check. P1-R8 throughout, `timeZone="UTC"`, `locale="en-GB"`; P1 starts at 10:00 UTC.
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timeCheck, type TimeCheckResult, type Workout } from "@workoutlab/engine";
import type { SessionPlan } from "@workoutlab/shared";
import * as offline from "../../../lib/offline/index.js";
import { initialFocusState, type FocusEvent, type FocusState } from "../machine.js";
import type { SeamAction } from "../seams.js";
import type { SessionRow } from "../session.js";
import { createFocusStore } from "../store.js";
import { createCheckHolder, ruleEightCheckPoint } from "../time-check.js";
import { S1, STARTED_AT, USER_A } from "./fixtures.js";
import {
  advance,
  flushReal,
  freshDb,
  screenId,
  seedSession,
  signIn,
  storedFocus,
  useFakeClock,
} from "./helpers.js";
import { probe, session } from "./probe.js";
import { L_R8, R8_BENCH, R8_PLAN, R8_ROW, at, benchSets } from "./r8-fixtures.js";
import { deferred, renderSession } from "./session-helpers.js";
import { findPath, findScreen, seedFocus } from "./set-loop-helpers.js";
import { countOf, dispatched, stores } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./r8-mock.js").then((m) => m.r8Mock(orig)),
);
vi.mock("@workoutlab/engine", (orig) => import("./r8-mock.js").then((m) => m.engineSpy(orig)));
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));
vi.mock("../views.js", (orig) => import("./probe.js").then((m) => m.probedViews(orig)));

const tc = vi.mocked(timeCheck);
const upsert = vi.mocked(offline.upsertSession);
let realTimeCheck: typeof timeCheck;

beforeEach(async () => {
  const engine = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  realTimeCheck = engine.timeCheck;
  tc.mockReset();
  tc.mockImplementation(realTimeCheck);
  upsert.mockClear();
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  probe.current = null;
  freshDb();
  signIn(USER_A);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  tc.mockImplementation(realTimeCheck);
});

const render = () => renderSession({ timeZone: "UTC", locale: "en-GB" });

async function seedR8(row: { warmup_in_budget?: boolean; plan?: SessionPlan } = {}) {
  await seedSession({ plan: R8_PLAN, ...row });
}

/** The rest after bench-press's last set, run out at `nowMs`: the mount ends it (REST_END), so
 *  the check point after item 0 runs at `nowMs`. */
function seedCheckPoint(nowMs: number, patch: Partial<FocusState> = {}, plan = R8_PLAN) {
  seedFocus(
    nowMs,
    {
      phase: "rest",
      itemIndex: 0,
      setIndex: 3,
      loggedSets: benchSets(4),
      timer: { startedAtMs: nowMs - 120_000, durationS: 120, pausedMs: 0 },
      ...patch,
    },
    plan,
  );
}

/** Mounts at the check point after item 0 at `STARTED_AT + s`. */
async function atCheck(s: number, patch: Partial<FocusState> = {}) {
  useFakeClock(at(s));
  await seedR8();
  seedCheckPoint(at(s), patch);
  return render();
}

const option = (id: string) => document.querySelector(`[data-option="${id}"]`);
const doneBy = (id: string) =>
  option(id)?.querySelector('[data-field="done-by"]')?.textContent ?? null;
const heading = () => screen.queryByRole("heading", { level: 1 })?.textContent ?? null;
const lastResult = (): TimeCheckResult => {
  const result = tc.mock.results[tc.mock.results.length - 1]!;
  if (result.type !== "return") throw new Error("timeCheck threw");
  return result.value;
};

async function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
  await flushReal();
}

async function storedRow(): Promise<SessionRow> {
  return (await offline.offlineDb().sessions.get(S1))!.row;
}

describe("AC-1 R8-E1 through the engine", () => {
  it("one call with (workout, {elapsedS: 1500, nextItemIndex: 1}); the plan is the row's, the budget 45", async () => {
    await atCheck(1500);
    expect(screenId()).toBe("UF-09.8");
    expect(tc).toHaveBeenCalledTimes(1);
    const [workout, progress] = tc.mock.calls[0]! as [Workout, unknown];
    expect(progress).toEqual({ elapsedS: 1500, nextItemIndex: 1 });
    expect(workout.plan).toEqual(R8_PLAN);
    expect(workout.plan).toEqual((await storedRow()).plan);
    expect(workout.budgetMin).toBe(45);
  });

  it("shows 2 min behind, the planned finish, and each option with its Done by", async () => {
    await atCheck(1500);
    expect(heading()).toBe("2 min behind");
    expect(screen.getByText("You planned to finish by 10:45")).toBeInTheDocument();
    expect(doneBy("continue")).toBe("Done by 10:46");
    expect(option("trim")!.textContent).toContain("Lateral raise 3 → 2 sets");
    expect(doneBy("trim")).toBe("Done by 10:45");
    expect(option("skip")!.textContent).toContain("Skip Barbell row");
    expect(doneBy("skip")).toBe("Done by 10:37");
    // Each option's details describe its button.
    const trim = screen.getByRole("button", { name: "Trim" });
    expect(trim).toHaveAccessibleDescription("Lateral raise 3 → 2 sets Done by 10:45");
  });

  it("focus lands on Continue", async () => {
    await atCheck(1500);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Continue" }));
  });

  it("Pause and Resume on UF-09.8 make no second call", async () => {
    await atCheck(1500);
    await click("Pause workout");
    expect(screenId()).toBe("UF-09.9");
    await advance(30_000);
    await click("Resume");
    expect(screenId()).toBe("UF-09.8");
    expect(heading()).toBe("2 min behind");
    await flushReal();
    expect(tc).toHaveBeenCalledTimes(1);
  });
});

describe("AC-2 only between exercises, only when behind (NFR-TIME-4)", () => {
  it("not behind (R8-E3, 59 s): no UF-09.8, UF-09.6 barbell-row; one call, which returned show: false", async () => {
    await atCheck(1454);
    await flushReal();
    expect(screenId()).toBe("UF-09.6");
    expect(heading()).toBe("Barbell row");
    expect(tc).toHaveBeenCalledTimes(1);
    expect(lastResult().behindS).toBe(59);
    expect(lastResult().show).toBe(false);
    // `minutesBehind` renders only when `show` is true.
    expect(document.body.textContent).not.toMatch(/min behind/);
  });

  it("the pair: 1500 s elapsed shows UF-09.8", async () => {
    await atCheck(1500);
    expect(screenId()).toBe("UF-09.8");
    expect(lastResult().show).toBe(true);
    expect(heading()).toMatch(/min behind/);
  });

  function row(): SessionRow {
    return {
      id: S1,
      started_at: STARTED_AT,
      time_budget_min: 45,
      energy: "normal",
      warmup_in_budget: true,
      ended_at: null,
      plan: R8_PLAN,
    };
  }

  function r8Store(initial: FocusState) {
    const holder = createCheckHolder();
    holder.row = row();
    return createFocusStore({
      sessionId: S1,
      ctx: { plan: R8_PLAN, library: L_R8 },
      initial,
      storage: null,
      resolveCheckPoint: ruleEightCheckPoint(holder),
    });
  }

  const recorded = (setIndex: number, exerciseId = "bench-press") => ({
    ...benchSets(setIndex + 1)[setIndex]!,
    exerciseId,
  });

  it("never mid-item: a full walk of item 0 makes 0 calls before its last REST_END, then 1", () => {
    let t = at(0);
    const step = (s: number) => (t += s * 1000);
    const store = r8Store(initialFocusState(S1, R8_PLAN, t));
    const send = (event: FocusEvent) => store.dispatch(event);
    send({ type: "COUNTDOWN_END", atMs: step(5) });
    for (let i = 0; i < 4; i += 1) send({ type: "WARMUP_NEXT", atMs: step(40) });
    send({ type: "READY", atMs: step(30) });
    expect(store.getState().phase).toBe("set");
    for (let setIndex = 0; setIndex < 4; setIndex += 1) {
      send({ type: "SET_RECORDED", set: recorded(setIndex), atMs: step(40) });
      send({ type: "SAVED", atMs: step(5) });
      expect(store.getState().phase).toBe("rest");
      if (setIndex === 3) {
        expect(tc).toHaveBeenCalledTimes(0);
        // The last rest ends at 1500 s elapsed: behind, so the check shows.
        send({ type: "REST_END", atMs: at(1500) });
      } else send({ type: "REST_END", atMs: step(120) });
      if (setIndex < 3) expect(tc, `after set ${setIndex + 1}`).toHaveBeenCalledTimes(0);
    }
    expect(tc).toHaveBeenCalledTimes(1);
    expect(tc.mock.calls[0]![1]).toEqual({ elapsedS: 1500, nextItemIndex: 1 });
    expect(store.getState()).toMatchObject({ phase: "timeCheck", itemIndex: 1 });
  });

  it("never after the last item: its last set goes to done with 0 calls", async () => {
    const store = r8Store({
      ...initialFocusState(S1, R8_PLAN, at(2000)),
      phase: "set",
      timer: null,
      itemIndex: 3,
      setIndex: 2,
    });
    store.dispatch({ type: "SET_RECORDED", set: recorded(2, "lateral-raise"), atMs: at(2600) });
    store.dispatch({ type: "SAVED", atMs: at(2605) });
    expect(store.getState().phase).toBe("done");
    await flushReal();
    expect(tc).toHaveBeenCalledTimes(0);
  });

  it("with a keepsClockRunning: true overlay open, the check point makes 0 calls (T-0304e AC-9)", async () => {
    let overlay: { close(): void } | null = null;
    const listView: SeamAction = {
      id: "list-view",
      label: "List view",
      keepsClockRunning: true,
      render: (c) => {
        overlay = c;
        return <p data-testid="overlay">{"List"}</p>;
      },
    };
    useFakeClock(at(1380));
    await seedR8();
    seedFocus(
      at(1380),
      {
        phase: "paused",
        resumePhase: "rest",
        pausedAtMs: at(1380),
        itemIndex: 0,
        setIndex: 3,
        loggedSets: benchSets(4),
        timer: { startedAtMs: at(1380), durationS: 120, pausedMs: 0 },
      },
      R8_PLAN,
    );
    await renderSession({ timeZone: "UTC", locale: "en-GB", seams: { pause: [listView] } });
    await click("List view");
    // The rest ends under the overlay at 1500 s: behind, but the check point is forced.
    await advance(120_000);
    expect(countOf("REST_END")).toBe(1);
    expect(storedFocus()).toMatchObject({ phase: "next", itemIndex: 1 });
    expect(tc).toHaveBeenCalledTimes(0);
    act(() => overlay!.close());
    await flushReal();
    expect(tc).toHaveBeenCalledTimes(0);
  });
});

describe("AC-3 apply an option (D-0120 §1, D-0071 §6)", () => {
  it("Trim: one upsertSession of {...row, plan: {...row.plan, items: trim.items}}; then UF-09.6 barbell-row on the new plan", async () => {
    await atCheck(1500);
    const before = await storedRow();
    const result = lastResult();
    await click("Trim");
    expect(upsert).toHaveBeenCalledTimes(1);
    const written = upsert.mock.calls[0]![0];
    expect(written).toEqual({
      ...before,
      plan: { ...(before.plan as SessionPlan), items: result.trim.items },
    });
    for (const key of [
      "started_at",
      "time_budget_min",
      "energy",
      "warmup_in_budget",
      "ended_at",
    ] as const) {
      expect(written[key], key).toEqual(before[key]);
    }
    const plan = written.plan as SessionPlan;
    expect(plan.items).toHaveLength(4);
    expect(plan.items[3]).toMatchObject({ exerciseId: "lateral-raise", sets: 2 });
    await findScreen("UF-09.6");
    expect(heading()).toBe("Barbell row");
    expect(session().plan).toEqual(plan);
    expect((await storedRow()).plan).toEqual(plan);
    expect(storedFocus()).toMatchObject({ phase: "next", itemIndex: 1 });
  });

  it("Skip next: items = skipNext.items (3, no barbell-row); UF-09.6 leg-curl", async () => {
    await atCheck(1500);
    const result = lastResult();
    await click("Skip next");
    expect(upsert).toHaveBeenCalledTimes(1);
    const plan = upsert.mock.calls[0]![0].plan as SessionPlan;
    expect(plan.items).toEqual(result.skipNext.items);
    expect(plan.items.map((i) => i.exerciseId)).toEqual([
      "bench-press",
      "leg-curl",
      "lateral-raise",
    ]);
    await findScreen("UF-09.6");
    expect(heading()).toBe("Leg curl");
  });

  it("Continue: no upsertSession; UF-09.6 barbell-row", async () => {
    await atCheck(1500);
    await click("Continue");
    expect(screenId()).toBe("UF-09.6");
    expect(heading()).toBe("Barbell row");
    await flushReal();
    expect(upsert).not.toHaveBeenCalled();
    expect(session().plan).toEqual(R8_PLAN);
  });

  it("pending: the three options are aria-disabled, and a second click makes no second call", async () => {
    await atCheck(1500);
    const held = deferred<void>();
    upsert.mockImplementationOnce(() => held.promise.then(() => ({}) as never));
    await click("Trim");
    for (const name of ["Continue", "Trim", "Skip next"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-disabled", "true");
    }
    await click("Trim");
    await click("Skip next");
    await click("Continue");
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(countOf("CONTINUE")).toBe(0);
    expect(screenId()).toBe("UF-09.8");
    await act(async () => held.resolve());
    await findScreen("UF-09.6");
    expect(heading()).toBe("Barbell row");
  });

  it("the pair: before a pick, no option is aria-disabled", async () => {
    await atCheck(1500);
    for (const name of ["Continue", "Trim", "Skip next"]) {
      expect(screen.getByRole("button", { name })).not.toHaveAttribute("aria-disabled");
    }
  });

  it("rejection: the polite error, still UF-09.8, and Continue still works", async () => {
    await atCheck(1500);
    upsert.mockImplementationOnce(() => Promise.reject(new Error("quota")));
    await click("Trim");
    const status = screen.getByText("Couldn't save the new plan. Try again.");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screenId()).toBe("UF-09.8");
    expect(session().plan).toEqual(R8_PLAN);
    await click("Continue");
    expect(screenId()).toBe("UF-09.6");
  });

  it("nothing left: an option with items.length = itemIndex goes to done, and finish() runs", async () => {
    tc.mockImplementationOnce((workout, progress) => {
      const r = realTimeCheck(workout, progress);
      return {
        ...r,
        skipNext: { items: r.skipNext.items.slice(0, 1), projectedS: progress.elapsedS },
      };
    });
    await atCheck(1500);
    await click("Skip next");
    await findPath(`/session/${S1}/summary`);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect((upsert.mock.calls[0]![0].plan as SessionPlan).items).toHaveLength(1);
    expect(upsert.mock.calls[1]![0].ended_at).toBe(new Date(at(1500)).toISOString());
    expect(storedFocus()).toBeNull();
  });

  it("Trim hidden: when the not-started items are only a main lift, trim.items equals the plan and there is no Trim", async () => {
    const plan: SessionPlan = {
      ...R8_PLAN,
      items: [R8_ROW, R8_BENCH],
    };
    useFakeClock(at(2100));
    await seedR8({ plan });
    seedCheckPoint(
      at(2100),
      {
        setIndex: 2,
        loggedSets: benchSets(3).map((s) => ({ ...s, exerciseId: "barbell-row" })),
      },
      plan,
    );
    await render();
    expect(screenId()).toBe("UF-09.8");
    expect(lastResult().trim.items).toEqual(plan.items);
    expect(screen.queryByRole("button", { name: "Trim" })).toBeNull();
    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent),
    ).toEqual(["Pause workout", "Continue", "Skip next"]);
  });
});

describe("AC-4 elapsed, clock skew, a throwing check (D-0120 §3)", () => {
  it("a 120 s pause and an off-budget 160 s warm-up at +1780 s pass elapsedS 1500; planned finish 10:49", async () => {
    useFakeClock(at(1780));
    await seedR8({ warmup_in_budget: false });
    seedCheckPoint(at(1780), { workoutPausedMs: 120_000, warmupSpentMs: 160_000 });
    await render();
    expect(tc.mock.calls[0]![1]).toEqual({ elapsedS: 1500, nextItemIndex: 1 });
    expect(screenId()).toBe("UF-09.8");
    expect(screen.getByText("You planned to finish by 10:49")).toBeInTheDocument();
  });

  it("the pair: the warm-up in budget passes 1660, and the planned finish leaves it out (10:47)", async () => {
    useFakeClock(at(1780));
    await seedR8({ warmup_in_budget: true });
    seedCheckPoint(at(1780), { workoutPausedMs: 120_000, warmupSpentMs: 160_000 });
    await render();
    expect(tc.mock.calls[0]![1]).toEqual({ elapsedS: 1660, nextItemIndex: 1 });
    expect(screen.getByText("You planned to finish by 10:47")).toBeInTheDocument();
  });

  it("a sub-second now (+1500.4 s) passes the integer 1500; timeCheck doesn't throw, and UF-09.8 shows", async () => {
    useFakeClock(at(1500.4));
    await seedR8();
    seedCheckPoint(at(1500.4));
    await render();
    expect(tc).toHaveBeenCalledTimes(1);
    expect(tc.mock.calls[0]![1]).toEqual({ elapsedS: 1500, nextItemIndex: 1 });
    expect(Number.isInteger((tc.mock.calls[0]![1] as { elapsedS: number }).elapsedS)).toBe(true);
    expect(tc.mock.results[0]!.type).toBe("return");
    expect(screenId()).toBe("UF-09.8");
  });

  it("clock skew: now = started_at − 60 s passes elapsedS 0, and the screen is UF-09.6", async () => {
    await atCheck(-60);
    expect(tc.mock.calls[0]![1]).toEqual({ elapsedS: 0, nextItemIndex: 1 });
    expect(lastResult().show).toBe(false);
    expect(screenId()).toBe("UF-09.6");
  });

  it("a throwing timeCheck: UF-09.6, no uncaught error, no role=alert", async () => {
    const errors = vi.spyOn(console, "error");
    tc.mockImplementation(() => {
      throw new RangeError("elapsedS must be an integer ≥ 0");
    });
    await atCheck(1500);
    await flushReal();
    expect(tc).toHaveBeenCalledTimes(1);
    expect(tc.mock.results[0]!.type).toBe("throw");
    expect(screenId()).toBe("UF-09.6");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("AC-5 restore (D-0120 §4 §5)", () => {
  it("a remount in timeCheck 30 s later makes exactly one fresh call, {elapsedS: 1530, nextItemIndex: 1}, and still shows UF-09.8", async () => {
    const view = await atCheck(1500);
    expect(screenId()).toBe("UF-09.8");
    view.unmount();
    vi.setSystemTime(at(1530));
    await render();
    expect(tc).toHaveBeenCalledTimes(2);
    expect(tc.mock.calls[1]![1]).toEqual({ elapsedS: 1530, nextItemIndex: 1 });
    expect(screenId()).toBe("UF-09.8");
    expect(heading()).toBe("3 min behind");
    await flushReal();
    expect(tc).toHaveBeenCalledTimes(2);
  });

  it("no longer behind: a fresh result with show: false dispatches CONTINUE → UF-09.6", async () => {
    const view = await atCheck(1500);
    view.unmount();
    dispatched.length = 0;
    tc.mockImplementationOnce((workout, progress) => ({
      ...realTimeCheck(workout, progress),
      show: false,
      minutesBehind: null,
    }));
    await render();
    expect(countOf("CONTINUE")).toBe(1);
    expect(screenId()).toBe("UF-09.6");
    expect(heading()).toBe("Barbell row");
  });

  it.each([
    ["timeCheck", {}],
    ["paused on timeCheck", { phase: "paused", resumePhase: "timeCheck", pausedAtMs: at(1500) }],
  ] as const)(
    "past the end: a stored %s at itemIndex = items.length restores to done, which finishes",
    async (_label, patch) => {
      useFakeClock(at(1500));
      await seedR8();
      seedFocus(at(1500), { phase: "timeCheck", itemIndex: 4, ...patch }, R8_PLAN);
      await render();
      await findPath(`/session/${S1}/summary`);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(upsert.mock.calls[0]![0].ended_at).toBe(new Date(at(1500)).toISOString());
      expect(tc).not.toHaveBeenCalled();
    },
  );

  it("the pair: itemIndex = items.length + 1 is rejected and starts fresh at UF-09.1", async () => {
    useFakeClock(at(1500));
    await seedR8();
    seedFocus(at(1500), { phase: "timeCheck", itemIndex: 5 }, R8_PLAN);
    await render();
    expect(screenId()).toBe("UF-09.1");
    expect(storedFocus()).toMatchObject({ phase: "getReady", itemIndex: 0 });
    await flushReal();
    expect(upsert).not.toHaveBeenCalled();
  });
});
