// UF-11 Plan check-in flow (T-0308b): UF-11.2 Plan and UF-11.3 Edit plan. T-0308c added
// `CheckinCard`; T-0471 mounts it as the first element after the <h1> on UF-11.2, in every Plan
// state, passing the screen's own clock so a test that pins Plan's clock pins the card's too.
// Each screen renders its host and <h1> itself, on the first render in every state (loading,
// cold cache, no user id).
//
// T-0471: `Plan` owns the one `usePlanData` call (moved up from `PlanBody`, which now takes the
// resulting state as a prop) so `CheckinCard`'s mount can be gated on it. `CheckinCard`'s own
// hook does a single, un-refreshed cache read (by design, D-0070 §5/§7); on a genuinely cold
// cache — a direct first visit to `/plan` with no prior visit to warm it — that single read can
// lose a race against `usePlanData`'s own `refreshAll`, since both would otherwise mount as
// independent siblings with no ordering between them (found by this ticket's own e2e AC-4b).
// Delaying the card's mount until `usePlanData`'s own phase leaves "loading" means the cache is
// already as fresh as Plan's own content is by the time the card's single read runs — the exact
// guarantee `use-checkin-data.ts`'s comment already assumes ("the screens that mount it keep the
// data fresh"), now actually true before the card reads, not just after.
import { useState } from "react";
import { Link } from "react-router";
import { en } from "../../lib/i18n/en.js";
import { AccountSettingsBody } from "./AccountSettingsBody.js";
import { CheckinCard } from "./CheckinCard.js";
import { ExcludedBody } from "./ExcludedBody.js";
import { FavoritesBody } from "./FavoritesBody.js";
import { EditPlanBody } from "./EditPlanBody.js";
import "./plan.css";
import { PlanBody } from "./PlanBody.js";
import { systemClock, usePlanData, type Clock } from "./use-plan-data.js";

export { CheckinCard };

interface PlanScreenProps {
  now?: Clock;
}

export function Plan({ now = systemClock }: PlanScreenProps = {}) {
  // T-0481: bumped by the card's `onAnswered`; `usePlanData` re-reads the cache once per bump.
  const [revision, setRevision] = useState(0);
  const state = usePlanData(now, revision);
  const [checkinPending, setCheckinPending] = useState(false);
  return (
    <div data-screen-id="UF-11.2" className="wl-page">
      <header className="wl-plan__header">
        <h1>{en.screens.plan}</h1>
        <Link className="wl-button--secondary wl-plan__account" to="/plan/account">
          <svg aria-hidden focusable={false} width={18} height={18} viewBox="0 0 24 24">
            <circle cx={12} cy={8} r={4} />
            <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
          </svg>
          {en.uf11.accountLink}
        </Link>
        <p className="wl-plan__purpose">{en.uf11.purpose}</p>
      </header>
      {state.phase !== "loading" ? (
        <CheckinCard
          now={now}
          onAnswered={() => setRevision((r) => r + 1)}
          onVisibleChange={setCheckinPending}
        />
      ) : null}
      <PlanBody state={state} checkinPending={checkinPending} />
    </div>
  );
}

export function EditPlan({ now = systemClock }: PlanScreenProps = {}) {
  return (
    <div data-screen-id="UF-11.3" className="wl-page">
      <h1>{en.screens.editPlan}</h1>
      <EditPlanBody clock={now} />
    </div>
  );
}

export function AccountSettings({ now = systemClock }: PlanScreenProps = {}) {
  return (
    <div data-screen-id="UF-11.4" className="wl-page">
      <Link
        className="wl-button--text wl-account__back"
        to="/plan"
        aria-label={en.uf11.account.backToPlan}
      >
        <svg aria-hidden focusable={false} width={18} height={18} viewBox="0 0 24 24">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        {en.screens.plan}
      </Link>
      <h1>{en.screens.accountSettings}</h1>
      <AccountSettingsBody clock={now} />
    </div>
  );
}

export function ExcludedExercises() {
  return (
    <div data-screen-id="UF-11.5" className="wl-page">
      <Link
        className="wl-button--text wl-account__back"
        to="/plan"
        aria-label={en.uf11.excludedScreen.back}
      >
        <svg aria-hidden focusable={false} width={18} height={18} viewBox="0 0 24 24">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        {en.screens.plan}
      </Link>
      <h1>{en.screens.excludedExercises}</h1>
      <ExcludedBody />
    </div>
  );
}

export function FavoriteExercises() {
  return (
    <div data-screen-id="UF-11.6" className="wl-page">
      <Link
        className="wl-button--text wl-account__back"
        to="/plan"
        aria-label={en.uf11.favoritesScreen.back}
      >
        <svg aria-hidden focusable={false} width={18} height={18} viewBox="0 0 24 24">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        {en.screens.plan}
      </Link>
      <h1>{en.uf11.favoritesScreen.title}</h1>
      <FavoritesBody />
    </div>
  );
}
