// T-0304d AC-6–AC-8 (UF-09.9, principle 1, D-0071 §4, D-0120 §6–§8): Elapsed, Left and Sets,
// the actions and the seams in v2 order, Skip to next exercise (`SKIP_ITEM`, `skippedItems`), and
// End workout confirmed in place → `finish()`. `timeZone="UTC"`, `locale="en-GB"`.
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timeCheck } from "@workoutlab/engine";
import type { SessionPlan } from "@workoutlab/shared";
import * as offline from "../../../lib/offline/index.js";
import { initialFocusState, type FocusState, type LoggedSet } from "../machine.js";
import type { SeamAction } from "../seams.js";
import type { FocusSession } from "../session.js";
import { BENCH, P1, S1, USER_A, planWith } from "./fixtures.js";
import {
  advance,
  flushReal,
  freshDb,
  screenId,
  screenIds,
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
import { dispatched, stores } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./r8-mock.js").then((m) => m.r8Mock(orig)),
);
vi.mock("@workoutlab/engine", (orig) => import("./r8-mock.js").then((m) => m.engineSpy(orig)));
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));
vi.mock("../views.js", (orig) => import("./probe.js").then((m) => m.probedViews(orig)));

const tc = vi.mocked(timeCheck);
const upsert = vi.mocked(offline.upsertSession);
const editSet = vi.mocked(offline.editSet);

beforeEach(async () => {
  const engine = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  tc.mockReset();
  tc.mockImplementation(engine.timeCheck);
  upsert.mockClear();
  editSet.mockClear();
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
});

const render = (seams?: { pause?: SeamAction[]; next?: SeamAction[] }) =>
  renderSession(
    seams ? { timeZone: "UTC", locale: "en-GB", seams } : { timeZone: "UTC", locale: "en-GB" },
  );

function names(): string[] {
  return screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent!);
}

const field = (name: string) =>
  document.querySelector(`[data-field="${name}"]`)?.textContent ?? null;

async function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
  await flushReal();
}

const rowSets = (n: number): LoggedSet[] =>
  benchSets(n).map((s) => ({
    ...s,
    clientId: `r${s.setIndex}`,
    itemIndex: 1,
    exerciseId: "barbell-row",
  }));

/** UF-09.5 on P1 (or `plan`) at `STARTED_AT + s`: barbell-row's rest after `logged` row sets. */
async function restAt(s: number, plan: SessionPlan = P1, patch: Partial<FocusState> = {}) {
  useFakeClock(at(s));
  await seedSession({ plan });
  seedFocus(
    at(s),
    {
      phase: "rest",
      itemIndex: 1,
      setIndex: 1,
      loggedSets: [...benchSets(4), ...rowSets(2)],
      timer: { startedAtMs: at(s), durationS: 120, pausedMs: 0 },
      ...patch,
    },
    plan,
  );
  await render();
}

/** A seeded pause on `plan` at `STARTED_AT + s`. */
async function pausedAt(
  s: number,
  patch: Partial<FocusState>,
  plan: SessionPlan = R8_PLAN,
  seams?: { pause?: SeamAction[] },
) {
  useFakeClock(at(s));
  await seedSession({ plan });
  seedFocus(at(s), { phase: "paused", pausedAtMs: at(s), ...patch }, plan);
  await render(seams);
}

