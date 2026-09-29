// Session building: the eligible-exercise rule (rule 0, D-0034 §7), the time model (7.1),
// main lift, pinned and greedy selection (7.2), energy (7.4), reasons (rule 10) and
// `suggest()` for UF-08.1 / UF-08.3 / UF-08.4 (D-0024, D-0037 §6–§7, D-0040, D-0042, D-0047).
import { balance } from "./balance.js";
import {
  BACKOFF_FACTOR,
  DEFAULT_INCREMENT_KG,
  floorInc,
  LOW_TRIM_FROM_SETS,
  LOW_TRIM_TO_SETS,
} from "./energy.js";
import { availableS, isEligible, itemCostS, setCostS } from "./cost.js";
import { indexLibrary, primaryAreas, recentSessionIds, weightsOf } from "./history.js";
import { lastDoneDates, rankAgainst, type SwapContext } from "./swaps.js";
import { dayDiff } from "./time.js";
import {
  AREAS,
  type Area,
  type AreaNumbers,
  type AreaTarget,
  type Backoff,
  type EngineProfile,
  type HistorySet,
  type Instant,
  type LibraryExercise,
  type PrefillResult,
  type Reason,
  type SessionInput,
  type TimeZone,
  type Workout,
  type WorkoutItem,
} from "./types.js";
import { generateWarmup, WARMUP_COST_S } from "./warmup.js";

export {
  availableS,
  isEligible,
  itemCostS,
  setCostS,
  REST_COMPOUND_S,
  REST_ISOLATION_S,
  TRANSITION_S,
  WORK_S,
} from "./cost.js";

/** Rule 7.2 caps. */
export const MAX_ITEMS = 8;
export const MAX_ITEMS_PER_AREA = 2;
/** `budgetMin` bounds (D-0037 §7, D-0040 §7). */
export const BUDGET_MIN = 1;
export const BUDGET_MAX = 480;

function assertBudget(budgetMin: number): void {
  if (!Number.isInteger(budgetMin) || budgetMin < BUDGET_MIN || budgetMin > BUDGET_MAX) {
    throw new RangeError(
      `budgetMin must be an integer ${BUDGET_MIN}–${BUDGET_MAX}, got ${budgetMin}`,
    );
  }
}

// ---- Selection state ----

interface Start {
  targets: AreaNumbers;
  loads: AreaNumbers;
  deficits: AreaNumbers;
  daysSince: Record<Area, number | null>;
  recovering: Set<Area>;
  /** Exercise ids with hard sets in the most recent session (D-0040 §9). */
  recentIds: Set<string>;
  /** Eligible exercises with at least one primary area, id-sorted. */
  pool: LibraryExercise[];
}

interface Picked {
  exercise: LibraryExercise;
  sets: number;
  isMain: boolean;
  /** Rule 7.4 Low: trimmed from 3 to 2 sets. */
  lowTrimmed?: boolean;
  /** Rule 7.4 High: one back-off set on the main lift. */
  backoff?: boolean;
  /** Rule 13: the slot's original exercise, when shuffle replaced it (D-0056 §11). */
  previous?: LibraryExercise;
}

interface State {
  start: Start;
  projected: AreaNumbers;
  picked: Picked[];
  primaryCount: Record<Area, number>;
  remainingS: number;
}

