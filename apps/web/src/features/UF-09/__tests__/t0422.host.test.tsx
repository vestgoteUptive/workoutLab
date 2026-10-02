// T-0422 UF-05.1 mounted in focus mode (D-0071 §4 §6, D-0142 §7, D-0153 §2): the real
// `SessionHost` with the MODULE seam arrays (no `seams` prop), P1, fake-indexeddb, the real
// `rankSwaps`/`applySwap`, and the real `upsertSession` in a spy. The cache holds a beginner,
// full-equipment profile and engine L1 (t0422-fixtures.ts). `locale="en-GB"`, `timeZone="UTC"`.
//
// AC-2 (Swap from UF-09.9), AC-3 (which item), AC-4 (Swap from UF-09.6), AC-5 (apply persisted
// offline), AC-6 (main slot), AC-7 host (a swap while UF-09.4 is in play), AC-8 (axe).
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fireEvent, screen, within, type RenderResult } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import * as engine from "@workoutlab/engine";
import type { EngineProfile, LibraryExercise as EngineExercise } from "@workoutlab/engine";
import { parseSessionPlan, type LibraryExercise, type SessionPlan } from "@workoutlab/shared";
import { offlineDb, userScopedKey } from "../../../lib/offline/db.js";
import * as queue from "../../../lib/offline/queue.js";
import { AUTOSAVE_S, type FocusState, type LoggedSet } from "../machine.js";
import type { ResolveCheckPoint } from "../store.js";
import { P1, S1, STARTED_AT_MS, USER_A } from "./fixtures.js";
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
import { renderSession } from "./session-helpers.js";
import { findEl, findScreen, seedFocus } from "./set-loop-helpers.js";

// Spies over the REAL `lib/offline` queue writes (every write, the re-exports in
// `lib/offline/index.js` included, because they are the same module), and a spy on the hook's
// `replaceItem` that keeps each call's arguments exactly as passed (AC-6: a call without
// `mainLiftId` has two).
const { replaceCalls } = vi.hoisted(() => ({ replaceCalls: [] as unknown[][] }));

vi.mock("../../../lib/offline/queue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/queue.js")>();
  return {
    ...actual,
    recordSet: vi.fn(actual.recordSet),
    editSet: vi.fn(actual.editSet),
    deleteSet: vi.fn(actual.deleteSet),
    upsertSession: vi.fn(actual.upsertSession),
  };
});
vi.mock("../session.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../session.js")>();
  return {
    ...actual,
    createFocusActions(deps: Parameters<typeof actual.createFocusActions>[0]) {
      const actions = actual.createFocusActions(deps);
      return {
        ...actions,
        replaceItem(...args: Parameters<typeof actions.replaceItem>) {
          replaceCalls.push([...args]);
          return actions.replaceItem(...args);
        },
      };
    },
  };
});

// The cache UF-05.1 reads inside focus mode (T-0421's test setup): a beginner, full-equipment
// profile and the engine L1 library (docs/engine-rules.md §Fixtures), names by the engine fixture
// rule ("db-row" → "Db row"). Written straight into the `lib/offline` cache tables, the rows
// `refreshProfile`/`refreshLibrary` write.
type Areas = EngineExercise["areas"];

