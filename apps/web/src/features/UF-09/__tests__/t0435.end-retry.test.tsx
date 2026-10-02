// T-0435 UF-09.9 / UF-09.8 / UF-09.6: End after a failed finish (D-0153 §6, D-0149 §1, D-0120,
// D-0071 §6). A failed End can be tried again; a later Trim still writes and moves the machine;
// and a seam's `ctx.finish()` that fails after the plan write it waited for had landed applies
// that plan, so Continue walks the row's plan, not the old one. Setup as `end-race.test.tsx`.
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timeCheck, type TimeCheckResult } from "@workoutlab/engine";
import type { SessionPlan } from "@workoutlab/shared";
import * as offline from "../../../lib/offline/index.js";
import type { SeamAction } from "../seams.js";
import type { FocusSession, SessionRow } from "../session.js";
import { S1, USER_A } from "./fixtures.js";
import {
  flushReal,
  freshDb,
  screenId,
  seedSession,
  signIn,
  storedFocus,
  timerText,
  useFakeClock,
} from "./helpers.js";
import { probe, session } from "./probe.js";
import { R8_PLAN, at, benchSets } from "./r8-fixtures.js";
import { deferred, renderSession } from "./session-helpers.js";
import { findPath, findScreen, seedFocus } from "./set-loop-helpers.js";
import { dispatched, lastStore, stores } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./r8-mock.js").then((m) => m.r8Mock(orig)),
);
vi.mock("@workoutlab/engine", (orig) => import("./r8-mock.js").then((m) => m.engineSpy(orig)));
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));
vi.mock("../views.js", (orig) => import("./probe.js").then((m) => m.probedViews(orig)));

const tc = vi.mocked(timeCheck);
const upsert = vi.mocked(offline.upsertSession);
let realUpsert: typeof offline.upsertSession;

/** The injected `keepsClockRunning: false` seam: its probe keeps the latest `ctx`. */
const seamCtx: { current: FocusSession | null } = { current: null };
function SeamProbe({ ctx }: { ctx: FocusSession }) {
  seamCtx.current = ctx;
  return <p data-testid="overlay-how-to">How to</p>;
}
const HOW_TO: SeamAction = {
  id: "how-to",
  label: "How to",
  keepsClockRunning: false,
  render: (ctx) => <SeamProbe ctx={ctx} />,
};
const SEAMS = { pause: [HOW_TO] };
const RENDER = { timeZone: "UTC", locale: "en-GB", seams: SEAMS } as const;

const NOW_ISO = () => new Date(at(1500)).toISOString();
const END_ERROR = "Couldn't end the workout. Try again.";

