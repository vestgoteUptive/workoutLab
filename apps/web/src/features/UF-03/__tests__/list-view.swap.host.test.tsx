// T-0478 AC-2 (D-0071 §7, D-0140): swapping from the List view through the real `SessionHost`,
// the real `SwapSheet`, `rankSwaps` and `applySwap`. No mock of `lib/offline/history.js` or
// `@workoutlab/engine`: the real `loadProfile`/`loadLibrary`/`loadEngineHistory` read the seeded
// cache, so the ranked candidate ("hip-thrust", see the ticket's AC-1 fixture comment) and the
// swapped item's pre-fill come from the engine itself, not a stub.
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseSessionPlan } from "@workoutlab/shared";
import { offlineDb, setKey } from "../../../lib/offline/db.js";
import { L1, NOW, S1, USER_A } from "./fixtures.js";
import {
  freshDb,
  seedLibraryAndTargets,
  seedProfile,
  seedSession,
  signIn,
  signOut,
  waitReal,
} from "./helpers.js";
import {
  LIST_PLAN,
  findEl,
  pausedState,
  renderHost,
  settle,
  storedFocus,
  writeFocus,
} from "./list-helpers.js";

const nowMs = Date.parse("2026-09-27T10:00:00.000Z");

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  const db = freshDb();
  signIn();
  await seedLibraryAndTargets(db, L1);
  await seedProfile(db);
  window.localStorage.removeItem(`wl-focus:${S1}`);
});

afterEach(async () => {
  await waitReal(50);
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  signOut();
});

/** Back-squat rows 1-2 (setIndex 0, 1) logged at 100 x 6, as the ticket's Test setup wants. Two
 *  shapes of the same two sets: the persisted focus state's `loggedSets` (what `ListView` reads
 *  to render the rows) and the real IndexedDB queue row `recordSet` itself would have written
 *  (what AC-2's "keep exerciseId back-squat in IndexedDB" means literally). */
const LOGGED_BACK_SQUAT = [
  {
    clientId: "c0",
    itemIndex: 0,
    setIndex: 0,
    exerciseId: "back-squat",
    reps: 6,
    weightKg: 100,
    durationS: null,
    rir: null,
    backoff: false,
  },
  {
    clientId: "c1",
    itemIndex: 0,
    setIndex: 1,
    exerciseId: "back-squat",
    reps: 6,
    weightKg: 100,
    durationS: null,
    rir: null,
    backoff: false,
  },
];

/** Seeds the real `db.sets` queue row for each of `LOGGED_BACK_SQUAT` (no `itemIndex`: the queue
 *  schema has none, D-0045 §6 — a logged set's position in the plan is a List/Focus-view idea,
 *  never persisted). */
async function seedQueuedBackSquat(): Promise<void> {
  const db = offlineDb();
  for (const s of LOGGED_BACK_SQUAT) {
    await db.sets.put({
      key: setKey(USER_A, s.clientId),
      userId: USER_A,
      clientId: s.clientId,
      sessionId: S1,
      exerciseId: s.exerciseId,
      setIndex: s.setIndex,
      kind: "reps",
      reps: s.reps,
      weightKg: s.weightKg,
      durationS: null,
      rir: null,
      isWarmup: false,
      backoff: false,
      completedAt: new Date(nowMs).toISOString(),
      editedAt: new Date(nowMs).toISOString(),
      deletedAt: null,
      status: "queued",
    });
  }
}

async function openSwapFromList(): Promise<void> {
  await seedSession(offlineDb(), { endedAt: null, plan: LIST_PLAN });
  await seedQueuedBackSquat();
  writeFocus(pausedState(nowMs, { loggedSets: LOGGED_BACK_SQUAT }));
  renderHost();
  await openSwap();
}

async function openSwap(): Promise<void> {
  await findEl(() => document.querySelector('[data-screen-id="UF-09.9"]'));
  fireEvent.click(screen.getByRole("button", { name: "List view" }));
  await findEl(() => document.querySelector('[data-screen-id="UF-03.1"]'));
  await screen.findByRole("heading", { level: 2, name: "Back squat" });
  fireEvent.click(screen.getByRole("button", { name: "Swap Back squat" }));
  await screen.findByRole("dialog", { name: "Replace Back squat" });
}

async function applyFirstCandidate(): Promise<void> {
  await screen.findByRole("radiogroup", { name: "Replacement" });
  const useButton = await screen.findByRole("button", { name: /^Use / });
  fireEvent.click(useButton);
}

const rowTag = (setIndex: number): string | null =>
  document.querySelector(`[data-set-index="${setIndex}"] [data-part="tag"]`)?.textContent ?? null;

