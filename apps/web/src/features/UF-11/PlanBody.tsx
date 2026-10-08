// UF-11.2 Plan body. The screen host and its <h1> live in `index.tsx`, so they are in the DOM on
// the first render in every state (loading, cold cache, no user id).
//
// T-0471: `index.tsx` owns the one `usePlanData` call now (not this file), so `Plan` can gate
// `CheckinCard`'s mount on the same state this body renders from — see that file's own comment
// for why (a cold-cache race `CheckinCard`'s own single read could otherwise lose).
import { Link } from "react-router";
import { AREAS, type AreaTarget } from "@workoutlab/shared";
import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";
import { en } from "../../lib/i18n/en.js";
import { ExcludedRow } from "./ExcludedRow.js";
import { formatInstantDay, formatLocalDay } from "./format.js";
import type { PlanData, PlanState } from "./use-plan-data.js";
import "./plan.css";

const u = en.uf11;

/** The tile's source line: none for a default target (UF-11.2 spec block 6). */
function sourceLabel(target: AreaTarget, tz: string): string | null {
  if (target.source === "adapted") return u.adapted(formatInstantDay(target.updatedAt, tz));
  if (target.source === "manual") return u.sourceLabels.manual;
  return null;
}

function answerLabel(answer: "accepted" | "kept" | "withdrawn" | null): string {
  return answer === null ? u.answers.pending : u.answers[answer];
}

function PlanContent({ data, checkinPending }: { data: PlanData; checkinPending: boolean }) {
  const { profile, targets, checkins, routines, evaluation, tz } = data;
  const ordered = [...targets].sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area));
  const isFirst = evaluation.periods.length === 0 && checkins.length === 0;
  const nextDate = formatLocalDay(evaluation.nextCheckinDate);
  const priorityNames = AREAS.filter((a) => profile.priorityAreas.includes(a)).map(
    (a) => en.bodyMap.areas[a],
  );
  return (
    <>
      <section className="wl-card" aria-labelledby="wl-plan-yours">
        <h2 id="wl-plan-yours" className="wl-label">
          {u.yourPlan}
        </h2>
        <dl className="wl-plan__facts">
          <div>
            <dt className="wl-caption">{u.headings.goal}</dt>
            <dd>{u.goals[profile.goal]}</dd>
          </div>
          <div>
            <dt className="wl-caption">{u.headings.rhythm}</dt>
            <dd>
              <span>{u.rhythmPerWeek(profile.rhythmMin, profile.rhythmMax)}</span>{" "}
              <span className="wl-caption">
                {u.rhythmPer14(profile.rhythmMin, profile.rhythmMax)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="wl-caption">{u.headings.priorities}</dt>
            <dd>{priorityNames.length === 0 ? u.noPriorities : priorityNames.join(", ")}</dd>
          </div>
        </dl>
        <Link
          className={`${checkinPending ? "wl-button--secondary" : "wl-button--primary"} wl-plan__linkbtn`}
          to="/plan/edit"
        >
          {u.editPlan}
        </Link>
      </section>
      {/* The D-0202 favorites row goes directly above this one. */}
      <ExcludedRow />
      <section className="wl-card" aria-labelledby="wl-plan-targets">
        <h2 id="wl-plan-targets" className="wl-label">
          {u.headings.targets}
        </h2>
        <p className="wl-caption">{u.targetsCaption}</p>
        <ul className="wl-plan__tiles" aria-label={u.targetsList}>
          {ordered.map((t) => {
            const isPriority = profile.priorityAreas.includes(t.area);
            const caption = u.tileCaption(
              [isPriority ? u.priorityTag : null, sourceLabel(t, tz)].filter(
                (x): x is string => x !== null,
              ),
            );
            return (
              <li key={t.area} className={isPriority ? "wl-plan__tile--priority" : undefined}>
                <span className="wl-caption">{en.bodyMap.areas[t.area]}</span>{" "}
                <span className="wl-stat">{t.setsPer14d}</span>
                <span className="wl-plan__sr">{u.hardSets}</span>
                {caption ? (
                  <>
                    {" "}
                    <span className="wl-caption">{caption}</span>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="wl-caption">{u.targetsNote}</p>
        <Link className="wl-row" to="/balance">
          {u.seeInBalance}
        </Link>
      </section>
      <section className="wl-card" aria-labelledby="wl-plan-checkins">
        <h2 id="wl-plan-checkins" className="wl-label">
          {u.headings.checkins}
        </h2>
        <div className="wl-plan__next">
          <span className="wl-caption">{isFirst ? u.firstCheckin : u.nextCheckin}</span>
          <span className="wl-stat">{nextDate}</span>
        </div>
        <p className="wl-muted">{u.checkinsExplain}</p>
        {checkins.length === 0 ? (
          <p className="wl-caption">{u.noCheckins}</p>
        ) : (
          <ul className="wl-plan__history" aria-label={u.headings.checkins}>
            {checkins.slice(0, 3).map((c) => (
              <li key={c.id}>
                <span className="wl-plan__line">
                  {u.checkinLine(
                    formatInstantDay(c.proposedAt, tz),
                    u.checkinChange(
                      c.rhythmMinBefore,
                      c.rhythmMaxBefore,
                      c.proposedMin,
                      c.proposedMax,
                    ),
                  )}
                </span>{" "}
                <span className="wl-caption">
                  {u.checkinMeta(u.sessions(c.completedLast), answerLabel(c.answer))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="wl-card" aria-labelledby="wl-plan-routines">
        <h2 id="wl-plan-routines" className="wl-label">
          {u.headings.routines}
        </h2>
        {routines.length === 0 ? (
          <p className="wl-caption">{u.noRoutines}</p>
        ) : (
          <ul className="wl-plan__rows" aria-label={u.headings.routines}>
            {routines.map((r) => (
              <li key={r.id}>
                <Link
                  className="wl-row"
                  to={`/plan/routines/${r.id}`}
                  aria-label={u.routineName(r.name, u.exercises(r.items.length))}
                >
                  <span className="wl-plan__rowtext">
                    <span className="wl-plan__name">{r.name}</span>
                    <span className="wl-caption">{u.exercises(r.items.length)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link className="wl-button--secondary wl-plan__linkbtn" to="/plan/routines/new">
          <svg aria-hidden focusable={false} width={18} height={18} viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {u.newRoutine}
        </Link>
      </section>
    </>
  );
}

export function PlanBody({
  state,
  checkinPending = false,
}: {
  state: PlanState;
  checkinPending?: boolean;
}) {
  return (
    <>
      <OfflineStatus variant="text" />
      {state.phase === "loading" ? (
        <p role="status" className="wl-caption">
          {u.loading}
        </p>
      ) : null}
      {state.phase === "ready" ? (
        <PlanContent data={state.data} checkinPending={checkinPending} />
      ) : null}
      {state.phase === "cold" ? (
        <p className="wl-plan__notice">
          <svg aria-hidden focusable={false} width={20} height={20} viewBox="0 0 24 24">
            <circle cx={12} cy={12} r={9} />
            <path d="M12 11v5M12 8h.01" />
          </svg>
          <span>{u.coldCache}</span>
        </p>
      ) : null}
    </>
  );
}