function byId(a: LibraryExercise, b: LibraryExercise): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function buildStart(
  history: readonly HistorySet[],
  targets: readonly AreaTarget[],
  profile: Pick<EngineProfile, "level" | "equipment">,
  library: readonly LibraryExercise[],
  excludeIds: readonly string[],
  now: Instant,
  tz: TimeZone,
): Start {
  const bal = balance(history, targets, library, now, tz);
  const t = {} as AreaNumbers;
  const loads = {} as AreaNumbers;
  const deficits = {} as AreaNumbers;
  const daysSince = {} as Record<Area, number | null>;
  const recovering = new Set<Area>();
  for (const a of AREAS) {
    const ab = bal.areas.find((x) => x.area === a);
    if (ab === undefined) throw new RangeError(`balance() lacks ${a}`);
    t[a] = ab.target;
    loads[a] = ab.load;
    deficits[a] = ab.deficit;
    daysSince[a] = ab.lastTrainedDate === null ? null : dayDiff(ab.lastTrainedDate, bal.windowEnd);
    if (ab.recovering) recovering.add(a);
  }
  const pool = [...indexLibrary(library).values()]
    .filter((e) => isEligible(e, profile, excludeIds) && primaryAreas(e).length > 0)
    .sort(byId);
  return {
    targets: t,
    loads,
    deficits,
    daysSince,
    recovering,
    recentIds: recentSessionIds(history, library, bal.windowEnd, tz),
    pool,
  };
}

function newState(start: Start, available: number): State {
  const primaryCount = {} as Record<Area, number>;
  for (const a of AREAS) primaryCount[a] = 0;
  return { start, projected: { ...start.loads }, picked: [], primaryCount, remainingS: available };
}

const ratio = (s: State, a: Area): number => s.projected[a] / s.start.targets[a];

/** `Σ w(a) × projectedDeficit(a)`, recovering areas count 0 (rule 7.2). */
function gapFit(s: State, ex: LibraryExercise): number {
  let sum = 0;
  for (const [a, w] of weightsOf(ex)) {
    if (s.start.recovering.has(a)) continue;
    const t = s.start.targets[a];
    sum += (w * Math.max(0, t - s.projected[a])) / t;
  }
  // Rounded so mathematically equal sums built in a different order still tie (D-0042).
  return Math.round(sum * 1e9) / 1e9;
}

/** Can `ex` join the session: not taken, no recovering primary area, primary caps free. */
function admissible(s: State, ex: LibraryExercise): boolean {
  if (s.picked.length >= MAX_ITEMS) return false;
  if (s.picked.some((p) => p.exercise.id === ex.id)) return false;
  for (const a of primaryAreas(ex)) {
    if (s.start.recovering.has(a)) return false;
    if (s.primaryCount[a] >= MAX_ITEMS_PER_AREA) return false;
  }
  return true;
}

/** Rule 7.2 candidates for `area`, in rank order: not in the recent session, gap fit, id. */
function candidates(s: State, area: Area): LibraryExercise[] {
  return s.start.pool
    .filter((e) => e.areas[area] === 1 && admissible(s, e))
    .map((e) => ({ e, recent: s.start.recentIds.has(e.id) ? 1 : 0, fit: gapFit(s, e) }))
    .sort((x, y) => x.recent - y.recent || y.fit - x.fit || byId(x.e, y.e))
    .map((x) => x.e);
}

/** Adds `ex` at the first set count in `tries` that fits; true when added. */
function tryAdd(s: State, ex: LibraryExercise, tries: readonly number[], isMain: boolean): boolean {
  for (const sets of tries) {
    const cost = itemCostS(ex, sets);
    if (cost > s.remainingS) continue;
    s.picked.push({ exercise: ex, sets, isMain });
    s.remainingS -= cost;
    for (const [a, w] of weightsOf(ex)) s.projected[a] += sets * w;
    for (const a of primaryAreas(ex)) s.primaryCount[a] += 1;
    return true;
  }
  return false;
}

/** Eligible areas for selection, lowest projected ratio first (ties by fixed order). */
function areasByRatio(s: State, exhausted: ReadonlySet<Area>): Area[] {
  return AREAS.filter(
    (a) =>
      !s.start.recovering.has(a) && !exhausted.has(a) && s.primaryCount[a] < MAX_ITEMS_PER_AREA,
  )
    .map((a, i) => ({ a, i, r: ratio(s, a) }))
    .sort((x, y) => x.r - y.r || x.i - y.i)
    .map((x) => x.a);
}

