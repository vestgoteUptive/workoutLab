// UF-08 Session setup host (T-0303a, D-0107 §1). One route, `/session/setup`, with the step in
// `?step=`. Setup state (minutes, warm-up, energy, the current `Workout`) lives here, so moving
// between steps is a push inside the same route and the host never remounts.
//
// - `/session/setup` and `?step=time` render UF-08.1.
// - `?step=suggested` renders UF-08.2 only once "Suggest my workout" has handed a `Workout` over.
//   A cold load of it, or of any other step, is replaced by `/session/setup` (no stale step in
//   history, principle 2).
//
// The fit line is the real on-device `suggest()` (principle 3), memoised on its inputs: the data
// object (which `useSetupData` keeps identical while its content is unchanged, D-0107 §3), the
// minutes, the warm-up toggle and the energy. It is only computed while UF-08.1 is on screen.
//
// UF-08.2 (T-0303b, D-0109 §1-§2). "Suggest my workout" freezes UF-08.1's `Workout` into the
// session record `{workout, shuffle: 0, excludeIds: []}`; a later cache re-read never swaps it.
// Shuffle and a time chip are exactly one `suggest` call each (Remove is the engine's `removeItem`, T-0521) with the inputs record
// `{budgetMin, warmupInBudget, energy, shuffle, mainLiftId, excludeIds}`, where `mainLiftId` is the
// current plan's (null only when the main item itself is removed). Leaving UF-08.2 for UF-08.1
// drops the record (the adjustments are discarded); `budgetMin` is shared and stays.
//
// T-0940 (D-0236, D-0237, D-0239): "Start empty" opens UF-08.2 in empty mode. The record's `mode`
// picks the plan call: empty mode is `suggest` with `autoMainLift: false, fill: false`,
// `pinnedIds = addedIds`, `mainLiftId = mainPickId` and `shuffle: 0`, so the plan holds only the
// picks. `mainPickId` is the main lift the user chose on this visit, in both modes; re-suggests read
// it from the record, never back from a plan that may have dropped it (D-0239 §1).
//
// T-0941 (D-0238, D-0239 §3): empty mode also lists suggestions (`computeSuggestions`): one `suggest`
// call with `fill: true` around the picks, a second only when a plan item is missing from it, none
// while the plan is over budget. "Other suggestions" bumps `shuffle` (suggestions only, no plan
// call); "Fill the rest for me" switches the visit to suggested mode with the picks kept.
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  AREAS,
  MAX_ITEMS,
  MAX_ITEMS_PER_AREA,
  balance,
  excludedOutAreas,
  homeAreaOf,
  insertItem,
  orderItems,
  primaryAreas,
  recoveringAreas,
  rankSwaps,
  applySwap,
  areaGroups,
  removeItem,
  suggest,
  type Area,
  type Energy,
  type SessionInput,
  type Workout,
  type WorkoutItem,
} from "@workoutlab/engine";
import { ArrowIcon, CrossIcon, TickIcon } from "../../components/icons/index.js";
import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";
import { useAuth } from "../../lib/auth/auth-context.js";
import { formatTime } from "../../lib/format/intl.js";
import { en } from "../../lib/i18n/en.js";
import { excludeExercise, excludeIdsFor, includeExercise } from "../../lib/offline/excluded.js";
import { useExcludedList, useOnline } from "../../lib/offline/excluded-hooks.js";
import { favoriteIdsFor } from "../../lib/offline/favorites.js";
import { useFavoriteList } from "../../lib/offline/favorites-hooks.js";
import { SwapSheet } from "../UF-05/index.js";
import { AreaDetail, type AddOutcome, type NotTodayLine } from "./AreaDetail.js";
import { AreaPlan, type AreaLoad } from "./AreaPlan.js";
import { blockedReasons } from "./blocked.js";
import { Ready } from "./Ready.js";
import {
  adjustSets,
  editContext,
  fillRest as fillAreas,
  overviewOf,
  putIn,
  takeOut,
  type PlanOverview,
} from "./area-plan-engine.js";
import { mergeOrder, permute } from "./order.js";
import { Suggested } from "./Suggested.js";
import {
  CHIPS,
  MAX_BUDGET,
  MIN_BUDGET,
  STEP_MIN,
  clampBudget,
  finishInstant,
  finishToBudget,
  parseBudget,
} from "./time.js";
import { useSetupData, type SetupData } from "./use-setup-data.js";
import { leftMinutes, overMinutes } from "./budget.js";
import { computeSuggestions, type SuggestionList } from "./suggestions.js";
import "./uf-08.css";

const SETUP_PATH = "/session/setup";
const ENERGIES = ["low", "normal", "high"] as const satisfies readonly Energy[];

export interface SessionSetupProps {
  /** Read once at mount (D-0107 §4). Defaults to the current time. */
  now?: Date | string;
  /**
   * UF-08.4's clock (D-0110 §1): read when Ready mounts (done by) and at the Start tap
   * (`started_at`), so setup time is never charged to the workout. Defaults to `new Date()`.
   */
  clock?: () => Date;
  /** Defaults to `navigator.language` when it is a string, else `"en-GB"`. */
  locale?: string;
  /** The `tz` given to `suggest` and `refreshAll`. Defaults to the device's zone. */
  timeZone?: string;
  /**
   * T-0996: renders UF-08.2 as the old exercise list (Reorder, Shuffle, empty-mode Suggestions).
   * The product never sets it: that list is unreachable. Tests of it keep running through this
   * flag until T-0998 deletes the code and those tests together.
   */
  legacyExerciseList?: boolean;
}

function defaultLocale(): string {
  // Shell tests stub `navigator` as `{onLine}` only, so read nothing else without a guard, and
  // never `navigator.languages`.
  if (typeof navigator !== "undefined" && typeof navigator.language === "string") {
    return navigator.language;
  }
  return "en-GB";
}

function defaultTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * UF-08.1's call is fixed at `shuffle: 0, mainLiftId: null`, with `excludeIds` = the stored list
 * (T-0538, D-0199 §6; the visit list is empty here). `pinnedIds` is a parameter so the later
 * add/reorder tickets (D-0205) can thread it through every call without reshaping them.
 */
function setupInput(
  budgetMin: number,
  warmupInBudget: boolean,
  energy: Energy,
  avoidAreas: readonly Area[],
  stored: readonly string[],
  favorites: readonly string[],
  pinnedIds: readonly string[] = [],
): SessionInput {
  return {
    budgetMin,
    warmupInBudget,
    energy,
    shuffle: 0,
    mainLiftId: null,
    pinnedIds: [...pinnedIds],
    excludeIds: excludeIdsFor(stored, []),
    // T-0571 (D-0202 §6): the stored favorites rank first within an area.
    favoriteIds: favoriteIdsFor(favorites),
    // T-0520 (D-0191): the engine does the skipping (rule 6.1); absent when nothing is skipped.
    ...(avoidAreas.length > 0 ? { avoidAreas } : {}),
  };
}

