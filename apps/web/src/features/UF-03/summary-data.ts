// UF-03.3 Summary data (T-0419, D-0068 §1, D-0142 §4). IndexedDB only: the stored session row,
// `loadEngineHistory()` (cache ∪ queue), the cached library and targets. No `refresh*`, no
// `useAuth()`, no Edge Function: online and offline give the same numbers (NFR-OFF-2).
//
// Principle 3: every number is an engine call or a field of the stored row. Hard sets come from
// `isHardSet`, the before → after loads from `balance`, and the "next up" areas from the
// engine's own `coverageStep` and `areas` order. Nothing here re-derives an engine value.
//
// `now` is the row's `ended_at` (D-0142 §4), never the device clock, so a reload any time later
// shows the same numbers.
import { balance, isHardSet, normalizeHistory } from "@workoutlab/engine";
import {
  AREAS,
  parseSessionPlan,
  type AreaBalance,
  type AreaTarget,
  type BalanceResult,
} from "@workoutlab/shared";
import {
  currentUserId,
  loadEngineHistory,
  loadLibrary,
  loadTargets,
  offlineDb,
} from "../../lib/offline/index.js";

/** One before → after row: an area whose load changed in this session. */
export interface AreaChange {
  area: AreaBalance["area"];
  before: number;
  after: number;
  target: number;
}

export interface EndedSummary {
  /** Whole minutes, `ended_at − started_at`, rounded down. */
  minutes: number;
  budgetMin: number;
  exercises: number;
  hardSets: number;
  /** `null` when the cached targets don't cover all nine areas (D-0147 §2). */
  changes: AreaChange[] | null;
  /** The engine's `after.areas` with `coverageStep < 4`, first two; `null` with `changes`. */
  nextUp: AreaBalance["area"][] | null;
}

export type SummaryLoad =
  { kind: "notOnDevice" } | { kind: "running" } | { kind: "ended"; summary: EndedSummary };

const NOT_ON_DEVICE: SummaryLoad = { kind: "notOnDevice" };

/** How many "next up" areas the summary names (D-0068 §1). */
const NEXT_UP_COUNT = 2;
/** The top of the coverage ramp (D-0003): an area at step 4 is on target. */
const ON_TARGET_STEP = 4;

/** Before → after over the engine's two results, in `after.areas` order (D-0068 §1). */
export function areaChanges(before: BalanceResult, after: BalanceResult): AreaChange[] {
  const beforeLoad = new Map(before.areas.map((a) => [a.area, a.load]));
  const out: AreaChange[] = [];
  for (const a of after.areas) {
    const prev = beforeLoad.get(a.area) ?? 0;
    if (prev !== a.load) out.push({ area: a.area, before: prev, after: a.load, target: a.target });
  }
  return out;
}

/** The first ≤ 2 areas of `after.areas` (engine order) whose `coverageStep` is below 4. */
export function nextUpAreas(after: BalanceResult): AreaBalance["area"][] {
  return after.areas
    .filter((a) => a.coverageStep < ON_TARGET_STEP)
    .slice(0, NEXT_UP_COUNT)
    .map((a) => a.area);
}

/** True when the cached targets name every one of the nine areas (D-0147 §2). */
export function coversEveryArea(targets: readonly AreaTarget[]): boolean {
  return AREAS.every((area) => targets.some((t) => t.area === area));
}

/**
 * Reads everything UF-03.3 shows for `sessionId`. Never rejects: an unreadable row, another
 * user's row, or IndexedDB failing is "isn't on this device" (D-0142 §4).
 */
export async function loadSummary(sessionId: string, tz: string): Promise<SummaryLoad> {
  try {
    const entry = await offlineDb().sessions.get(sessionId);
    if (!entry || entry.userId !== currentUserId()) return NOT_ON_DEVICE;
    if (!parseSessionPlan(entry.row.plan ?? null).ok) return NOT_ON_DEVICE;
    const row = entry.row;
    if (row.ended_at == null) return { kind: "running" };

    const endedAt = row.ended_at;
    const durationMs = Date.parse(endedAt) - Date.parse(row.started_at);
    if (!Number.isFinite(durationMs)) return NOT_ON_DEVICE;

    const [raw, library, targets] = await Promise.all([
      loadEngineHistory(),
      loadLibrary(),
      loadTargets(),
    ]);
    const history = normalizeHistory(raw);
    const byId = new Map(library.map((e) => [e.id, e]));
    const hard = history.filter(
      (s) => s.sessionId === sessionId && isHardSet(s, byId.get(s.exerciseId)),
    );

    // D-0147 §2: a cache that doesn't hold a target for all nine areas yet (`balance` needs all
    // nine) gives the stats without the before → after rows and "Next up". Only that case: any
    // other error from `balance` reaches the outer catch, never a partial summary.
    let changes: AreaChange[] | null = null;
    let nextUp: AreaBalance["area"][] | null = null;
    if (coversEveryArea(targets)) {
      const before = balance(
        history.filter((s) => s.sessionId !== sessionId),
        targets,
        library,
        endedAt,
        tz,
      );
      const after = balance(history, targets, library, endedAt, tz);
      changes = areaChanges(before, after);
      nextUp = nextUpAreas(after);
    }

    return {
      kind: "ended",
      summary: {
        minutes: Math.max(0, Math.floor(durationMs / 60_000)),
        budgetMin: row.time_budget_min,
        exercises: new Set(hard.map((s) => s.exerciseId)).size,
        hardSets: hard.length,
        changes,
        nextUp,
      },
    };
  } catch {
    return NOT_ON_DEVICE;
  }
}