function name(id: string): string {
  const spaced = id.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function ex(
  id: string,
  type: "compound" | "isolation",
  equipment: string[],
  areas: Areas,
  inc: number | "bw",
  opts: { level?: EngineExercise["level"]; timedS?: number } = {},
): EngineExercise {
  return {
    id,
    name: name(id),
    kind: "exercise",
    type,
    level: opts.level ?? "beginner",
    equipment,
    areas,
    timed: opts.timedS !== undefined,
    defaultDurationS: opts.timedS ?? null,
    incrementKg: inc === "bw" ? null : inc,
    externalLoad: inc !== "bw",
  };
}

function wu(id: string, areas: Areas): EngineExercise {
  return {
    id,
    name: name(id),
    kind: "warmup",
    type: "isolation",
    level: "beginner",
    equipment: [],
    areas,
    timed: true,
    defaultDurationS: 40,
    incrementKg: null,
    externalLoad: false,
  };
}

/** Engine L1 plus its warm-up moves. */
const ENGINE_L1: EngineExercise[] = [
  ex(
    "back-squat",
    "compound",
    ["barbell", "rack"],
    { quads: 1, glutes: 1, hamstrings: 0.5, core: 0.5 },
    2.5,
  ),
  ex("romanian-deadlift", "compound", ["barbell"], { hamstrings: 1, glutes: 0.5 }, 2.5),
  ex("hip-thrust", "compound", ["barbell", "bench"], { glutes: 1, hamstrings: 0.5 }, 2.5),
  ex("leg-extension", "isolation", ["machine"], { quads: 1 }, 5),
  ex("leg-curl", "isolation", ["machine"], { hamstrings: 1 }, 5),
  ex("calf-raise", "isolation", ["machine"], { calves: 1 }, 5),
  ex("bench-press", "compound", ["barbell", "bench"], { chest: 1, shoulders: 0.5, arms: 0.5 }, 2.5),
  ex(
    "db-bench-press",
    "compound",
    ["dumbbell", "bench"],
    { chest: 1, shoulders: 0.5, arms: 0.5 },
    2,
  ),
  ex("push-up", "compound", [], { chest: 1, arms: 0.5, core: 0.5 }, "bw"),
  ex("overhead-press", "compound", ["barbell"], { shoulders: 1, arms: 0.5, core: 0.5 }, 2.5),
  ex("lateral-raise", "isolation", ["dumbbell"], { shoulders: 1 }, 2),
  ex("barbell-row", "compound", ["barbell"], { back: 1, arms: 0.5 }, 2.5),
  ex("db-row", "compound", ["dumbbell", "bench"], { back: 1, arms: 0.5 }, 2),
  ex("inverted-row", "compound", ["rack"], { back: 1, arms: 0.5, core: 0.5 }, "bw"),
  ex("lat-pulldown", "compound", ["cable"], { back: 1, arms: 0.5 }, 5),
  ex("seated-cable-row", "compound", ["cable"], { back: 1, arms: 0.5 }, 5),
  ex("straight-arm-pulldown", "isolation", ["cable"], { back: 1 }, 5),
  ex("pull-up", "compound", ["pullup-bar"], { back: 1, arms: 0.5 }, "bw", {
    level: "intermediate",
  }),
  ex("biceps-curl", "isolation", ["dumbbell"], { arms: 1 }, 2),
  ex("plank", "isolation", [], { core: 1 }, "bw", { timedS: 45 }),
  ex("dead-bug", "isolation", [], { core: 1 }, "bw"),
  ex("hanging-knee-raise", "isolation", ["pullup-bar"], { core: 1 }, "bw"),
  wu("wu-scap-push-up", { chest: 1, shoulders: 0.5 }),
  wu("wu-arm-circle", { shoulders: 1, chest: 0.5 }),
  wu("wu-band-pull-apart", { back: 1, shoulders: 0.5 }),
  wu("wu-cat-cow", { core: 1, back: 0.5 }),
  wu("wu-bodyweight-squat", { quads: 1, glutes: 1 }),
  wu("wu-leg-swing", { hamstrings: 1, glutes: 0.5 }),
  wu("wu-jumping-jack", {}),
  wu("wu-march-in-place", {}),
];

/** F-profile: beginner, full equipment. */
function fullProfile(): EngineProfile {
  return {
    goal: "build_muscle",
    level: "beginner",
    equipment: ["barbell", "rack", "bench", "dumbbell", "cable", "machine", "pullup-bar"],
    rhythmMin: 3,
    rhythmMax: 4,
    priorityAreas: [],
    onboardedAt: "2026-08-02T10:00:00Z",
    planUpdatedAt: "2026-08-02T10:00:00Z",
  };
}

/** Fills the profile and library caches of the current (fresh) database for `userId`. */
async function seedSwapCache(userId: string = USER_A): Promise<void> {
  const db = offlineDb();
  await db.profileCache.put({ userId, profile: fullProfile() as never });
  await db.libraryCache.bulkPut(
    ENGINE_L1.map((exercise) => ({
      key: userScopedKey(userId, exercise.id),
      userId,
      // The cached row is the shared shape; the engine's has a looser `incrementKg` (bodyweight).
      exercise: exercise as unknown as LibraryExercise,
    })),
  );
}

const NOW = STARTED_AT_MS + 20 * 60_000;
const upsert = vi.mocked(queue.upsertSession);
const editSet = vi.mocked(queue.editSet);
const recordSet = vi.mocked(queue.recordSet);
let applySpy: MockInstance<typeof engine.applySwap>;

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
}