/** UF-08.2's adjustments on top of the shared minutes, warm-up and energy (D-0109 §1). */
interface Adjusted {
  /**
   * T-0940 (D-0236 §2): how this visit plans. "empty" (from "Start empty") holds only the picks;
   * "suggested" is the engine's full plan. Per visit: Back to UF-08.1 drops it with the record.
   */
  mode: "suggested" | "empty";
  /** The `Workout` on UF-08.2: UF-08.1's at hand-off, then each action's `suggest` result. */
  workout: Workout;
  shuffle: number;
  excludeIds: string[];
  /** T-0573 (D-0205 §1): exercises added on this visit, in add order; the engine's `pinnedIds`. */
  addedIds: string[];
  /** T-0576 (D-0205 §7): the user's display order of `workout.plan.items`; null = engine order. */
  order: string[] | null;
  /**
   * T-0935 (D-0235 §1): the ids in `excludeIds` that a UF-08.3 swap took out, not a Remove. They
   * stay out of every re-suggest like a remove, but the Removed line lists removes only.
   */
  swappedOut: string[];
  /**
   * T-0935 (D-0240 §2): the pins in `addedIds` the user did not add through UF-08.5: a swap-in, or
   * a main lift demoted by "Start with this". Pins for the engine, but not "Added by you".
   */
  unlabelledPins: string[];
  /**
   * T-0935/T-0940 (D-0239 §1-§2): the main lift the user chose on this visit (a main-lift swap or
   * "Start with this"); null when the engine picked it, and cleared by Remove of that item. Every
   * re-suggest passes it as `mainLiftId` (empty mode), or `mainPickId ?? plan.mainLiftId`
   * (suggested mode), so a time chip that drops it can't lose it. "Start with this" demotes it to
   * the front of the pins instead of returning it to the pool.
   */
  mainPickId: string | null;
  /** True while the plan is empty because Remove took the last row (T-0521, D-0191 §5). */
  emptiedByRemove: boolean;
  /**
   * T-0996 (D-0274 §3, D-0286 §2): the areas the user took out of the plan on this visit. They are
   * skipped for rebuilds like the UF-08.1 chips, but their "Add" puts them back. Per visit.
   */
  removedAreas: Area[];
}

/** A Not today the user can undo (T-0997, D-0275 §8): the pair, and what the swap overwrote. */
interface NotTodayEntry extends NotTodayLine {
  prev: {
    pinned: boolean;
    unlabelled: boolean;
    excluded: boolean;
    swapped: boolean;
    mainPickId: string | null;
  };
}

/**
 * T-0935 (D-0235): the swap is part of the visit record, so Add, Shuffle, a time chip and "Start
 * with this" keep it. The swap-in becomes a pin where the old id was pinned, else the last pin (a
 * non-main item); a main-lift swap-in is already `mainLiftId`. The swapped-out id is excluded for
 * the visit only, like a Remove (never stored here). T-0997: shared by UF-08.3 and "Not today".
 */
function recordSwap(adj: Adjusted, applied: Workout, old: WorkoutItem, swapIn: string): Adjusted {
  const out = old.exerciseId;
  const pins = adj.addedIds.filter((id) => id !== swapIn);
  const addedIds = pins.includes(out)
    ? pins.map((id) => (id === out ? swapIn : id))
    : old.isMain
      ? pins
      : [...pins, swapIn];
  const drop = (ids: readonly string[]) => ids.filter((e) => e !== swapIn && e !== out);
  return {
    ...adj,
    workout: applied,
    addedIds,
    excludeIds: [...drop(adj.excludeIds), out],
    swappedOut: [...drop(adj.swappedOut), out],
    unlabelledPins: addedIds.includes(swapIn)
      ? [...drop(adj.unlabelledPins), swapIn]
      : drop(adj.unlabelledPins),
    mainPickId: old.isMain ? swapIn : adj.mainPickId,
  };
}

/** The area an exercise is homed in once added (its first primary area, D-0287 §4). */
function homeOf(id: string, library: SetupData["library"]): Area | null {
  const ex = library.find((e) => e.id === id);
  return ex === undefined ? null : (primaryAreas(ex)[0] ?? null);
}

function runSuggest(
  data: SetupData,
  input: SessionInput,
  nowIso: string,
  timeZone: string,
): Workout | null {
  try {
    return suggest(data.history, data.targets, data.profile, data.library, input, nowIso, timeZone);
  } catch {
    // An engine rejection (an unknown goal, say) is shown as the no-profile state, never thrown.
    return null;
  }
}

/** n = items, m = Σ sets + the back-off sets (D-0065 §3). */
function fitLine(workout: Workout): string {
  const items = workout.plan.items;
  if (items.length === 0) return en.uf08.nothingFits(workout.budgetMin);
  const sets = items.reduce((sum, i) => sum + i.sets + (i.backoff ? 1 : 0), 0);
  return en.uf08.fits(items.length, sets);
}

/** `item` as a whole number in `[0, count)`, else null. */
function parseItem(raw: string | null, count: number): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n < count ? n : null;
}

function systemClock(): Date {
  return new Date();
}