beforeEach(async () => {
  const engine = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  const real = await vi.importActual<typeof import("../../../lib/offline/index.js")>(
    "../../../lib/offline/index.js",
  );
  realUpsert = real.upsertSession;
  tc.mockReset();
  tc.mockImplementation(engine.timeCheck);
  upsert.mockClear();
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  probe.current = null;
  seamCtx.current = null;
  freshDb();
  signIn(USER_A);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function storedRow(): Promise<SessionRow> {
  return (await offline.offlineDb().sessions.get(S1))!.row;
}

async function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
  await flushReal();
}

const heading = () => screen.queryByRole("heading", { level: 1 })?.textContent ?? null;
const lastResult = (): TimeCheckResult => {
  const result = tc.mock.results[tc.mock.results.length - 1]!;
  if (result.type !== "return") throw new Error("timeCheck threw");
  return result.value;
};
const storePlan = () => lastStore().getSnapshot().ctx.plan;

/** UF-09.8 after item 0 at 1500 s (R8-E1: behind, Trim offered). */
async function atCheck() {
  useFakeClock(at(1500));
  await seedSession({ plan: R8_PLAN });
  seedFocus(
    at(1500),
    {
      phase: "rest",
      itemIndex: 0,
      setIndex: 3,
      loggedSets: benchSets(4),
      timer: { startedAtMs: at(1500) - 120_000, durationS: 120, pausedMs: 0 },
    },
    R8_PLAN,
  );
  const view = await renderSession(RENDER);
  expect(screenId()).toBe("UF-09.8");
  return view;
}

/** Holds the next upsertSession call; `release()` lets the REAL write land, or rejects it. */
function holdNextUpsert({ fail = false } = {}) {
  const gate = deferred<void>();
  upsert.mockImplementationOnce(async (row) => {
    await gate.promise;
    if (fail) throw new Error("IndexedDB closed");
    return realUpsert(row);
  });
  return {
    release: async () => {
      await act(async () => gate.resolve());
      await flushReal();
    },
  };
}

/** The next upsertSession call rejects (a quota error, a closed DB). */
function rejectNextUpsert() {
  upsert.mockImplementationOnce(async () => {
    throw new Error("QuotaExceededError");
  });
}

/** Opens the injected seam from UF-09.9. */
async function openSeam() {
  expect(screenId()).toBe("UF-09.9");
  await click("How to");
  expect(screen.getByTestId("overlay-how-to")).toBeInTheDocument();
  expect(seamCtx.current).not.toBeNull();
}

/** Calls the seam's `ctx.finish()`; at settle, records what the store held at that moment and,
 *  given the store's `applyPlan` spy, how many times it had been called by then. */
function seamFinish(applyPlan?: { mock: { calls: unknown[] } }) {
  const out: {
    status: "pending" | "resolved" | "rejected";
    planAtSettle: SessionPlan | null;
    focusAtSettle: Record<string, unknown> | null;
    appliesAtSettle: number | null;
  } = { status: "pending", planAtSettle: null, focusAtSettle: null, appliesAtSettle: null };
  const settle = (status: "resolved" | "rejected") => () => {
    out.status = status;
    out.planAtSettle = storePlan();
    out.focusAtSettle = storedFocus();
    out.appliesAtSettle = applyPlan ? applyPlan.mock.calls.length : null;
  };
  act(() => {
    void seamCtx.current!.finish().then(settle("resolved"), settle("rejected"));
  });
  return out;
}

async function closeSeam() {
  act(() => seamCtx.current!.close());
  await flushReal();
  expect(screenId()).toBe("UF-09.9");
}

describe("AC-1 End again after a failed End", () => {
  it("the first End rejects and shows the error; the second writes ended_at and goes to the summary", async () => {
    useFakeClock(at(1500));
    await seedSession({ plan: R8_PLAN });
    seedFocus(
      at(1500),
      { phase: "set", itemIndex: 1, setIndex: 0, loggedSets: benchSets(4) },
      R8_PLAN,
    );
    await renderSession(RENDER);
    expect(screenId()).toBe("UF-09.3");
    await click("Pause workout");
    expect(screenId()).toBe("UF-09.9");
    rejectNextUpsert();
    await click("End workout");
    await click("End workout");
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(screen.getByText(END_ERROR)).toBeInTheDocument();
    expect(screen.getByText(END_ERROR).getAttribute("aria-live")).toBe("polite");
    expect((await storedRow()).ended_at).toBeNull();
    expect(storedFocus()).not.toBeNull();

    await click("End workout");
    await findPath(`/session/${S1}/summary`);
    await flushReal();
    expect(upsert).toHaveBeenCalledTimes(2);
    const second = upsert.mock.calls[1]![0];
    expect(second.ended_at).toBe(NOW_ISO());
    expect(storedFocus()).toBeNull();
    expect(await storedRow()).toEqual(second);
  });

  it("the pair: an End that succeeds the first time writes once", async () => {
    useFakeClock(at(1500));
    await seedSession({ plan: R8_PLAN });
    seedFocus(
      at(1500),
      { phase: "set", itemIndex: 1, setIndex: 0, loggedSets: benchSets(4) },
      R8_PLAN,
    );
    await renderSession(RENDER);
    await click("Pause workout");
    await click("End workout");
    await click("End workout");
    await findPath(`/session/${S1}/summary`);
    await flushReal();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(END_ERROR)).toBeNull();
    expect(await storedRow()).toEqual(upsert.mock.calls[0]![0]);
  });
});

