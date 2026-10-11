// UF-09.3 Current set (T-0304b, D-0066 §3 §6, D-0118 §5 §7–§9). Principle 1: one set and one big
// button. Principle 3: the engine's pre-fill is on screen, so the normal path is one tap. Done set
// writes IndexedDB through the hook first and only then moves on (NFR-OFF-2); the busy state is
// set before the write starts, in the same event (NFR-PERF-4).
import { useEffect, useRef, useState } from "react";
import { TickIcon } from "../../components/icons/index.js";
import { formatKg } from "../../lib/format/number.js";
import { en } from "../../lib/i18n/en.js";
import { nextSetPrefill } from "./prefill.js";
import { useFocusSession } from "./session.js";
import { useCue } from "./use-cue.js";
import type { ViewProps } from "./views.js";

/** One hero line of the load. The kilo line splits into the number and its small unit (the two
 *  spans read back as the unchanged text); the words line ("8 reps", "Set weight") is one text
 *  node at the stat size, since it has no short number to enlarge. */
interface HeroLineProps {
  text: string;
  hero?: boolean;
  unit?: boolean;
}

function HeroLine({ text, hero = false, unit = false }: HeroLineProps) {
  const at = unit ? text.search(/[\s\u00A0]/) : -1;
  const role = hero ? "wl-type-hero-number" : "wl-type-stat";
  if (at < 0) return <span className={`${role} wl-uf09__hero`}>{text}</span>;
  return (
    <span className={`${role} wl-uf09__hero`}>
      {text.slice(0, at)}
      <span className="wl-uf09__unit">{text.slice(at)}</span>
    </span>
  );
}

export function CurrentSet({ state, ctx, locale }: ViewProps) {
  const session = useFocusSession();
  const item = ctx.plan.items[state.itemIndex]!;
  const exercise = ctx.library.find((e) => e.id === item.exerciseId);
  const bodyweight = exercise?.externalLoad === false;
  const backoff = state.setIndex >= item.sets;
  const prefill = nextSetPrefill(ctx.plan, state.itemIndex, state.setIndex, state.loggedSets);
  const reps = prefill.reps ?? 0;
  const cue = useCue(item.exerciseId);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const doneRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    doneRef.current?.focus();
  }, []);

  const onDone = () => {
    // One write per set (NFR-SYNC-1): a second tap while the first is pending does nothing.
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setFailed(false);
    session
      .recordSet({
        sessionId: session.sessionId,
        itemIndex: state.itemIndex,
        exerciseId: item.exerciseId,
        setIndex: state.setIndex,
        kind: "reps",
        reps,
        weightKg: prefill.weightKg,
        isWarmup: false,
        backoff,
      })
      .then(
        // On success the machine is in `confirm` and this view unmounts.
        () => undefined,
        () => {
          pending.current = false;
          setSaving(false);
          setFailed(true);
        },
      );
  };

  // "100 kg × 8" on two hero lines, "100 kg" then "× 8", the text itself unchanged.
  const load = bodyweight || prefill.weightKg === null ? null : formatKg(prefill.weightKg, locale);
  const loadText = load === null ? "" : en.uf09.load(load, reps);
  const split = loadText.indexOf("×");

  return (
    <div className="wl-uf09__view wl-uf09__view--lift">
      <p className="wl-uf09__state wl-type-label">
        {backoff ? en.uf09.liftingBackoff : en.uf09.liftingCaption(state.setIndex + 1, item.sets)}
      </p>
      <h1 className="wl-type-page-title wl-uf09__name">{exercise?.name ?? item.exerciseId}</h1>
      {bodyweight ? (
        <p className="wl-uf09__load">
          <HeroLine text={en.uf09.reps(reps)} />
        </p>
      ) : load === null ? (
        <div className="wl-uf09__load">
          <p className="wl-uf09__ask wl-type-stat">{en.uf09.setWeight}</p>
          <p>
            <HeroLine text={en.uf09.reps(reps)} />
          </p>
        </div>
      ) : (
        <p className="wl-uf09__load">
          <HeroLine text={loadText.slice(0, split)} hero unit />
          <HeroLine text={loadText.slice(split)} hero />
        </p>
      )}
      {cue ? (
        <p className="wl-uf09__cue wl-type-body" data-field="cue">
          {cue}
        </p>
      ) : null}
      <button
        ref={doneRef}
        type="button"
        className="wl-button--session wl-uf09__done"
        data-action="primary"
        data-state={saving ? "saving" : undefined}
        aria-busy={saving ? true : undefined}
        aria-disabled={saving ? true : undefined}
        onClick={onDone}
      >
        {en.uf09.doneSet}
        <TickIcon />
      </button>
      <p className="wl-uf09__status wl-type-label" aria-live="polite">
        {failed ? en.uf09.doneSetError : null}
      </p>
    </div>
  );
}