describe("T-0478 AC-2 after a swap, through the real engine and host", () => {
  it("the card shows the candidate's library name (Hip thrust)", async () => {
    await openSwapFromList();
    await applyFirstCandidate();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Hip thrust" })).toBeTruthy(),
    );
  });

  it("rows 3-4 (unlogged) show the engine's pre-fill from the new plan.items[0].prefill", async () => {
    await openSwapFromList();
    await applyFirstCandidate();
    await waitFor(() => screen.getByRole("heading", { level: 2, name: "Hip thrust" }));
    // Zero history, the back-squat slot's own 100 kg prefill carried over (rule 14 step 1,
    // D-0057 §1): hip-thrust and back-squat share a weight-1.0 area (glutes) and barbell
    // equipment, so the real `applySwap` returns `kind: "carry"`, reps 6, weight 100 — shown as
    // given (AC-2's "zero history" edge case), not re-derived by the List view.
    expect(
      await screen.findByRole<HTMLInputElement>("textbox", { name: "Set 3 reps" }),
    ).toHaveValue("6");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Set 4 reps" })).toHaveValue("6");
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "Set 3 weight in kg" }),
    ).toHaveValue("100");
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "Set 4 weight in kg" }),
    ).toHaveValue("100");
  });

  it("rows 1-2 keep their values, show the tag 'Back squat', and keep exerciseId back-squat in IndexedDB", async () => {
    await openSwapFromList();
    await applyFirstCandidate();
    await waitFor(() => screen.getByRole("heading", { level: 2, name: "Hip thrust" }));
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "Set 1 weight in kg" }),
    ).toHaveValue("100");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Set 1 reps" })).toHaveValue("6");
    expect(rowTag(0)).toBe("Back squat");
    expect(rowTag(1)).toBe("Back squat");
    expect(rowTag(2)).toBeNull();
    // The AC's own words: "keep exerciseId back-squat in IndexedDB" — the real `db.sets` queue
    // row each check wrote (T-0417 AC-4, D-0071 §5), not the persisted focus-state's own copy of
    // the same two sets.
    const queued = await offlineDb().sets.where({ sessionId: S1 }).toArray();
    const backSquatRows = queued.filter((s) => s.exerciseId === "back-squat");
    expect(backSquatRows).toHaveLength(2);
    expect(backSquatRows.map((s) => s.setIndex).sort()).toEqual([0, 1]);
  });

  it("checking row 3 records the new exerciseId at setIndex 2 (the first free position)", async () => {
    await openSwapFromList();
    await applyFirstCandidate();
    await waitFor(() => screen.getByRole("heading", { level: 2, name: "Hip thrust" }));
    const weight = await screen.findByRole<HTMLInputElement>("textbox", {
      name: "Set 3 weight in kg",
    });
    fireEvent.change(weight, { target: { value: "60" } });
    fireEvent.blur(weight);
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark set 3 done" }));
    await screen.findByRole("checkbox", { name: "Mark set 3 not done" });
    // The machine's own focus state (`itemIndex`, the UI's position idea) …
    const focusState = storedFocus() as {
      loggedSets: Array<{ exerciseId: string; setIndex: number; itemIndex: number }>;
    };
    const added = focusState.loggedSets.find(
      (s) => s.exerciseId === "hip-thrust" && s.itemIndex === 0,
    );
    expect(added).toMatchObject({ setIndex: 2 });
    // … and the real `db.sets` queue row `recordSet` wrote for it (T-0417 AC-4, D-0071 §5): the
    // persisted truth has no `itemIndex` (D-0045 §6), so `exerciseId` + `setIndex` is what to read.
    const queuedHipThrust = (await offlineDb().sets.where({ sessionId: S1 }).toArray()).filter(
      (s) => s.exerciseId === "hip-thrust",
    );
    expect(queuedHipThrust).toHaveLength(1);
    expect(queuedHipThrust[0]).toMatchObject({ setIndex: 2, weightKg: 60 });
  });

  it("the stored row's plan passes parseSessionPlan; the row's other fields are unchanged", async () => {
    await openSwapFromList();
    const before = await offlineDb().sessions.get(S1);
    await applyFirstCandidate();
    await waitFor(async () => {
      const row = await offlineDb().sessions.get(S1);
      expect(row!.row.plan).not.toEqual(before!.row.plan);
    });
    const after = await offlineDb().sessions.get(S1);
    const parsed = parseSessionPlan(after!.row.plan);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.plan?.items[0]?.exerciseId).toBe("hip-thrust");
    const { plan: beforePlan, ...beforeRest } = before!.row;
    const { plan: afterPlan, ...afterRest } = after!.row;
    expect(afterRest).toEqual(beforeRest);
    expect(afterPlan).not.toEqual(beforePlan);
  });

  it("offline: the swap persists through the queue; a remount reads the new exercise back", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await openSwapFromList();
    await applyFirstCandidate();
    await waitFor(() => screen.getByRole("heading", { level: 2, name: "Hip thrust" }));
    await waitFor(async () => {
      const row = await offlineDb().sessions.get(S1);
      const parsed = parseSessionPlan(row!.row.plan);
      expect(parsed.ok && parsed.plan?.items[0]?.exerciseId).toBe("hip-thrust");
    });
    cleanup();
    renderHost();
    // The List view (D-0142 §3) left the machine out of "paused" (`phase: "set"`, the AC-2 List
    // view host test); the remount resumes there. Resuming on set 2 (0-indexed 1) with sets 0-1
    // already logged lands on the rest before set 3 (UF-09.5): skip it to reach focus mode.
    await findEl(() => document.querySelector('[data-screen-id="UF-09.5"]'));
    fireEvent.click(screen.getByRole("button", { name: "Skip rest" }));
    await findEl(() => document.querySelector('[data-screen-id="UF-09.3"]'));
    fireEvent.click(screen.getByRole("button", { name: "Pause workout" }));
    await findEl(() => document.querySelector('[data-screen-id="UF-09.9"]'));
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    await findEl(() => document.querySelector('[data-screen-id="UF-03.1"]'));
    expect(await screen.findByRole("heading", { level: 2, name: "Hip thrust" })).toBeTruthy();
  });
});