beforeEach(async () => {
  window.localStorage.clear();
  replaceCalls.length = 0;
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession();
  await seedSwapCache();
  upsert.mockClear();
  editSet.mockClear();
  recordSet.mockClear();
  applySpy = vi.spyOn(engine, "applySwap");
  setOnline(false);
});

afterEach(() => {
  setOnline(true);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const render = (props: { resolveCheckPoint?: ResolveCheckPoint } = {}) =>
  renderSession({ locale: "en-GB", timeZone: "UTC", ...props });

/** Queues a real set row (the `lib/offline` queue), and returns its focus-state entry. */
async function queued(
  itemIndex: number,
  setIndex: number,
  exerciseId: string,
  weightKg: number,
  reps: number,
): Promise<LoggedSet> {
  const row = await queue.recordSet({
    sessionId: S1,
    exerciseId,
    setIndex,
    kind: "reps",
    reps,
    weightKg,
    isWarmup: false,
    backoff: false,
  });
  return {
    clientId: row.clientId,
    itemIndex,
    setIndex,
    exerciseId,
    reps,
    weightKg,
    durationS: null,
    rir: null,
    backoff: false,
  };
}

async function storedRow() {
  return (await offlineDb().sessions.get(S1))!.row;
}

async function queuedSets() {
  return offlineDb().sets.where({ sessionId: S1 }).toArray();
}

const dialog = () => screen.queryByRole("dialog");
const dialogNamed = (name: string) => findEl(() => screen.queryByRole("dialog", { name }));

async function click(name: string | RegExp): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name }));
  await flushReal();
}

/** "Swap", then the sheet titled for `exercise`, once its cache read is in. */
async function openSwap(exercise: string): Promise<HTMLElement> {
  await click("Swap");
  return (await dialogNamed(`Replace ${exercise}`)) as HTMLElement;
}

/** Picks `id` in the open sheet (optionally under `chip`) and taps "Use …". */
async function useCandidate(id: string, label: string, chip?: string): Promise<void> {
  if (chip) {
    const reasons = screen.getByRole("radiogroup", { name: "Reason" });
    fireEvent.click(within(reasons).getByRole("radio", { name: chip }));
    await flushReal();
  }
  const row = await findEl(
    () =>
      screen
        .queryByRole("radiogroup", { name: "Replacement" })
        ?.querySelector(`[data-id="${id}"]`) ?? null,
  );
  fireEvent.click(within(row as HTMLElement).getByRole("radio"));
  await flushReal();
  fireEvent.click(screen.getByRole("button", { name: `Use ${label}` }));
  await flushReal();
}

const heading = () => screen.getByRole("heading", { level: 1 }).textContent;

/** Paused from barbell-row set 2 (`resumePhase: "set"`, item 1, set index 0 logged). */
async function pausedOnRowSet2(): Promise<LoggedSet> {
  const first = await queued(1, 0, "barbell-row", 60, 8);
  seedFocus(NOW, {
    phase: "paused",
    resumePhase: "set",
    pausedAtMs: NOW,
    itemIndex: 1,
    setIndex: 1,
    loggedSets: [first],
  });
  recordSet.mockClear();
  return first;
}

const benchLogged = (n: number) =>
  Promise.all(Array.from({ length: n }, (_, k) => queued(0, k, "bench-press", 80, 6)));

