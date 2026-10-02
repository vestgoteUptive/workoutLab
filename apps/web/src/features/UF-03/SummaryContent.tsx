// UF-03.3 Summary content (T-0419, D-0068 §1, D-0142 §4): the three states under the wrapper in
// `index.tsx`. Loading renders nothing (the wrapper's `<h1>` only); "isn't on this device" and
// "still running" never redirect; only an ended session shows the numbers and "See balance".
//
// No mount refresh (D-0142 §4, the D-0111 §11 exemption): this reads IndexedDB once per
// session id and never calls `refresh*` or `useAuth()`, so it renders with no `AuthProvider`.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";
import { formatSetCount } from "../../lib/format/number.js";
import { en } from "../../lib/i18n/en.js";
import { areaName } from "../../lib/i18n/workout.js";
import { loadSummary, type EndedSummary, type SummaryLoad } from "./summary-data.js";
import "./summary.css";

export interface SummaryProps {
  /** The device zone by default; tests pin it (the UF-10 pattern). */
  timeZone?: string;
  locale?: string;
}

interface Loaded {
  key: string;
  value: SummaryLoad;
}

export function SummaryContent({ timeZone, locale }: SummaryProps) {
  const { sessionId = "" } = useParams();
  const tz = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const key = `${sessionId}|${tz}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let live = true;
    // `loadSummary` never rejects (D-0142 §4: IndexedDB failing is "isn't on this device").
    void loadSummary(sessionId, tz).then((value) => {
      if (live) setLoaded({ key: `${sessionId}|${tz}`, value });
    });
    return () => {
      live = false;
    };
  }, [sessionId, tz]);

  if (loaded === null || loaded.key !== key) return null;
  const state = loaded.value;

  switch (state.kind) {
    case "notOnDevice":
      return (
        <div className="wl-uf03-summary__state" data-part="not-on-device">
          <p>{en.uf03.notOnDevice}</p>
          <Link to="/" className="wl-uf03-summary__link">
            {en.uf03.goHome}
          </Link>
        </div>
      );
    case "running":
      return (
        <div className="wl-uf03-summary__state" data-part="still-running">
          <p>{en.uf03.stillRunning}</p>
          <Link to={`/session/${encodeURIComponent(sessionId)}`} className="wl-uf03-summary__link">
            {en.uf03.backToWorkout}
          </Link>
        </div>
      );
    case "ended":
      return <Ended summary={state.summary} timeZone={tz} locale={locale} />;
  }
}

function Ended({
  summary,
  timeZone,
  locale,
}: {
  summary: EndedSummary;
  timeZone: string;
  locale: string | undefined;
}) {
  const n = (value: number) => formatSetCount(value, locale);
  const { changes, nextUp } = summary;

  return (
    <div className="wl-uf03-summary__ended" data-part="ended">
      <OfflineStatus variant="text" locale={locale ?? "en-GB"} timeZone={timeZone} />

      <dl className="wl-uf03-summary__stats">
        <div className="wl-uf03-summary__stat">
          <dt>{en.uf03.timeLabel}</dt>
          <dd data-part="time">{en.uf03.minutes(n(summary.minutes))}</dd>
          <dd data-part="budget" className="wl-uf03-summary__budget">
            {en.uf03.budget(n(summary.budgetMin))}
          </dd>
        </div>
        <div className="wl-uf03-summary__stat">
          <dt>{en.uf03.exercisesLabel}</dt>
          <dd data-part="exercises">{n(summary.exercises)}</dd>
        </div>
        <div className="wl-uf03-summary__stat">
          <dt>{en.uf03.setsLabel}</dt>
          <dd data-part="sets">{n(summary.hardSets)}</dd>
        </div>
      </dl>

      {changes !== null && changes.length > 0 ? (
        <>
          <h2 className="wl-uf03-summary__heading">{en.uf03.balanceHeading}</h2>
          <ul className="wl-uf03-summary__rows" data-part="rows">
            {changes.map((c) => (
              <li key={c.area} data-part="row" data-area={c.area}>
                {en.uf03.areaRow(areaName(c.area), n(c.before), n(c.after), n(c.target))}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {nextUp !== null ? (
        <p className="wl-uf03-summary__next" data-part="next-up">
          {nextUp.length === 0
            ? en.uf03.allOnTarget
            : en.uf03.nextUp(nextUp.map(areaName).join(en.uf03.nextUpSeparator))}
        </p>
      ) : null}

      <Link to="/balance" className="wl-uf03-summary__link">
        {en.uf03.seeBalance}
      </Link>
    </div>
  );
}
