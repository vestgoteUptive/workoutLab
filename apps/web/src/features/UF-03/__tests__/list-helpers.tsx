// T-0416 helpers (UF-03.1): the S1 plan with the engine pre-fill, a `ctx` with spied methods
// (D-0071 §5), the axe loader, and a host mount over the real `SessionHost` and the real module
// seam arrays. The host is imported here (tests only); no UF-03 source file imports UF-09.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { act, render, type RenderResult } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { vi } from "vitest";
import { WARMUP_COST_S, availableS } from "@workoutlab/engine";
import type { SessionPlan, Workout, WorkoutItem } from "@workoutlab/shared";
import { SessionHost } from "../../UF-09/index.js";
import { Summary } from "../index.js";
import type { ListViewCtx } from "../ListView.js";
import { PLAN, S1 } from "./fixtures.js";
import { waitReal } from "./helpers.js";

/** S1 with the engine's pre-fill (ticket §Test setup): back-squat 100 × 6, RDL 80 × 8. */
export function planWithPrefill(): SessionPlan {
  const items: WorkoutItem[] = PLAN.items.map((item) => ({ ...item }));
  items[0] = { ...items[0]!, prefill: { weightKg: 100, reps: 6, durationS: null, kind: "hold" } };
  items[1] = { ...items[1]!, prefill: { weightKg: 80, reps: 8, durationS: null, kind: "hold" } };
  return { ...PLAN, items };
}

export const LIST_PLAN = planWithPrefill();

export function withItem(plan: SessionPlan, index: number, patch: Partial<WorkoutItem>) {
  const items = plan.items.map((item, i) => (i === index ? { ...item, ...patch } : item));
  return { ...plan, items };
}

/** T-0478: the `Workout` LIST_PLAN's stored row would build (D-0069 §5, the real
 *  `UF-09/session.js` `buildWorkout`'s own arithmetic — recomputed here, not imported, since a
 *  UF-03 test file never imports a UF-09 module other than its public `index.js`, D-0142 §5). A
 *  test that needs a particular `ctx.plan` passes its own `workout` too. */
const LIST_BUDGET_MIN = 45;
const LIST_WARMUP_IN_BUDGET = true;
const listItemsTotalS = (plan: SessionPlan): number =>
  plan.items.reduce((sum, item) => sum + item.costS, 0);

export const LIST_WORKOUT: Workout = {
  plan: LIST_PLAN,
  budgetMin: LIST_BUDGET_MIN,
  warmupInBudget: LIST_WARMUP_IN_BUDGET,
  energy: "normal",
  itemsTotalS: listItemsTotalS(LIST_PLAN),
  totalS: listItemsTotalS(LIST_PLAN) + WARMUP_COST_S,
  unusedS: Math.max(
    0,
    availableS(LIST_BUDGET_MIN, LIST_WARMUP_IN_BUDGET) - listItemsTotalS(LIST_PLAN),
  ),
  sessionReasons: [],
};

export type SpiedCtx = ListViewCtx & {
  close: ReturnType<typeof vi.fn<() => void>>;
  finish: ReturnType<typeof vi.fn<() => Promise<void>>>;
  recordSet: ReturnType<typeof vi.fn<ListViewCtx["recordSet"]>>;
  editSet: ReturnType<typeof vi.fn<ListViewCtx["editSet"]>>;
  deleteSet: ReturnType<typeof vi.fn<ListViewCtx["deleteSet"]>>;
  startRest: ReturnType<typeof vi.fn<ListViewCtx["startRest"]>>;
  adjustRest: ReturnType<typeof vi.fn<ListViewCtx["adjustRest"]>>;
  skipRest: ReturnType<typeof vi.fn<ListViewCtx["skipRest"]>>;
  replaceItem: ReturnType<typeof vi.fn<ListViewCtx["replaceItem"]>>;
};