function positions(sets: readonly LoggedSet[]): string[] {
  return sets.map((s) => `${s.itemIndex}:${s.setIndex}`);
}

describe("T-0422 AC-2 Swap from UF-09.9", () => {
  it("opens: 'Swap' shows the dialog 'Replace Barbell row' in place of UF-09.9", async () => {
    await pausedOnRowSet2();
    await render();
    expect(screenId()).toBe("UF-09.9");
    await openSwap("Barbell row");
    expect(screenIds()).toEqual(["UF-05.1"]);
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
  });

  it("the clock stays paused: after 10 min with the sheet open the stored state is deep-equal", async () => {
    await pausedOnRowSet2();
    await render();
    await openSwap("Barbell row");
    const before = storedFocus();
    await advance(600_000);
    expect(storedFocus()).toEqual(before);
    expect(dialog()).not.toBeNull();
  });

  it("Cancel returns to UF-09.9; the plan is deep-equal and there is no upsertSession", async () => {
    await pausedOnRowSet2();
    await render();
    const plan = (await storedRow()).plan;
    await openSwap("Barbell row");
    await click("Close");
    await flushReal();
    expect(screenId()).toBe("UF-09.9");
    expect((await storedRow()).plan).toEqual(plan);
    expect(upsert).not.toHaveBeenCalled();
    expect(replaceCalls).toEqual([]);
  });

  it("reload: a remount with the sheet open restores UF-09.9, paused", async () => {
    await pausedOnRowSet2();
    const view: RenderResult = await render();
    await openSwap("Barbell row");
    view.unmount();
    await render();
    expect(screenId()).toBe("UF-09.9");
    expect(storedFocus()).toMatchObject({ phase: "paused", resumePhase: "set", itemIndex: 1 });
    expect(dialog()).toBeNull();
  });

  it("no way out: no a[href] while the sheet is open", async () => {
    await pausedOnRowSet2();
    await render();
    await openSwap("Barbell row");
    expect(await findEl(() => screen.queryByRole("radiogroup", { name: "Replacement" }))).toBe(
      screen.getByRole("radiogroup", { name: "Replacement" }),
    );
    expect(document.querySelectorAll("a[href]")).toHaveLength(0);
  });
});

describe("T-0422 AC-3 which item (D-0142 §7)", () => {
  const restTimer = { startedAtMs: NOW, durationS: 120, pausedMs: 0 };

  it("finished item: paused in the rest after bench-press set 4 opens 'Replace Barbell row'", async () => {
    seedFocus(NOW, {
      phase: "paused",
      resumePhase: "rest",
      pausedAtMs: NOW,
      itemIndex: 0,
      setIndex: 3,
      timer: restTimer,
      loggedSets: await benchLogged(4),
    });
    await render();
    await openSwap("Barbell row");
  });

  it("the pair: paused in the rest after bench-press set 2 opens 'Replace Bench press'", async () => {
    seedFocus(NOW, {
      phase: "paused",
      resumePhase: "rest",
      pausedAtMs: NOW,
      itemIndex: 0,
      setIndex: 1,
      timer: restTimer,
      loggedSets: await benchLogged(2),
    });
    await render();
    await openSwap("Bench press");
  });

  it("skipped: bench-press complete and item 1 in skippedItems opens 'Replace Leg curl'", async () => {
    seedFocus(NOW, {
      phase: "paused",
      resumePhase: "rest",
      pausedAtMs: NOW,
      itemIndex: 0,
      setIndex: 3,
      timer: restTimer,
      skippedItems: [1],
      loggedSets: await benchLogged(4),
    });
    await render();
    await openSwap("Leg curl");
  });

  it("none left: with every set of P1 logged it opens the current item", async () => {
    const all: LoggedSet[] = [];
    P1.items.forEach((item, i) => {
      for (let k = 0; k < item.sets; k += 1) {
        all.push({
          clientId: `all-${i}-${k}`,
          itemIndex: i,
          setIndex: k,
          exerciseId: item.exerciseId,
          reps: item.repsMin === null ? null : 8,
          weightKg: null,
          durationS: item.repsMin === null ? 50 : null,
          rir: null,
          backoff: false,
        });
      }
    });
    seedFocus(NOW, {
      phase: "paused",
      resumePhase: "rest",
      pausedAtMs: NOW,
      itemIndex: 2,
      setIndex: 2,
      timer: restTimer,
      loggedSets: all,
    });
    await render();
    await openSwap("Leg curl");
  });
});

