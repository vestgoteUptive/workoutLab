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
import { formatInstantDay, formatLocalDay } from "./format.js";
import type { PlanData, PlanState } from "./use-plan-data.js";
import "./plan.css";

const u = en.uf11;

function sourceLabel(target: AreaTarget, tz: string): string {
  if (target.source === "adapted") return u.adapted(formatInstantDay(target.updatedAt, tz));
  if (target.source === "manual") return u.sourceLabels.manual;
  return u.sourceLabels.default;
}

function answerLabel(answer: "accepted" | "kept" | "withdrawn" | null): string {
  return answer === null ? u.answers.pending : u.answers[answer];
}

function PlanContent({ data }: { data: PlanData }) {
  const { profile, targets, checkins, routines, evaluation, tz } = data;
  const ordered = [...targets].sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area));
  const isFirst = evaluation.periods.length === 0 && checkins.length === 0;
  const nextDate = formatLocalDay(evaluation.nextCheckinDate);
  return (
    <>
      <section className="wl-plan__section">
        <h2>{u.headings.goal}</h2>
        <p>{u.goals[profile.goal]}</p>
      </section>
      <section className="wl-plan__section">
        <h2>{u.headings.rhythm}</h2>
        <p>{u.rhythm(profile.rhythmMin, profile.rhythmMax)}</p>
      </section>
      <section className="wl-plan__section">
        <h2>{u.headings.priorities}</h2>
        <p>
          {profile.priorityAreas.length === 0
            ? u.noPriorities
            : profile.priorityAreas.map((a) => en.bodyMap.areas[a]).join(", ")}
        </p>
      </section>
      <section className="wl-plan__section">
        <h2>{u.headings.targets}</h2>
        <ul className="wl-plan__list" aria-label={u.headings.targets}>
          {ordered.map((t) => (
            <li key={t.area}>
              {u.targetRow(en.bodyMap.areas[t.area], t.setsPer14d, sourceLabel(t, tz))}
            </li>
          ))}
        </ul>
        <p>{isFirst ? u.firstCheckin(nextDate) : u.nextCheckin(nextDate)}</p>
      </section>
      <section className="wl-plan__section">
        <h2>{u.headings.checkins}</h2>
        {checkins.length === 0 ? (
          <p>{u.noCheckins}</p>
        ) : (
          <ul className="wl-plan__list" aria-label={u.headings.checkins}>
            {checkins.slice(0, 3).map((c) => (
              <li key={c.id}>
                {u.checkinRow(
                  formatInstantDay(c.proposedAt, tz),
                  u.sessions(c.completedLast),
                  u.checkinChange(
                    c.rhythmMinBefore,
                    c.rhythmMaxBefore,
                    c.proposedMin,
                    c.proposedMax,
                  ),
                  answerLabel(c.answer),
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="wl-plan__section">
        <h2>{u.headings.routines}</h2>
        {routines.length === 0 ? (
          <p>{u.noRoutines}</p>
        ) : (
          <ul className="wl-plan__list wl-plan__list--links" aria-label={u.headings.routines}>
            {routines.map((r) => (
              <li key={r.id}>
                <Link className="wl-plan__link" to={`/plan/routines/${r.id}`}>
                  {u.routineRow(r.name, u.exercises(r.items.length))}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link className="wl-plan__link" to="/plan/routines/new">
          {u.newRoutine}
        </Link>
      </section>
      <Link className="wl-plan__link wl-plan__link--primary" to="/plan/edit">
        {u.editPlan}
      </Link>
    </>
  );
}

export function PlanBody({ state }: { state: PlanState }) {
  return (
    <>
      <OfflineStatus variant="text" />
      {state.phase === "ready" ? <PlanContent data={state.data} /> : null}
      {state.phase === "cold" ? <p>{u.coldCache}</p> : null}
      <Link className="wl-plan__link" to="/plan/account">
        {u.accountLink}
      </Link>
    </>
  );
}
