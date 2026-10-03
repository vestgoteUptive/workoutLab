// UF-09.5 Rest (T-0304f, parent AC-B7, D-0066 §7, D-0118 §7 §10). Principle 1: the ring, the
// next set only, and three ways to change the rest. The length is the machine's — the engine's
// constants by library `type` — so this view holds no rest length of its own (principle 3). The
// ring is the persisted wall-clock timer (NFR-TIME-1); "10 seconds" and "Go" are spoken by the
// chrome announcer in the host, which outlives this view (D-0118 §10).
import { useEffect, useRef } from "react";
import { formatKg } from "../../lib/format/number.js";
import { en } from "../../lib/i18n/en.js";
import { isBodyweight, setAfterRest } from "./machine.js";
import { nextSetPrefill } from "./prefill.js";
import { useRingTransition } from "./reduced-motion.js";
import { useFocusSession } from "./session.js";
import { formatClock, remainingS } from "./timer.js";
import type { ViewProps } from "./views.js";

/** At or below this many seconds left, the ring turns to the warn colour (parent AC-B7). */
export const REST_WARN_S = 10;
/** The ring's radius in its 100 × 100 view box. */
const RING_R = 45;
const RING_C = 2 * Math.PI * RING_R;
const RING_CENTRE = 50;

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
  const fraction = timer && timer.durationS > 0 ? Math.min(1, remaining / timer.durationS) : 0;
  const warn = remaining <= REST_WARN_S;
  const next = nextLine({ state, ctx, locale });
  // T-0304g (NFR-A11Y-5, D-0119 §10): no sweep under reduced motion; the label still counts.
  const transition = useRingTransition();

  useEffect(() => {
    skipRef.current?.focus();
  }, []);

  return (
    <div className="wl-uf09__view">
      <h1 className="wl-uf09__title">{en.uf09.titles.rest}</h1>
      <div className="wl-uf09__ring" data-field="ring" data-warn={warn ? "true" : "false"}>
        <svg className="wl-uf09__ring-svg" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="wl-uf09__ring-track" cx={RING_CENTRE} cy={RING_CENTRE} r={RING_R} />
          <circle
            className="wl-uf09__ring-fill"
            cx={RING_CENTRE}
            cy={RING_CENTRE}
            r={RING_R}
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - fraction)}
            style={{ transition }}
          />
        </svg>
        <div className="wl-uf09__ring-label">
          <p className="wl-uf09__ring-time" role="timer">
            {formatClock(remaining)}
          </p>
          {remaining === 0 ? (
            <p className="wl-uf09__ring-go" data-field="go">
              {en.uf09.go}
            </p>
          ) : null}
        </div>
      </div>
      {next ? (
        <div className="wl-uf09__next" data-field="next">
          <p className="wl-uf09__next-title">{next.title}</p>
          {next.load?.kind === "kg" ? <p className="wl-uf09__next-load">{next.load.text}</p> : null}
          {next.load?.kind === "bw" ? <p className="wl-uf09__next-load">{next.load.reps}</p> : null}
          {next.load?.kind === "ask" ? (
            <div className="wl-uf09__next-load">
              <p className="wl-uf09__ask">{en.uf09.setWeight}</p>
              <p>{next.load.reps}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="wl-uf09__adjust">
        <button
          type="button"
          className="wl-uf09__secondary"
          onClick={() => session.adjustRest(-15)}
        >
          {en.uf09.restLess}
        </button>
        <button type="button" className="wl-uf09__secondary" onClick={() => session.adjustRest(15)}>
          {en.uf09.restMore}
        </button>
      </div>
      <button
        ref={skipRef}
        type="button"
        className="wl-uf09__primary wl-uf09__wide"
        data-action="primary"
        onClick={() => session.skipRest()}
      >
        {en.uf09.skipRest}
      </button>
    </div>
  );
}
