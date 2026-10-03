// T-0308c UF-11.1 CheckinCard, read side (D-0070 §5/§7, D-0166, D-0168 §5). Renders nothing until
// the cache read resolves, nothing with no proposal, and nothing (no `console.error`) on a
// rejected loader or a missing profile. Its writes (first-shown insert, Accept, Keep) are T-0470;
// its mount on UF-11.2/UF-02.1 is T-0471 — this ticket exports it, unmounted.
import { previewTargets } from "@workoutlab/engine";
import { AREAS } from "@workoutlab/shared";
import { en } from "../../lib/i18n/en.js";
import { formatCalendarDay, resolveTimeZone } from "./format.js";
import { useCheckinData, type CheckinCardData } from "./use-checkin-data.js";
import { useOnline, systemClock, type Clock } from "./use-plan-data.js";
import "./plan.css";

const u = en.uf11.checkin;

export interface CheckinCardProps {
  now?: Clock;
  timeZone?: string;
  locale?: string;
}

function CardBody({
  data,
  online,
  locale,
  timeZone,
}: {
  data: CheckinCardData;
  online: boolean;
  locale: string;
  timeZone: string;
}) {
  const { profile, evaluation } = data;
  const proposal = evaluation.proposal;
  // A null proposal never reaches here (the hook's `phase: "ready"` implies non-null), but the
  // guard keeps this function total under a stubbed evaluation.
  if (proposal === null) return null;
  const last = evaluation.periods[evaluation.periods.length - 1];
  if (last === undefined) return null;

  const from = formatCalendarDay(last.start, locale, timeZone);
  const to = formatCalendarDay(last.end, locale, timeZone);
  const line =
    proposal.direction === "down"
      ? u.down(
          last.completed,
          from,
          to,
          2 * profile.rhythmMin,
          2 * profile.rhythmMax,
          proposal.rhythmMin,
          proposal.rhythmMax,
        )
      : u.up(
          last.completed,
          from,
          to,
          2 * profile.rhythmMin,
          2 * profile.rhythmMax,
          proposal.rhythmMin,
          proposal.rhythmMax,
        );

  // "Current" is the engine's own preview for the CURRENT plan (same inputs minus the proposed
  // rhythm change), never a stored/cached target: that keeps the before side as much the
  // engine's number as the after side (principle 3).
  const current = previewTargets({
    rhythmMin: profile.rhythmMin,
    rhythmMax: profile.rhythmMax,
    priorityAreas: profile.priorityAreas,
  });
  const currentByArea = new Map(current.map((t) => [t.area, t.setsPer14d]));
  const nextByArea = new Map(proposal.previewTargets.map((t) => [t.area, t.setsPer14d]));

  return (
    <section data-part="checkin-card" aria-label={u.cardName}>
      <p>{line}</p>
      <ul aria-label={u.cardName}>
        {AREAS.map((area) => (
          <li key={area}>
            {u.previewRow(
              en.bodyMap.areas[area],
              currentByArea.get(area) ?? 0,
              nextByArea.get(area) ?? 0,
            )}
          </li>
        ))}
      </ul>
      <button type="button" disabled={!online}>
        {u.accept}
      </button>
      <button type="button" disabled={!online}>
        {u.keep}
      </button>
      {!online ? <p>{u.connectToUpdate}</p> : null}
    </section>
  );
}

export function CheckinCard({
  now = systemClock,
  timeZone,
  locale = "en-GB",
}: CheckinCardProps = {}) {
  const tz = timeZone ?? resolveTimeZone();
  const state = useCheckinData(now, tz);
  const online = useOnline();

  if (state.phase !== "ready") return null;
  return <CardBody data={state.data} online={online} locale={locale} timeZone={tz} />;
}
