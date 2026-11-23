// UF-06.2 Exercise history: one exercise's rows and three stat cards over the 56 cached local
// days. An unknown or warm-up id redirects to /progress (D-0079 §4).
import { useMemo, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router";
import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";
import { en } from "../../lib/i18n/en.js";
import { asWord } from "../../lib/i18n/per-side.js";
import { useUnilateral } from "../../lib/offline/index.js";
import { E1rmChart } from "./E1rmChart.js";
import { formatDayMonth, formatWeekdayDayMonth } from "./format.js";
import { e1rmSeries, exerciseHistory, formatWeight } from "./stats.js";
import { statusProps, useProgressData, type ProgressOptions } from "./use-progress-data.js";
import "./progress.css";

export function ExerciseHistory(props: ProgressOptions) {
  const { exerciseId = "" } = useParams();
  const { data, settled, now, timeZone, locale } = useProgressData(props);

  const word = asWord(useUnilateral(exerciseId));

  const history = useMemo(
    () =>
      data === null
        ? null
        : exerciseHistory(exerciseId, data.history, data.library, now, timeZone, locale, word),
    [data, exerciseId, now, timeZone, locale, word],
  );

  const points = useMemo(
    () => (data === null ? [] : e1rmSeries(exerciseId, data.history, data.library, now, timeZone)),
    [data, exerciseId, now, timeZone],
  );

  if (data === null) return null;
  if (history === null) {
    // An empty library cache on a device that is still refreshing is "not loaded yet", not "unknown".
    if (data.library.length === 0 && !settled) return null;
    return <Navigate to="/progress" replace />;
  }

  const weightedLift = !history.exercise.timed && history.exercise.externalLoad;
  let estimate: ReactNode = null;
  if (!weightedLift) {
    estimate = <p className="wl-type-body wl-e1rm__note">{en.uf06.e1rmWeightedOnly}</p>;
  } else if (points.length === 0) {
    estimate = <p className="wl-type-body wl-e1rm__note">{en.uf06.e1rmNone}</p>;
  } else {
    const firstP = points[0]!;
    const lastP = points[points.length - 1]!;
    const delta = Math.round(lastP.e1rm) - Math.round(firstP.e1rm);
    const since = formatDayMonth(firstP.date, locale);
    estimate = (
      <>
        {points.length > 1 && (
          <p className="wl-type-body wl-e1rm__delta">
            {delta > 0
              ? en.uf06.deltaUp(formatWeight(delta, locale), since)
              : delta < 0
                ? en.uf06.deltaDown(formatWeight(-delta, locale), since)
                : en.uf06.deltaSame(since)}
          </p>
        )}
        <E1rmChart points={points} locale={locale} />
      </>
    );
  }

  return (
    <div className="wl-page wl-progress" data-screen-id="UF-06.2" data-wl-state="plan">
      <h1 className="wl-type-page-title wl-title--stop wl-progress__title">
        {history.exercise.name}
      </h1>
      <p className="wl-type-label wl-progress__caption">{en.uf06.last8Weeks}</p>
      <OfflineStatus variant="text" {...statusProps(props)} />
      {history.rows.length === 0 ? (
        <p className="wl-type-body wl-progress__empty">{en.uf06.noSets}</p>
      ) : (
        <>
          <dl className="wl-progress__cards">
            <div className="wl-progress__card">
              <dt className="wl-type-label">{en.uf06.bestSet}</dt>
              <dd className="wl-type-stat">
                {history.best === null ? en.uf06.noValue : history.best.label}
              </dd>
            </div>
            <div className="wl-progress__card">
              <dt className="wl-type-label">{en.uf06.heaviest}</dt>
              <dd className="wl-type-stat">
                {history.heaviestKg === null
                  ? en.uf06.noValue
                  : en.uf06.weightKg(formatWeight(history.heaviestKg, locale))}
              </dd>
            </div>
            <div className="wl-progress__card">
              <dt className="wl-type-label">{en.uf06.sessions}</dt>
              <dd className="wl-type-stat">{history.sessions}</dd>
            </div>
            {points.length > 0 && (
              <div className="wl-progress__card">
                <dt className="wl-type-label">{en.uf06.e1rmLabel}</dt>
                <dd className="wl-type-stat">
                  {en.uf06.aboutKg(
                    formatWeight(Math.round(points[points.length - 1]!.e1rm), locale),
                  )}
                </dd>
              </div>
            )}
          </dl>
          {estimate}
          <ul className="wl-progress__rows" aria-label={en.uf06.historyName}>
            {history.rows.map((row) => (
              <li key={row.sessionId} className="wl-row wl-type-body wl-progress__row">
                {en.uf06.historyRow(formatWeekdayDayMonth(row.date, locale), row.sets.join(", "))}
              </li>
            ))}
          </ul>
        </>
      )}
      <Link to={`/library/${history.exercise.id}`} className="wl-button--text wl-progress__howto">
        {en.uf06.howTo}
      </Link>
    </div>
  );
}
