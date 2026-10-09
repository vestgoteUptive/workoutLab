// UF-09.3 Current set (T-0304b, D-0066 §3 §6, D-0118 §5 §7–§9). Principle 1: one set and one big
// button. Principle 3: the engine's pre-fill is on screen, so the normal path is one tap. Done set
// writes IndexedDB through the hook first and only then moves on (NFR-OFF-2); the busy state is
// set before the write starts, in the same event (NFR-PERF-4).
import { useEffect, useRef, useState } from "react";
import { formatKg } from "../../lib/format/number.js";
import { en } from "../../lib/i18n/en.js";
import { nextSetPrefill } from "./prefill.js";
import { useFocusSession } from "./session.js";
import { useCue } from "./use-cue.js";
import type { ViewProps } from "./views.js";

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

  return (
    <div className="wl-uf09__view">
      <p className="wl-uf09__state">
        {backoff ? en.uf09.liftingBackoff : en.uf09.liftingCaption(state.setIndex + 1, item.sets)}
      </p>
      <h1 className="wl-uf09__title">{exercise?.name ?? item.exerciseId}</h1>
      {bodyweight ? (
        <p className="wl-uf09__load">{en.uf09.reps(reps)}</p>
      ) : prefill.weightKg === null ? (
        <div className="wl-uf09__load">
          <p className="wl-uf09__ask">{en.uf09.setWeight}</p>
          <p>{en.uf09.reps(reps)}</p>
        </div>
      ) : (
        <p className="wl-uf09__load">{en.uf09.load(formatKg(prefill.weightKg, locale), reps)}</p>
      )}
      {cue ? (
        <p className="wl-uf09__cue" data-field="cue">
          {cue}
        </p>
      ) : null}
      <button
        ref={doneRef}
        type="button"
        className="wl-uf09__primary wl-uf09__done"
        data-action="primary"
        data-state={saving ? "saving" : undefined}
        aria-busy={saving ? true : undefined}
        aria-disabled={saving ? true : undefined}
        onClick={onDone}
      >
        {en.uf09.doneSet}
      </button>
      <p className="wl-uf09__status" aria-live="polite">
        {failed ? en.uf09.doneSetError : null}
      </p>
    </div>
  );
}