const MAIN_TRIES = [4, 3, 2] as const;
const ACCESSORY_TRIES = [3, 2] as const;

function selectMain(s: State, mainLiftId: string | null): void {
  if (mainLiftId !== null) {
    const ex = s.start.pool.find((e) => e.id === mainLiftId);
    if (ex !== undefined && ex.type === "compound" && admissible(s, ex)) {
      if (tryAdd(s, ex, MAIN_TRIES, true)) return;
    }
  }
  for (const area of areasByRatio(s, new Set())) {
    for (const ex of candidates(s, area)) {
      if (ex.type === "compound" && tryAdd(s, ex, MAIN_TRIES, true)) return;
    }
  }
}

function selectPinned(s: State, pinnedIds: readonly string[]): void {
  for (const id of pinnedIds) {
    const ex = s.start.pool.find((e) => e.id === id);
    if (ex !== undefined && admissible(s, ex)) tryAdd(s, ex, ACCESSORY_TRIES, false);
  }
}

function selectGreedy(s: State): void {
  const exhausted = new Set<Area>();
  while (s.picked.length < MAX_ITEMS) {
    const area = areasByRatio(s, exhausted)[0];
    if (area === undefined) return;
    const added = candidates(s, area).some((ex) => tryAdd(s, ex, ACCESSORY_TRIES, false));
    if (!added) exhausted.add(area);
  }
}

/** Rule 7.2 rep ranges; timed items have none (D-0040 §5). */
function repRange(ex: LibraryExercise, isMain: boolean): [number, number] | [null, null] {
  if (ex.timed) return [null, null];
  if (isMain) return [6, 8];
  return ex.type === "compound" ? [8, 12] : [10, 15];
}

/** The slot's previous exercise and its pre-fill weight, for rule 14's `carry` (D-0057 §2). */
interface PreviousSlot {
  exerciseId: string;
  weightKg: number | null;
}

/**
 * First-time pre-fill seam (D-0040 §4): rule 14 step 1 without the carry case. T-0205
 * replaces this behind the same call and fills in `carry` from `_previous` (D-0056 §11).
 */
function prefillFor(
  ex: LibraryExercise,
  repsMin: number | null,
  _previous: PreviousSlot | null,
): PrefillResult {
  return {
    weightKg: ex.externalLoad ? null : 0,
    reps: repsMin,
    durationS: ex.timed ? ex.defaultDurationS : null,
    kind: "first_time",
  };
}

/** D-0040 §4: `floorInc(0.9 × prefill weight)` (null stays null) at the main `repsMin`. */
function backoffOf(ex: LibraryExercise, prefill: PrefillResult, reps: number): Backoff {
  const w = prefill.weightKg;
  const inc = ex.incrementKg ?? DEFAULT_INCREMENT_KG;
  return { weightKg: w === null ? null : floorInc(BACKOFF_FACTOR * w, inc), reps };
}

function previousOf(p: Picked): PreviousSlot | null {
  if (p.previous === undefined) return null;
  const [repsMin] = repRange(p.previous, p.isMain);
  return {
    exerciseId: p.previous.id,
    weightKg: prefillFor(p.previous, repsMin, null).weightKg,
  };
}

function toItem(start: Start, p: Picked): WorkoutItem {
  const [repsMin, repsMax] = repRange(p.exercise, p.isMain);
  const prefill = prefillFor(p.exercise, repsMin, previousOf(p));
  const area = primaryAreas(p.exercise)[0] as Area;
  const backoff =
    p.backoff === true && repsMin !== null ? backoffOf(p.exercise, prefill, repsMin) : null;
  // Item reason order (D-0040 §6).
  const reasons: Reason[] = [];
  if (p.isMain) reasons.push({ code: "main_lift" });
  reasons.push({ code: "area_deficit", area, deficit: start.deficits[area] });
  reasons.push({ code: "days_since", area, days: start.daysSince[area] });
  if (p.previous !== undefined) reasons.push({ code: "swap", reason: null });
  if (p.lowTrimmed === true) reasons.push({ code: "energy_low_trim" });
  if (backoff !== null) reasons.push({ code: "energy_high_backoff" });
  reasons.push({ code: "prefill", kind: prefill.kind });
  return {
    exerciseId: p.exercise.id,
    isMain: p.isMain,
    sets: p.sets,
    repsMin,
    repsMax,
    durationS: p.exercise.timed ? p.exercise.defaultDurationS : null,
    costS: itemCostS(p.exercise, p.sets) + (backoff === null ? 0 : setCostS(p.exercise)),
    backoff,
    prefill,
    reasons,
  };
}

