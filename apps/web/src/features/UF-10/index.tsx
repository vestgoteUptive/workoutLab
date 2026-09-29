// UF-10 Balance (T-0307a): UF-10.1 All areas (`/balance`) and UF-10.2 Area detail
// (`/balance/:area`). Spec: docs/specs/uf-10-balance.md, D-0013, D-0027, D-0003, D-0071.
//
// Principle 3 — the engine decides, this file renders:
//   * the nine rows come out in `result.areas` order, exactly as `balance()` returned them.
//     There is no `.sort()` in this file, and there must never be one: a sort by deficit, by
//     name or by the fixed `AREAS` order all pass a forward fixture and fail a reversed one
//     (AC-A5). The same holds for `contributors` (AC-A9).
//   * `coverageStep`, `needsAttention`, `recovering` and `deficit` are read, never recomputed
//     from `load`/`target` (AC-A13).
//
// Principle 1 — UF-10 is never reachable during a workout. Nothing here links into a session
// except the "Start workout" CTA, and no UF-03/04/05/08/09 file may import this module
// (`no-restricted-imports` in apps/web/eslint.config.mjs, D-0071 §9). The render half of that
// guarantee is AC-A12's: no `a[href^="/balance"]` exists on a session route.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import type { Area, AreaBalance, BalanceResult, Contributor } from "@workoutlab/shared";
import { BodyMap } from "../../components/body-map/index.js";
import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";
import { en } from "../../lib/i18n/en.js";
import { formatSetCount } from "../../lib/format/number.js";
import { loadLibrary } from "../../lib/offline/history.js";
import {
  barWidth,
  dayDiff,
  deficitPercent,
  fillToken,
  formatDateRange,
  formatDayMonth,
  formatInstantDayMonth,
  tokenVar,
  windowDates,
} from "./format.js";
import { useBalance } from "./use-balance.js";
import "./balance.css";

/** Test seams (AC-A5, AC-A7, AC-A8, AC-A13): the screens take their clock and their data in. */
export interface BalanceScreenProps {
  /** A fixed `BalanceResult`, so a test can hand the UI an internally inconsistent one. */
  result?: BalanceResult;
  now?: Date;
  timeZone?: string;
  locale?: string;
  lastSyncedAt?: string | null;
  /** Exercise id → library name, for UF-10.2's contributors; loaded from the cache by default. */
  exerciseNames?: ReadonlyMap<string, string>;
}

function useResult(props: BalanceScreenProps): {
  result: BalanceResult | null;
  lastSyncedAt: string | null;
  timeZone: string;
} {
  // Fixed for the life of the mount. A fresh `new Date()` per render would change the hook's
  // `nowIso` dependency on every render and re-run the load effect forever (a render loop
  // that froze the page in the e2e). The window rolls on the next mount, as AC-A6 pins.
  const [mountedAt] = useState(() => new Date());
  const now = props.now ?? mountedAt;
  const timeZone = props.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  // `exactOptionalPropertyTypes`: spread the seams in only when they were actually supplied,
  // so `stubLastSyncedAt === undefined` keeps meaning "read it from IndexedDB" and is never
  // confused with an explicit `lastSyncedAt: undefined`.
  const state = useBalance({
    now,
    timeZone,
    ...(props.result !== undefined ? { stub: props.result } : {}),
    ...(props.lastSyncedAt !== undefined ? { stubLastSyncedAt: props.lastSyncedAt } : {}),
  });
  return {
    result: props.result ?? state.result,
    lastSyncedAt: props.lastSyncedAt !== undefined ? props.lastSyncedAt : state.lastSyncedAt,
    timeZone,
  };
}

/** The bar: width from `min(load/target, 1)`, fill from the engine's `coverageStep`. */
function CoverageBar({ area }: { area: AreaBalance }) {
  return (
    <span className="wl-balance__bar" data-part="bar" aria-hidden="true">
      <span
        className="wl-balance__bar-fill"
        data-part="bar-fill"
        data-coverage-step={area.coverageStep}
        style={{
          width: barWidth(area.load, area.target),
          backgroundColor: tokenVar(fillToken(area.coverageStep)),
        }}
      />
    </span>
  );
}

