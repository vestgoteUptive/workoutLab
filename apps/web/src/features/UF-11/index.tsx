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
import { en } from "../../lib/i18n/en.js";
import { AccountSettingsBody } from "./AccountSettingsBody.js";
import { CheckinCard } from "./CheckinCard.js";
import { EditPlanBody } from "./EditPlanBody.js";
import { PlanBody } from "./PlanBody.js";
import { systemClock, usePlanData, type Clock } from "./use-plan-data.js";

export { CheckinCard };

interface PlanScreenProps {
  now?: Clock;
}

export function Plan({ now = systemClock }: PlanScreenProps = {}) {
  const state = usePlanData(now);
  return (
    <div data-screen-id="UF-11.2">
      <h1>{en.screens.plan}</h1>
      {state.phase !== "loading" ? <CheckinCard now={now} /> : null}
      <PlanBody state={state} />
    </div>
  );
}

export function EditPlan({ now = systemClock }: PlanScreenProps = {}) {
  return (
    <div data-screen-id="UF-11.3">
      <h1>{en.screens.editPlan}</h1>
      <EditPlanBody clock={now} />
    </div>
  );
}

export function AccountSettings({ now = systemClock }: PlanScreenProps = {}) {
  return (
    <div data-screen-id="UF-11.4">
      <h1>{en.screens.accountSettings}</h1>
      <AccountSettingsBody clock={now} />
    </div>
  );
}