describe("AC-2 / AC-3 a Trim after a failed End writes and moves the machine; a second End writes ended_at", () => {
  it("failed End on a pause from UF-09.8 → Cancel → Resume → Trim → Pause → End → End", async () => {
    await atCheck();
    const result = lastResult();
    await click("Pause workout");
    expect(storedFocus()).toMatchObject({ phase: "paused", resumePhase: "timeCheck" });
    rejectNextUpsert();
    await click("End workout");
    await click("End workout");
    expect(screen.getByText(END_ERROR)).toBeInTheDocument();
    expect(upsert).toHaveBeenCalledTimes(1);
    await click("Cancel");
    await click("Resume");
    expect(screenId()).toBe("UF-09.8");

    // AC-2: the Trim writes once, with the engine's list, and moves on to UF-09.6.
    await click("Trim");
    await findScreen("UF-09.6");
    expect(upsert).toHaveBeenCalledTimes(2);
    const trimWrite = upsert.mock.calls[1]![0];
    const plan = trimWrite.plan as SessionPlan;
    expect(plan.items).toEqual(result.trim.items);
    expect(plan.items[3]).toMatchObject({ exerciseId: "lateral-raise", sets: 2 });
    expect(trimWrite.ended_at).toBeNull();
    expect(heading()).toBe("Barbell row");
    expect(timerText()).toBe("1:00");
    expect(storedFocus()).toMatchObject({ phase: "next", itemIndex: 1 });
    const stored = await storedRow();
    expect(session().plan).toEqual(stored.plan);

    // AC-3: Pause → End → End writes ended_at on the trimmed plan, and nothing after it.
    await click("Pause workout");
    await click("End workout");
    await click("End workout");
    await findPath(`/session/${S1}/summary`);
    await flushReal();
    expect(upsert).toHaveBeenCalledTimes(3);
    const last = upsert.mock.calls[2]![0];
    expect(last.ended_at).toBe(NOW_ISO());
    expect(last.plan).toEqual(plan);
    expect(await storedRow()).toEqual(last);
    expect(storedFocus()).toBeNull();
    await flushReal();
    expect(upsert).toHaveBeenCalledTimes(3);
  });
});