export function makeCtx(over: Partial<ListViewCtx> = {}): SpiedCtx {
  return {
    sessionId: S1,
    plan: LIST_PLAN,
    workout: LIST_WORKOUT,
    timeZone: "America/New_York",
    loggedSets: [],
    currentItemIndex: 0,
    elapsedS: 600,
    rest: null,
    close: vi.fn<() => void>(),
    finish: vi.fn<() => Promise<void>>(async () => undefined),
    recordSet: vi.fn<ListViewCtx["recordSet"]>(async () => ({})),
    editSet: vi.fn<ListViewCtx["editSet"]>(async () => undefined),
    deleteSet: vi.fn<ListViewCtx["deleteSet"]>(async () => undefined),
    startRest: vi.fn<ListViewCtx["startRest"]>(),
    adjustRest: vi.fn<ListViewCtx["adjustRest"]>(),
    skipRest: vi.fn<ListViewCtx["skipRest"]>(),
    replaceItem: vi.fn<ListViewCtx["replaceItem"]>(async () => undefined),
    // `over` last: a test's own spy (for example a rejecting `replaceItem`) must win over the
    // defaults above, not be silently discarded by them (T-0478).
    ...over,
  } as SpiedCtx;
}

export function logged(
  itemIndex: number,
  setIndex: number,
  exerciseId: string,
  reps: number,
  kg: number,
) {
  return {
    clientId: `c-${itemIndex}-${setIndex}`,
    itemIndex,
    setIndex,
    exerciseId,
    reps,
    weightKg: kg,
    durationS: null,
  };
}

interface Axe {
  run: (ctx: Element, opts: object) => Promise<{ violations: { id: string }[] }>;
}
let axeCache: Axe | undefined;
export async function axeViolations(): Promise<string[]> {
  if (!axeCache) {
    const req = createRequire(resolve(process.cwd(), "package.json"));
    const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
    const loaded = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
    axeCache = loaded.default ?? loaded;
  }
  const results = await axeCache.run(document.body, {
    rules: { "color-contrast": { enabled: false } },
  });
  return results.violations.map((v) => v.id);
}

export async function settle(ms = 50): Promise<void> {
  await act(async () => {
    await waitReal(ms);
  });
}

/** Polls on real macrotasks until `find()` returns an element. */
export async function findEl<T extends Element>(find: () => T | null, tries = 80): Promise<T> {
  for (let i = 0; i < tries; i += 1) {
    const el = find();
    if (el) return el;
    await settle(10);
  }
  const el = find();
  if (!el) throw new Error("findEl: not found");
  return el;
}

export const screenIds = (): string[] =>
  Array.from(document.querySelectorAll("[data-screen-id]")).map((e) =>
    e.getAttribute("data-screen-id")!,
  );

/** The persisted focus state (D-0111 §4), as `wl-focus:<id>` stores it. Written by hand: UF-03
 *  never deep-imports UF-09 (D-0071 §3), not even in tests. */
export type FocusStateJson = Record<string, unknown>;

/** The ticket's S1 paused from back-squat set 2, set index 0 logged (AC-2). */
export function pausedState(nowMs: number, over: FocusStateJson = {}): FocusStateJson {
  return {
    version: 1,
    sessionId: S1,
    phase: "paused",
    itemIndex: 0,
    setIndex: 1,
    warmupIndex: 0,
    timer: null,
    pausedAtMs: nowMs,
    resumePhase: "set",
    workoutPausedMs: 0,
    warmupStartedAtMs: null,
    warmupSpentMs: 0,
    timerPausedAtMs: null,
    skippedItems: [],
    loggedSets: [
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
    ],
    ...over,
  };
}

export function writeFocus(state: FocusStateJson): void {
  window.localStorage.setItem(`wl-focus:${S1}`, JSON.stringify(state));
}

export function storedFocus(): Record<string, unknown> | null {
  const raw = window.localStorage.getItem(`wl-focus:${S1}`);
  return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
}

export const hostPath = { value: "" };

function PathProbe() {
  hostPath.value = useLocation().pathname;
  return null;
}

/** The real host with the module arrays (no `seams` prop), plus the real UF-03.3 route. */
export function renderHost(): RenderResult {
  return render(
    <MemoryRouter initialEntries={[`/session/${S1}`]}>
      <PathProbe />
      <Routes>
        <Route
          path="/session/:sessionId"
          element={<SessionHost locale="en-GB" timeZone="Europe/Stockholm" />}
        />
        <Route
          path="/session/:sessionId/summary"
          element={<Summary timeZone="Europe/Stockholm" locale="en-GB" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}