describe("T-0422 AC-4 Swap from UF-09.6", () => {
  /** UF-09.6 for item 1 with 50 s left. */
  async function nextWith50s(): Promise<void> {
    seedFocus(NOW, {
      phase: "next",
      itemIndex: 1,
      setIndex: 0,
      timer: { startedAtMs: NOW - 10_000, durationS: 60, pausedMs: 0 },
      loggedSets: await benchLogged(4),
    });
    await render();
    expect(screenId()).toBe("UF-09.6");
    expect(timerText()).toBe("0:50");
  }

  it("opens: 'Swap' opens 'Replace Barbell row' (the upcoming item)", async () => {
    await nextWith50s();
    await openSwap("Barbell row");
    expect(screenIds()).toEqual(["UF-05.1"]);
  });

  it("the countdown stops: after 90 s with the sheet open, Cancel returns to UF-09.6 with 0:50", async () => {
    await nextWith50s();
    await openSwap("Barbell row");
    expect(storedFocus()).toMatchObject({ phase: "paused", resumePhase: "next" });
    await advance(90_000);
    expect(dialog()).not.toBeNull();
    await click("Close");
    expect(screenId()).toBe("UF-09.6");
    expect(timerText()).toBe("0:50");
  });

  it("the pair: with no sheet open the countdown runs (0:40 after 10 s)", async () => {
    await nextWith50s();
    await advance(10_000);
    expect(timerText()).toBe("0:40");
  });

  it("apply returns to UF-09.6 with the new name, and the countdown runs on from 0:50", async () => {
    await nextWith50s();
    await openSwap("Barbell row");
    await useCandidate("db-row", "Db row");
    await findScreen("UF-09.6");
    expect(heading()).toBe("Db row");
    expect(timerText()).toBe("0:50");
    await advance(10_000);
    expect(timerText()).toBe("0:40");
  });
});