/**
 * Rule 13 shuffle (UF-08.2, D-0025, D-0056 §8–§12), after greedy selection and before
 * energy. Every accessory slot not in `pinnedIds`, in session order, takes entry `n mod len`
 * of `[original, …variety ranking]`, where the ranking is built against the plan as it
 * stands (so earlier picks are already excluded). A pick that doesn't fit, has a recovering
 * area at weight 1.0 or would put an area over the primary cap leaves the original. `n` is
 * the only input that varies the result; `n = 0` changes nothing.
 */
function applyShuffle(s: State, n: number, pinnedIds: readonly string[], ctx: SwapContext): void {
  for (const p of s.picked) {
    if (p.isMain || pinnedIds.includes(p.exercise.id)) continue;
    const planIds = new Set(s.picked.map((q) => q.exercise.id));
    const ranking = rankAgainst(ctx, p.exercise, p, planIds, "variety", () => true);
    const idx = n % (1 + ranking.length);
    if (idx === 0) continue;
    const pick = ctx.lib.get((ranking[idx - 1] as { exerciseId: string }).exerciseId);
    if (pick === undefined) continue;
    const oldCost = itemCostS(p.exercise, p.sets);
    const newCost = itemCostS(pick, p.sets);
    if (s.remainingS + oldCost - newCost < 0) continue;
    const oldPrimary = primaryAreas(p.exercise);
    const newPrimary = primaryAreas(pick);
    if (newPrimary.some((a) => s.start.recovering.has(a))) continue;
    const overCap = newPrimary.some(
      (a) => s.primaryCount[a] - (oldPrimary.includes(a) ? 1 : 0) + 1 > MAX_ITEMS_PER_AREA,
    );
    if (overCap) continue;
    s.remainingS += oldCost - newCost;
    for (const [a, w] of weightsOf(p.exercise)) s.projected[a] -= p.sets * w;
    for (const [a, w] of weightsOf(pick)) s.projected[a] += p.sets * w;
    for (const a of oldPrimary) s.primaryCount[a] -= 1;
    for (const a of newPrimary) s.primaryCount[a] += 1;
    p.previous = p.previous ?? p.exercise;
    p.exercise = pick;
  }
}

function assertShuffle(n: number): void {
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
    throw new RangeError(`shuffle must be an integer ≥ 0, got ${String(n)}`);
  }
}

/**
 * Rule 7.4, applied after selection. Low: every accessory at 3 sets goes to 2 and the freed
 * time stays unused; the main lift is untouched. High: when the time left (`remainingS`, i.e.
 * `unusedS`) covers one main-lift set, the main lift gets one back-off set. A timed main
 * lift has no reps, so it gets no back-off (D-0047).
 */
function applyEnergy(s: State, energy: SessionInput["energy"]): void {
  if (energy === "low") {
    for (const p of s.picked) {
      if (p.isMain || p.sets !== LOW_TRIM_FROM_SETS) continue;
      s.remainingS += (p.sets - LOW_TRIM_TO_SETS) * setCostS(p.exercise);
      p.sets = LOW_TRIM_TO_SETS;
      p.lowTrimmed = true;
    }
  } else if (energy === "high") {
    const main = s.picked.find((p) => p.isMain);
    if (main === undefined || main.exercise.timed) return;
    const cost = setCostS(main.exercise);
    if (s.remainingS < cost) return;
    main.backoff = true;
    s.remainingS -= cost;
  }
}

