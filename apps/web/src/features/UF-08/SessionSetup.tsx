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
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  AREAS,
  MAX_ITEMS,
  MAX_ITEMS_PER_AREA,
  excludedOutAreas,
  isEligible,
  primaryAreas,
  recoveringAreas,
  removeItem,
  suggest,
  type Area,
  type Energy,
  type SessionInput,
  type Workout,
} from "@workoutlab/engine";
import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";
import { useAuth } from "../../lib/auth/auth-context.js";
import { formatTime } from "../../lib/format/intl.js";
import { en } from "../../lib/i18n/en.js";
import { excludeExercise, excludeIdsFor, includeExercise } from "../../lib/offline/excluded.js";
import { useExcludedList, useOnline } from "../../lib/offline/excluded-hooks.js";
import { favoriteIdsFor } from "../../lib/offline/favorites.js";
import { useFavoriteList } from "../../lib/offline/favorites-hooks.js";
import { SwapSheet } from "../UF-05/index.js";
import { Ready } from "./Ready.js";
import { mergeOrder, permute } from "./order.js";
import { Suggested } from "./Suggested.js";
import {
  CHIPS,
  DEFAULT_BUDGET,
  MAX_BUDGET,
  MIN_BUDGET,
  STEP_MIN,
  clampBudget,
  finishInstant,
  finishToBudget,
} from "./time.js";
import { useSetupData, type SetupData } from "./use-setup-data.js";
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
  /** The `Workout` on UF-08.2: UF-08.1's at hand-off, then each action's `suggest` result. */
  workout: Workout;
  shuffle: number;
  excludeIds: string[];
  /** T-0573 (D-0205 §1): exercises added on this visit, in add order; the engine's `pinnedIds`. */
  addedIds: string[];
  /** T-0576 (D-0205 §7): the user's display order of `workout.plan.items`; null = engine order. */
  order: string[] | null;
  /** True while the plan is empty because Remove took the last row (T-0521, D-0191 §5). */
  emptiedByRemove: boolean;
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
}: SessionSetupProps = {}) {
  const [nowIso] = useState(() => new Date(now ?? new Date()).toISOString());
  const [loc] = useState(() => locale ?? defaultLocale());
  const [tz] = useState(() => timeZone ?? defaultTimeZone());

  const [budgetMin, setBudgetMin] = useState(DEFAULT_BUDGET);
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

  const [params] = useSearchParams();
  const navigate = useNavigate();
  const step = params.get("step");
  const pastSetup = step === "suggested" || step === "ready" || step === "swap";
  // UF-08.3 (T-0303c): `?step=swap&item=n` with a current `Workout` and an item in range.
  const swapItem = parseItem(params.get("item"), adjusted?.workout.plan.items.length ?? 0);
  const showSwap = step === "swap" && adjusted !== null && swapItem !== null;
  const badSwap = step === "swap" && adjusted !== null && swapItem === null;
  const showSuggested = (step === "suggested" || badSwap) && adjusted !== null;
  const showReady = step === "ready" && adjusted !== null;
  const stale = step !== null && step !== "time" && !showSuggested && !showReady && !showSwap;
  const [focusSwapItem, setFocusSwapItem] = useState<number | null>(null);

  // D-0109 §1: going back to UF-08.1 discards UF-08.2's adjustments. Keyed on the step changing
  // (not on `adjusted`), so the Suggest click's own render can't drop the record it just set.
  useEffect(() => {
    if (!pastSetup) setAdjusted(null);
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
  const missing =
    state.kind === "missing" ||
    (data !== null && !pastSetup && storedLoaded && favoritesLoaded && workout === null);

  useEffect(() => {
    if (badSwap) void navigate(`${SETUP_PATH}?step=suggested`, { replace: true });
  }, [badSwap, navigate]);

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
    warmup: useId(),
  };

  if (showReady) {
    return <Ready workout={adjusted.workout} clock={clock} locale={loc} timeZone={tz} />;
  }

  if (showSwap) {
    const leave = (applied: Workout | null) => {
      if (applied !== null) {
        // A swap that replaced an added exercise takes it off the pins; it is no longer in the plan.
        const had = (id: string) => adjusted.workout.plan.items.some((i) => i.exerciseId === id);
        const has = (id: string) => applied.plan.items.some((i) => i.exerciseId === id);
        // The swap-in takes the old item's place (SwapSheet replaces in place), so the order
        // is the new plan's own sequence.
        setAdjusted({
          ...adjusted,
          workout: applied,
          order: adjusted.order === null ? null : applied.plan.items.map((i) => i.exerciseId),
          addedIds: adjusted.addedIds.filter((id) => !(had(id) && !has(id))),
        });
      }
      setFocusSwapItem(swapItem);
      void navigate(-1);
    };
    return (
      <SwapSheet
        workout={adjusted.workout}
        itemIndex={swapItem}
        timeZone={tz}
        onApply={(result) => leave(result)}
        onClose={() => leave(null)}
      />
    );
  }

  if (showSuggested && data !== null) {
    /** One `suggest` call with the inputs record (D-0109 §2); a rejection keeps the plan. */
    const resuggest = (change: {
      budgetMin?: number;
      shuffle?: number;
      excludeIds?: string[];
      mainLiftId?: string | null;
    }): boolean => {
      const next = {
        budgetMin: change.budgetMin ?? budgetMin,
        shuffle: change.shuffle ?? adjusted.shuffle,
        excludeIds: change.excludeIds ?? adjusted.excludeIds,
      };
      const mainLiftId =
        change.mainLiftId === undefined ? adjusted.workout.plan.mainLiftId : change.mainLiftId;
      const result = runSuggest(
        data,
        {
          budgetMin: next.budgetMin,
          warmupInBudget,
          energy,
          shuffle: next.shuffle,
          mainLiftId,
          pinnedIds: adjusted.addedIds,
          excludeIds: excludeIdsFor(stored, next.excludeIds),
          favoriteIds: favoriteIdsFor(favoriteIds),
          ...(avoidAreas.length > 0 ? { avoidAreas } : {}),
        },
        nowIso,
        tz,
      );
      if (result === null) return false;
      if (next.budgetMin !== budgetMin) setBudgetMin(next.budgetMin);
      const merged = mergeOrder(adjusted.order, result);
      setAdjusted({
        workout: merged.workout,
        shuffle: next.shuffle,
        excludeIds: next.excludeIds,
        addedIds: adjusted.addedIds,
        order: merged.order,
        emptiedByRemove: false,
      });
      return true;
    };
    /**
     * T-0573 (D-0205 §1): one `suggest` call pinning `id` after this visit's adds. The engine
     * silently ignores a pin that does not fit, so the result is checked: null when `id` is in
     * the new plan (it becomes the plan), else the refusal text and nothing changes.
     */
    const addExercise = (id: string): string | null => {
      const pinned = [...adjusted.addedIds.filter((a) => a !== id), id];
      const visit = adjusted.excludeIds.filter((e) => e !== id);
      const result = runSuggest(
        data,
        {
          budgetMin,
          warmupInBudget,
          energy,
          shuffle: adjusted.shuffle,
          mainLiftId: adjusted.workout.plan.mainLiftId,
          pinnedIds: pinned,
          excludeIds: excludeIdsFor(stored, visit),
          favoriteIds: favoriteIdsFor(favoriteIds),
          ...(avoidAreas.length > 0 ? { avoidAreas } : {}),
        },
        nowIso,
        tz,
      );
      if (result !== null && result.plan.items.some((i) => i.exerciseId === id)) {
        const merged = mergeOrder(adjusted.order, result);
        setAdjusted({
          workout: merged.workout,
          shuffle: adjusted.shuffle,
          excludeIds: visit,
          addedIds: pinned,
          order: merged.order,
          emptiedByRemove: false,
        });
        return null;
      }
      const ex = data.library.find((e) => e.id === id);
      const name = ex?.name ?? id;
      // Caps (D-0205 §4): main + added already hold 8, or two with the same primary area.
      const held = new Set(adjusted.addedIds);
      if (adjusted.workout.plan.mainLiftId !== null) held.add(adjusted.workout.plan.mainLiftId);
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
      const inPlan = adjusted.workout.plan.items.some((i) => i.exerciseId === id);
      const pinned =
        inPlan || adjusted.addedIds.includes(id) ? adjusted.addedIds : [...adjusted.addedIds, id];
      const visit = inPlan ? adjusted.excludeIds : adjusted.excludeIds.filter((e) => e !== id);
      const result = runSuggest(
        data,
        {
          budgetMin,
          warmupInBudget,
          energy,
          shuffle: adjusted.shuffle,
          mainLiftId: id,
          pinnedIds: pinned,
          excludeIds: excludeIdsFor(stored, visit),
          favoriteIds: favoriteIdsFor(favoriteIds),
          ...(avoidAreas.length > 0 ? { avoidAreas } : {}),
        },
        nowIso,
        tz,
      );
      if (result !== null && result.plan.mainLiftId === id) {
        const merged = mergeOrder(adjusted.order, result, true);
        setAdjusted({
          workout: merged.workout,
          shuffle: adjusted.shuffle,
          excludeIds: visit,
          addedIds: pinned,
          order: merged.order,
          emptiedByRemove: false,
        });
        return null;
      }
      return en.uf08.noFitStart(data.library.find((e) => e.id === id)?.name ?? id, budgetMin);
    };
    // UF-08.5 disabled rows, first match wins (D-0205 §3). "In this workout" is the sheet's own.
    const blocked: Record<string, string> = {};
    for (const e of data.library) {
      if (e.kind !== "exercise") continue;
      const areas = primaryAreas(e);
      const skip = areas.find((a) => avoidAreas.includes(a));
      const rec = areas.find((a) => recovering.includes(a));
      if (stored.includes(e.id)) blocked[e.id] = en.uf08.reasonExcluded;
      else if (!isEligible(e, { ...data.profile, level: "advanced" }, []))
        blocked[e.id] = en.uf08.reasonEquipment;
      else if (!isEligible(e, data.profile, [])) blocked[e.id] = en.uf08.reasonLevel;
      else if (skip !== undefined) blocked[e.id] = en.uf08.reasonSkipping(en.bodyMap.areas[skip]);
      else if (rec !== undefined) blocked[e.id] = en.uf08.reasonRecovering(en.bodyMap.areas[rec]);
    }
    return (
      <Suggested
        workout={adjusted.workout}
        library={data.library}
        locale={loc}
        avoidAreas={avoidAreas}
        emptiedByRemove={adjusted.emptiedByRemove}
        noticeAreas={noticeAreas}
        removedIds={adjusted.excludeIds}
        storedIds={stored}
        online={online}
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
            // A removed exercise is no longer a pin (D-0205 §6), or a re-suggest would list it.
            addedIds: adjusted.addedIds.filter((a) => a !== exerciseId),
            emptiedByRemove: next.plan.items.length === 0,
          });
          return true;
        }}
        onShuffle={() => resuggest({ shuffle: adjusted.shuffle + 1 })}
        onBudget={(m) => resuggest({ budgetMin: m })}
        focusSwapItem={focusSwapItem}
        onSwapFocused={() => setFocusSwapItem(null)}
        addedIds={adjusted.addedIds}
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
      workout,
      shuffle: 0,
      excludeIds: [],
      addedIds: [],
      order: null,
      emptiedByRemove: false,
    });
    void navigate(`${SETUP_PATH}?step=suggested`);
  };

  const atMin = budgetMin <= MIN_BUDGET;
  const atMax = budgetMin >= MAX_BUDGET;
  const ready = workout !== null;

  return (
    <div data-screen-id="UF-08.1" className="wl-uf08">
      <div className="wl-uf08__top">
        <Link to="/" className="wl-uf08__close" aria-label={en.uf08.close}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        </Link>
        <OfflineStatus variant="icon" locale={loc} timeZone={tz} />
      </div>
      <h1 className="wl-uf08__title">{en.uf08.title}</h1>

      {missing ? (
        <div className="wl-uf08__missing">
          <p>{en.uf08.missing}</p>
          <Link to="/" className="wl-uf08__link">
            {en.uf08.missingLink}
          </Link>
        </div>
      ) : (
        <>
          <div className="wl-uf08__card">
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
                <span className="wl-uf08__minutes" data-part="minutes">
                  {budgetMin}
                </span>
                <span className="wl-uf08__unit">{en.uf08.minutesUnit}</span>
                <span className="wl-uf08__done-by" data-part="done-by">
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
                  className="wl-uf08__chip"
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
                  <label htmlFor={ids.finish} className="wl-uf08__label">
                    {en.uf08.finishBy}
                  </label>
                  <input
                    ref={finishInput}
                    id={ids.finish}
                    type="time"
                    className="wl-uf08__time"
                    value={finishValue}
                    onChange={onFinishChange}
                    aria-invalid={finishError ? "true" : "false"}
                    aria-describedby={finishError ? ids.finishError : undefined}
                  />
                  {finishError ? (
                    <p id={ids.finishError} className="wl-uf08__error">
                      {en.uf08.finishRejected}
                    </p>
                  ) : null}
                </>
              ) : (
                <button
                  ref={finishButton}
                  type="button"
                  className="wl-uf08__link"
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

            <div className="wl-uf08__toggle">
              <label htmlFor={ids.warmup}>{en.uf08.warmupToggle}</label>
              <input
                id={ids.warmup}
                type="checkbox"
                className="wl-uf08__checkbox"
                checked={warmupInBudget}
                onChange={(e) => setWarmupInBudget(e.target.checked)}
              />
            </div>
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
            <div className="wl-uf08__energy-options">
              {ENERGIES.map((e) => (
                <label key={e} className="wl-uf08__energy-option" data-energy={e}>
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
                  className="wl-uf08__skip-chip"
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
                  {en.bodyMap.areas[a]}
                </button>
              ))}
            </div>
          </div>

          <p className="wl-uf08__fit" data-part="fit-line" aria-live="polite">
            {workout ? fitLine(workout) : en.uf08.checking}
          </p>

          <button
            type="button"
            className="wl-uf08__primary"
            aria-disabled={ready ? "false" : "true"}
            onClick={onSuggest}
          >
            {en.uf08.suggest}
          </button>
        </>
      )}
    </div>
  );
}