describe("AC-6 UF-09.9 content (D-0120 §6)", () => {
  it("PAUSE from UF-09.5 at 23:10 with 6 sets: Paused, Elapsed 23:10, Left 22 min, Sets 6 / 12", async () => {
    await restAt(1390);
    expect(screenId()).toBe("UF-09.5");
    await click("Pause workout");
    expect(screenId()).toBe("UF-09.9");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Paused");
    expect(field("elapsed")).toBe("Elapsed 23:10");
    expect(field("left")).toBe("Left 22 min");
    expect(field("sets")).toBe("Sets 6 / 12");
  });

  it("a bench-press back-off counts in the planned sets: 13", async () => {
    await restAt(
      1390,
      planWith({ items: [{ ...BENCH, backoff: { weightKg: 70, reps: 6 } }, ...P1.items.slice(1)] }),
    );
    await click("Pause workout");
    expect(field("sets")).toBe("Sets 6 / 13");
  });

  it("timers stop: 60 s later Elapsed is unchanged, and Resume shows the same rest remaining", async () => {
    await restAt(1390);
    await advance(20_000);
    expect(timerText()).toBe("1:40");
    await click("Pause workout");
    expect(field("elapsed")).toBe("Elapsed 23:30");
    await advance(60_000);
    expect(field("elapsed")).toBe("Elapsed 23:30");
    await click("Resume");
    expect(screenId()).toBe("UF-09.5");
    expect(timerText()).toBe("1:40");
  });

  it("over budget: elapsed above 45 min shows Left 0 min", async () => {
    await restAt(2800);
    await click("Pause workout");
    expect(field("left")).toBe("Left 0 min");
  });

  it("the pair: 1 s under the budget shows Left 1 min", async () => {
    await restAt(2699);
    await click("Pause workout");
    expect(field("left")).toBe("Left 1 min");
  });

  // D-0142 §6 (a named change, T-0422): the module's swap seam sits after Resume.
  it("actions: Resume (primary, focused), Swap, Skip to next exercise, End workout; no a[href]", async () => {
    await restAt(1390);
    await click("Pause workout");
    expect(names()).toEqual(["Resume", "Swap", "Skip to next exercise", "End workout"]);
    const resume = screen.getByRole("button", { name: "Resume" });
    expect(resume).toHaveAttribute("data-action", "primary");
    expect(document.activeElement).toBe(resume);
    expect(document.querySelectorAll("a[href]")).toHaveLength(0);
    expect(screenIds()).toEqual(["UF-09.9"]);
  });

  const seam = (id: string, label: string, keepsClockRunning = false): SeamAction => ({
    id,
    label,
    keepsClockRunning,
    render: () => <p>{label}</p>,
  });

  it("seams: injected swap, how-to and list-view sit at their v2 places", async () => {
    await pausedAt(600, { resumePhase: "set", itemIndex: 1 }, R8_PLAN, {
      pause: [seam("list-view", "List view", true), seam("how-to", "How to"), seam("swap", "Swap")],
    });
    expect(names()).toEqual([
      "Resume",
      "Swap",
      "Skip to next exercise",
      "How to",
      "List view",
      "End workout",
    ]);
  });

  // D-0142 §6 (a named change, T-0422): the module arrays now hold swap, and nothing else yet.
  it("the pair: with the module arrays there is Swap, and no How to or List view", async () => {
    await pausedAt(600, { resumePhase: "set", itemIndex: 1 });
    expect(names()).toEqual(["Resume", "Swap", "Skip to next exercise", "End workout"]);
    expect(
      Array.from(document.querySelectorAll("[data-seam-id]")).map((b) =>
        b.getAttribute("data-seam-id"),
      ),
    ).toEqual(["swap"]);
  });
});

