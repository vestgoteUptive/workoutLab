// UF-06.2 Exercise history: one exercise's rows and three stat cards over the 56 cached local
// days. An unknown or warm-up id redirects to /progress (D-0079 §4).
import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router";
import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";
import { en } from "../../lib/i18n/en.js";
import { formatWeekdayDayMonth } from "./format.js";
import { exerciseHistory, formatWeight } from "./stats.js";
import { statusProps, useProgressData, type ProgressOptions } from "./use-progress-data.js";
import "./progress.css";

export function ExerciseHistory(props: ProgressOptions) {
  const { exerciseId = "" } = useParams();
  const { data, settled, now, timeZone, locale } = useProgressData(props);

  const history = useMemo(
    () =>
      data === null
        ? null
        : exerciseHistory(exerciseId, data.history, data.library, now, timeZone, locale),
    [data, exerciseId, now, timeZone, locale],
  );

  if (data === null) return null;
  if (history === null) {
    // An empty library cache on a device that is still refreshing is "not loaded yet", not "unknown".
    if (data.library.length === 0 && !settled) return null;
    return <Navigate to="/progress" replace />;
  }

  return (
    <div className="wl-progress" data-screen-id="UF-06.2">
      <h1 className="wl-progress__title">{history.exercise.name}</h1>
      <p className="wl-progress__caption">{en.uf06.last8Weeks}</p>
      <OfflineStatus variant="text" {...statusProps(props)} />
      {history.rows.length === 0 ? (
        <p className="wl-progress__empty">{en.uf06.noSets}</p>
      ) : (
        <>
          <dl className="wl-progress__cards">
            <div className="wl-progress__card">
              <dt>{en.uf06.bestSet}</dt>
              <dd>{history.best === null ? en.uf06.noValue : history.best.label}</dd>
            </div>
            <div className="wl-progress__card">
              <dt>{en.uf06.heaviest}</dt>
              <dd>
                {history.heaviestKg === null
                  ? en.uf06.noValue
                  : en.uf06.weightKg(formatWeight(history.heaviestKg, locale))}
              </dd>
            </div>
            <div className="wl-progress__card">
              <dt>{en.uf06.sessions}</dt>
              <dd>{history.sessions}</dd>
            </div>
          </dl>
          <ul className="wl-progress__rows" aria-label={en.uf06.historyName}>
            {history.rows.map((row) => (
              <li key={row.sessionId} className="wl-progress__row">
                {en.uf06.historyRow(formatWeekdayDayMonth(row.date, locale), row.sets.join(", "))}
              </li>
            ))}
          </ul>
        </>
      )}
      <Link to={`/library/${history.exercise.id}`} className="wl-progress__howto">
        {en.uf06.howTo}
      </Link>
    </div>
  );
}
