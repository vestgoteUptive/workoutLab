// T-0308c UF-11.1 CheckinCard, read side (D-0070 §5/§7, D-0166, D-0168 §5); T-0470 adds the
// writes (D-0070 §3-§4, D-0172 §1-§2): the first-shown insert, Accept, Keep current. Renders
// nothing until the cache read resolves, nothing with no proposal, and nothing (no
// `console.error`) on a rejected loader or a missing profile. Its mount on UF-11.2/UF-02.1 is
// T-0471 — this ticket exports it, unmounted.
import { useEffect, useRef, useState } from "react";
import { previewTargets } from "@workoutlab/engine";
import {
  AREAS,
  type CheckinEvaluation,
  type CheckinProposal,
  type EngineProfile,
} from "@workoutlab/shared";
import { en } from "../../lib/i18n/en.js";
import { acceptProposal, insertIfFirstShown, keepCurrent } from "./checkin-writes.js";
import { formatCalendarDay, resolveTimeZone } from "./format.js";
import { refreshAll } from "../../lib/offline/index.js";
import { useCheckinData, type CheckinCardData } from "./use-checkin-data.js";
import { useOnline, systemClock, type Clock } from "./use-plan-data.js";
import "./plan.css";

const u = en.uf11.checkin;

export interface CheckinCardProps {
  now?: Clock;
  timeZone?: string;
  locale?: string;
}

type WriteState = { pending: boolean; failed: boolean };

function CardBody({
  data,
  online,
  locale,
  timeZone,
  now,
}: {
  data: CheckinCardData;
  online: boolean;
  locale: string;
  timeZone: string;
  now: Date;
}) {
  const { profile, evaluation } = data;
  const proposal = evaluation.proposal;
  // A null proposal never reaches here (the hook's `phase: "ready"` implies non-null), but the
  // guard keeps this function total under a stubbed evaluation.
  if (proposal === null) return null;
  const last = evaluation.periods[evaluation.periods.length - 1];
  if (last === undefined) return null;

  return (
    <CardReady
      profile={profile}
      evaluation={evaluation}
      periodIndex={last.index}
      completed={last.completed}
      start={last.start}
      end={last.end}
      proposal={proposal}
      online={online}
      locale={locale}
      timeZone={timeZone}
      now={now}
    />
  );
}

function CardReady({
  profile,
  evaluation,
  periodIndex,
  completed,
  start,
  end,
  proposal,
  online,
  locale,
  timeZone,
  now,
}: {
  profile: EngineProfile;
  evaluation: CheckinEvaluation;
  periodIndex: number;
  completed: number;
  start: string;
  end: string;
  proposal: CheckinProposal;
  online: boolean;
  locale: string;
  timeZone: string;
  now: Date;
}) {
  // Hidden only by a second device's already-answered row (D-0172 §2): Accept/Keep hide this
  // same render via their own navigation away (T-0471 unmounts on hide), so this flag only ever
  // needs to go from `false` to `true`.
  const [hiddenElsewhere, setHiddenElsewhere] = useState(false);
  const [write, setWrite] = useState<WriteState>({ pending: false, failed: false });
  // A double tap dispatches both clicks before React re-renders (D-0166's `save-plan.ts` double
  // submit case), so the guard reads a ref, not the render's own `write.pending` closure.
  const pendingRef = useRef(false);
  // At most one first-shown insert per mount (AC-1): a ref survives the online/offline toggle
  // with no remount, where a `useState` flag would also work but a ref keeps the online effect
  // below from needing to be a dependency of its own guard.
  const insertedOrChecked = useRef(false);

  useEffect(() => {
    if (!online || hiddenElsewhere) return;
    if (insertedOrChecked.current) return;
    insertedOrChecked.current = true;
    void insertIfFirstShown({ evaluation, profile, now, tz: timeZone }).then((hidden) => {
      if (hidden) setHiddenElsewhere(true);
    });
    // `evaluation`/`profile`/`now`/`timeZone` are pinned for the life of this mount (the hook
    // above reads the cache once), so this effect only re-runs on the online/offline toggle; they
    // are deliberately left out of the dependency list below.
  }, [online, hiddenElsewhere]);

  if (hiddenElsewhere) return null;

  async function runWrite(action: () => Promise<void>) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setWrite({ pending: true, failed: false });
    try {
      await action();
    } catch {
      pendingRef.current = false;
      setWrite({ pending: false, failed: true });
      return;
    }
    setHiddenElsewhere(true);
  }

  function onAccept() {
    void runWrite(async () => {
      await acceptProposal({
        profile,
        proposal: { rhythmMin: proposal.rhythmMin, rhythmMax: proposal.rhythmMax },
        periodIndex,
        now,
      });
      await refreshAll(now, timeZone).catch(() => undefined);
    });
  }

  function onKeep() {
    void runWrite(async () => {
      await keepCurrent({ periodIndex, now });
      await refreshAll(now, timeZone).catch(() => undefined);
    });
  }

  const from = formatCalendarDay(start, locale, timeZone);
  const to = formatCalendarDay(end, locale, timeZone);
  const line =
    proposal.direction === "down"
      ? u.down(
          completed,
          from,
          to,
          2 * profile.rhythmMin,
          2 * profile.rhythmMax,
          proposal.rhythmMin,
          proposal.rhythmMax,
        )
      : u.up(
          completed,
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

  const buttonsDisabled = !online || write.pending;

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
      <button
        type="button"
        className="wl-plan__button wl-plan__button--primary"
        disabled={buttonsDisabled}
        onClick={onAccept}
      >
        {u.accept}
      </button>
      <button type="button" className="wl-plan__button" disabled={buttonsDisabled} onClick={onKeep}>
        {u.keep}
      </button>
      {write.failed ? <p role="alert">{en.uf11.saveFailed}</p> : null}
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
  // Pinned once, like `useCheckinData`'s own `now`: the write side must act on the SAME instant
  // the card was first shown with, not a fresh `Date.now()` on whichever render triggers a write.
  const pinnedNow = useRef<Date | null>(null);
  pinnedNow.current ??= now();

  if (state.phase !== "ready") return null;
  return (
    <CardBody
      data={state.data}
      online={online}
      locale={locale}
      timeZone={tz}
      now={pinnedNow.current}
    />
  );
}
