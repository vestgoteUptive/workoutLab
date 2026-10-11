// UF-09.5 Rest (T-0304f, parent AC-B7, D-0066 §7, D-0118 §7 §10). Principle 1: the time, the
// next set only, and three ways to change the rest. The length is the machine's — the engine's
// constants by library `type` — so this view holds no rest length of its own (principle 3). The
// time is the persisted wall-clock timer (NFR-TIME-1); the screen's fill is the host's (T-0597,
// drain-fill.ts). "10 seconds" and "Go" are spoken by the chrome announcer in the host, which
// outlives this view (D-0118 §10).
import { useEffect, useRef } from "react";
import { ArrowIcon } from "../../components/icons/index.js";
import { formatKg } from "../../lib/format/number.js";
import { en } from "../../lib/i18n/en.js";
import { isBodyweight, setAfterRest } from "./machine.js";
import { nextSetPrefill } from "./prefill.js";
import { useFocusSession } from "./session.js";
import { formatClock, remainingS } from "./timer.js";
import type { ViewProps } from "./views.js";

interface NextLine {
  title: string;
  /** The load line for a reps set; `null` for another item or a timed set. */
  load:
    | { kind: "kg"; text: string }
    | { kind: "ask"; reps: string }
    | { kind: "bw"; reps: string }
    | null;
}

/** What the rest leads to (D-0118 §7): the next set of this item, or the next item's name. */
function nextLine({
  state,
  ctx,
  locale,
}: Pick<ViewProps, "state" | "ctx" | "locale">): NextLine | null {
  const item = ctx.plan.items[state.itemIndex];
  if (!item) return null;
  const nextSet = setAfterRest(state, ctx);
  if (nextSet === null) {
    const nextItem = ctx.plan.items[state.itemIndex + 1];
    if (!nextItem) return null;
    const name = ctx.library.find((e) => e.id === nextItem.exerciseId)?.name ?? nextItem.exerciseId;
    return { title: en.uf09.nextItem(name), load: null };
  }
  const title =
    nextSet >= item.sets ? en.uf09.nextBackoff : en.uf09.nextSet(nextSet + 1, item.sets);
  if (item.repsMin === null) return { title, load: null };
  const prefill = nextSetPrefill(ctx.plan, state.itemIndex, nextSet, state.loggedSets);
  const reps = prefill.reps ?? 0;
  if (isBodyweight(item.exerciseId, ctx.library)) {
    return { title, load: { kind: "bw", reps: en.uf09.reps(reps) } };
  }
  if (prefill.weightKg === null) return { title, load: { kind: "ask", reps: en.uf09.reps(reps) } };
  return {
    title,
    load: { kind: "kg", text: en.uf09.load(formatKg(prefill.weightKg, locale), reps) },
  };
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
      {next ? (
        <div className="wl-uf09__next" data-field="next">
          <p className="wl-uf09__next-title wl-type-label">{next.title}</p>
          {next.load?.kind === "kg" ? (
            <p className="wl-uf09__next-load wl-type-stat">{next.load.text}</p>
          ) : null}
          {next.load?.kind === "bw" ? (
            <p className="wl-uf09__next-load wl-type-stat">{next.load.reps}</p>
          ) : null}
          {next.load?.kind === "ask" ? (
            <div className="wl-uf09__next-load wl-type-stat">
              <p className="wl-uf09__ask">{en.uf09.setWeight}</p>
              <p>{next.load.reps}</p>
            </div>
          ) : null}
        </div>
      ) : null}
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
