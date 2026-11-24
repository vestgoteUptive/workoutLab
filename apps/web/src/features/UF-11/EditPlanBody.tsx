// UF-11.3 Edit plan body. The screen host and its <h1> live in `index.tsx` (first render, every
// state). The draft is initialised once from the first read that finds a profile; a later
// refresh never overwrites it, and that same snapshot is the Save baseline (D-0081 §2).
// T-0682 (D-0230, D-0233 §1–§2): a Level radiogroup after Goal; a level-only Save is one
// `profiles.update({ level })` (`saveLevel`), anything else is the D-0070 §3 three writes.
import { useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { previewTargets } from "@workoutlab/engine";
import { AREAS, type Area, type EngineProfile, type Goal, type Level } from "@workoutlab/shared";
import { ArrowIcon, TickIcon } from "../../components/icons/index.js";
import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";
import { en } from "../../lib/i18n/en.js";
import { resolveTimeZone } from "./format.js";
import { refreshAfterSave, saveLevel, savePlan, type SaveScope } from "./save-plan.js";
import { useOnline, usePlanData, type Clock } from "./use-plan-data.js";
import "./plan.css";

const u = en.uf11;
const GOALS: Goal[] = ["build_muscle", "get_stronger", "general_fitness"];
const LEVELS: Level[] = ["beginner", "intermediate", "advanced"];
const MAX_PRIORITIES = 3;
const RHYTHM_MIN = 1;
const RHYTHM_MAX = 7;

interface Draft {
  goal: Goal;
  level: Level;
  min: number;
  max: number;
  priorities: readonly Area[];
}

function fromProfile(p: EngineProfile): Draft {
  return {
    goal: p.goal,
    level: p.level,
    min: p.rhythmMin,
    max: p.rhythmMax,
    priorities: [...p.priorityAreas],
  };
}

/** Whether anything other than the level differs: goal, rhythm or priority areas. */
function planDiffers(a: Draft, b: Draft): boolean {
  if (a.goal !== b.goal || a.min !== b.min || a.max !== b.max) return true;
  if (a.priorities.length !== b.priorities.length) return true;
  return a.priorities.some((area) => !b.priorities.includes(area));
}

function differs(a: Draft, b: Draft): boolean {
  return a.level !== b.level || planDiffers(a, b);
}

/** T-0683b (D-0230 §5): `from` is a fixed token, never a URL. Exact match only, so nothing the
 *  query carries can send the user off-site. */
function useReturn(): { to: string; state: { focusTitle: true } | undefined } {
  const [params] = useSearchParams();
  return params.get("from") === "favorites"
    ? { to: "/plan/favorites", state: { focusTitle: true } }
    : { to: "/plan", state: undefined };
}

function EditForm({ profile, clock }: { profile: EngineProfile; clock: Clock }) {
  const navigate = useNavigate();
  const back = useReturn();
  const online = useOnline();
  const [baseline] = useState<Draft>(() => fromProfile(profile));
  const [draft, setDraft] = useState<Draft>(baseline);
  const [limitHit, setLimitHit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const savingRef = useRef(false);
  const idBase = useId();
  const levelNoteId = `${idBase}-level-note`;
  const levelNameId = (level: Level) => `${idBase}-level-${level}`;
  const levelHintId = (level: Level) => `${idBase}-level-${level}-hint`;
  // T-0687 (WCAG 3.3.2): each group is named by a visible `.wl-label` heading above it.
  const goalHeadId = `${idBase}-goal-heading`;
  const levelHeadId = `${idBase}-level-heading`;
  const rhythmHeadId = `${idBase}-rhythm-heading`;
  const priorityHeadId = `${idBase}-priority-heading`;

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
    let scope: SaveScope = "level";
    // T-0363 point 1: the guard is released in `finally`, whatever path the save takes.
    try {
      try {
        if (planDiffers(draft, baseline)) {
          scope = "full";
          await savePlan({
            goal: draft.goal,
            level: draft.level,
            rhythmMin: draft.min,
            rhythmMax: draft.max,
            priorityAreas: inFixedOrder,
            preview,
            now,
          });
        } else {
          // Only the level differs (D-0230 §2): targets, a pending check-in and the rule 9
          // streak stay as they are.
          await saveLevel({ level: draft.level });
        }
      } catch {
        setFailed(true);
        return;
      }
      // The writes are done: a failed re-read is retried once and never keeps the user here
      // (T-0690, D-0270). The result is not shown.
      await refreshAfterSave({ scope, now, tz: resolveTimeZone() });
      navigate(back.to, back.state ? { state: back.state } : undefined);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
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
      <h2 id={goalHeadId} className="wl-label">
        {u.goalGroup}
      </h2>
      <div role="radiogroup" aria-labelledby={goalHeadId} className="wl-edit__group">
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
      <h2 id={levelHeadId} className="wl-label">
        {u.levelGroup}
      </h2>
      <div
        role="radiogroup"
        aria-labelledby={levelHeadId}
        aria-describedby={levelNoteId}
        className="wl-edit__group"
      >
        {LEVELS.map((level) => (
          <label key={level} className="wl-option">
            <input
              type="radio"
              name="level"
              value={level}
              checked={draft.level === level}
              aria-labelledby={levelNameId(level)}
              aria-describedby={levelHintId(level)}
              onChange={() => setDraft({ ...draft, level })}
            />
            <span className="wl-edit__option-text">
              <span id={levelNameId(level)} className="wl-type-body">
                {u.levels[level].label}
              </span>
              <span id={levelHintId(level)} className="wl-type-label">
                {u.levels[level].hint}
              </span>
            </span>
            <TickIcon size={20} className="wl-option__tick" />
          </label>
        ))}
      </div>
      <p id={levelNoteId} className="wl-type-label wl-edit__note">
        {u.levelNote}
      </p>
      <h2 id={rhythmHeadId} className="wl-label">
        {u.rhythmGroup}
      </h2>
      <div role="group" aria-labelledby={rhythmHeadId} className="wl-edit__group">
        {stepper(u.minimum, draft.min, { dec: u.decreaseMin, inc: u.increaseMin }, setMin)}
        {stepper(u.maximum, draft.max, { dec: u.decreaseMax, inc: u.increaseMax }, setMax)}
        <p className="wl-type-body">{u.rhythm(draft.min, draft.max)}</p>
      </div>
      <h2 id={priorityHeadId} className="wl-label">
        {u.priorityGroup}
      </h2>
      <div role="group" aria-labelledby={priorityHeadId} className="wl-edit__group">
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
        <h2 className="wl-label">{u.previewHeading}</h2>
        <ul className="wl-edit__preview" aria-label={u.previewHeading}>
          {preview.map((p) => (
            <li key={p.area}>{u.previewRow(en.bodyMap.areas[p.area], p.setsPer14d)}</li>
          ))}
        </ul>
      </section>
      {failed ? <p role="alert">{u.saveFailed}</p> : null}
      {!online ? <p className="wl-type-label">{u.connectToSave}</p> : null}
      <Link className="wl-button--text wl-edit__cancel" to={back.to} state={back.state}>
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
  const back = useReturn();
  // The first read that finds a profile fixes the draft: `EditForm` keeps its own snapshot, and
  // a later `ready` state (after the refresh) only re-renders it with a new, ignored `profile`.
  if (state.phase === "ready") return <EditForm profile={state.data.profile} clock={clock} />;
  if (state.phase === "cold") {
    return (
      <>
        <OfflineStatus variant="text" />
        <p className="wl-type-label">{u.coldCache}</p>
        <Link className="wl-button--text" to={back.to} state={back.state}>
          {u.cancel}
        </Link>
      </>
    );
  }
  return <OfflineStatus variant="text" />;
}
