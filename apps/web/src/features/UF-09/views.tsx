// The per-state view registry (D-0111 §9). These are deliberately bare placeholders: an <h1>,
// and `m:ss` for a phase with a timer. T-0304b–d replace them and own their buttons; `paused`
// has its one button, Resume.
import type { ReactElement } from "react";
import { en } from "../../lib/i18n/en.js";
import type { FocusState, Phase } from "./machine.js";
import { formatClock, remainingS } from "./timer.js";

export type ViewPhase = Exclude<Phase, "betweenItems" | "done">;

export interface ViewProps {
  state: FocusState;
  nowMs: number;
  onResume: () => void;
}

/** Screen ids of the machine states (D-0111 §3). */
export const SCREEN_IDS: Record<ViewPhase, string> = {
  getReady: "UF-09.1",
  warmup: "UF-09.2",
  set: "UF-09.3",
  confirm: "UF-09.4",
  rest: "UF-09.5",
  next: "UF-09.6",
  timed: "UF-09.7",
  timeCheck: "UF-09.8",
  paused: "UF-09.9",
};

function Placeholder({ phase, state, nowMs }: ViewProps & { phase: ViewPhase }) {
  return (
    <div className="wl-uf09__view">
      <h1 className="wl-uf09__title">{en.uf09.titles[phase]}</h1>
      {state.timer ? (
        <p className="wl-uf09__timer" role="timer">
          {formatClock(remainingS(state.timer, nowMs))}
        </p>
      ) : null}
    </div>
  );
}

function Paused({ onResume }: ViewProps) {
  return (
    <div className="wl-uf09__view">
      <h1 className="wl-uf09__title">{en.uf09.titles.paused}</h1>
      <button type="button" className="wl-uf09__primary" onClick={onResume}>
        {en.uf09.resume}
      </button>
    </div>
  );
}

const placeholder = (phase: ViewPhase) => {
  const View = (props: ViewProps) => <Placeholder {...props} phase={phase} />;
  return View;
};

export const VIEWS: Record<ViewPhase, (props: ViewProps) => ReactElement> = {
  getReady: placeholder("getReady"),
  warmup: placeholder("warmup"),
  set: placeholder("set"),
  confirm: placeholder("confirm"),
  rest: placeholder("rest"),
  next: placeholder("next"),
  timed: placeholder("timed"),
  timeCheck: placeholder("timeCheck"),
  paused: Paused,
};
