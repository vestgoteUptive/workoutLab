// UF-08.2 Today's plan, by area (T-0996, D-0274 to D-0276, D-0280, D-0286, UF-08.2.md).
// Principle 3: the screen shows the engine's plan grouped by `areaGroups` and sends each tap to the
// host, which forwards it to `adjustAreaSets`, `removeArea`, `addArea` or `areaCandidates` (see
// `area-plan-engine.ts`). No area, exercise or set count is picked here, and no `suggest` call is
// made for an edit. A time chip is the one rebuild, and the host runs it.
//
// Interim (D-0280 §8): "Looks good" still opens UF-08.4 until T-1009 puts Start on this screen. A
// row's open button goes to `?step=area&area={area}`, the route T-0997 builds (UF-08.6).
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  AREAS,
  WARMUP_COST_S,
  areaGroups,
  type Area,
  type AreaCandidate,
  type Workout,
} from "@workoutlab/engine";
import { ArrowIcon, ChevronIcon, CrossIcon, Icon } from "../../components/icons/index.js";
import { ExcludedAreasNotice } from "../../components/excluded-areas-notice/index.js";
import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";
import { formatTime } from "../../lib/format/intl.js";
import { formatSetCount } from "../../lib/format/number.js";
import { en } from "../../lib/i18n/en.js";
import { sessionReasonChips } from "../../lib/i18n/workout.js";
import type { EditResult, PlanOverview } from "./area-plan-engine.js";
import { leftMinutes, overMinutes } from "./budget.js";
import { exerciseName, type LibraryLookup } from "./rows.js";
import { CHIPS } from "./time.js";

const READY_HREF = "/session/setup?step=ready";
const SETUP_HREF = "/session/setup?step=time";

export interface AreaLoad {
  load: number;
  target: number;
}

export interface AreaPlanProps {
  /** "empty" is "Start empty": the same screen, with no areas to begin with. */
  mode?: "suggested" | "empty";
  /** The host's current plan, in the engine's order (the rows follow it; Start writes `orderItems`). */
  workout: Workout;
  /** Names for the "Doesn't fit" line. */
  library: LibraryLookup;
  locale: string;
  timeZone: string;
  /** Read once at mount: "Done by" is this plus the plan's minutes (D-0107 §4, D-0280 §3). */
  clock: () => Date;
  /** The 14-day load and target of every area (engine `balance`, on the device). */
  loads: Readonly<Record<Area, AreaLoad>>;
  overview: PlanOverview;
  /** Skipped on UF-08.1: their Add is disabled. */
  avoidAreas: readonly Area[];
  /** Removed on this visit: skipped for rebuilds, but their Add puts them back. */
  removedAreas: readonly Area[];
  noticeAreas?: readonly Area[];
  /** The ids a rebuild may have left out (swaps and adds), named in "Doesn't fit in {n} min". */
  keptIds?: readonly string[];
  exclusionFailed?: boolean;
  onAdjust: (area: Area, delta: 1 | -1) => EditResult;
  onRemoveArea: (area: Area) => EditResult;
  onAddArea: (area: Area) => EditResult;
  onFillRest: () => { workout: Workout; added: readonly Area[] };
  /** The host rebuilds the plan for `budgetMin`; null when the engine rejected it. */
  onBudget: (budgetMin: number) => Workout | null;
}

function minutesOf(seconds: number): number {
  return Math.ceil(seconds / 60);
}

function areaLabel(area: Area): string {
  return en.bodyMap.areas[area];
}

/** One bar segment. Its `flex-grow` is data (seconds), so it is set on the node. */
function Segment({ kind, seconds }: { kind: string; seconds: number }) {
  const ref = useCallback(
    (el: HTMLSpanElement | null) => {
      if (el) el.style.flexGrow = String(seconds);
    },
    [seconds],
  );
  return <span ref={ref} className="wl-uf08__seg" data-segment={kind} />;
}

function MinusIcon() {
  return (
    <Icon size={20}>
      <path d="M5 12h14" />
    </Icon>
  );
}

