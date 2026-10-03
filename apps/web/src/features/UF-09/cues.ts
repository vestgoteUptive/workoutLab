// UF-09 sound and voice cues (T-0304g, D-0066 §7, D-0119 §7). A pure crossing detector: a cue for
// threshold t fires when an earlier observation of the same timer, in this mount, saw
// `remainingS > t` and this one sees `remainingS ≤ t`. The first observation of a timer (a mount,
// a restore, a new step) fires nothing, and each (timer, threshold) fires at most once. The host
// never observes a paused workout, so a pause fires nothing either.
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
  const fire = (PHASE_CUES[seen.phase] ?? []).filter(
    (cue) => prev > cue.atS && seen.remainingS <= cue.atS && !track.fired.includes(cue.atS),
  );
  if (fire.length === 0 && prev === seen.remainingS) return { track, fire };
  return {
    track: {
      key: track.key,
      lastS: seen.remainingS,
      fired: fire.length === 0 ? track.fired : [...track.fired, ...fire.map((c) => c.atS)],
    },
    fire,
  };
}
