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
import { ChevronIcon } from "../../components/icons/index.js";
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
  return (
    <div data-screen-id="UF-11.2" data-wl-state="plan" className="wl-page wl-plan">
      <header className="wl-plan__header">
        <h1 className="wl-type-page-title wl-title--stop">{en.screens.plan}</h1>
        <Link className="wl-button--secondary wl-plan__account" to="/plan/account">
          {en.uf11.accountLink}
        </Link>
        <p className="wl-plan__purpose wl-type-label">{en.uf11.purpose}</p>
      </header>
      {state.phase !== "loading" ? (
        <CheckinCard now={now} onAnswered={() => setRevision((r) => r + 1)} />
      ) : null}
      <PlanBody state={state} />
    </div>
  );
}

export function EditPlan({ now = systemClock }: PlanScreenProps = {}) {
  return (
    <div data-screen-id="UF-11.3" data-wl-state="plan" className="wl-page wl-plan wl-edit">
      <h1>{en.screens.editPlan}</h1>
      <EditPlanBody clock={now} />
    </div>
  );
}

/** The text-button back link of UF-11.4 to UF-11.6; the chevron is decoration, the name is `label`. */
function BackToPlan({ label }: { label: string }) {
  return (
    <Link className="wl-button--text wl-account__back" to="/plan" aria-label={label}>
      <ChevronIcon direction="left" size={18} />
      {en.screens.plan}
    </Link>
  );
}

export function AccountSettings({ now = systemClock }: PlanScreenProps = {}) {
  return (
    <div data-screen-id="UF-11.4" data-wl-state="plan" className="wl-page wl-account">
      <BackToPlan label={en.uf11.account.backToPlan} />
      <h1 className="wl-type-page-title wl-title--stop">{en.screens.accountSettings}</h1>
      <AccountSettingsBody clock={now} />
    </div>
  );
}

export function ExcludedExercises() {
  return (
    <div data-screen-id="UF-11.5" data-wl-state="plan" className="wl-page wl-account">
      <BackToPlan label={en.uf11.excludedScreen.back} />
      <h1 className="wl-type-page-title wl-title--stop">{en.screens.excludedExercises}</h1>
      <ExcludedBody />
    </div>
  );
}

export function FavoriteExercises() {
  return (
    <div data-screen-id="UF-11.6" data-wl-state="plan" className="wl-page wl-account">
      <BackToPlan label={en.uf11.favoritesScreen.back} />
      <h1 className="wl-type-page-title wl-title--stop">{en.uf11.favoritesScreen.title}</h1>
      <FavoritesBody />
    </div>
  );
}