describe("AC-7 Skip to next exercise (D-0120 §7)", () => {
  const benchRest = (s: number): Partial<FocusState> => ({
    resumePhase: "rest",
    itemIndex: 0,
    setIndex: 1,
    loggedSets: benchSets(2),
    timer: { startedAtMs: at(s), durationS: 120, pausedMs: 0 },
  });

  it("from a rest, not behind: skippedItems [0], one check for item 1, UF-09.6 barbell-row; 2 sets kept, no write", async () => {
    await pausedAt(600, benchRest(600));
    await click("Skip to next exercise");
    expect(storedFocus()).toMatchObject({ phase: "next", itemIndex: 1, skippedItems: [0] });
    expect(tc).toHaveBeenCalledTimes(1);
    expect(tc.mock.calls[0]![1]).toEqual({ elapsedS: 600, nextItemIndex: 1 });
    expect(screenId()).toBe("UF-09.6");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Barbell row");
    expect((storedFocus()!.loggedSets as LoggedSet[]).length).toBe(2);
    await flushReal();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("from a rest, behind: the check shows UF-09.8 for item 1", async () => {
    await pausedAt(1500, benchRest(1500));
    await advance(30_000);
    await click("Skip to next exercise");
    // The pause isn't counted: 1500 s elapsed at the check.
    expect(tc.mock.calls[0]![1]).toEqual({ elapsedS: 1500, nextItemIndex: 1 });
    expect(screenId()).toBe("UF-09.8");
    expect(storedFocus()).toMatchObject({ phase: "timeCheck", itemIndex: 1, skippedItems: [0] });
  });

  it("from the warm-up: UF-09.6 for item 0, 0 checks, warmupSpentMs recorded without the pause", async () => {
    await pausedAt(100, {
      resumePhase: "warmup",
      warmupIndex: 1,
      warmupStartedAtMs: at(70),
      timer: { startedAtMs: at(90), durationS: 40, pausedMs: 0 },
    });
    await advance(10_000);
    await click("Skip to next exercise");
    expect(screenId()).toBe("UF-09.6");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bench press");
    expect(storedFocus()).toMatchObject({
      phase: "next",
      itemIndex: 0,
      warmupSpentMs: 30_000,
      warmupStartedAtMs: null,
      skippedItems: [],
    });
    await flushReal();
    expect(tc).not.toHaveBeenCalled();
  });

  it("from UF-09.6 of item 1: item 1 is skipped, and the check is for item 2", async () => {
    await pausedAt(600, {
      resumePhase: "next",
      itemIndex: 1,
      loggedSets: benchSets(4),
      timer: { startedAtMs: at(590), durationS: 60, pausedMs: 0 },
    });
    await click("Skip to next exercise");
    expect(tc.mock.calls[0]![1]).toEqual({ elapsedS: 600, nextItemIndex: 2 });
    expect(storedFocus()).toMatchObject({ phase: "next", itemIndex: 2, skippedItems: [1] });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Leg curl");
  });

  it("from confirm: the recorded set stands, and nothing is edited", async () => {
    const recorded = benchSets(1);
    await pausedAt(300, {
      resumePhase: "confirm",
      itemIndex: 0,
      setIndex: 0,
      loggedSets: recorded,
    });
    await click("Skip to next exercise");
    expect(storedFocus()!.loggedSets).toEqual(recorded);
    expect(storedFocus()).toMatchObject({ phase: "next", itemIndex: 1, skippedItems: [0] });
    await flushReal();
    expect(editSet).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  // D-0142 §6 (a named change, T-0422): the module's swap seam stays; only Skip is hidden.
  it("hidden on the last item (End is the way out)", async () => {
    await pausedAt(600, { resumePhase: "set", itemIndex: 3 });
    expect(names()).toEqual(["Resume", "Swap", "End workout"]);
  });

  it("hidden in a pause taken on UF-09.8", async () => {
    await pausedAt(1500, { resumePhase: "timeCheck", itemIndex: 1 });
    expect(screen.queryByRole("button", { name: "Skip to next exercise" })).toBeNull();
    // D-0142 §6 (a named change, T-0422): the module's swap seam stays.
    expect(names()).toEqual(["Resume", "Swap", "End workout"]);
  });

  it("re-sync: after skipping item 0 with 2 of 4 sets, close() from a keepsClockRunning: true overlay lands on item 1", async () => {
    let overlay: FocusSession | null = null;
    const listView: SeamAction = {
      id: "list-view",
      label: "List view",
      keepsClockRunning: true,
      render: (c) => {
        overlay = c;
        return <p>{"List"}</p>;
      },
    };
    await pausedAt(600, benchRest(600), R8_PLAN, { pause: [listView] });
    await click("Skip to next exercise");
    expect(storedFocus()).toMatchObject({ phase: "next", itemIndex: 1 });
    await click("Pause workout");
    await click("List view");
    act(() => overlay!.close());
    await flushReal();
    expect(storedFocus()).toMatchObject({ itemIndex: 1, skippedItems: [0] });
    expect(screenId()).toBe("UF-09.6");
  });

  it("the pair: with item 0 not skipped, the same close() goes back to item 0's first unlogged set", async () => {
    let overlay: FocusSession | null = null;
    const listView: SeamAction = {
      id: "list-view",
      label: "List view",
      keepsClockRunning: true,
      render: (c) => {
        overlay = c;
        return <p>{"List"}</p>;
      },
    };
    await pausedAt(
      600,
      {
        resumePhase: "next",
        itemIndex: 1,
        loggedSets: benchSets(2),
        timer: { startedAtMs: at(590), durationS: 60, pausedMs: 0 },
      },
      R8_PLAN,
      { pause: [listView] },
    );
    await click("List view");
    act(() => overlay!.close());
    await flushReal();
    expect(storedFocus()).toMatchObject({ phase: "set", itemIndex: 0, setIndex: 2 });
  });

  it("old stored states: no skippedItems restores as []; skippedItems [9] on a 4-item plan is rejected", async () => {
    useFakeClock(at(600));
    await seedSession({ plan: R8_PLAN });
    const { skippedItems: _omit, ...old } = {
      ...initialFocusState(S1, R8_PLAN, at(600)),
      phase: "paused" as const,
      resumePhase: "set" as const,
      pausedAtMs: at(600),
      timer: null,
      itemIndex: 1,
    };
    window.localStorage.setItem(`wl-focus:${S1}`, JSON.stringify(old));
    const view = await render();
    expect(screenId()).toBe("UF-09.9");
    expect(session().state.skippedItems).toEqual([]);
    view.unmount();

    window.localStorage.setItem(`wl-focus:${S1}`, JSON.stringify({ ...old, skippedItems: [9] }));
    await render();
    expect(screenId()).toBe("UF-09.1");
    expect(storedFocus()).toMatchObject({ phase: "getReady", skippedItems: [] });
  });
});

describe("AC-8 End workout (D-0120 §8)", () => {
  it("the confirm replaces the actions in place; focus on Cancel; Cancel returns, focus on Resume", async () => {
    await pausedAt(600, { resumePhase: "set", itemIndex: 1 });
    await click("End workout");
    expect(screenIds()).toEqual(["UF-09.9"]);
    expect(screen.getByText("End workout? Your sets are saved.")).toBeInTheDocument();
    expect(names()).toEqual(["End workout", "Cancel"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    await click("Cancel");
    // D-0142 §6 (a named change, T-0422): the module's swap seam is back with the actions.
    expect(names()).toEqual(["Resume", "Swap", "Skip to next exercise", "End workout"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Resume" }));
    await flushReal();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("End: finish() once: upsertSession({...row, ended_at: now}), wl-focus:S1 removed, then /session/S1/summary (UF-03.3)", async () => {
    await pausedAt(600, { resumePhase: "set", itemIndex: 1 });
    const before = (await offline.offlineDb().sessions.get(S1))!.row;
    await click("End workout");
    await click("End workout");
    await findPath(`/session/${S1}/summary`);
    await findScreen("UF-03.3");
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]![0]).toEqual({
      ...before,
      ended_at: new Date(at(600)).toISOString(),
    });
    expect(storedFocus()).toBeNull();
  });

  it("pending: a second End while finish() is pending makes no second write", async () => {
    await pausedAt(600, { resumePhase: "set", itemIndex: 1 });
    const held = deferred<void>();
    upsert.mockImplementationOnce(() => held.promise.then(() => ({}) as never));
    await click("End workout");
    await click("End workout");
    await click("End workout");
    expect(upsert).toHaveBeenCalledTimes(1);
    await act(async () => held.resolve());
    await findPath(`/session/${S1}/summary`);
  });

  it("rejection: the polite error, and the screen stays UF-09.9", async () => {
    await pausedAt(600, { resumePhase: "set", itemIndex: 1 });
    upsert.mockImplementationOnce(() => Promise.reject(new Error("quota")));
    await click("End workout");
    await click("End workout");
    const status = screen.getByText("Couldn't end the workout. Try again.");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screenId()).toBe("UF-09.9");
    expect(storedFocus()).toMatchObject({ phase: "paused" });
  });
});

describe("T-0304e review: resume() from a keepsClockRunning: false overlay", () => {
  it("closes the overlay first, then resumes: UF-09.6 runs again", async () => {
    let overlay: FocusSession | null = null;
    const swap: SeamAction = {
      id: "swap",
      label: "Swap",
      keepsClockRunning: false,
      render: (c) => {
        overlay = c;
        return <p data-testid="swap">{"Swap"}</p>;
      },
    };
    await pausedAt(600, { resumePhase: "set", itemIndex: 1 }, R8_PLAN, { pause: [swap] });
    await click("Swap");
    expect(screen.getByTestId("swap")).toBeInTheDocument();
    act(() => overlay!.resume());
    await flushReal();
    expect(screen.queryByTestId("swap")).toBeNull();
    expect(screenId()).toBe("UF-09.3");
    expect(storedFocus()).toMatchObject({ phase: "set", resumePhase: null });
  });
});
