// The per-state view registry (D-0111 §9). The placeholders are deliberately bare: an <h1>,
// and `m:ss` for a phase with a timer. T-0304b–d replace them and own their buttons; `paused`
// has its one button, Resume. T-0304b: UF-09.3 (`set`) and UF-09.4 (`confirm`) are built.
// T-0304f: UF-09.1 (`getReady`), UF-09.5 (`rest`) and UF-09.6 (`next`) are built.
// T-0304c: UF-09.2 (`warmup`) and UF-09.7 (`timed`) are built.
import type { ReactElement, ReactNode } from "react";
import { en } from "../../lib/i18n/en.js";
import { ConfirmSet } from "./confirm-set.js";
import { CurrentSet } from "./current-set.js";
import { GetReady } from "./get-ready.js";
import type { FocusCtx, FocusEvent, FocusState, LoggedSet, Phase } from "./machine.js";
import { NextExercise } from "./next-exercise.js";
import { Rest } from "./rest.js";
import { orderActions } from "./seams.js";
import { TimedSet } from "./timed-set.js";
import { formatClock, remainingS } from "./timer.js";
import { Warmup } from "./warmup.js";

export type ViewPhase = Exclude<Phase, "betweenItems" | "done">;

/** A machine event without its `atMs`: the host stamps `Date.now()` when it dispatches. */
export type ViewEvent = FocusEvent extends infer E
  ? E extends unknown
    ? Omit<E, "atMs">
    : never
  : never;

/** A seam entry as a button on UF-09.6 / UF-09.9 (T-0304e, D-0071 §4). */
export interface SeamButton {
  id: string;
  label: string;
  onSelect: () => void;
}

export interface ViewProps {
  state: FocusState;
  /** The plan and library the machine walks (names, increments, bodyweight). */
  ctx: FocusCtx;
  /** The number locale for kg values (D-0118 §6); `undefined` means the runtime default. */
  locale: string | undefined;
  nowMs: number;
  /** UF-09.4: a touch stops the auto-save (`AUTOSAVE_CANCEL`, D-0118 §3). */
  onCancelAutosave: () => void;
  /** UF-09.4: the set is saved (`SAVED`), with the edited entry when Save changed it. */
  onSaved: (set?: LoggedSet) => void;
  onResume: () => void;
  /** Dispatches a machine event now (UF-09.1 Start now / Skip warm-up, UF-09.6 I'm ready). */
  send: (event: ViewEvent) => void;
  /** The seam entries for this screen: `pause` on UF-09.9, `next` on UF-09.6, else none. */
  seams: readonly SeamButton[];
  /** UF-09.7: the host's auto-log of this hold was rejected (D-0119 §3). Absent: `false`. */
  holdFailed?: boolean;
  /** UF-09.7 "Log hold": logs the current hold again through the hook; rejects on a failed
   *  write. Only the host passes it (the views rendered on their own in tests have no hook). */
  onLogHold?: () => Promise<void>;
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

const placeholder = (phase: ViewPhase) => {
  const View = (props: ViewProps) => <Placeholder {...props} phase={phase} />;
  return View;
};

export const VIEWS: Record<ViewPhase, (props: ViewProps) => ReactElement> = {
  getReady: GetReady,
  warmup: Warmup,
  set: CurrentSet,
  confirm: ConfirmSet,
  rest: Rest,
  next: NextExercise,
  timed: TimedSet,
  timeCheck: placeholder("timeCheck"),
  paused: Paused,
};
