// The per-state view registry (D-0111 §9). These are deliberately bare placeholders: an <h1>,
// and `m:ss` for a phase with a timer. T-0304b–d replace them and own their buttons; `paused`
// has its one button, Resume.
import type { ReactElement, ReactNode } from "react";
import { en } from "../../lib/i18n/en.js";
import type { FocusState, Phase } from "./machine.js";
import { orderActions } from "./seams.js";
import { formatClock, remainingS } from "./timer.js";

export type ViewPhase = Exclude<Phase, "betweenItems" | "done">;

/** A seam entry as a button on UF-09.6 / UF-09.9 (T-0304e, D-0071 §4). */
export interface SeamButton {
  id: string;
  label: string;
  onSelect: () => void;
}

export interface ViewProps {
  state: FocusState;
  nowMs: number;
  onResume: () => void;
  /** The seam entries for this screen: `pause` on UF-09.9, `next` on UF-09.6, else none. */
  seams: readonly SeamButton[];
}

function SeamButtonView({ seam }: { seam: SeamButton }) {
  return (
    <button
      type="button"
      className="wl-uf09__secondary"
      data-seam-id={seam.id}
      onClick={seam.onSelect}
    >
      {seam.label}
    </button>
  );
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

function Placeholder({
  phase,
  state,
  nowMs,
  children,
}: ViewProps & { phase: ViewPhase; children?: ReactNode }) {
  return (
    <div className="wl-uf09__view">
      <h1 className="wl-uf09__title">{en.uf09.titles[phase]}</h1>
      {state.timer ? (
        <p className="wl-uf09__timer" role="timer">
          {formatClock(remainingS(state.timer, nowMs))}
        </p>
      ) : null}
      {children}
    </div>
  );
}

function Paused({ onResume, seams }: ViewProps) {
  // T-0304d adds Skip ("skip") and End workout ("end") at their `orderActions` positions.
  const ids = orderActions(["resume"], seams, "pause");
  return (
    <div className="wl-uf09__view">
      <h1 className="wl-uf09__title">{en.uf09.titles.paused}</h1>
      {ids.map((id) => {
        if (id === "resume") {
          return (
            <button key={id} type="button" className="wl-uf09__primary" onClick={onResume}>
              {en.uf09.resume}
            </button>
          );
        }
        const seam = seams.find((s) => s.id === id);
        return seam ? <SeamButtonView key={id} seam={seam} /> : null;
      })}
    </div>
  );
}

function Next(props: ViewProps) {
  // T-0304b adds I'm ready ("ready") before the seams.
  const ids = orderActions([], props.seams, "next");
  return (
    <Placeholder {...props} phase="next">
      {ids.map((id) => {
        const seam = props.seams.find((s) => s.id === id);
        return seam ? <SeamButtonView key={id} seam={seam} /> : null;
      })}
    </Placeholder>
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
  next: Next,
  timed: placeholder("timed"),
  timeCheck: placeholder("timeCheck"),
  paused: Paused,
};