/** Rule 10 + D-0040 §6: ≤ 2 `recovering_skipped`, then first-primary `area_deficit`, ≤ 3. */
function sessionReasonsOf(start: Start, items: readonly WorkoutItem[]): Reason[] {
  const out: Reason[] = [];
  for (const a of AREAS) {
    if (out.length >= 2) break;
    if (start.recovering.has(a)) out.push({ code: "recovering_skipped", area: a });
  }
  const seen = new Set<Area>();
  for (const item of items) {
    if (out.length >= 3) break;
    const r = item.reasons.find((x) => x.code === "area_deficit");
    if (r === undefined || r.code !== "area_deficit" || seen.has(r.area)) continue;
    seen.add(r.area);
    out.push({ code: "area_deficit", area: r.area, deficit: r.deficit });
  }
  return out;
}

/**
 * Rule 7.2 candidate ranking for `area` at session start (R7-E7): the ids of the eligible
 * exercises with weight 1.0 there and no recovering primary area.
 */
export function rankCandidates(
  area: Area,
  history: readonly HistorySet[],
  targets: readonly AreaTarget[],
  profile: Pick<EngineProfile, "level" | "equipment">,
  library: readonly LibraryExercise[],
  sessionInput: Pick<SessionInput, "excludeIds">,
  now: Instant,
  tz: TimeZone,
): string[] {
  const start = buildStart(history, targets, profile, library, sessionInput.excludeIds, now, tz);
  return candidates(newState(start, 0), area).map((e) => e.id);
}

/**
 * The next workout (UF-08.1, UF-08.4; rules 7, 10). Pure: the same inputs give a
 * deep-equal result, inputs are never mutated, and history/library order doesn't matter.
 * Selection is main → pinned → greedy → shuffle (rule 13), then energy (rule 7.4, D-0056 §8).
 */
export function suggest(
  history: readonly HistorySet[],
  targets: readonly AreaTarget[],
  profile: Pick<EngineProfile, "level" | "equipment">,
  library: readonly LibraryExercise[],
  sessionInput: SessionInput,
  now: Instant,
  tz: TimeZone,
): Workout {
  assertBudget(sessionInput.budgetMin);
  assertShuffle(sessionInput.shuffle);
  const available = availableS(sessionInput.budgetMin, sessionInput.warmupInBudget);
  const start = buildStart(history, targets, profile, library, sessionInput.excludeIds, now, tz);
  const s = newState(start, Math.max(0, available));

  selectMain(s, sessionInput.mainLiftId);
  selectPinned(s, sessionInput.pinnedIds);
  selectGreedy(s);
  const lib = indexLibrary(library);
  applyShuffle(s, sessionInput.shuffle, sessionInput.pinnedIds, {
    lib,
    pool: start.pool,
    recovering: start.recovering,
    recentIds: start.recentIds,
    lastDone: lastDoneDates(history, lib, tz),
  });
  applyEnergy(s, sessionInput.energy);

  const items = s.picked.map((p) => toItem(start, p));
  const itemsTotalS = items.reduce((sum, i) => sum + i.costS, 0);
  const main = items.find((i) => i.isMain);
  return {
    plan: {
      version: 1,
      mainLiftId: main === undefined ? null : main.exerciseId,
      warmup: generateWarmup(
        items.map((i) => i.exerciseId),
        library,
      ),
      items,
      startDeficits: { ...start.deficits },
    },
    budgetMin: sessionInput.budgetMin,
    warmupInBudget: sessionInput.warmupInBudget,
    energy: sessionInput.energy,
    itemsTotalS,
    totalS: itemsTotalS + WARMUP_COST_S,
    unusedS: Math.max(0, available - itemsTotalS),
    sessionReasons: sessionReasonsOf(start, items),
  };
}
