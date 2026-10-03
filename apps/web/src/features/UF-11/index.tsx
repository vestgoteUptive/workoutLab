// UF-11 Plan check-in flow (T-0308b): UF-11.2 Plan and UF-11.3 Edit plan. T-0308c adds
// `CheckinCard`, exported but mounted nowhere yet (T-0471, D-0168 §5). Each screen renders its
// host and <h1> itself, on the first render in every state (loading, cold cache, no user id).
import { en } from "../../lib/i18n/en.js";
import { AccountSettingsBody } from "./AccountSettingsBody.js";
import { CheckinCard } from "./CheckinCard.js";
import { EditPlanBody } from "./EditPlanBody.js";
import { PlanBody } from "./PlanBody.js";
import { systemClock, type Clock } from "./use-plan-data.js";

export { CheckinCard };

interface PlanScreenProps {
  now?: Clock;
}

export function Plan({ now = systemClock }: PlanScreenProps = {}) {
  return (
    <div data-screen-id="UF-11.2">
      <h1>{en.screens.plan}</h1>
      <PlanBody clock={now} />
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
