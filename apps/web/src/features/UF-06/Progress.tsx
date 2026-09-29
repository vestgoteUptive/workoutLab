// UF-06.1 Progress overview: the month calendar, the Balance card and Recent exercises. Every
// number is engine output (`checkinSessions`, `balance`) or a display grouping in `stats.ts`.
import { useMemo } from "react";
import { Link } from "react-router";
import { balance, checkinSessions } from "@workoutlab/engine";
import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";
import { en } from "../../lib/i18n/en.js";
import { BalanceCard } from "./BalanceCard.js";
import { formatDayMonth, formatMonthTitle, weekdayNames } from "./format.js";
import { monthCalendar, recentExercises } from "./stats.js";
import { statusProps, useProgressData, type ProgressOptions } from "./use-progress-data.js";
import "./progress.css";

const AREA_COUNT = 9;

export function Progress(props: ProgressOptions) {
  const { data, now, timeZone, locale } = useProgressData(props);

  const view = useMemo(() => {
    if (data === null) return null;
    const completed = checkinSessions(data.sessions, data.history, data.library);
    return {
      calendar: monthCalendar(completed, now, timeZone),
      // `balance()` needs all nine targets. A device that has never synced has none, so the
      // card waits for the first refresh instead of throwing.
      areas:
        data.targets.length >= AREA_COUNT
          ? balance(data.history, data.targets, data.library, now.toISOString(), timeZone).areas
          : null,
      recent: recentExercises(data.history, data.library, now, timeZone, locale),
    };
  }, [data, now, timeZone, locale]);

  return (
    <div className="wl-progress" data-screen-id="UF-06.1">
      <h1 className="wl-progress__title">{en.screens.progress}</h1>
      <OfflineStatus variant="text" {...statusProps(props)} />
      {view === null ? null : (
        <>
          <section className="wl-progress__section" aria-label={en.uf06.calendarName}>
            <h2 className="wl-progress__heading">
              {formatMonthTitle(view.calendar.year, view.calendar.month, locale)}
            </h2>
            <table className="wl-progress__calendar">
              <thead>
                <tr>
                  {weekdayNames(locale).map((name) => (
                    <th key={name} scope="col" className="wl-progress__weekday">
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.calendar.weeks.map((week, w) => (
                  <tr key={w}>
                    {week.map((day, d) => {
                      if (day === null) return <td key={d} className="wl-progress__day" />;
                      const isToday = day === view.calendar.today;
                      const marked = view.calendar.marked.includes(day);
                      return (
                        <td
                          key={d}
                          className="wl-progress__day"
                          data-day={day}
                          data-marked={marked ? "true" : undefined}
                          data-today={isToday ? "true" : undefined}
                          aria-current={isToday ? "date" : undefined}
                          tabIndex={isToday ? -1 : undefined}
                        >
                          <span>{day}</span>
                          {marked ? (
                            <span className="wl-progress__sr-only">{en.uf06.workoutDay}</span>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="wl-progress__count">{en.uf06.workoutsThisMonth(view.calendar.count)}</p>
          </section>

          {view.areas === null ? null : (
            <BalanceCard areas={view.areas.slice(0, 4)} locale={locale} />
          )}

          <section className="wl-progress__section">
            <h2 className="wl-progress__heading">{en.uf06.recentTitle}</h2>
            {view.recent.length === 0 ? (
              <p className="wl-progress__empty">{en.uf06.noExercises}</p>
            ) : (
              <ul className="wl-progress__recent">
                {view.recent.map((entry) => (
                  <li key={entry.exerciseId}>
                    <Link to={`/progress/${entry.exerciseId}`} className="wl-progress__recent-row">
                      <span className="wl-progress__recent-name">{entry.name}</span>
                      <span className="wl-progress__recent-date">
                        {formatDayMonth(entry.lastDate, locale)}
                      </span>
                      <span className="wl-progress__recent-best">{entry.best.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