describe("T-0478 AC-3 focus after a resolved Apply, real host", () => {
  it("focus lands on the Swap button, now named 'Swap Hip thrust'", async () => {
    await openSwapFromList();
    await applyFirstCandidate();
    await waitFor(() => screen.getByRole("heading", { level: 2, name: "Hip thrust" }));
    await settle();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Swap Hip thrust" }));
  });
});

describe("T-0478 AC-1 during a rest, real host", () => {
  /** Paused mid-rest after set 2 of back-squat (resumePhase "rest", a live timer): opening the
   *  List view from UF-09.9 keeps `ctx.rest` (D-0142 §3's wall clock, read straight off the
   *  machine), so the bar shows on UF-03.1 too. */
  async function pausedFromRest(): Promise<void> {
    await seedSession(offlineDb(), { endedAt: null, plan: LIST_PLAN });
    writeFocus(
      pausedState(nowMs, {
        loggedSets: LOGGED_BACK_SQUAT,
        setIndex: 2,
        resumePhase: "rest",
        timer: { startedAtMs: nowMs - 30_000, durationS: 120, pausedMs: 0 },
      }),
    );
    renderHost();
    await findEl(() => document.querySelector('[data-screen-id="UF-09.9"]'));
  }

  it("opening and cancelling the sheet leaves the rest running; the bar shows again on return", async () => {
    await pausedFromRest();
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    await findEl(() => document.querySelector('[data-screen-id="UF-03.1"]'));
    const restBarBefore = await screen.findByRole("button", { name: /^Rest,/ });
    expect(restBarBefore).toBeTruthy();
    await screen.findByRole("heading", { level: 2, name: "Back squat" });
    fireEvent.click(screen.getByRole("button", { name: "Swap Back squat" }));
    await screen.findByRole("dialog", { name: "Replace Back squat" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await settle();
    // The rest bar (and so the rest itself, since the bar's clock is `ctx.rest` verbatim) is
    // back on screen, counting down from where it was, not restarted and not gone.
    const restBarAfter = await screen.findByRole("button", { name: /^Rest,/ });
    expect(restBarAfter).toBeTruthy();
    expect(restBarAfter.textContent).toBe(restBarBefore.textContent);
  });
});

describe("T-0478 AC-1 rejection, real host and real SwapSheet", () => {
  it("a rejected replaceItem shows the sheet's own 'Couldn't save the swap' text; the card stays Back squat", async () => {
    await openSwapFromList();
    // Deletes the stored row `ctx.replaceItem` reads before writing (T-0478 AC-1's "offline" edge
    // case, engineered deterministically): `storedRow` throws, so the real `SwapSheet`'s own
    // `onApply` catch sets its `saveFailed` notice (T-0421), not a List-view-owned message.
    await offlineDb().sessions.delete(S1);
    await applyFirstCandidate();
    // The `role="status"` element is always present (empty until a notice sets it); wait for its
    // text, not just its presence.
    await screen.findByText("Couldn't save the swap. Try again.");
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't save the swap. Try again.");
    expect(screen.getByRole("dialog", { name: "Replace Back squat" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Back squat" })).toBeTruthy();
  });
});