function AreaRow({ area, locale }: { area: AreaBalance; locale: string | undefined }) {
  const load = formatSetCount(area.load, locale);
  const target = formatSetCount(area.target, locale);
  return (
    <li>
      <Link
        to={`/balance/${area.area}`}
        className="wl-balance__row"
        data-part="row"
        data-area={area.area}
        data-attention={area.needsAttention ? "true" : undefined}
        aria-label={en.uf10.rowName(en.bodyMap.areas[area.area], load, target, area.needsAttention)}
      >
        <span className="wl-balance__row-name" aria-hidden="true">
          {en.bodyMap.areas[area.area]}
          {area.recovering ? (
            <span className="wl-balance__tag" data-part="recovering">
              {en.uf10.recovering}
            </span>
          ) : null}
        </span>
        <span className="wl-balance__row-value" data-part="value" aria-hidden="true">
          {en.bodyMap.loadOfTarget(load, target)}
        </span>
        <CoverageBar area={area} />
      </Link>
    </li>
  );
}

/** UF-10.1 All areas. */
export function Balance(props: BalanceScreenProps = {}) {
  const { result, lastSyncedAt, timeZone } = useResult(props);
  const locale = props.locale;
  const areas = result?.areas ?? [];
  // `every`, not a recomputation: the empty state is "no hard set anywhere in the window", which
  // is what all nine areas reading load 0 means. The engine still owns each area's numbers.
  const nothingLogged = areas.length > 0 && areas.every((a) => a.load === 0);

  return (
    <div data-screen-id="UF-10.1" className="wl-balance">
      <div className="wl-balance__header">
        <h1 className="wl-balance__window">
          {result
            ? en.uf10.window(formatDateRange(result.windowStart, result.windowEnd, locale))
            : en.screens.balance}
        </h1>
        <span className="wl-balance__meta">
          {/* The screen's own time zone, not the device default, so "last synced HH:MM" is
              read in the same zone the 14-day window was computed in. */}
          <OfflineStatus
            variant="text"
            lastSyncedAt={lastSyncedAt}
            locale={locale ?? "en-GB"}
            timeZone={timeZone}
          />
          <Link to="/plan" className="wl-balance__plan-link">
            {en.uf10.planLink}
          </Link>
        </span>
      </div>

      {/* The one C-01 region on this screen, fed `result.areas` — the same array the rows
          below render, so the map and the rows can never disagree (AC-A15). */}
      <BodyMap
        variant="full"
        areas={areas}
        loading={result === null}
        {...(locale !== undefined ? { locale } : {})}
      />

      {nothingLogged ? <p className="wl-balance__empty">{en.uf10.emptyState}</p> : null}

      <ul className="wl-balance__rows" aria-label={en.uf10.areaListName}>
        {areas.map((area) => (
          <AreaRow key={area.area} area={area} locale={locale} />
        ))}
      </ul>

      {nothingLogged ? (
        <Link to="/session/setup" className="wl-balance__cta">
          {en.uf10.startWorkout}
        </Link>
      ) : null}
    </div>
  );
}

function targetSourceText(area: AreaBalance, timeZone: string, locale: string | undefined): string {
  switch (area.targetSource) {
    case "default":
      return en.uf10.targetFromPlan;
    case "adapted":
      return en.uf10.targetAdapted(
        formatInstantDayMonth(area.targetUpdatedAt, { locale, timeZone }),
      );
    case "manual":
      return en.uf10.targetManual;
  }
}

function lastTrainedText(area: AreaBalance, today: string, locale: string | undefined): string {
  if (area.lastTrainedDate === null) return en.uf10.neverTrained;
  const days = dayDiff(area.lastTrainedDate, today);
  if (days <= 0) return en.uf10.lastTrainedToday;
  if (days === 1) return en.uf10.lastTrainedYesterday;
  return en.uf10.lastTrainedDaysAgo(formatSetCount(days, locale));
}

