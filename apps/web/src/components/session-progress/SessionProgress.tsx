// SessionProgress (T-0594, D-0211): pause button, one segment per step, and the counter.
import "./session-progress.css";
import { PauseIcon } from "../icons/index.js";

export interface SessionProgressProps {
  done: number;
  total: number;
  onPause: () => void;
  pauseLabel: string;
  counter: string;
}

export function SessionProgress({
  done,
  total,
  onPause,
  pauseLabel,
  counter,
}: SessionProgressProps) {
  return (
    <div className="wl-session-progress">
      <button
        type="button"
        className="wl-session-progress__pause"
        onClick={onPause}
        aria-label={pauseLabel}
      >
        <PauseIcon />
      </button>
      <div className="wl-session-progress__segments" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={
              i < done
                ? "wl-session-progress__segment wl-session-progress__segment--done"
                : "wl-session-progress__segment"
            }
          />
        ))}
      </div>
      <span className="wl-session-progress__counter">{counter}</span>
    </div>
  );
}