describe("AC-4 a seam's failed finish applies the plan write it waited for (D-0153 §6)", () => {
  it("Trim held → Pause → seam ctx.finish() → the Trim lands, the ended row rejects: the store walks the trimmed plan, paused on resumePhase next", async () => {
    await atCheck();
    const result = lastResult();
    const trim = holdNextUpsert();
    await click("Trim");
    await click("Pause workout");
    await openSeam();
    const applyPlan = vi.spyOn(lastStore(), "applyPlan");
    rejectNextUpsert();
    const finish = seamFinish(applyPlan);
    await flushReal();
    expect(finish.status).toBe("pending");
    expect(upsert).toHaveBeenCalledTimes(1);
    await trim.release();

    expect(finish.status).toBe("rejected");
    expect(upsert).toHaveBeenCalledTimes(2);
    const stored = await storedRow();
    expect(stored.ended_at).toBeNull();
    const trimmed = stored.plan as SessionPlan;
    expect(trimmed.items).toEqual(result.trim.items);
    expect(trimmed.items[3]).toMatchObject({ sets: 2 });
    // Applied before the promise rejected.
    expect(finish.planAtSettle).toEqual(trimmed);
    expect(finish.focusAtSettle).toMatchObject({ phase: "paused", resumePhase: "next" });
    expect(finish.appliesAtSettle).toBe(1);
    expect(applyPlan).toHaveBeenCalledTimes(1);
    expect(applyPlan).toHaveBeenCalledWith(trimmed, at(1500));
    expect(seamCtx.current!.plan).toEqual(stored.plan);
    expect(seamCtx.current!.row).toEqual(stored);
    expect(storedFocus()).toMatchObject({
      phase: "paused",
      resumePhase: "next",
      itemIndex: 1,
      setIndex: 0,
      pausedAtMs: at(1500),
      timer: { startedAtMs: at(1500), durationS: 60, pausedMs: 0 },
    });

    await closeSeam();
    expect(session().plan).toEqual(stored.plan);
    expect(session().row).toEqual(stored);
    await click("Resume");
    expect(screenId()).toBe("UF-09.6");
    expect(heading()).toBe("Barbell row");
    expect(timerText()).toBe("1:00");
    expect(session().plan).toEqual(trimmed);
    await flushReal();
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("reload after the failure: a remount restores UF-09.9 paused on the trimmed plan", async () => {
    const view = await atCheck();
    const trim = holdNextUpsert();
    await click("Trim");
    await click("Pause workout");
    await openSeam();
    rejectNextUpsert();
    const finish = seamFinish();
    await trim.release();
    expect(finish.status).toBe("rejected");
    const trimmed = (await storedRow()).plan as SessionPlan;
    view.unmount();
    probe.current = null;

    await renderSession(RENDER);
    expect(stores).toHaveLength(2);
    expect(screenId()).toBe("UF-09.9");
    expect(storePlan()).toEqual(trimmed);
    expect(session().plan).toEqual(trimmed);
    expect(lastStore().getState()).toMatchObject({
      phase: "paused",
      resumePhase: "next",
      itemIndex: 1,
    });
  });

  it("the pair: the finish succeeds: the workout ends, the ended row is the last write, no applyPlan", async () => {
    await atCheck();
    const trim = holdNextUpsert();
    await click("Trim");
    await click("Pause workout");
    await openSeam();
    const applyPlan = vi.spyOn(lastStore(), "applyPlan");
    const finish = seamFinish();
    await trim.release();
    await findPath(`/session/${S1}/summary`);
    await flushReal();
    expect(finish.status).toBe("resolved");
    expect(upsert).toHaveBeenCalledTimes(2);
    const row = await storedRow();
    expect(row.ended_at).toBe(NOW_ISO());
    expect(row).toEqual(upsert.mock.calls[1]![0]);
    expect((row.plan as SessionPlan).items[3]).toMatchObject({ sets: 2 });
    expect(applyPlan).not.toHaveBeenCalled();
    expect(dispatched.some((e) => e.type === "PLAN_APPLIED")).toBe(false);
    expect(storedFocus()).toBeNull();
  });

  it("the pair: the plan write rejects too: nothing is applied, and a later Trim writes and moves the machine", async () => {
    await atCheck();
    const result = lastResult();
    const trim = holdNextUpsert({ fail: true });
    await click("Trim");
    await click("Pause workout");
    await openSeam();
    const applyPlan = vi.spyOn(lastStore(), "applyPlan");
    rejectNextUpsert();
    const finish = seamFinish();
    await trim.release();
    expect(finish.status).toBe("rejected");
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(applyPlan).not.toHaveBeenCalled();
    expect(storePlan()).toEqual(R8_PLAN);
    expect(seamCtx.current!.plan).toEqual(R8_PLAN);
    expect(storedFocus()).toMatchObject({ phase: "paused", resumePhase: "timeCheck" });
    const stored = await storedRow();
    expect(stored.plan).toEqual(R8_PLAN);
    expect(stored.ended_at).toBeNull();

    await closeSeam();
    expect(session().plan).toEqual(R8_PLAN);
    await click("Resume");
    expect(screenId()).toBe("UF-09.8");
    await click("Trim");
    await findScreen("UF-09.6");
    expect(upsert).toHaveBeenCalledTimes(3);
    const written = upsert.mock.calls[2]![0];
    expect((written.plan as SessionPlan).items).toEqual(result.trim.items);
    expect(written.ended_at).toBeNull();
    expect(applyPlan).toHaveBeenCalledTimes(1);
    expect(session().plan).toEqual((await storedRow()).plan);
    expect(timerText()).toBe("1:00");
  });

  it("the pair: no plan write pending: a failed seam finish leaves the plan and the state as they were", async () => {
    await atCheck();
    await click("Pause workout");
    await openSeam();
    const applyPlan = vi.spyOn(lastStore(), "applyPlan");
    const stateBefore = lastStore().getState();
    const focusBefore = storedFocus();
    const rowBefore = await storedRow();
    rejectNextUpsert();
    const finish = seamFinish();
    await flushReal();
    expect(finish.status).toBe("rejected");
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(applyPlan).not.toHaveBeenCalled();
    expect(storePlan()).toEqual(R8_PLAN);
    expect(lastStore().getState()).toEqual(stateBefore);
    expect(storedFocus()).toEqual(focusBefore);
    expect(seamCtx.current!.row).toEqual(rowBefore);
    expect(await storedRow()).toEqual(rowBefore);
  });
});
