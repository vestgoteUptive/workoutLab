// UF-09 sound and voice cues (T-0304g, D-0066 §7, D-0119 §7). A pure crossing detector: a cue for
// threshold t fires when an earlier observation of the same timer, in this mount, saw
// `remainingS > t` and this one sees `remainingS ≤ t`. The first observation of a timer (a mount,
// a restore, a new step) fires nothing, and each (timer, threshold) fires at most once. The host
// never observes a paused workout, so a pause fires nothing either.
// D-0161 (T-0447): when one observation crosses several thresholds (a throttled tab coming back),
// only the lowest crossed cue of each kind fires, no voice cue fires at 0, and every crossed
// threshold still counts as fired.
import type { Phase } from "./machine.js";

export type CueKind = "sound" | "voice";

export interface Cue {
  kind: CueKind;
  /** The threshold, in seconds left. */
  atS: number;
}

/** The cues each phase's timer has (D-0119 §7): a tone at 10 and 0 on UF-09.5, at the hold's 0
 *  on UF-09.7; the voice "3", "2", "1" on UF-09.5 and UF-09.1. Other timers have none. */
export const PHASE_CUES: Partial<Record<Phase, readonly Cue[]>> = {
  rest: [
    { kind: "sound", atS: 10 },
    { kind: "voice", atS: 3 },
    { kind: "voice", atS: 2 },
    { kind: "voice", atS: 1 },
    { kind: "sound", atS: 0 },
  ],
  timed: [{ kind: "sound", atS: 0 }],
  getReady: [
    { kind: "voice", atS: 3 },
    { kind: "voice", atS: 2 },
    { kind: "voice", atS: 1 },
  ],
};

/** What this mount has seen of one timer. */
export interface CueTrack {
  key: string | null;
  /** The last `remainingS` observed for `key`; `null` before the first observation. */
  lastS: number | null;
  /** The thresholds already fired for `key`. */
  fired: readonly number[];
}

export const NO_TRACK: CueTrack = { key: null, lastS: null, fired: [] };

export interface Observation {
  /** The running timer's identity; a new key is a new timer. `null`: no timer. */
  key: string | null;
  phase: Phase;
  remainingS: number;
}

/** One observation: the next track and the cues it crosses, in threshold order (high to low). */
export function observeCues(track: CueTrack, seen: Observation): { track: CueTrack; fire: Cue[] } {
  if (seen.key === null) return { track: NO_TRACK, fire: [] };
  if (seen.key !== track.key || track.lastS === null) {
    return { track: { key: seen.key, lastS: seen.remainingS, fired: [] }, fire: [] };
  }
  const prev = track.lastS;
  const crossed = (PHASE_CUES[seen.phase] ?? []).filter(
    (cue) => prev > cue.atS && seen.remainingS <= cue.atS && !track.fired.includes(cue.atS),
  );
  // The lowest crossed cue of each kind (the list is high to low); no voice once the timer is at 0.
  const lowest = (kind: CueKind) => crossed.filter((c) => c.kind === kind).at(-1);
  const keep = [lowest("sound"), seen.remainingS > 0 ? lowest("voice") : undefined];
  const fire = crossed.filter((c) => keep.includes(c));
  if (crossed.length === 0 && prev === seen.remainingS) return { track, fire };
  return {
    track: {
      key: track.key,
      lastS: seen.remainingS,
      fired: crossed.length === 0 ? track.fired : [...track.fired, ...crossed.map((c) => c.atS)],
    },
    fire,
  };
}
