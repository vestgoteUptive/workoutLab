// UF-09.5 Rest (T-0304f, parent AC-B7, D-0066 §7, D-0118 §7 §10). Principle 1: the time, the
// next set only, and three ways to change the rest. The length is the machine's — the engine's
// constants by library `type` — so this view holds no rest length of its own (principle 3). The
// time is the persisted wall-clock timer (NFR-TIME-1); the screen's fill is the host's (T-0597,
// drain-fill.ts). "10 seconds" and "Go" are spoken by the chrome announcer in the host, which
// outlives this view (D-0118 §10).
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowIcon } from "../../components/icons/index.js";
import { formatKg } from "../../lib/format/number.js";
import { en } from "../../lib/i18n/en.js";
import { perSide, readReps } from "../../lib/i18n/per-side.js";
import { HeroLine, SrText } from "./hero-line.js";
import { isBodyweight, setAfterRest } from "./machine.js";
import { nextSetPrefill } from "./prefill.js";
import { useFocusSession } from "./session.js";
import { formatClock, remainingS } from "./timer.js";
import { useCachedFields } from "./use-cue.js";
import type { ViewProps } from "./views.js";

interface NextLine {
  /** The exercise the next set belongs to, and whether it is the one just done (`same`) or the next item. */
  exerciseId: string;
  kind: "same" | "new";
  caption: string;
  /** The reps set of the same exercise; `null` for another item or a timed set. */
  reps: number | null;
  /** Today's load line for an unflagged set; the per-side reading is built from the parts. */
  weightKg: number | null;
  bodyweight: boolean;
}

/** What the rest leads to (D-0118 §7, D-0273): the next set of this item, or the next item. */
function nextLine({ state, ctx }: Pick<ViewProps, "state" | "ctx" | "locale">): NextLine | null {
  const item = ctx.plan.items[state.itemIndex];
  if (!item) return null;
  const nextSet = setAfterRest(state, ctx);
  if (nextSet === null) {
    const nextItem = ctx.plan.items[state.itemIndex + 1];
    if (!nextItem) return null;
    return {
      exerciseId: nextItem.exerciseId,
      kind: "new",
      caption: en.uf09.titles.next,
      reps: null,
      weightKg: null,
      bodyweight: false,
    };
  }
  const caption =
    nextSet >= item.sets ? en.uf09.nextBackoff : en.uf09.nextSet(nextSet + 1, item.sets);
  const base = { exerciseId: item.exerciseId, kind: "same" as const, caption };
  if (item.repsMin === null) return { ...base, reps: null, weightKg: null, bodyweight: false };
  const prefill = nextSetPrefill(ctx.plan, state.itemIndex, nextSet, state.loggedSets);
  return {
    ...base,
    reps: prefill.reps ?? 0,
    weightKg: prefill.weightKg,
    bodyweight: isBodyweight(item.exerciseId, ctx.library),
  };
}

/** The cue of a new exercise: the cached cue, else the first how-to line, else nothing. */
function pickCue(cue: string | null, instructions: readonly string[]): string | null {
  if (cue) return cue;
  return instructions[0] ? instructions[0] : null;
}

/** The "Next" block (D-0273). Its own component so the cache hook is not conditional on `next`. */
function NextBlock({
  line,
  library,
  locale,
}: {
  line: NextLine;
  library: ViewProps["ctx"]["library"];
  locale: ViewProps["locale"];
}) {
  const { cue, instructions, unilateral } = useCachedFields(line.exerciseId);
  const name = library.find((e) => e.id === line.exerciseId)?.name ?? line.exerciseId;
  const side = perSide(unilateral);
  const flagged = unilateral !== null;
  const reps = line.reps ?? 0;
  const cueText = line.kind === "new" ? pickCue(cue, instructions) : null;
  let load: ReactNode = null;
  if (line.kind === "same" && line.reps !== null) {
    if (line.bodyweight) {
      load = flagged ? (
        <p className="wl-uf09__next-load wl-type-stat">
          <SrText text={readReps(reps, unilateral, locale)} />
          <HeroLine text={en.uf09.reps(reps)} suffix={side} ariaHidden />
        </p>
      ) : (
        <p className="wl-uf09__next-load wl-type-stat">{en.uf09.reps(reps)}</p>
      );
    } else if (line.weightKg === null) {
      load = (
        <div className="wl-uf09__next-load wl-type-stat">
          <p className="wl-uf09__ask">{en.uf09.setWeight}</p>
          {flagged ? (
            <p>
              <SrText text={readReps(reps, unilateral, locale)} />
              <HeroLine text={en.uf09.reps(reps)} suffix={side} ariaHidden />
            </p>
          ) : (
            <p>{en.uf09.reps(reps)}</p>
          )}
        </div>
      );
    } else {
      const kg = formatKg(line.weightKg, locale);
      const text = en.uf09.load(kg, reps);
      const split = text.indexOf("×");
      load = flagged ? (
        <p className="wl-uf09__next-load wl-type-stat">
          <SrText text={readReps(reps, unilateral, locale, kg)} />
          <HeroLine text={text.slice(0, split)} ariaHidden />
          <HeroLine text={text.slice(split)} suffix={side} ariaHidden />
        </p>
      ) : (
        <p className="wl-uf09__next-load wl-type-stat">{text}</p>
      );
    }
  }
  return (
    <div className="wl-uf09__next" data-field="next">
      <p className="wl-uf09__next-title wl-type-label">{line.caption}</p>
      <p className="wl-uf09__next-name">{name}</p>
      {load}
      {cueText === null ? null : <p className="wl-uf09__next-cue wl-type-body">{cueText}</p>}
    </div>
  );
}

export function Rest({ state, ctx, locale, nowMs }: ViewProps) {
  const session = useFocusSession();
  const skipRef = useRef<HTMLButtonElement>(null);
  const timer = state.timer;
  const remaining = timer ? remainingS(timer, nowMs) : 0;
  const next = nextLine({ state, ctx, locale });

  useEffect(() => {
    skipRef.current?.focus();
  }, []);

  return (
    <div className="wl-uf09__view wl-uf09__view--rest">
      <h1 className="wl-uf09__state wl-type-label">{en.uf09.titles.rest}</h1>
      <p className="wl-type-hero-number wl-uf09__count" role="timer">
        {formatClock(remaining)}
      </p>
      {remaining === 0 ? (
        <p className="wl-uf09__go wl-type-stat" data-field="go">
          {en.uf09.go}
        </p>
      ) : null}
      <div className="wl-uf09__adjust">
        <button
          type="button"
          className="wl-button--session-outline"
          onClick={() => session.adjustRest(-15)}
        >
          {en.uf09.restLess}
        </button>
        <button
          type="button"
          className="wl-button--session-outline"
          onClick={() => session.adjustRest(15)}
        >
          {en.uf09.restMore}
        </button>
      </div>
      {next ? <NextBlock line={next} library={ctx.library} locale={locale} /> : null}
      <button
        ref={skipRef}
        type="button"
        className="wl-button--session wl-uf09__action"
        data-action="primary"
        onClick={() => session.skipRest()}
      >
        {en.uf09.skipRest}
        <ArrowIcon />
      </button>
    </div>
  );
}
