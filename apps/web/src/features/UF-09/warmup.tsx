// UF-09.2 Warm-up (T-0304c, parent AC-C1, D-0066 §8, D-0119 §5). Principle 1: one move, its cue,
// and two ways to change it. Each move is the machine's persisted wall-clock timer (NFR-TIME-1);
// at 0 the host dispatches `WARMUP_NEXT`. Warm-up moves are never logged as sets (D-0004).
import { useEffect, useRef } from "react";
import { en } from "../../lib/i18n/en.js";
import { Ring } from "./ring.js";
import { formatClock, remainingS } from "./timer.js";
import { useCue } from "./use-cue.js";
import type { ViewProps } from "./views.js";

export function Warmup({ state, ctx, nowMs, send }: ViewProps) {
  const moves = ctx.plan.warmup;
  const move = moves[state.warmupIndex] ?? moves[0]!;
  // The library name, else the id (D-0118 §8).
  const name = ctx.library.find((e) => e.id === move.exerciseId)?.name ?? move.exerciseId;
  const cue = useCue(move.exerciseId);
  const nextRef = useRef<HTMLButtonElement>(null);
  const remaining = state.timer ? remainingS(state.timer, nowMs) : 0;
  const total = state.timer?.durationS ?? move.durationS;

  useEffect(() => {
    nextRef.current?.focus();
  }, []);

  return (
    <div className="wl-uf09__view">
      <p className="wl-uf09__set-line" data-field="move-index">
        {en.uf09.warmupMove(state.warmupIndex + 1, moves.length)}
      </p>
      <h1 className="wl-uf09__title">{name}</h1>
      <Ring fraction={total > 0 ? remaining / total : 0} warn={false}>
        <p className="wl-uf09__ring-time" role="timer">
          {formatClock(remaining)}
        </p>
      </Ring>
      {cue ? (
        <p className="wl-uf09__cue" data-field="cue">
          {cue}
        </p>
      ) : null}
      <button
        type="button"
        className="wl-uf09__secondary wl-uf09__wide"
        onClick={() => send({ type: "WARMUP_RESTART" })}
      >
        {en.uf09.restartMove}
      </button>
      <button
        ref={nextRef}
        type="button"
        className="wl-uf09__primary wl-uf09__wide"
        data-action="primary"
        onClick={() => send({ type: "WARMUP_NEXT" })}
      >
        {en.uf09.nextMove}
      </button>
    </div>
  );
}
