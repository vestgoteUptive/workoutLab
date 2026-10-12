// UF-11.3 Edit plan body. The screen host and its <h1> live in `index.tsx` (first render, every
// state). The draft is initialised once from the first read that finds a profile; a later
// refresh never overwrites it, and that same snapshot is the Save baseline (D-0081 §2).
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { previewTargets } from "@workoutlab/engine";
import { AREAS, type Area, type EngineProfile, type Goal } from "@workoutlab/shared";
import { ArrowIcon, TickIcon } from "../../components/icons/index.js";
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

  const stepper = (
    label: string,
    value: number,
    names: { dec: string; inc: string },
    set: (n: number) => void,
  ) => (
    <div className="wl-edit__stepper">
      <span className="wl-type-body">{label}</span>
      <div className="wl-segmented">
        <button
          type="button"
          aria-label={names.dec}
          aria-disabled={value <= RHYTHM_MIN}
          onClick={() => {
            if (value > RHYTHM_MIN) set(value - 1);
          }}
        >
          −
        </button>
        <button
          type="button"
          aria-label={names.inc}
          aria-disabled={value >= RHYTHM_MAX}
          onClick={() => {
            if (value < RHYTHM_MAX) set(value + 1);
          }}
        >
          +
        </button>
      </div>
    </div>
  );

  return (
    <>
      <OfflineStatus variant="text" />
      <div role="radiogroup" aria-label={u.goalGroup} className="wl-edit__group">
        {GOALS.map((g) => (
          <label key={g} className="wl-option">
            <input
              type="radio"
              name="goal"
              value={g}
              checked={draft.goal === g}
              onChange={() => setDraft({ ...draft, goal: g })}
            />
            <span className="wl-type-body">{u.goals[g]}</span>
            <TickIcon size={20} className="wl-option__tick" />
          </label>
        ))}
      </div>
      <div role="group" aria-label={u.rhythmGroup} className="wl-edit__group">
        {stepper(u.minimum, draft.min, { dec: u.decreaseMin, inc: u.increaseMin }, setMin)}
        {stepper(u.maximum, draft.max, { dec: u.decreaseMax, inc: u.increaseMax }, setMax)}
        <p className="wl-type-body">{u.rhythm(draft.min, draft.max)}</p>
      </div>
      <div role="group" aria-label={u.priorityGroup} className="wl-edit__group">
        <div className="wl-edit__chips">
          {AREAS.map((area) => (
            <button
              key={area}
              type="button"
              className="wl-chip"
              aria-pressed={draft.priorities.includes(area)}
              onClick={() => togglePriority(area)}
            >
              <TickIcon size={16} className="wl-chip__tick" />
              {en.bodyMap.areas[area]}
            </button>
          ))}
        </div>
        <p role="status" className="wl-type-label">
          {limitHit ? u.pickUpToThree : null}
        </p>
      </div>
      <section className="wl-plan__section">
        <h2 className="wl-type-label">{u.previewHeading}</h2>
        <ul className="wl-edit__preview" aria-label={u.previewHeading}>
          {preview.map((p) => (
            <li key={p.area}>{u.previewRow(en.bodyMap.areas[p.area], p.setsPer14d)}</li>
          ))}
        </ul>
      </section>
      {failed ? <p role="alert">{u.saveFailed}</p> : null}
      {!online ? <p className="wl-type-label">{u.connectToSave}</p> : null}
      <Link className="wl-button--text wl-edit__cancel" to="/plan">
        {u.cancel}
      </Link>
      <button
        type="button"
        className="wl-button--primary"
        aria-disabled={!canSave}
        onClick={() => void onSave()}
      >
        {u.save}
        <ArrowIcon size={20} />
      </button>
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
        <p className="wl-type-label">{u.coldCache}</p>
        <Link className="wl-button--text" to="/plan">
          {u.cancel}
        </Link>
      </>
    );
  }
  return <OfflineStatus variant="text" />;
}
