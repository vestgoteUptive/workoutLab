// UF-11.3 Edit plan body. The screen host and its <h1> live in `index.tsx` (first render, every
// state). The draft is initialised once from the first read that finds a profile; a later
// refresh never overwrites it, and that same snapshot is the Save baseline (D-0081 §2).
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { previewTargets } from "@workoutlab/engine";
import { AREAS, type Area, type EngineProfile, type Goal } from "@workoutlab/shared";
import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";
import { en } from "../../lib/i18n/en.js";
import { refreshAll } from "../../lib/offline/index.js";
import { resolveTimeZone } from "./format.js";
import { savePlan } from "./save-plan.js";
import { useOnline, usePlanData, type Clock } from "./use-plan-data.js";
import "./plan.css";

const u = en.uf11;
const GOALS: Goal[] = ["build_muscle", "get_stronger", "general_fitness"];
const MAX_PRIORITIES = 3;
const RHYTHM_MIN = 1;
const RHYTHM_MAX = 7;

interface Draft {
  goal: Goal;
  min: number;
  max: number;
  priorities: readonly Area[];
}

function fromProfile(p: EngineProfile): Draft {
  return { goal: p.goal, min: p.rhythmMin, max: p.rhythmMax, priorities: [...p.priorityAreas] };
}

function differs(a: Draft, b: Draft): boolean {
  if (a.goal !== b.goal || a.min !== b.min || a.max !== b.max) return true;
  if (a.priorities.length !== b.priorities.length) return true;
  return a.priorities.some((area) => !b.priorities.includes(area));
}

function EditForm({ profile, clock }: { profile: EngineProfile; clock: Clock }) {
  const navigate = useNavigate();
  const online = useOnline();
  const [baseline] = useState<Draft>(() => fromProfile(profile));
  const [draft, setDraft] = useState<Draft>(baseline);
  const [limitHit, setLimitHit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const savingRef = useRef(false);

  const inFixedOrder = useMemo(
    () => AREAS.filter((a) => draft.priorities.includes(a)),
    [draft.priorities],
  );
  const preview = useMemo(
    () =>
      previewTargets({
        rhythmMin: draft.min,
        rhythmMax: draft.max,
        priorityAreas: inFixedOrder,
      }),
    [draft.min, draft.max, inFixedOrder],
  );

  const dirty = differs(draft, baseline);
  const canSave = dirty && online && !saving;

  function togglePriority(area: Area) {
    if (draft.priorities.includes(area)) {
      const next = draft.priorities.filter((a) => a !== area);
      setDraft({ ...draft, priorities: next });
      if (next.length < MAX_PRIORITIES) setLimitHit(false);
      return;
    }
    if (draft.priorities.length >= MAX_PRIORITIES) {
      setLimitHit(true);
      return;
    }
    setDraft({ ...draft, priorities: [...draft.priorities, area] });
  }

  function setMin(min: number) {
    setDraft({ ...draft, min, max: Math.max(draft.max, min) });
  }
  function setMax(max: number) {
    setDraft({ ...draft, max, min: Math.min(draft.min, max) });
  }

  async function onSave() {
    if (!canSave || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFailed(false);
    const now = clock();
    try {
      await savePlan({
        goal: draft.goal,
        rhythmMin: draft.min,
        rhythmMax: draft.max,
        priorityAreas: inFixedOrder,
        preview,
        now,
      });
    } catch {
      savingRef.current = false;
      setSaving(false);
      setFailed(true);
      return;
    }
    try {
      await refreshAll(now, resolveTimeZone());
    } catch {
      // The writes are done: a failed re-read must not keep the user on this screen.
    }
    navigate("/plan");
  }

  return (
    <>
      <OfflineStatus variant="text" />
      <div role="radiogroup" aria-label={u.goalGroup} className="wl-plan__section">
        {GOALS.map((g) => (
          <label key={g} className="wl-plan__radio" data-checked={draft.goal === g}>
            <input
              type="radio"
              name="goal"
              value={g}
              checked={draft.goal === g}
              onChange={() => setDraft({ ...draft, goal: g })}
            />
            <span>{u.goals[g]}</span>
          </label>
        ))}
      </div>
      <div role="group" aria-label={u.rhythmGroup} className="wl-plan__section">
        <div className="wl-plan__stepper">
          <span>{u.minimum}</span>
          <button
            type="button"
            className="wl-plan__button"
            aria-label={u.decreaseMin}
            disabled={draft.min <= RHYTHM_MIN}
            onClick={() => setMin(draft.min - 1)}
          >
            −
          </button>
          <button
            type="button"
            className="wl-plan__button"
            aria-label={u.increaseMin}
            disabled={draft.min >= RHYTHM_MAX}
            onClick={() => setMin(draft.min + 1)}
          >
            +
          </button>
        </div>
        <div className="wl-plan__stepper">
          <span>{u.maximum}</span>
          <button
            type="button"
            className="wl-plan__button"
            aria-label={u.decreaseMax}
            disabled={draft.max <= RHYTHM_MIN}
            onClick={() => setMax(draft.max - 1)}
          >
            −
          </button>
          <button
            type="button"
            className="wl-plan__button"
            aria-label={u.increaseMax}
            disabled={draft.max >= RHYTHM_MAX}
            onClick={() => setMax(draft.max + 1)}
          >
            +
          </button>
        </div>
        <p>{u.rhythm(draft.min, draft.max)}</p>
      </div>
      <div role="group" aria-label={u.priorityGroup} className="wl-plan__section">
        <div className="wl-plan__chips">
          {AREAS.map((area) => (
            <button
              key={area}
              type="button"
              className="wl-plan__button wl-plan__chip"
              aria-pressed={draft.priorities.includes(area)}
              onClick={() => togglePriority(area)}
            >
              {en.bodyMap.areas[area]}
            </button>
          ))}
        </div>
        <p role="status">{limitHit ? u.pickUpToThree : null}</p>
      </div>
      <section className="wl-plan__section">
        <h2>{u.previewHeading}</h2>
        <ul className="wl-plan__list" aria-label={u.previewHeading}>
          {preview.map((p) => (
            <li key={p.area}>{u.previewRow(en.bodyMap.areas[p.area], p.setsPer14d)}</li>
          ))}
        </ul>
      </section>
      {failed ? <p role="alert">{u.saveFailed}</p> : null}
      {!online ? <p>{u.connectToSave}</p> : null}
      <div className="wl-plan__actions">
        <button
          type="button"
          className="wl-plan__button wl-plan__button--primary"
          disabled={!canSave}
          onClick={() => void onSave()}
        >
          {u.save}
        </button>
        <Link className="wl-plan__link" to="/plan">
          {u.cancel}
        </Link>
      </div>
    </>
  );
}

export function EditPlanBody({ clock }: { clock: Clock }) {
  const state = usePlanData(clock);
  // The first read that finds a profile fixes the draft: `EditForm` keeps its own snapshot, and
  // a later `ready` state (after the refresh) only re-renders it with a new, ignored `profile`.
  if (state.phase === "ready") return <EditForm profile={state.data.profile} clock={clock} />;
  if (state.phase === "cold") {
    return (
      <>
        <OfflineStatus variant="text" />
        <p>{u.coldCache}</p>
        <Link className="wl-plan__link" to="/plan">
          {u.cancel}
        </Link>
      </>
    );
  }
  return <OfflineStatus variant="text" />;
}