describe("T-0422 AC-5 apply persisted offline (D-0071 §5 §6, D-0093 §7)", () => {
  it("one replaceItem(1, result.plan.items[1], result.plan.mainLiftId), one row write, a valid plan; Resume shows Db row set 2", async () => {
    expect(navigator.onLine).toBe(false);
    const first = await pausedOnRowSet2();
    await render();
    const before = await storedRow();
    await openSwap("Barbell row");
    await useCandidate("db-row", "Db row");
    await findScreen("UF-09.9");

    // The call: exactly the engine's item and main lift, once.
    expect(applySpy).toHaveBeenCalledTimes(1);
    const result = applySpy.mock.results[0]!.value as engine.Workout;
    expect(replaceCalls).toEqual([[1, result.plan.items[1], result.plan.mainLiftId]]);
    // The one row write is replaceItem's: features/UF-05 (and the seam) write nothing.
    expect(upsert).toHaveBeenCalledTimes(1);

    // The stored row.
    const row = await storedRow();
    const plan = row.plan as SessionPlan;
    expect(plan.items[1]!.exerciseId).toBe("db-row");
    const { plan: _after, ...restAfter } = row;
    const { plan: _before, ...restBefore } = before;
    expect(restAfter).toEqual(restBefore);
    const others = (p: SessionPlan) => ({ ...p, items: p.items.filter((_, k) => k !== 1) });
    expect(others(plan)).toEqual(others(before.plan as SessionPlan));
    expect(parseSessionPlan(row.plan ?? null).ok).toBe(true);

    // After Resume: UF-09.3 on Db row set 2.
    await click("Resume");
    expect(screenId()).toBe("UF-09.3");
    expect(heading()).toBe("Db row");
    expect(screen.getByText("Set 2 of 3")).toBeInTheDocument();

    // Logging: the old set keeps its exercise; the next Done set is db-row at setIndex 1.
    await click("Done set");
    await findScreen("UF-09.4");
    const logged = (storedFocus() as unknown as FocusState).loggedSets;
    expect(logged[0]).toEqual(first);
    expect(logged[1]).toMatchObject({ itemIndex: 1, setIndex: 1, exerciseId: "db-row" });
    expect(new Set(positions(logged)).size).toBe(logged.length);
    expect(recordSet).toHaveBeenCalledTimes(1);
    expect(recordSet.mock.calls[0]![0]).toMatchObject({ exerciseId: "db-row", setIndex: 1 });
  });

  // TR-0043: red until it is resolved. `nextSetPrefill` (D-0118 §7) carries set 1's logged
  // barbell-row 60 kg × 8 onto db-row set 2, so UF-09.3 reads "60 kg × 8", not the engine's
  // `first_time` pre-fill. The fix is in features/UF-09/prefill.ts, outside this ticket's paths.
  it("after Resume, the load line is the engine's first_time pre-fill: 'Set weight', '8 reps' (D-0118 §9)", async () => {
    await pausedOnRowSet2();
    await render();
    await openSwap("Barbell row");
    await useCandidate("db-row", "Db row");
    await findScreen("UF-09.9");
    const result = applySpy.mock.results[0]!.value as engine.Workout;
    expect(result.plan.items[1]!.prefill).toMatchObject({ weightKg: null, kind: "first_time" });
    await click("Resume");
    expect(screenId()).toBe("UF-09.3");
    expect(screen.getByText("Set weight")).toBeInTheDocument();
    expect(screen.getByText("8 reps")).toBeInTheDocument();
  });

  it("remount: the host reads Db row back", async () => {
    await pausedOnRowSet2();
    const view = await render();
    await openSwap("Barbell row");
    await useCandidate("db-row", "Db row");
    await findScreen("UF-09.9");
    view.unmount();
    await render();
    expect(screenId()).toBe("UF-09.9");
    await click("Resume");
    expect(screenId()).toBe("UF-09.3");
    expect(heading()).toBe("Db row");
  });
});

describe("T-0422 AC-6 the main slot", () => {
  it("bench-press → push-up under Equipment taken: replaceItem(0, item, 'push-up'); plan.mainLiftId push-up, items[0].isMain", async () => {
    seedFocus(NOW, { phase: "paused", resumePhase: "set", pausedAtMs: NOW, itemIndex: 0 });
    await render();
    await openSwap("Bench press");
    await useCandidate("push-up", "Push up", "Equipment taken");
    await findScreen("UF-09.9");
    expect(replaceCalls).toHaveLength(1);
    expect(replaceCalls[0]).toHaveLength(3);
    expect(replaceCalls[0]![0]).toBe(0);
    expect(replaceCalls[0]![2]).toBe("push-up");
    const plan = (await storedRow()).plan as SessionPlan;
    expect(plan.mainLiftId).toBe("push-up");
    expect(plan.items[0]).toMatchObject({ exerciseId: "push-up", isMain: true });
  });

  it("the pair: a non-main slot passes the plan's unchanged main lift", async () => {
    await pausedOnRowSet2();
    await render();
    await openSwap("Barbell row");
    await useCandidate("db-row", "Db row");
    await findScreen("UF-09.9");
    expect(replaceCalls[0]![2]).toBe("bench-press");
    expect(((await storedRow()).plan as SessionPlan).mainLiftId).toBe("bench-press");
  });
});