export function SessionSetup({
  now,
  clock = systemClock,
  locale,
  timeZone,
  legacyExerciseList = false,
}: SessionSetupProps = {}) {
  const [nowIso] = useState(() => new Date(now ?? new Date()).toISOString());
  const [loc] = useState(() => locale ?? defaultLocale());
  const [tz] = useState(() => timeZone ?? defaultTimeZone());

  const [params] = useSearchParams();
  // T-0637: `?budget=N` is read once at mount (the UF-02.1 Quick 20-min link); later edits win.
  const [budgetMin, setBudgetMin] = useState(() => parseBudget(params.get("budget")));
  // T-0580: the swap on UF-08.3 landed but "Don't suggest again" did not save; UF-08.2 shows it.
  const [exclusionFailed, setExclusionFailed] = useState(false);
  const [warmupInBudget, setWarmupInBudget] = useState(true);
  const [energy, setEnergy] = useState<Energy>("normal");
  // "Skip today" (T-0520, D-0191 §1): held in this host, so Back keeps it and a remount clears it.
  const [avoid, setAvoid] = useState<ReadonlySet<Area>>(() => new Set());
  const avoidAreas = useMemo(() => AREAS.filter((a) => avoid.has(a)), [avoid]);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishValue, setFinishValue] = useState("");
  const [finishError, setFinishError] = useState(false);
  const [adjusted, setAdjusted] = useState<Adjusted | null>(null);
  const finishInput = useRef<HTMLInputElement>(null);
  const finishButton = useRef<HTMLButtonElement>(null);
  const finishWasOpen = useRef(finishOpen);

  // D-0115 §5 (WCAG 2.4.3): opening moves focus into "Finish by"; a conversion that closes it
  // moves focus back to "Set a finish time". Runs only when `finishOpen` flips, so the first
  // mount (and any other render) moves no focus. A rejected or partial value keeps it open.
  useEffect(() => {
    if (finishWasOpen.current === finishOpen) return;
    finishWasOpen.current = finishOpen;
    if (finishOpen) finishInput.current?.focus();
    else finishButton.current?.focus();
  }, [finishOpen]);

  const { status, userId } = useAuth();
  // T-0538 (D-0199 §6): the stored list joins every `suggest` call; offline it is the cache.
  const { ids: stored, loaded: storedLoaded } = useExcludedList(userId);
  const { ids: favoriteIds, loaded: favoritesLoaded } = useFavoriteList(userId);
  const online = useOnline();
  const state = useSetupData(nowIso, tz, status === "signed-in");
  const data = state.kind === "ready" ? state.data : null;

  const navigate = useNavigate();
  const step = params.get("step");
  const pastSetup = step === "suggested" || step === "ready" || step === "swap" || step === "area";
  // UF-08.3 (T-0303c): `?step=swap&item=n` with a current `Workout` and an item in range.
  const swapItem = parseItem(params.get("item"), adjusted?.workout.plan.items.length ?? 0);
  const showSwap = step === "swap" && adjusted !== null && swapItem !== null;
  const badSwap = step === "swap" && adjusted !== null && swapItem === null;
  // T-0997 (UF-08.6.md): `?step=area&area=` needs a plan (a cold load has none) and a known area.
  // A valid area the plan no longer holds is replaced by UF-08.2 with no message.
  const areaParam = params.get("area");
  const areaId = AREAS.find((a) => a === areaParam) ?? null;
  const areaHeld =
    step === "area" &&
    !legacyExerciseList &&
    adjusted !== null &&
    areaId !== null &&
    areaGroups(adjusted.workout).some((g) => g.area === areaId);
  const showArea = areaHeld;
  const badArea =
    step === "area" && !legacyExerciseList && adjusted !== null && areaId !== null && !areaHeld;
  const showSuggested = (step === "suggested" || badSwap || badArea) && adjusted !== null;
  const showReady = step === "ready" && adjusted !== null;
  const stale =
    step !== null && step !== "time" && !showSuggested && !showReady && !showSwap && !showArea;
  const [focusSwapItem, setFocusSwapItem] = useState<number | null>(null);
  // T-0997: the exercise whose Swap button takes focus when UF-08.6 returns from UF-08.3.
  const [focusSwapId, setFocusSwapId] = useState<string | null>(null);
  // T-0997: the Not today lines of this visit, the area UF-08.2 returns focus to, and the status
  // UF-08.2 opens with ("{Area} removed. Add it back below."). All per visit, never stored.
  const [notTodayLines, setNotTodayLines] = useState<NotTodayEntry[]>([]);
  const [returnFocus, setReturnFocus] = useState<{ area: Area; index: number } | null>(null);
  const [areaNotice, setAreaNotice] = useState("");

  // D-0109 §1: going back to UF-08.1 discards UF-08.2's adjustments. Keyed on the step changing
  // (not on `adjusted`), so the Suggest click's own render can't drop the record it just set.
  useEffect(() => {
    if (!pastSetup) {
      setAdjusted(null);
      setNotTodayLines([]);
      setReturnFocus(null);
      setAreaNotice("");
    }
  }, [pastSetup]);

  // Only UF-08.1 shows the fit line, so only UF-08.1 computes it: a time chip on UF-08.2 changes
  // the shared `budgetMin` and must not cost a second `suggest` call.
  const workout = useMemo(
    () =>
      data && !pastSetup && storedLoaded && favoritesLoaded
        ? runSuggest(
            data,
            setupInput(budgetMin, warmupInBudget, energy, avoidAreas, stored, favoriteIds),
            nowIso,
            tz,
          )
        : null,
    [
      data,
      pastSetup,
      storedLoaded,
      favoritesLoaded,
      budgetMin,
      warmupInBudget,
      energy,
      avoidAreas,
      stored,
      favoriteIds,
      nowIso,
      tz,
    ],
  );
  // The notice reads the stored list only (D-0199 §8): a Remove on this visit never shows it.
  const noticeAreas = useMemo(
    () => (data ? excludedOutAreas(data.profile, data.library, stored) : []),
    [data, stored],
  );
  // UF-08.5 row states 5-6 (T-0574): computed once per data and time, on the device.
  const recovering = useMemo(
    () => (data ? recoveringAreas(data.history, data.library, nowIso) : []),
    [data, nowIso],
  );
  // T-0941: the empty-mode Suggestions list. Keyed on what the calls read (not on `adjusted`'s
  // identity), so a Reorder or an unrelated state change never costs a `suggest` call.
  const planSig = adjusted
    ? `${adjusted.workout.plan.items.map((i) => i.exerciseId).join(",")}|${adjusted.workout.unusedS}|${adjusted.workout.itemsTotalS}`
    : "";
  const suggestions = useMemo<SuggestionList | null>(() => {
    // T-0996: the exercise Suggestions list belongs to the old list; the area plan makes no call.
    if (
      !showSuggested ||
      !legacyExerciseList ||
      adjusted === null ||
      adjusted.mode !== "empty" ||
      data === null
    ) {
      return null;
    }
    return computeSuggestions((input) => runSuggest(data, input, nowIso, tz), {
      base: {
        budgetMin,
        warmupInBudget,
        energy,
        shuffle: 0,
        mainLiftId: null,
        pinnedIds: [...adjusted.addedIds],
        excludeIds: excludeIdsFor(stored, adjusted.excludeIds),
        favoriteIds: favoriteIdsFor(favoriteIds),
        ...(avoidAreas.length > 0 ? { avoidAreas } : {}),
      },
      shuffle: adjusted.shuffle,
      mainPickId: adjusted.mainPickId,
      plan: adjusted.workout,
    });
    // `adjusted` is read through the listed fields and `planSig` only.
  }, [
    showSuggested,
    legacyExerciseList,
    data,
    adjusted?.mode,
    adjusted?.addedIds,
    adjusted?.excludeIds,
    adjusted?.mainPickId,
    adjusted?.shuffle,
    planSig,
    budgetMin,
    warmupInBudget,
    energy,
    avoidAreas,
    stored,
    favoriteIds,
    nowIso,
    tz,
  ]);
  // T-0996: the area plan's engine reads. `loads` is the 14-day history line of every row (rule
  // 11, on the device); `areaView` holds the edit context and the addable areas / refused + of the
  // current plan, recomputed when the plan changes only.
  const areaPlanOn =
    (showSuggested || showArea) && !legacyExerciseList && adjusted !== null && data !== null;
  const loads = useMemo<Readonly<Record<Area, AreaLoad>> | null>(() => {
    if (!areaPlanOn || data === null) return null;
    const result = balance(data.history, data.targets, data.library, nowIso, tz);
    return Object.fromEntries(
      result.areas.map((a) => [a.area, { load: a.load, target: a.target }]),
    ) as Record<Area, AreaLoad>;
  }, [areaPlanOn, data, nowIso, tz]);
  const areaView = useMemo(() => {
    if (!areaPlanOn || data === null || adjusted === null) return null;
    const ctx = editContext(data, {
      excludeIds: excludeIdsFor(stored, adjusted.excludeIds),
      favoriteIds: favoriteIdsFor(favoriteIds),
      avoidAreas,
      nowIso,
      tz,
    });
    let overview: PlanOverview;
    try {
      overview = overviewOf(adjusted.workout, ctx);
    } catch {
      overview = { candidates: [], stepRefusals: {} };
    }
    return { ctx, overview };
    // `adjusted` is read through its workout and exclusions only.
  }, [
    areaPlanOn,
    data,
    adjusted?.workout,
    adjusted?.excludeIds,
    stored,
    favoriteIds,
    avoidAreas,
    nowIso,
    tz,
  ]);
  const missing =
    state.kind === "missing" ||
    (data !== null && !pastSetup && storedLoaded && favoritesLoaded && workout === null);

  useEffect(() => {
    if (badSwap) void navigate(`${SETUP_PATH}?step=suggested`, { replace: true });
  }, [badSwap, navigate]);

  useEffect(() => {
    if (badArea) void navigate(`${SETUP_PATH}?step=suggested`, { replace: true });
  }, [badArea, navigate]);

  useEffect(() => {
    if (stale) void navigate(SETUP_PATH, { replace: true });
  }, [stale, navigate]);

  const ids = {
    energy: useId(),
    skip: useId(),
    skipHint: useId(),
    hint: useId(),
    finish: useId(),
    finishError: useId(),
    fit: useId(),
  };

  if (showReady) {
    // T-0996 (D-0275 §7): the plan is run, and written at Start, in the engine's automatic order.
    // `data === null` can't reach this branch: `adjusted` is only set once `data` was ready, and
    // `data` never goes back to null while the host stays mounted. It falls back to the plan as
    // held (already ordered by every UF-08.6 edit) rather than ordering without a library.
    const run =
      legacyExerciseList || data === null
        ? adjusted.workout
        : orderItems(adjusted.workout, data.library);
    return <Ready workout={run} clock={clock} locale={loc} timeZone={tz} />;
  }

  if (showSwap) {
    const leave = (applied: Workout | null) => {
      if (applied !== null) {
        // The swap-in takes the old item's place (SwapSheet replaces in place), so the order
        // is the new plan's own sequence.
        const order = adjusted.order === null ? null : applied.plan.items.map((i) => i.exerciseId);
        const old = adjusted.workout.plan.items[swapItem];
        const swapIn = applied.plan.items[swapItem]?.exerciseId;
        // T-0997 (D-0275 §7): every UF-08.6 change leaves the plan in `orderItems` order.
        const next =
          legacyExerciseList || data === null ? applied : orderItems(applied, data.library);
        if (old === undefined || swapIn === undefined || swapIn === old.exerciseId) {
          setAdjusted({ ...adjusted, workout: next, order });
        } else {
          setAdjusted({ ...recordSwap(adjusted, next, old, swapIn), order });
        }
        setFocusSwapId(swapIn ?? old?.exerciseId ?? null);
      }
      if (applied === null)
        setFocusSwapId(adjusted.workout.plan.items[swapItem]?.exerciseId ?? null);
      setFocusSwapItem(swapItem);
      void navigate(-1);
    };
    return (
      <SwapSheet
        workout={adjusted.workout}
        itemIndex={swapItem}
        timeZone={tz}
        onApply={(result, outcome) => {
          setExclusionFailed(outcome.exclusionFailed);
          leave(result);
        }}
        onClose={() => leave(null)}
      />
    );
  }

  if ((showSuggested || showArea) && data !== null) {
    const empty = adjusted.mode === "empty";
    // T-0996 (D-0191, D-0286 §2): a rebuild skips the UF-08.1 areas and the ones removed here.
    const skipAreas = AREAS.filter((a) => avoid.has(a) || adjusted.removedAreas.includes(a));
    const plan = adjusted.workout.plan;
    // D-0239 §13.1: only a UF-08.3 swap confirmed with `fitsBudget: false` gets here.
    const overMin = overMinutes(adjusted.workout);
    /**
     * Every UF-08.2 `suggest` call's inputs (D-0109 §2). Empty mode (D-0237, D-0239 §1) holds
     * only the picks: no auto main lift, no fill, no shuffle. Suggested mode is unchanged.
     */
    const inputFor = (
      o: {
        budgetMin: number;
        shuffle: number;
        excludeIds: readonly string[];
        pinnedIds: readonly string[];
        mainLiftId: string | null;
      },
      emptyCall = empty,
    ): SessionInput => ({
      budgetMin: o.budgetMin,
      warmupInBudget,
      energy,
      shuffle: emptyCall ? 0 : o.shuffle,
      mainLiftId: o.mainLiftId,
      pinnedIds: [...o.pinnedIds],
      excludeIds: excludeIdsFor(stored, o.excludeIds),
      favoriteIds: favoriteIdsFor(favoriteIds),
      ...(skipAreas.length > 0 ? { avoidAreas: skipAreas } : {}),
      ...(emptyCall ? { autoMainLift: false, fill: false } : {}),
    });
    // D-0239 §1: the record's main pick wins; suggested mode falls back to the plan's main lift.
    const mainLiftId = empty ? adjusted.mainPickId : (adjusted.mainPickId ?? plan.mainLiftId);
    const nameOf = (id: string) => data.library.find((e) => e.id === id)?.name ?? id;
    /**
     * The empty-mode safety net (D-0239 §2, §13.3): the first item of the current plan, in plan
     * order, that `result` no longer holds, or null when every item is kept.
     */
    const pushedOut = (result: Workout): string | null =>
      plan.items.find((i) => !result.plan.items.some((r) => r.exerciseId === i.exerciseId))
        ?.exerciseId ?? null;
    /** One `suggest` call with the inputs record (D-0109 §2); a rejection keeps the plan. */
    const resuggest = (change: { budgetMin?: number; shuffle?: number }): Workout | null => {
      const next = {
        budgetMin: change.budgetMin ?? budgetMin,
        shuffle: change.shuffle ?? adjusted.shuffle,
      };
      const result = runSuggest(
        data,
        inputFor({
          budgetMin: next.budgetMin,
          shuffle: next.shuffle,
          excludeIds: adjusted.excludeIds,
          pinnedIds: adjusted.addedIds,
          mainLiftId,
        }),
        nowIso,
        tz,
      );
      if (result === null) return null;
      if (next.budgetMin !== budgetMin) setBudgetMin(next.budgetMin);
      const merged = mergeOrder(adjusted.order, result);
      setAdjusted({
        mode: adjusted.mode,
        workout: merged.workout,
        shuffle: next.shuffle,
        excludeIds: adjusted.excludeIds,
        addedIds: adjusted.addedIds,
        order: merged.order,
        swappedOut: adjusted.swappedOut,
        unlabelledPins: adjusted.unlabelledPins,
        mainPickId: adjusted.mainPickId,
        emptiedByRemove: false,
        removedAreas: adjusted.removedAreas,
      });
      return merged.workout;
    };
    /**
     * T-0573 (D-0205 §1): one `suggest` call pinning `id` after this visit's adds. The engine
     * silently ignores a pin that does not fit, so the result is checked: null when `id` is in
     * the new plan (it becomes the plan), else the refusal text and nothing changes.
     */
    const addExercise = (id: string, asMain = false): string | null => {
      // D-0239 §13.1, D-0240 §4 (T-0943): an over-budget plan refuses before any call, in both
      // modes (a `fitsBudget: false` swap-in is the cause).
      if (overMin > 0) return en.uf08.overRefusal(overMin);
      // T-0941 (D-0239 §1): a suggestion tagged "Main lift" becomes `mainPickId`, not a pin.
      const pinned = asMain
        ? adjusted.addedIds.filter((a) => a !== id)
        : [...adjusted.addedIds.filter((a) => a !== id), id];
      const visit = adjusted.excludeIds.filter((e) => e !== id);
      const result = runSuggest(
        data,
        inputFor({
          budgetMin,
          shuffle: adjusted.shuffle,
          excludeIds: visit,
          pinnedIds: pinned,
          // T-0935 kept the plan's main lift here; D-0239 §1 reads the record first.
          mainLiftId: asMain ? id : mainLiftId,
        }),
        nowIso,
        tz,
      );
      if (result !== null && result.plan.items.some((i) => i.exerciseId === id)) {
        // D-0239 §13.3 (empty mode): the pick fits but pushes out a pick or the main lift.
        const pushed = empty ? pushedOut(result) : null;
        if (pushed !== null) return en.uf08.pushesOut(nameOf(id), nameOf(pushed));
        const merged = mergeOrder(adjusted.order, result);
        setAdjusted({
          mode: adjusted.mode,
          workout: merged.workout,
          shuffle: adjusted.shuffle,
          excludeIds: visit,
          addedIds: pinned,
          order: merged.order,
          // D-0235 §4: adding a swapped-out exercise back takes it out of the visit's exclusions.
          swappedOut: adjusted.swappedOut.filter((e) => e !== id),
          // An exercise the user adds is theirs, even if a swap had pinned it.
          unlabelledPins: adjusted.unlabelledPins.filter((e) => e !== id),
          mainPickId: asMain ? id : adjusted.mainPickId,
          emptiedByRemove: false,
          removedAreas: adjusted.removedAreas,
        });
        return null;
      }
      const ex = data.library.find((e) => e.id === id);
      const name = ex?.name ?? id;
      // Caps (D-0205 §4): main + added already hold 8, or two with the same primary area.
      const held = new Set(adjusted.addedIds);
      if (mainLiftId !== null) held.add(mainLiftId);
      held.delete(id);
      if (held.size >= MAX_ITEMS) return en.uf08.capItems(MAX_ITEMS);
      if (ex !== undefined) {
        for (const a of primaryAreas(ex)) {
          const n = [...held].filter((h) => {
            const lib = data.library.find((l) => l.id === h);
            return lib !== undefined && primaryAreas(lib).includes(a);
          }).length;
          if (n >= MAX_ITEMS_PER_AREA) return en.uf08.capArea(en.bodyMap.areas[a]);
        }
      }
      return ex?.type === "compound"
        ? en.uf08.noFitCompound(name, budgetMin)
        : en.uf08.noFitIsolation(name, budgetMin);
    };
    /**
     * T-0575 (D-0205 §5): one `suggest` call with `mainLiftId = id`. A new pick (not in the plan)
     * is pinned and leaves this visit's removes; a row already in the plan is not re-pinned (Q9).
     * Success is the engine's own `plan.mainLiftId === id`; otherwise the plan is unchanged.
     */
    const startWith = (id: string): string | null => {
      if (overMin > 0) return en.uf08.overRefusal(overMin);
      const inPlan = plan.items.some((i) => i.exerciseId === id);
      // Empty mode (D-0239 §2): X is the main lift, never a pin, so it leaves the pins.
      const base = empty
        ? adjusted.addedIds.filter((a) => a !== id)
        : inPlan || adjusted.addedIds.includes(id)
          ? adjusted.addedIds
          : [...adjusted.addedIds, id];
      // T-0935 (D-0239 §2): a main lift the user chose on this visit (a swap-in, an earlier Start
      // with this, or an added one) is demoted to the front of the pins; an engine pick still
      // returns to the pool in suggested mode (D-0205 §5). In empty mode every main lift is the
      // user's, so the previous one (the record's, even if a time chip dropped it) is kept.
      const prev = empty ? (adjusted.mainPickId ?? plan.mainLiftId) : plan.mainLiftId;
      const demoted =
        prev !== null &&
        prev !== id &&
        (empty || prev === adjusted.mainPickId || adjusted.addedIds.includes(prev))
          ? prev
          : null;
      const pinned = demoted === null ? base : [demoted, ...base.filter((p) => p !== demoted)];
      const visit = inPlan ? adjusted.excludeIds : adjusted.excludeIds.filter((e) => e !== id);
      const result = runSuggest(
        data,
        inputFor({
          budgetMin,
          shuffle: adjusted.shuffle,
          excludeIds: visit,
          pinnedIds: pinned,
          mainLiftId: id,
        }),
        nowIso,
        tz,
      );
      if (result !== null && result.plan.mainLiftId === id) {
        // D-0239 §2 safety net (empty mode): every pick, the old main lift included, must stay.
        const pushed = empty ? pushedOut(result) : null;
        if (pushed !== null) return en.uf08.pushesOut(nameOf(id), nameOf(pushed));
        const merged = mergeOrder(adjusted.order, result, true);
        setAdjusted({
          mode: adjusted.mode,
          // T-0997 (D-0275 §7): the area plan keeps `orderItems` order, the main lift first.
          workout: legacyExerciseList ? merged.workout : orderItems(merged.workout, data.library),
          shuffle: adjusted.shuffle,
          excludeIds: visit,
          addedIds: pinned,
          order: merged.order,
          swappedOut: inPlan ? adjusted.swappedOut : adjusted.swappedOut.filter((e) => e !== id),
          unlabelledPins:
            !empty && demoted !== null && !adjusted.addedIds.includes(demoted)
              ? [...adjusted.unlabelledPins, demoted]
              : adjusted.unlabelledPins,
          mainPickId: id,
          emptiedByRemove: false,
          removedAreas: adjusted.removedAreas,
        });
        return null;
      }
      return en.uf08.noFitStart(nameOf(id), budgetMin);
    };
    /**
     * T-0941 (D-0236 §6, D-0242 §1): the one-way switch to suggested mode, `pinnedIds = addedIds`,
     * `mainLiftId = mainPickId`. Over budget it is refused like Shuffle (D-0240 §4).
     */
    const fillRest = (): string | null => {
      if (overMin > 0) return en.uf08.overRefusal(overMin);
      const result = runSuggest(
        data,
        inputFor(
          {
            budgetMin,
            shuffle: adjusted.shuffle,
            excludeIds: adjusted.excludeIds,
            pinnedIds: adjusted.addedIds,
            mainLiftId: adjusted.mainPickId,
          },
          false,
        ),
        nowIso,
        tz,
      );
      if (result === null) return en.uf08.missing;
      const merged = mergeOrder(adjusted.order, result);
      setAdjusted({ ...adjusted, mode: "suggested", workout: merged.workout, order: merged.order });
      return null;
    };
    const blocked = blockedReasons(data, stored, avoidAreas, recovering);
    const keptIds = [
      // D-0239 §1: a dropped main pick is named like a pin; in empty mode every pick is.
      ...(adjusted.mainPickId !== null ? [adjusted.mainPickId] : []),
      // D-0240 §3 (T-0943): a dropped swap-in is named too, so it is never silently gone.
      ...adjusted.addedIds,
    ].filter((id, i, all) => all.indexOf(id) === i);
    if (showArea && areaId !== null && !legacyExerciseList && loads !== null) {
      const lib = data.library;
      const hold = (workout: Workout, patch: Partial<Adjusted> = {}) =>
        setAdjusted({
          ...adjusted,
          workout: orderItems(workout, lib),
          emptiedByRemove: false,
          ...patch,
        });
      const itemOf = (id: string) => adjusted.workout.plan.items.find((i) => i.exerciseId === id);
      const without = <T extends string>(ids: readonly T[], id: string): T[] =>
        ids.filter((e) => e !== id);
      return (
        <AreaDetail
          area={areaId}
          workout={adjusted.workout}
          catalog={lib}
          locale={loc}
          timeZone={tz}
          load={loads[areaId]}
          favoriteIds={favoriteIds}
          favoritesLoaded={favoritesLoaded}
          addedIds={adjusted.addedIds.filter((a) => !adjusted.unlabelledPins.includes(a))}
          notToday={notTodayLines}
          removedIds={adjusted.excludeIds.filter(
            (e) => !adjusted.swappedOut.includes(e) && homeOf(e, lib) === areaId,
          )}
          storedIds={stored}
          online={online}
          exclusionFailed={exclusionFailed}
          onExclude={userId ? (id) => excludeExercise(userId, id) : undefined}
          onInclude={userId ? (id) => includeExercise(userId, id) : undefined}
          blocked={blocked}
          focusSwap={focusSwapId}
          onFocused={() => setFocusSwapId(null)}
          onSwap={(id) => {
            const index = adjusted.workout.plan.items.findIndex((i) => i.exerciseId === id);
            if (index >= 0) void navigate(`${SETUP_PATH}?step=swap&item=${index}`);
          }}
          onNotToday={(id) => {
            // D-0275 §8: `rankSwaps` for "equipment taken", the first candidate, `applySwap`. The
            // old one is excluded for this visit only and nothing is stored (no learned preference).
            const old = itemOf(id);
            if (old === undefined) return null;
            try {
              const first = rankSwaps(
                id,
                "equipment_taken",
                adjusted.workout,
                data.profile,
                lib,
                data.history,
                nowIso,
                tz,
                excludeIdsFor(stored, adjusted.excludeIds),
              )[0];
              if (first === undefined) return null;
              const applied = applySwap(
                adjusted.workout,
                id,
                first.exerciseId,
                "equipment_taken",
                data.history,
                data.profile,
                lib,
                nowIso,
                tz,
              );
              const next = orderItems(applied, lib);
              setAdjusted({
                ...recordSwap(adjusted, next, old, first.exerciseId),
                emptiedByRemove: false,
              });
              setNotTodayLines((lines) => [
                ...lines.filter((l) => l.newId !== id),
                {
                  oldId: id,
                  newId: first.exerciseId,
                  prev: {
                    pinned: adjusted.addedIds.includes(id),
                    unlabelled: adjusted.unlabelledPins.includes(id),
                    excluded: adjusted.excludeIds.includes(id),
                    swapped: adjusted.swappedOut.includes(id),
                    mainPickId: adjusted.mainPickId,
                  },
                },
              ]);
              // D-0287 §4: the replacement may be homed in another area (back-squat is Glutes). If
              // this area has nothing left, UF-08.2 opens and says what happened.
              if (!areaGroups(next).some((g) => g.area === areaId)) {
                setAreaNotice(
                  en.uf08.replacedBy(
                    lib.find((e) => e.id === id)?.name ?? id,
                    lib.find((e) => e.id === first.exerciseId)?.name ?? first.exerciseId,
                  ),
                );
                void navigate(`${SETUP_PATH}?step=suggested`, { replace: true });
              }
              return first.exerciseId;
            } catch {
              return null;
            }
          }}
          onUndoNotToday={(line) => {
            const entry = notTodayLines.find((l) => l.newId === line.newId);
            if (entry === undefined) return;
            try {
              const restored = orderItems(
                applySwap(
                  adjusted.workout,
                  entry.newId,
                  entry.oldId,
                  null,
                  data.history,
                  data.profile,
                  lib,
                  nowIso,
                  tz,
                ),
                lib,
              );
              const { prev } = entry;
              const wasMain = itemOf(entry.newId)?.isMain === true;
              hold(restored, {
                addedIds: prev.pinned
                  ? adjusted.addedIds.map((a) => (a === entry.newId ? entry.oldId : a))
                  : without(adjusted.addedIds, entry.newId),
                unlabelledPins: [
                  ...without(adjusted.unlabelledPins, entry.newId),
                  ...(prev.unlabelled ? [entry.oldId] : []),
                ],
                excludeIds: prev.excluded
                  ? adjusted.excludeIds
                  : without(adjusted.excludeIds, entry.oldId),
                swappedOut: prev.swapped
                  ? adjusted.swappedOut
                  : without(adjusted.swappedOut, entry.oldId),
                mainPickId: wasMain ? prev.mainPickId : adjusted.mainPickId,
              });
              setNotTodayLines((lines) => lines.filter((l) => l.newId !== entry.newId));
            } catch {
              // The plan stays as it is; the line stays so the user can try again.
            }
          }}
          onRemove={(id) => {
            // D-0191 §4: `removeItem`, no refill, and nothing stored; the id is out for this visit.
            let next: Workout;
            try {
              next = removeItem(adjusted.workout, id);
            } catch {
              return "failed";
            }
            const ordered = orderItems(next, lib);
            const last = !areaGroups(ordered).some((g) => g.area === areaId);
            hold(ordered, {
              order: adjusted.order?.filter((e) => e !== id) ?? null,
              excludeIds: [...adjusted.excludeIds, id],
              swappedOut: without(adjusted.swappedOut, id),
              unlabelledPins: without(adjusted.unlabelledPins, id),
              mainPickId: adjusted.mainPickId === id ? null : adjusted.mainPickId,
              addedIds: without(adjusted.addedIds, id),
              ...(last
                ? { removedAreas: [...adjusted.removedAreas.filter((a) => a !== areaId), areaId] }
                : {}),
            });
            setNotTodayLines((lines) => lines.filter((l) => l.newId !== id));
            if (!last) return "ok";
            // The page returns to UF-08.2 (REPLACE, so Back doesn't return to an empty area).
            setAreaNotice(en.uf08.areaRemoved(en.bodyMap.areas[areaId]));
            void navigate(`${SETUP_PATH}?step=suggested`, { replace: true });
            return "last";
          }}
          onStartWith={(id) => {
            const refusal = startWith(id);
            if (refusal === null) setNotTodayLines((lines) => lines.filter((l) => l.newId !== id));
            return refusal;
          }}
          onAdd={(id): AddOutcome => {
            // D-0274 §5: local. `insertItem` with `leftS = unusedS` at the end; nothing else in the
            // plan is rebuilt, so no other area can change. The id is pinned for this visit.
            if (overMin > 0) return { refused: en.uf08.overRefusal(overMin) };
            const ex = lib.find((e) => e.id === id);
            if (ex === undefined)
              return { refused: en.uf08.noFitIsolation(id, leftMinutes(adjusted.workout)) };
            for (const a of primaryAreas(ex)) {
              const n = adjusted.workout.plan.items.filter((i) => {
                const l = lib.find((e) => e.id === i.exerciseId);
                return l !== undefined && primaryAreas(l).includes(a);
              }).length;
              if (n >= MAX_ITEMS_PER_AREA) return { refused: en.uf08.capArea(en.bodyMap.areas[a]) };
            }
            const left = leftMinutes(adjusted.workout);
            let result: ReturnType<typeof insertItem>;
            try {
              result = insertItem(
                adjusted.workout,
                id,
                { atIndex: adjusted.workout.plan.items.length, leftS: adjusted.workout.unusedS },
                data.history,
                data.profile,
                lib,
                nowIso,
                tz,
              );
            } catch {
              return { refused: en.uf08.noFitIsolation(ex.name, left) };
            }
            if ("refused" in result) {
              return {
                refused:
                  result.refused === "items_cap"
                    ? en.uf08.capItems(MAX_ITEMS)
                    : ex.type === "compound"
                      ? en.uf08.noFitCompound(ex.name, left)
                      : en.uf08.noFitIsolation(ex.name, left),
              };
            }
            const before = areaGroups(adjusted.workout).map((g) => g.area);
            const added = result.workout.plan.items.find((i) => i.exerciseId === id);
            const homeArea = added === undefined ? null : homeAreaOf(added);
            hold(result.workout, {
              addedIds: [...without(adjusted.addedIds, id), id],
              excludeIds: without(adjusted.excludeIds, id),
              swappedOut: without(adjusted.swappedOut, id),
              unlabelledPins: without(adjusted.unlabelledPins, id),
              removedAreas:
                homeArea === null
                  ? adjusted.removedAreas
                  : without(adjusted.removedAreas, homeArea),
            });
            return {
              added: true,
              homeArea,
              areaWasNew: homeArea !== null && !before.includes(homeArea),
              left: leftMinutes(result.workout),
            };
          }}
        />
      );
    }
    if (!legacyExerciseList && areaView !== null && loads !== null) {
      const { ctx, overview } = areaView;
      const commit = (workout: Workout, patch: Partial<Adjusted> = {}) =>
        setAdjusted({ ...adjusted, workout, emptiedByRemove: false, ...patch });
      return (
        <AreaPlan
          mode={adjusted.mode}
          workout={adjusted.workout}
          library={data.library}
          locale={loc}
          timeZone={tz}
          clock={clock}
          loads={loads}
          overview={overview}
          avoidAreas={avoidAreas}
          removedAreas={adjusted.removedAreas}
          noticeAreas={noticeAreas}
          keptIds={keptIds}
          exclusionFailed={exclusionFailed}
          onAdjust={(area, delta) => {
            // D-0275 §3: one engine call. Over budget refuses a + before it is asked (D-0274 §9).
            if (delta === 1 && overMin > 0) return { refused: "time" };
            const result = adjustSets(adjusted.workout, area, delta, ctx);
            if ("workout" in result) commit(result.workout);
            return result;
          }}
          onRemoveArea={(area) => {
            const result = takeOut(adjusted.workout, area);
            if ("workout" in result) {
              // D-0274 §3: the area joins this visit's skipped areas, so a rebuild keeps it out.
              commit(result.workout, {
                removedAreas: [...adjusted.removedAreas.filter((a) => a !== area), area],
              });
            }
            return result;
          }}
          onAddArea={(area) => {
            const result = putIn(adjusted.workout, area, ctx);
            if ("workout" in result) {
              commit(result.workout, {
                removedAreas: adjusted.removedAreas.filter((a) => a !== area),
              });
            }
            return result;
          }}
          onFillRest={() => {
            const result = fillAreas(adjusted.workout, ctx, adjusted.removedAreas);
            if (result.added.length > 0) commit(result.workout);
            return result;
          }}
          onBudget={(m) => resuggest({ budgetMin: m })}
          initialStatus={areaNotice}
          focusArea={returnFocus}
          onFocused={() => {
            setReturnFocus(null);
            setAreaNotice("");
          }}
          onOpenArea={(area, index) => {
            setReturnFocus({ area, index });
            void navigate(`${SETUP_PATH}?step=area&area=${area}`);
          }}
        />
      );
    }
    return (
      <Suggested
        mode={adjusted.mode}
        workout={adjusted.workout}
        library={data.library}
        locale={loc}
        avoidAreas={avoidAreas}
        emptiedByRemove={adjusted.emptiedByRemove}
        noticeAreas={noticeAreas}
        removedIds={adjusted.excludeIds.filter((e) => !adjusted.swappedOut.includes(e))}
        storedIds={stored}
        online={online}
        exclusionFailed={exclusionFailed}
        onExclude={userId ? (id) => excludeExercise(userId, id) : undefined}
        onInclude={userId ? (id) => includeExercise(userId, id) : undefined}
        onRemove={(exerciseId) => {
          // T-0521 (D-0191 §4): no `suggest` call. The engine drops the row and refills nothing;
          // the id joins `excludeIds`, so a later Shuffle or time chip can't bring it back.
          let next: Workout;
          try {
            next = removeItem(adjusted.workout, exerciseId);
          } catch {
            return false;
          }
          setAdjusted({
            ...adjusted,
            workout: next,
            order: adjusted.order?.filter((id) => id !== exerciseId) ?? null,
            excludeIds: [...adjusted.excludeIds, exerciseId],
            swappedOut: adjusted.swappedOut.filter((e) => e !== exerciseId),
            unlabelledPins: adjusted.unlabelledPins.filter((e) => e !== exerciseId),
            mainPickId: adjusted.mainPickId === exerciseId ? null : adjusted.mainPickId,
            // A removed exercise is no longer a pin (D-0205 §6), or a re-suggest would list it.
            addedIds: adjusted.addedIds.filter((a) => a !== exerciseId),
            emptiedByRemove: next.plan.items.length === 0,
          });
          return true;
        }}
        onShuffle={() => {
          // D-0240 §4 (T-0943): refused in the status line while the plan is over budget.
          if (overMin > 0) return en.uf08.overRefusal(overMin);
          resuggest({ shuffle: adjusted.shuffle + 1 });
          return null;
        }}
        {...(empty && suggestions !== null
          ? {
              suggestions,
              onAddSuggestion: (id: string, asMain: boolean) => addExercise(id, asMain),
              // Suggestions only: the picks and the plan are untouched (D-0238 §7).
              onOtherSuggestions: () => setAdjusted({ ...adjusted, shuffle: adjusted.shuffle + 1 }),
              onFillRest: fillRest,
            }
          : {})}
        onBudget={(m) => resuggest({ budgetMin: m })}
        focusSwapItem={focusSwapItem}
        onSwapFocused={() => setFocusSwapItem(null)}
        addedIds={adjusted.addedIds.filter((a) => !adjusted.unlabelledPins.includes(a))}
        keptIds={keptIds}
        catalog={data.library}
        blocked={blocked}
        favoriteIds={favoriteIds}
        favoritesLoaded={favoritesLoaded}
        onAdd={addExercise}
        onStartWith={startWith}
        onMove={(exerciseId, delta) => {
          // T-0576: a display permutation only; no `suggest` call, totals unchanged.
          const ids = adjusted.workout.plan.items.map((i) => i.exerciseId);
          const from = ids.indexOf(exerciseId);
          const to = from + delta;
          if (from < 0 || to < 0 || to >= ids.length) return;
          ids.splice(to, 0, ...ids.splice(from, 1));
          setAdjusted({
            ...adjusted,
            workout: permute(adjusted.workout, ids),
            order: ids,
          });
        }}
      />
    );
  }

  const stepBy = (delta: number) => {
    const next = clampBudget(budgetMin + delta);
    if (next !== budgetMin) setBudgetMin(next);
  };

  const onFinishChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setFinishValue(value);
    const result = finishToBudget(value, nowIso, tz);
    if (result.kind === "partial") {
      setFinishError(false);
      return;
    }
    if (result.kind === "rejected") {
      setFinishError(true);
      return;
    }
    setFinishError(false);
    setFinishOpen(false);
    setFinishValue("");
    setBudgetMin(result.budgetMin);
  };

  const onSuggest = () => {
    if (workout === null) return;
    // Frozen here: UF-08.2 starts from exactly this `Workout` (reference-equal, no new call).
    setAdjusted({
      mode: "suggested",
      workout,
      shuffle: 0,
      excludeIds: [],
      addedIds: [],
      order: null,
      swappedOut: [],
      unlabelledPins: [],
      mainPickId: null,
      emptiedByRemove: false,
      removedAreas: [],
    });
    void navigate(`${SETUP_PATH}?step=suggested`);
  };

  // T-0940 (D-0236 §1-§3, D-0237): the same UF-08.1 inputs, but the plan holds only the picks, so
  // it starts with 0 items (the warm-up still counts when it is in the budget).
  const onStartEmpty = () => {
    if (workout === null || data === null) return;
    const empty = runSuggest(
      data,
      {
        ...setupInput(budgetMin, warmupInBudget, energy, avoidAreas, stored, favoriteIds),
        autoMainLift: false,
        fill: false,
      },
      nowIso,
      tz,
    );
    if (empty === null) return;
    setAdjusted({
      mode: "empty",
      workout: empty,
      shuffle: 0,
      excludeIds: [],
      addedIds: [],
      order: null,
      swappedOut: [],
      unlabelledPins: [],
      mainPickId: null,
      emptiedByRemove: false,
      removedAreas: [],
    });
    void navigate(`${SETUP_PATH}?step=suggested`);
  };

  const atMin = budgetMin <= MIN_BUDGET;
  const atMax = budgetMin >= MAX_BUDGET;
  const ready = workout !== null;

  return (
    <div data-screen-id="UF-08.1" data-wl-state="plan" className="wl-uf08 wl-page">
      <div className="wl-uf08__top">
        <Link to="/" className="wl-uf08__close" aria-label={en.uf08.close}>
          <CrossIcon />
        </Link>
        <OfflineStatus variant="icon" locale={loc} timeZone={tz} />
      </div>
      <h1 className="wl-uf08__title">{en.uf08.title}</h1>

      {missing ? (
        <div className="wl-uf08__missing">
          <p>{en.uf08.missing}</p>
          <Link to="/" className="wl-button--text">
            {en.uf08.missingLink}
          </Link>
        </div>
      ) : (
        <>
          <div className="wl-card wl-uf08__card">
            <div className="wl-uf08__stepper">
              <button
                type="button"
                className="wl-uf08__step"
                aria-label={en.uf08.minutesLess}
                aria-disabled={atMin ? "true" : "false"}
                onClick={() => {
                  if (!atMin) stepBy(-STEP_MIN);
                }}
              >
                <span aria-hidden="true">−</span>
              </button>
              <div className="wl-uf08__value">
                <span className="wl-uf08__minutes wl-type-hero" data-part="minutes">
                  {budgetMin}
                </span>
                <span className="wl-uf08__unit wl-type-label">{en.uf08.minutesUnit}</span>
                <span className="wl-uf08__done-by wl-type-label" data-part="done-by">
                  {en.uf08.doneBy(
                    formatTime(finishInstant(nowIso, budgetMin), { locale: loc, timeZone: tz }),
                  )}
                </span>
              </div>
              <button
                type="button"
                className="wl-uf08__step"
                aria-label={en.uf08.minutesMore}
                aria-disabled={atMax ? "true" : "false"}
                onClick={() => {
                  if (!atMax) stepBy(STEP_MIN);
                }}
              >
                <span aria-hidden="true">+</span>
              </button>
            </div>

            <div className="wl-uf08__chips" role="group" aria-label={en.uf08.chipsName}>
              {CHIPS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="wl-chip wl-uf08__chip"
                  aria-label={en.uf08.chipName(String(m))}
                  aria-pressed={budgetMin === m ? "true" : "false"}
                  onClick={() => setBudgetMin(m)}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="wl-uf08__finish">
              {finishOpen ? (
                <>
                  <label htmlFor={ids.finish} className="wl-uf08__label wl-type-label">
                    {en.uf08.finishBy}
                  </label>
                  <input
                    ref={finishInput}
                    id={ids.finish}
                    type="time"
                    className="wl-input wl-uf08__time"
                    value={finishValue}
                    onChange={onFinishChange}
                    aria-invalid={finishError ? "true" : "false"}
                    aria-describedby={finishError ? ids.finishError : undefined}
                  />
                  {finishError ? (
                    <p id={ids.finishError} className="wl-input__error wl-uf08__error">
                      {en.uf08.finishRejected}
                    </p>
                  ) : null}
                </>
              ) : (
                <button
                  ref={finishButton}
                  type="button"
                  className="wl-button--text"
                  onClick={() => {
                    setFinishOpen(true);
                    setFinishValue("");
                    setFinishError(false);
                  }}
                >
                  {en.uf08.setFinishTime}
                </button>
              )}
            </div>

            <label className="wl-toggle wl-uf08__toggle">
              <span>{en.uf08.warmupToggle}</span>
              <input
                type="checkbox"
                checked={warmupInBudget}
                onChange={(e) => setWarmupInBudget(e.target.checked)}
              />
            </label>
          </div>

          <div
            role="radiogroup"
            aria-labelledby={ids.energy}
            aria-describedby={ids.hint}
            className="wl-uf08__energy"
          >
            <p id={ids.energy} className="wl-uf08__label">
              {en.uf08.energyName}
            </p>
            <div className="wl-segmented">
              {ENERGIES.map((e) => (
                <label key={e} data-energy={e}>
                  <input
                    type="radio"
                    name="wl-uf08-energy"
                    value={e}
                    checked={energy === e}
                    onChange={() => setEnergy(e)}
                  />
                  <span>{en.uf08.energy[e]}</span>
                </label>
              ))}
            </div>
            <p id={ids.hint} className="wl-uf08__hint">
              {en.uf08.energyHint[energy]}
            </p>
          </div>

          <div
            role="group"
            aria-labelledby={ids.skip}
            aria-describedby={ids.skipHint}
            className="wl-uf08__skip"
          >
            <p id={ids.skip} className="wl-uf08__label">
              {en.uf08.skipName}
            </p>
            <p id={ids.skipHint} className="wl-uf08__hint">
              {en.uf08.skipHint}
            </p>
            <div className="wl-uf08__skip-chips">
              {AREAS.map((a) => (
                <button
                  key={a}
                  type="button"
                  className="wl-chip wl-uf08__skip-chip"
                  data-area={a}
                  aria-pressed={avoid.has(a) ? "true" : "false"}
                  onClick={() =>
                    setAvoid((prev) => {
                      const next = new Set(prev);
                      if (!next.delete(a)) next.add(a);
                      return next;
                    })
                  }
                >
                  <TickIcon size={16} className="wl-chip__tick" />
                  {en.bodyMap.areas[a]}
                </button>
              ))}
            </div>
          </div>

          <p id={ids.fit} className="wl-uf08__fit" data-part="fit-line" aria-live="polite">
            {workout ? fitLine(workout) : en.uf08.checking}
          </p>

          <button
            type="button"
            className="wl-button--primary wl-uf08__primary"
            aria-disabled={ready ? "false" : "true"}
            aria-describedby={ready ? undefined : ids.fit}
            onClick={onSuggest}
          >
            <span>{en.uf08.suggest}</span>
            <ArrowIcon />
          </button>
          <button
            type="button"
            className="wl-button--secondary wl-uf08__secondary"
            data-part="start-empty"
            aria-disabled={ready ? "false" : "true"}
            aria-describedby={ready ? undefined : ids.fit}
            onClick={onStartEmpty}
          >
            {en.uf08.startEmpty}
          </button>
        </>
      )}
    </div>
  );
}