function PlusIcon() {
  return (
    <Icon size={20}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

/** The words for an area that can't be added, or null when it can (D-0286 §1, UF-08.2.md). */
function candidateReason(candidate: AreaCandidate): string | null {
  if (candidate.available === true) return null;
  switch (candidate.available.reason) {
    case "recovering":
      return en.uf08.reasonAreaRecovering;
    case "avoided":
      return en.uf08.reasonAreaSkipping;
    case "excluded_out":
    case "no_exercise":
      return en.uf08.reasonAreaNoExercise;
    case "time":
      return en.uf08.reasonAreaNoTime;
    case "items_cap":
      return en.uf08.reasonAreaFull;
  }
}

export function AreaPlan({
  mode = "suggested",
  workout,
  library,
  locale,
  timeZone,
  clock,
  loads,
  overview,
  avoidAreas,
  removedAreas,
  noticeAreas = [],
  keptIds = [],
  exclusionFailed = false,
  onAdjust,
  onRemoveArea,
  onAddArea,
  onFillRest,
  onBudget,
}: AreaPlanProps) {
  const navigate = useNavigate();
  const [mountedAt] = useState(() => clock());
  const [status, setStatus] = useState("");
  // The refusal under one row's stepper, until the next tap in that row (UF-08.2.md › Area row).
  const [refusals, setRefusals] = useState<Partial<Record<Area, string>>>({});
  const needAreaId = useId();
  const overLineId = useId();
  const refusalIds = useId();
  const reasonIds = useId();

  const groups = useMemo(() => areaGroups(workout), [workout]);
  const chips = useMemo(() => sessionReasonChips(workout.sessionReasons), [workout.sessionReasons]);
  const noAreas = groups.length === 0;
  const over = overMinutes(workout);
  const { budgetMin, warmupInBudget, itemsTotalS, totalS, unusedS } = workout;
  const shown = minutesOf(warmupInBudget ? totalS : itemsTotalS);

  const [addOpen, setAddOpen] = useState(noAreas);
  useEffect(() => {
    if (noAreas) setAddOpen(true);
  }, [noAreas]);

  // Where focus goes once the host's new plan has rendered (UF-08.2.md › Focus). Never `body`.
  type Pending =
    { kind: "removed"; index: number } | { kind: "added"; area: Area } | { kind: "filled" };
  const pending = useRef<Pending | null>(null);
  const rowsRef = useRef<HTMLUListElement>(null);
  const addSummaryRef = useRef<HTMLElement>(null);
  const fillRef = useRef<HTMLButtonElement>(null);
  const looksGoodRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const p = pending.current;
    if (p === null) return;
    pending.current = null;
    if (p.kind === "removed") {
      const opens = rowsRef.current?.querySelectorAll<HTMLElement>('[data-part="area-open"]');
      const target = opens && opens.length > 0 ? opens[Math.min(p.index, opens.length - 1)] : null;
      (target ?? addSummaryRef.current)?.focus();
    } else if (p.kind === "added") {
      const plus = rowsRef.current?.querySelector<HTMLElement>(
        `[data-area="${p.area}"] [data-part="plus"]`,
      );
      (plus ?? looksGoodRef.current)?.focus();
    } else if (fillRef.current === null) looksGoodRef.current?.focus();
  }, [workout]);

  const skipped = AREAS.filter((a) => avoidAreas.includes(a) || removedAreas.includes(a));
  const doneBy = formatTime(
    new Date(mountedAt.getTime() + minutesOf(totalS) * 60_000).toISOString(),
    { locale, timeZone },
  );
  const budgetText =
    over > 0
      ? en.uf08.areaBudgetOver(shown, budgetMin, over, !warmupInBudget)
      : en.uf08.budgetWithin(shown, budgetMin, !warmupInBudget);

  const rebuiltStatus = (next: Workout, minutes: number): string => {
    const missing = keptIds.filter((id) => !next.plan.items.some((i) => i.exerciseId === id));
    const line = en.uf08.planRebuilt(minutes);
    return missing.length === 0
      ? line
      : `${line} ${en.uf08.doesntFit(
          minutes,
          missing.map((id) => exerciseName(id, library)),
        )}`;
  };

  /** The words under a refused **+**: over budget first, then the engine's reason. */
  const plusRefusalText = (area: Area): string | null => {
    const refusal = overview.stepRefusals[area];
    if (refusal === undefined) return null;
    if (over > 0 && refusal === "time") return en.uf08.overRefusal(over);
    return refusal === "area_full"
      ? en.uf08.areaRefuseFull(areaLabel(area))
      : en.uf08.areaRefuseTime;
  };
  const refuseText = (area: Area, reason: string): string => {
    if (over > 0 && reason === "time") return en.uf08.overRefusal(over);
    return reason === "area_full"
      ? en.uf08.areaRefuseFull(areaLabel(area))
      : en.uf08.areaRefuseTime;
  };

  const setRefusal = (area: Area, text: string | null) =>
    setRefusals((prev) => {
      const next = { ...prev };
      if (text === null) delete next[area];
      else next[area] = text;
      return next;
    });

  /** "{Area}: {k} sets, {left} min left." from the plan the engine returned. */
  const announceSets = (area: Area, next: Workout, secondGone: boolean) => {
    const sets = areaGroups(next).find((g) => g.area === area)?.sets ?? 0;
    const left = leftMinutes(next);
    setStatus(
      secondGone
        ? en.uf08.areaSecondGone(areaLabel(area), sets, left)
        : en.uf08.areaSets(areaLabel(area), sets, left),
    );
  };

  const onPlus = (area: Area) => {
    setRefusal(area, null);
    const known = plusRefusalText(area);
    if (known !== null) {
      setRefusal(area, known);
      setStatus(known);
      return;
    }
    const result = onAdjust(area, 1);
    if ("refused" in result) {
      const text = refuseText(area, result.refused);
      setRefusal(area, text);
      setStatus(text);
      return;
    }
    announceSets(area, result.workout, false);
  };

  const onMinus = (area: Area, index: number) => {
    setRefusal(area, null);
    const before = groups.find((g) => g.area === area);
    if (before === undefined) return;
    if (before.sets <= 2) {
      // The 2-set minimum: the control reads Remove and takes the area out (no confirm).
      const result = onRemoveArea(area);
      if ("refused" in result) return;
      pending.current = { kind: "removed", index };
      setStatus(en.uf08.areaRemoved(areaLabel(area)));
      return;
    }
    const result = onAdjust(area, -1);
    if ("refused" in result) return;
    const after = areaGroups(result.workout).find((g) => g.area === area);
    announceSets(area, result.workout, before.itemIds.length === 2 && after?.itemIds.length === 1);
  };

  const onAdd = (candidate: AreaCandidate) => {
    const area = candidate.area;
    if (over > 0 && (candidate.available === true || candidate.available.reason === "time")) {
      setStatus(en.uf08.overRefusal(over));
      return;
    }
    if (candidate.available !== true) return;
    const result = onAddArea(area);
    if ("refused" in result) return;
    pending.current = { kind: "added", area };
    setStatus(en.uf08.areaAdded(areaLabel(area), leftMinutes(result.workout)));
  };

  // Areas an unavailable-for-good reason keeps out (everything else can still be added).
  const addable = overview.candidates.filter(
    (c) =>
      !removedAreas.includes(c.area) &&
      (c.available === true || (over > 0 && c.available.reason === "time")),
  );
  const showFill = addable.length > 0;
  const permanentlyOut = overview.candidates.filter(
    (c) =>
      c.available !== true && c.available.reason !== "time" && c.available.reason !== "items_cap",
  ).length;

  const onFill = () => {
    if (over > 0) {
      setStatus(en.uf08.overRefusal(over));
      return;
    }
    const result = onFillRest();
    if (result.added.length === 0) return;
    pending.current = { kind: "filled" };
    const left = leftMinutes(result.workout);
    const first = result.added[0];
    setStatus(
      result.added.length === 1 && first !== undefined
        ? en.uf08.areaAdded(areaLabel(first), left)
        : en.uf08.areasAdded(result.added.length, left),
    );
  };

  const onChip = (minutes: number) => {
    if (minutes === budgetMin) return;
    setRefusals({});
    const next = onBudget(minutes);
    setStatus(next === null ? "" : rebuiltStatus(next, minutes));
  };

  return (
    <section
      data-screen-id="UF-08.2"
      data-wl-state="plan"
      className="wl-uf08 wl-page"
      data-items={workout.plan.items.length}
      data-mode={mode}
    >
      <div className="wl-uf08__top">
        <Link to="/" className="wl-uf08__close" aria-label={en.uf08.close}>
          <CrossIcon />
        </Link>
        <OfflineStatus variant="icon" locale={locale} timeZone={timeZone} />
      </div>
      <div className="wl-uf08__top">
        <Link className="wl-uf08__back" to={SETUP_HREF}>
          {en.uf08.back}
        </Link>
      </div>

      <div className="wl-uf08__heading">
        <h1 className="wl-uf08__title" data-part="area-title">
          {noAreas
            ? en.uf08.areaTitleEmpty
            : en.uf08.areaTitle(groups.map((g) => areaLabel(g.area)))}
        </h1>
        <p className="wl-uf08__label" data-part="done-by">
          {noAreas ? en.uf08.minToFill(budgetMin) : en.uf08.doneByLine(doneBy)}
        </p>
      </div>

      <div className="wl-uf08__budget" data-over={over > 0 ? "true" : undefined}>
        <div className="wl-uf08__bar" data-part="bar" aria-hidden="true">
          {warmupInBudget ? <Segment kind="warmup" seconds={WARMUP_COST_S} /> : null}
          {groups.map((g) => (
            <Segment key={g.area} kind="area" seconds={g.costS} />
          ))}
          {unusedS > 0 ? <Segment kind="unused" seconds={unusedS} /> : null}
        </div>
        <p className="wl-uf08__budget-text" data-part="budget-text">
          {budgetText}
        </p>
      </div>

      {chips.length > 0 ? (
        <ul
          className="wl-uf08__why"
          data-part="session-chips"
          aria-label={en.uf08.sessionChipsName}
        >
          {chips.map((chip, i) => (
            <li key={`${i}:${chip}`} className="wl-chip wl-uf08__why-chip">
              {chip}
            </li>
          ))}
        </ul>
      ) : null}

      {skipped.length > 0 ? (
        <p className="wl-uf08__skipping" data-part="skipping">
          <svg
            className="wl-uf08__skipping-icon"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5" />
            <path d="M12 8h.01" />
          </svg>
          <span>{en.uf08.skipping(skipped.map((a) => areaLabel(a)))}</span>
        </p>
      ) : null}
      <ExcludedAreasNotice areas={noticeAreas} />

      {noAreas && mode === "suggested" && removedAreas.length === 0 ? (
        <p className="wl-uf08__fit" data-part="nothing-fits">
          {permanentlyOut > 0 && permanentlyOut === overview.candidates.length
            ? en.uf08.noAreasNow(permanentlyOut)
            : en.uf08.nothingFits(budgetMin)}
        </p>
      ) : null}

      {noAreas ? null : (
        <ul className="wl-uf08__areas" ref={rowsRef} aria-label={en.uf08.areaRowsName}>
          {groups.map((g, index) => {
            const area = g.area;
            const name = areaLabel(area);
            const minutes = minutesOf(g.costS);
            const refusal = refusals[area];
            const refusalId = `${refusalIds}-${area}`;
            const plusRefused = plusRefusalText(area) !== null;
            const atMinimum = g.sets <= 2;
            const row = loads[area];
            return (
              <li key={area} className="wl-row wl-uf08__area" data-part="area-row" data-area={area}>
                <button
                  type="button"
                  className="wl-uf08__area-open"
                  data-part="area-open"
                  aria-label={en.uf08.areaOpenName(name, minutes, g.itemIds.length)}
                  onClick={() => void navigate(`/session/setup?step=area&area=${area}`)}
                >
                  <span className="wl-uf08__area-line">
                    <span className="wl-uf08__area-name wl-type-row-title" data-part="area-name">
                      {name}
                    </span>
                    <span className="wl-uf08__area-minutes" data-part="area-minutes">
                      {en.uf08.areaMinutes(minutes)}
                    </span>
                  </span>
                  <span className="wl-uf08__area-line">
                    <span className="wl-uf08__area-count" data-part="area-count">
                      {en.uf08.exercisesCount(g.itemIds.length)}
                    </span>
                    <ChevronIcon size={20} />
                  </span>
                </button>
                <div
                  className="wl-uf08__sets"
                  role="group"
                  aria-label={en.uf08.setsGroupName(name)}
                >
                  <button
                    type="button"
                    className="wl-uf08__sets-btn"
                    data-part="minus"
                    data-remove={atMinimum ? "true" : undefined}
                    aria-label={
                      atMinimum ? en.uf08.removeAreaName(name) : en.uf08.setLessName(name)
                    }
                    onClick={() => onMinus(area, index)}
                  >
                    {atMinimum ? <span>{en.uf08.removeAreaText}</span> : <MinusIcon />}
                  </button>
                  <span className="wl-uf08__sets-value" data-part="sets-value">
                    {en.uf08.setsValue(g.sets)}
                  </span>
                  <button
                    type="button"
                    className="wl-uf08__sets-btn"
                    data-part="plus"
                    aria-label={en.uf08.setMoreName(name)}
                    aria-disabled={plusRefused ? "true" : undefined}
                    aria-describedby={refusal === undefined ? undefined : refusalId}
                    onClick={() => onPlus(area)}
                  >
                    <PlusIcon />
                  </button>
                </div>
                {refusal === undefined ? null : (
                  <p id={refusalId} className="wl-uf08__refusal" data-part="refusal">
                    {refusal}
                  </p>
                )}
                <p className="wl-uf08__area-history" data-part="area-history">
                  {en.uf08.historyLine(
                    formatSetCount(row.load, locale),
                    formatSetCount(row.target, locale),
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <div role="status" className="wl-uf08__status" data-part="status">
        {status}
      </div>
      <div aria-live="assertive" data-part="exclusion-failed">
        {exclusionFailed ? (
          <p role="alert" className="wl-uf08__status">
            {en.excluded.saveFailed}
          </p>
        ) : null}
      </div>

      <details
        className="wl-uf08__add-area"
        data-part="add-area"
        open={addOpen}
        onToggle={(e) => setAddOpen(e.currentTarget.open)}
      >
        <summary ref={addSummaryRef} className="wl-uf08__summary" data-part="add-area-summary">
          <span>{en.uf08.addAreaSummary}</span>
          <ChevronIcon size={20} direction={addOpen ? "up" : "down"} />
        </summary>
        <ul className="wl-uf08__candidates">
          {overview.candidates.map((c) => {
            const name = areaLabel(c.area);
            const engineReason = candidateReason(c);
            const removedHere = removedAreas.includes(c.area);
            // An area removed on this visit reads "Skipping today" but its Add puts it back.
            const reason = engineReason ?? (removedHere ? en.uf08.reasonAreaSkipping : null);
            const refusedForOver =
              over > 0 && (c.available === true || c.available.reason === "time");
            const disabled = c.available !== true || refusedForOver;
            const reasonId = `${reasonIds}-${c.area}`;
            const describedBy = refusedForOver
              ? overLineId
              : reason === null
                ? undefined
                : reasonId;
            return (
              <li
                key={c.area}
                className="wl-row wl-uf08__candidate"
                data-part="candidate"
                data-area={c.area}
              >
                <div className="wl-uf08__candidate-body">
                  <span className="wl-uf08__area-name wl-type-row-title">{name}</span>
                  <span className="wl-uf08__area-history" data-part="candidate-history">
                    {en.uf08.historyLine(
                      formatSetCount(c.load, locale),
                      formatSetCount(c.target, locale),
                    )}
                  </span>
                  {reason === null ? null : (
                    <span
                      id={reasonId}
                      className="wl-uf08__area-history"
                      data-part="candidate-reason"
                    >
                      {reason}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="wl-button--secondary wl-uf08__candidate-add"
                  data-part="candidate-add"
                  aria-label={en.uf08.addName(name)}
                  aria-disabled={disabled ? "true" : undefined}
                  aria-describedby={describedBy}
                  onClick={() => onAdd(c)}
                >
                  {en.uf08.add}
                </button>
              </li>
            );
          })}
        </ul>
        {over > 0 ? (
          <p id={overLineId} className="wl-uf08__hint" data-part="over-line">
            {en.uf08.overRefusal(over)}
          </p>
        ) : null}
      </details>

      {showFill ? (
        <button
          ref={fillRef}
          type="button"
          className="wl-button--text wl-uf08__fill"
          data-part="fill-rest"
          onClick={onFill}
        >
          {en.uf08.fillRest}
        </button>
      ) : null}

      <div className="wl-uf08__chips" role="group" aria-label={en.uf08.timeChipsName}>
        {CHIPS.map((m) => (
          <button
            key={m}
            type="button"
            className="wl-chip wl-uf08__chip"
            aria-label={en.uf08.chipName(String(m))}
            aria-pressed={budgetMin === m ? "true" : "false"}
            onClick={() => onChip(m)}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="wl-uf08__actions">
        <button
          ref={looksGoodRef}
          type="button"
          className="wl-button--primary wl-uf08__primary"
          data-part="looks-good"
          aria-disabled={noAreas ? "true" : undefined}
          aria-describedby={noAreas ? needAreaId : undefined}
          onClick={() => {
            if (noAreas) return;
            void navigate(READY_HREF);
          }}
        >
          <span>{en.uf08.looksGood}</span>
          <ArrowIcon />
        </button>
        {noAreas ? (
          <p id={needAreaId} className="wl-uf08__hint" data-part="need-area">
            {en.uf08.needArea}
          </p>
        ) : null}
      </div>
    </section>
  );
}