function DayStrip({
  area,
  windowStart,
  locale,
}: {
  area: AreaBalance;
  windowStart: string;
  locale: string | undefined;
}) {
  const dates = windowDates(windowStart, area.days.length);
  return (
    <ul className="wl-balance-detail__strip" aria-label={en.uf10.stripName} data-part="strip">
      {area.days.map((value, i) => {
        const date = dates[i]!;
        const label = formatDayMonth(date, locale);
        return (
          <li
            key={date}
            className="wl-balance-detail__cell"
            data-part="strip-cell"
            data-date={date}
            aria-label={
              value === 0
                ? en.uf10.stripCellEmpty(label)
                : en.uf10.stripCell(label, formatSetCount(value, locale))
            }
          >
            {/* Blank when 0 (spec §UF-10.2); the accessible name above still says so. */}
            <span aria-hidden="true">{value === 0 ? null : formatSetCount(value, locale)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ContributorRow({
  contributor,
  name,
  locale,
}: {
  contributor: Contributor;
  name: string;
  locale: string | undefined;
}) {
  return (
    <li data-part="contributor" data-exercise-id={contributor.exerciseId}>
      {en.uf10.contributor(
        name,
        formatSetCount(contributor.weightedSets, locale),
        formatDayMonth(contributor.lastDate, locale),
      )}
    </li>
  );
}

const EMPTY_NAMES: ReadonlyMap<string, string> = new Map();

/**
 * Exercise id → library name for UF-10.2's contributor rows, read from the `lib/offline` cache.
 * With `override` supplied (a test, or a caller that already has the library) nothing is read
 * from IndexedDB at all.
 */
function useExerciseNames(
  override: ReadonlyMap<string, string> | undefined,
): ReadonlyMap<string, string> {
  const [loaded, setLoaded] = useState<ReadonlyMap<string, string>>(EMPTY_NAMES);

  useEffect(() => {
    if (override !== undefined) return;
    let live = true;
    void loadLibrary().then((library) => {
      if (!live) return;
      setLoaded(new Map(library.map((e) => [e.id, e.name])));
    });
    return () => {
      live = false;
    };
  }, [override]);

  return override ?? loaded;
}

/** UF-10.2 Area detail. */
export function BalanceDetail(props: BalanceScreenProps = {}) {
  const { area: areaParam } = useParams();
  const { result, lastSyncedAt, timeZone } = useResult(props);
  const locale = props.locale;
  const names = useExerciseNames(props.exerciseNames);

  const area = useMemo(
    () => result?.areas.find((a) => a.area === (areaParam as Area)) ?? null,
    [result, areaParam],
  );

  if (!result || !area) {
    return (
      <div data-screen-id="UF-10.2" className="wl-balance">
        <h1 className="wl-balance-detail__headline">{en.screens.balanceDetail}</h1>
      </div>
    );
  }

  const load = formatSetCount(area.load, locale);
  const target = formatSetCount(area.target, locale);

  return (
    <div data-screen-id="UF-10.2" className="wl-balance" data-area={area.area}>
      <div className="wl-balance__header">
        <h1 className="wl-balance-detail__headline">{en.bodyMap.areas[area.area]}</h1>
        <span className="wl-balance__meta">
          <OfflineStatus
            variant="text"
            lastSyncedAt={lastSyncedAt}
            locale={locale ?? "en-GB"}
            timeZone={timeZone}
          />
        </span>
      </div>

      <div className="wl-balance-detail__figures">
        <span className="wl-balance-detail__load" data-part="value">
          {en.bodyMap.loadOfTarget(load, target)}
        </span>
        <span className="wl-balance-detail__deficit" data-part="deficit">
          <span className="wl-balance__sr-only">{en.uf10.deficitLabel}</span>
          {/* The engine's `deficit`, rounded for display. Never `1 - load / target`. */}
          {en.uf10.deficit(formatSetCount(deficitPercent(area.deficit), locale))}
        </span>
      </div>

      <CoverageBar area={area} />

      <div className="wl-balance-detail__facts">
        <p data-part="target-source">{targetSourceText(area, timeZone, locale)}</p>
        <p data-part="last-trained">{lastTrainedText(area, result.windowEnd, locale)}</p>
      </div>

      {area.recovering ? (
        <div className="wl-balance-detail__recovering">
          <span className="wl-balance__tag" data-part="recovering">
            {en.uf10.recovering}
          </span>
          <p className="wl-balance-detail__recovering-why">{en.uf10.recoveringWhy}</p>
        </div>
      ) : null}

      <DayStrip area={area} windowStart={result.windowStart} locale={locale} />

      <h2 className="wl-balance-detail__heading">{en.uf10.contributorsHeading}</h2>
      {area.contributors.length === 0 ? (
        <p className="wl-balance__empty">{en.uf10.contributorsEmpty}</p>
      ) : (
        <ul className="wl-balance-detail__contributors">
          {area.contributors.map((c) => (
            <ContributorRow
              key={c.exerciseId}
              contributor={c}
              name={names.get(c.exerciseId) ?? c.exerciseId}
              locale={locale}
            />
          ))}
        </ul>
      )}

      <Link to="/session/setup" className="wl-balance__cta">
        {en.uf10.startWorkout}
      </Link>
    </div>
  );
}
