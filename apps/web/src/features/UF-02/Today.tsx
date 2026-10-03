// UF-02.1 Today (T-0302a): the header and date, the compact C-01 as one link to /balance, the
// attention line, the check-in slot, the zero-history lines, the no-plan state and Start.
// The 45-min suggestion card (T-0302c, D-0106 §1) sits between the check-in slot and the
// lines above Start; it lives in `SuggestionCard.tsx`.
// T-0395 (D-0139 §3 §4): the "Resume workout" slot sits right after the header, before the
// compact C-01 (or the no-plan line), in every Today state.
//
// Principle 3 — the engine decides, this file renders. The numbers come only from `balance()`
// (see `use-today.ts`). `needsAttention` and `load` are read as properties, in `result.areas`
// order, and nothing here derives coverage or attention from the numbers.
// Principle 2 — Start is a plain link to UF-08.1, which asks for the time. It never starts a
// session itself.
import { Suspense, useState } from "react";
import { Link } from "react-router";
import type { BalanceResult } from "@workoutlab/shared";
import { BodyMap } from "../../components/body-map/index.js";
import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";
import { formatSetCount } from "../../lib/format/number.js";
import { useAuth } from "../../lib/auth/auth-context.js";
import { en } from "../../lib/i18n/en.js";
import { defaultLocale, defaultTimeZone, formatTodayDate } from "./format.js";
import { todayCheckinSlot, todayResumeSlot } from "./slots.js";
import { SuggestionCard, SuggestionCardSkeleton } from "./SuggestionCard.js";
import { useToday } from "./use-today.js";
import "./today.css";

/** Test seams (AC-1): the clock, the locale and the time zone are injected. */
export interface TodayProps {
  now?: Date;
  locale?: string;
  timeZone?: string;
}

/** How many attention areas the line names before "+N more". */
const NAMED_AREAS = 3;

function AttentionLine({ result, locale }: { result: BalanceResult; locale: string }) {
  const flagged = result.areas.filter((a) => a.needsAttention);
  if (flagged.length === 0) return null;
  const names = flagged
    .slice(0, NAMED_AREAS)
    .map((a) => en.bodyMap.areas[a.area])
    .join(en.uf02.listSeparator);
  const rest = flagged.length - NAMED_AREAS;
  const restText = formatSetCount(rest, locale);
  return (
    <p className="wl-today__attention" data-part="attention">
      {en.uf02.attention(names)}
      {rest > 0 ? (
        <>
          {en.uf02.moreGap}
          <Link to="/balance" className="wl-today__more" data-part="attention-more">
            {en.uf02.more(restText)}
          </Link>
        </>
      ) : null}
    </p>
  );
}

/** AC-7: which line sits above Start when the attention line doesn't show. */
function EmptyLine({ result, hasHardSet }: { result: BalanceResult; hasHardSet: boolean }) {
  if (result.areas.some((a) => a.needsAttention)) return null;
  if (!hasHardSet) {
    return (
      <p className="wl-today__empty" data-part="no-workouts">
        {en.uf02.noWorkouts}
      </p>
    );
  }
  if (result.areas.every((a) => a.load === 0)) {
    return (
      <p className="wl-today__empty" data-part="nothing-recent">
        {en.uf02.nothingRecent}
      </p>
    );
  }
  return null;
}

function CheckinSlot() {
  const Slot = todayCheckinSlot;
  if (Slot === null) return null;
  return (
    <Suspense fallback={null}>
      <Slot />
    </Suspense>
  );
}

/** T-0395: the Today "Resume workout" card. A test that mocks `slots.js` without
 *  `todayResumeSlot` (an older mock) reads it as `undefined`, treated the same as `null`. */
function ResumeSlot({ now, locale, timeZone }: TodayProps) {
  const Slot = todayResumeSlot;
  if (!Slot) return null;
  return (
    <Suspense fallback={null}>
      <Slot now={now} locale={locale} timeZone={timeZone} />
    </Suspense>
  );
}

export function Today(props: TodayProps = {}) {
  // Fixed for the life of the mount: a fresh `new Date()` per render would re-run the cache-read
  // effect on every render (the UF-10 render-loop lesson).
  const [mountedAt] = useState(() => new Date());
  const now = props.now ?? mountedAt;
  const timeZone = props.timeZone ?? defaultTimeZone();
  const locale = props.locale ?? defaultLocale();
  // D-0113: the mount refresh runs only for a signed-in session (the AutoSync condition).
  const { status } = useAuth();
  const state = useToday(now, timeZone, status === "signed-in");

  return (
    <div data-screen-id="UF-02.1" className="wl-today">
      <div className="wl-today__header">
        <h1 className="wl-today__title">{en.screens.today}</h1>
        <p className="wl-today__date" data-part="date">
          {formatTodayDate(now, locale, timeZone)}
        </p>
        {state.status === "loading" ? null : (
          <span className="wl-today__status">
            <OfflineStatus
              variant="text"
              lastSyncedAt={state.lastSyncedAt}
              locale={locale}
              timeZone={timeZone}
            />
          </span>
        )}
      </div>

      <ResumeSlot now={now} locale={locale} timeZone={timeZone} />

      {state.status === "no-plan" ? (
        <p className="wl-today__no-plan" data-part="no-plan">
          {en.uf02.noPlan}
        </p>
      ) : (
        <>
          {state.status === "ready" ? (
            <BodyMap variant="compact" areas={state.result.areas} loading={false} locale={locale} />
          ) : (
            <BodyMap variant="compact" loading locale={locale} />
          )}
          {state.status === "ready" ? (
            <AttentionLine result={state.result} locale={locale} />
          ) : null}
          <CheckinSlot />
          {state.status === "ready" ? (
            state.workout === null ? null : (
              <SuggestionCard workout={state.workout} library={state.library} locale={locale} />
            )
          ) : (
            <SuggestionCardSkeleton />
          )}
          {state.status === "ready" ? (
            <EmptyLine result={state.result} hasHardSet={state.hasHardSet} />
          ) : null}
          <Link to="/session/setup" className="wl-today__start" data-part="start">
            {en.uf02.start}
          </Link>
        </>
      )}
    </div>
  );
}
