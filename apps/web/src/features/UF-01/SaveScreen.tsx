// `/welcome/save`, screen `UF-01.5-save` (T-0301c, D-0064 §8, D-0100, D-0101). A signed-in user
// with no profile lands here (the profile gate, D-0073). With a saveable pending plan
// (D-0098 §2) and online, it saves without a tap, each step only after the one before succeeded:
//   1. the existence check, `profiles.select("user_id").maybeSingle()`: a row means the existing
//      profile wins, so it writes nothing (D-0064 §8);
//   2. the 9 `area_targets` rows, `sets_per_14d` straight from `deriveTargets` (principle 3);
//   3. the `profiles` row;
//   4. clear the pending plan, await the gate recheck, then replace-navigate to `/`.
// Step 1 runs once *successfully* per visit; a Retry after a later failure resends steps 2 and 3
// only (D-0100 §3). Without a saveable plan it stays and links to `/welcome/goal` (D-0100 §2). It
// never starts the onboarding clock (D-0100 §5).
//
// Reached only through `React.lazy` from `WelcomeRoutes.tsx`, so the engine and the Supabase
// client stay out of the `/welcome` first chunk (principle 5). The pending-plan module arrives as
// the type-only `store` prop (the AC-A6 manifest reason in `WelcomeRoutes.tsx`). The one
// `lib/profile` import any feature may make is `useRecheckProfile` (D-0101).
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { deriveTargets } from "@workoutlab/engine";
import { AREAS, type TablesInsert } from "@workoutlab/shared";
import { useAuth } from "../../lib/auth/auth-context.js";
import { supabase } from "../../lib/auth/client.js";
import { en } from "../../lib/i18n/en.js";
import { useRecheckProfile } from "../../lib/profile/index.js";
import type { PendingPlan } from "./pending-plan.js";
import type { PendingPlanStore } from "./WelcomeRoutes.js";

const t = en.uf01.save;

type Phase = "saving" | "offline" | "error";

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function frame(children: React.ReactNode) {
  return (
    <div data-screen-id="UF-01.5-save" className="wl-uf01">
      {children}
    </div>
  );
}

export function SaveScreen({ store }: { store: PendingPlanStore }) {
  const { status } = useAuth();
  const [plan] = useState<PendingPlan | null>(() => store.readSaveablePlan());

  if (!plan) {
    // D-0100 §2: the answers aren't on this device (or were never shown as a plan).
    return frame(
      <>
        <div className="wl-uf01__intro">
          <h1 className="wl-uf01__title wl-uf01__title--step">{t.noPlanHeading}</h1>
          <p className="wl-uf01__muted">{t.noPlanBody}</p>
        </div>
        <div className="wl-uf01__actions">
          <Link to="/welcome/goal" className="wl-uf01__primary">
            {t.noPlanLink}
          </Link>
        </div>
      </>,
    );
  }
  // A saveable plan needs an account to be saved to: UF-01.5 asks for one ("Save your plan").
  if (status === "signed-out") return <Navigate to="/account" replace />;
  return <Saving plan={plan} store={store} />;
}

function Saving({ plan, store }: { plan: PendingPlan; store: PendingPlanStore }) {
  const navigate = useNavigate();
  const recheck = useRecheckProfile();
  const [phase, setPhase] = useState<Phase>(() => (isOnline() ? "saving" : "offline"));
  // Once an attempt has failed, Retry stays on screen through the next attempt (disabled while it
  // runs), so a quick second activation lands on the same button and is ignored.
  const [failedOnce, setFailedOnce] = useState(false);
  // Refs, not state: two Retry activations (or a Retry and an `online` event) in the same tick
  // must still start one attempt, and step 1 must not repeat once it has succeeded.
  const inFlight = useRef(false);
  const existenceChecked = useRef(false);
  const done = useRef(false);

  async function finish() {
    done.current = true;
    store.clearPendingPlan();
    await recheck();
    navigate("/", { replace: true });
  }

  async function attempt() {
    if (inFlight.current || done.current) return;
    if (!isOnline()) {
      setPhase("offline");
      return;
    }
    inFlight.current = true;
    setPhase("saving");
    try {
      if (!existenceChecked.current) {
        const { data, error } = await supabase.from("profiles").select("user_id").maybeSingle();
        if (error) throw error;
        existenceChecked.current = true;
        if (data) {
          // The existing profile wins (D-0064 §8): no write.
          await finish();
          return;
        }
      }

      const targets = deriveTargets({
        rhythmMin: plan.rhythmMin,
        rhythmMax: plan.rhythmMax,
        priorityAreas: [],
      });
      const rows: TablesInsert<"area_targets">[] = AREAS.map((area) => ({
        area_id: area,
        sets_per_14d: targets[area],
        source: "default",
      }));
      const targetsResult = await supabase
        .from("area_targets")
        .upsert(rows, { onConflict: "user_id,area_id" });
      if (targetsResult.error) throw targetsResult.error;

      const profile: TablesInsert<"profiles"> = {
        goal: plan.goal,
        level: plan.level,
        equipment: [...store.EQUIPMENT_PROFILES[plan.equipmentProfile]],
        rhythm_min: plan.rhythmMin,
        rhythm_max: plan.rhythmMax,
        priority_areas: [],
        onboarding_timing_ms: plan.timingMs,
      };
      const profileResult = await supabase
        .from("profiles")
        .upsert(profile, { onConflict: "user_id" });
      if (profileResult.error) throw profileResult.error;

      await finish();
    } catch {
      // D-0100 §4: the pending plan is kept, and Retry (or the next `online`) tries again.
      if (!done.current) {
        setFailedOnce(true);
        setPhase("error");
      }
    } finally {
      inFlight.current = false;
    }
  }
  // The listeners below are registered once; they call the latest `attempt` through this ref,
  // so a new `navigate` or `recheck` identity never re-runs the mount effect (and never retries
  // without a tap or an `online` event).
  const attemptRef = useRef(attempt);
  attemptRef.current = attempt;

  useEffect(() => {
    void attemptRef.current();
    const onOnline = () => void attemptRef.current();
    const onOffline = () => {
      if (!inFlight.current && !done.current) setPhase("offline");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return frame(
    <>
      <div className="wl-uf01__intro">
        <h1 className="wl-uf01__title wl-uf01__title--step">{t.heading}</h1>
        {phase === "saving" ? (
          <p role="status" className="wl-uf01__muted">
            {t.saving}
          </p>
        ) : null}
        {phase === "offline" ? (
          <p role="status" className="wl-uf01__muted">
            {t.offline}
          </p>
        ) : null}
        {phase === "error" ? (
          <p role="alert" className="wl-uf01__status">
            {t.error}
          </p>
        ) : null}
      </div>
      {phase === "error" || (phase === "saving" && failedOnce) ? (
        <div className="wl-uf01__actions">
          <button
            type="button"
            className="wl-uf01__primary"
            aria-disabled={phase === "error" ? "false" : "true"}
            onClick={() => {
              if (phase === "error") void attempt();
            }}
          >
            {t.retry}
          </button>
        </div>
      ) : null}
    </>,
  );
}