describe("T-0422 AC-7 host: a swap while UF-09.4 is in play (D-0153 §2)", () => {
  const autosave = { startedAtMs: NOW, durationS: AUTOSAVE_S, pausedMs: 0 };

  it("paused from UF-09.4 on barbell-row set 2: Swap → Db row → Resume shows UF-09.5; then Db row set 3 of 3, logged at setIndex 2", async () => {
    const sets = [
      await queued(1, 0, "barbell-row", 60, 8),
      await queued(1, 1, "barbell-row", 60, 8),
    ];
    seedFocus(NOW, {
      phase: "paused",
      resumePhase: "confirm",
      pausedAtMs: NOW,
      itemIndex: 1,
      setIndex: 1,
      timer: autosave,
      loggedSets: sets,
    });
    recordSet.mockClear();
    const queuedBefore = await queuedSets();
    await render({ resolveCheckPoint: () => "next" });
    expect(screenId()).toBe("UF-09.9");
    await openSwap("Barbell row");
    await useCandidate("db-row", "Db row");
    await findScreen("UF-09.9");
    expect(replaceCalls[0]![0]).toBe(1);

    await click("Resume");
    expect(screenId()).toBe("UF-09.5");
    await advance(120_000);
    await findScreen("UF-09.3");
    expect(heading()).toBe("Db row");
    expect(screen.getByText("Set 3 of 3")).toBeInTheDocument();
    await click("Done set");
    await findScreen("UF-09.4");
    expect(recordSet).toHaveBeenCalledTimes(1);
    expect(recordSet.mock.calls[0]![0]).toMatchObject({ exerciseId: "db-row", setIndex: 2 });

    const logged = (storedFocus() as unknown as FocusState).loggedSets;
    expect(logged.slice(0, 2)).toEqual(sets);
    expect(new Set(positions(logged)).size).toBe(logged.length);
    expect(editSet).not.toHaveBeenCalled();
    const after = await queuedSets();
    for (const row of queuedBefore) {
      expect(after.find((r) => r.clientId === row.clientId)).toEqual(row);
    }
  });

  it("the pair: paused from UF-09.4 on bench-press set 4 of 4 swaps item 1; Resume shows UF-09.4 bench-press as recorded, Save → UF-09.5 → UF-09.6 Db row", async () => {
    const sets = await benchLogged(4);
    seedFocus(NOW, {
      phase: "paused",
      resumePhase: "confirm",
      pausedAtMs: NOW,
      itemIndex: 0,
      setIndex: 3,
      timer: autosave,
      loggedSets: sets,
    });
    await render({ resolveCheckPoint: () => "next" });
    await openSwap("Barbell row");
    await useCandidate("db-row", "Db row");
    await findScreen("UF-09.9");
    expect(replaceCalls[0]![0]).toBe(1);

    await click("Resume");
    expect(screenId()).toBe("UF-09.4");
    expect(heading()).toBe("Bench press");
    expect(document.querySelector('[data-field="reps"]')?.textContent).toBe("6");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Weight (kg)" }).value).toBe("80");
    await click("Save");
    await findScreen("UF-09.5");
    await advance(120_000);
    await findScreen("UF-09.6");
    expect(heading()).toBe("Db row");
  });
});

interface Axe {
  run: (ctx: Element, opts: object) => Promise<{ violations: { id: string }[] }>;
}

/** axe-core through `@axe-core/playwright` (D-0060 §7), contrast off (jsdom): T-0421's helper. */
async function loadAxe(): Promise<Axe> {
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
  const mod = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
  return mod.default ?? mod;
}

describe("T-0422 AC-8 axe with the sheet open", () => {
  // axe schedules on real timers.
  async function axeViolations(): Promise<{ id: string }[]> {
    vi.useRealTimers();
    const axe = await loadAxe();
    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } },
    });
    return results.violations;
  }

  it("over UF-09.9: 0 violations", async () => {
    await pausedOnRowSet2();
    await render();
    await openSwap("Barbell row");
    await findEl(() => screen.queryByRole("radiogroup", { name: "Replacement" }));
    expect(await axeViolations()).toEqual([]);
  });

  it("over UF-09.6: 0 violations", async () => {
    seedFocus(NOW, {
      phase: "next",
      itemIndex: 1,
      timer: { startedAtMs: NOW, durationS: 60, pausedMs: 0 },
      loggedSets: await benchLogged(4),
    });
    await render();
    await openSwap("Barbell row");
    await findEl(() => screen.queryByRole("radiogroup", { name: "Replacement" }));
    expect(await axeViolations()).toEqual([]);
  });
});
