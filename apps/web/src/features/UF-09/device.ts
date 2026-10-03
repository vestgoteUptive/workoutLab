// UF-09 device features (T-0304g, NFR-TIME-3, D-0066 §7, D-0119 §6–§9). The user sets these on
// UF-08.4 (T-0303d); focus mode only reads them, once per machine mount, through the UF-08 index
// (D-0071 §3). None of this adds anything to the screen (principle 1). Every browser API here may
// be missing (iOS without `wakeLock`, no `speechSynthesis`, no `AudioContext`) and never throws.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { en } from "../../lib/i18n/en.js";
import { readFocusPrefs, type FocusPrefs } from "../UF-08/index.js";
import { NO_TRACK, observeCues, type Cue, type CueTrack } from "./cues.js";
import { timedRemainingS, type FocusState } from "./machine.js";
import { remainingS } from "./timer.js";

/** The tone: short and high enough to carry a metre from a bench (D-0066 §7). */
const TONE_HZ = 880;
const TONE_S = 0.15;
const TONE_GAIN = 0.25;

const noop = () => undefined;

/** Runs a call that may throw or return a promise that rejects, and ignores both. */
function quietly(run: () => unknown): void {
  try {
    Promise.resolve(run()).catch(noop);
  } catch {
    // A missing or broken API does nothing.
  }
}

interface WakeLockSentinelLike {
  released?: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}

interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

type AudioContextCtor = new () => AudioContext;

function wakeLockApi(): WakeLockLike | null {
  try {
    const api = (navigator as { wakeLock?: WakeLockLike }).wakeLock;
    return api && typeof api.request === "function" ? api : null;
  } catch {
    return null;
  }
}

function audioContextCtor(): AudioContextCtor | null {
  try {
    const w = window as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
    return w.AudioContext ?? w.webkitAudioContext ?? null;
  } catch {
    return null;
  }
}

/** iOS leaves a context `"interrupted"` after a call or Siri; `"suspended"` is the autoplay state
 *  (D-0164 §5). Both are resumed; `"running"` and `"closed"` are left alone. */
function resumeIfIdle(ctx: AudioContext): void {
  try {
    const state = ctx.state as string;
    if (state === "suspended" || state === "interrupted") quietly(() => ctx.resume());
  } catch {
    // A broken context does nothing.
  }
}

/** Stops queued and speaking utterances (D-0164 §5). Never throws. */
function cancelSpeech(): void {
  try {
    const synth = window.speechSynthesis;
    if (synth && typeof synth.cancel === "function") synth.cancel();
  } catch {
    // No voice on this device.
  }
}

/** iOS Safari speaks nothing until `speak()` has run inside a user activation (D-0164 §5): one
 *  silent empty utterance unlocks the timer-driven countdown. */
function primeSpeech(): void {
  try {
    const synth = window.speechSynthesis;
    const Utterance = window.SpeechSynthesisUtterance;
    if (!synth || typeof Utterance !== "function") return;
    const utterance = new Utterance("");
    utterance.volume = 0;
    synth.speak(utterance);
  } catch {
    // No voice on this device.
  }
}

function playTone(ctx: AudioContext): void {
  try {
    resumeIfIdle(ctx);
    const osc = ctx.createOscillator();
    osc.frequency.value = TONE_HZ;
    if (typeof ctx.createGain === "function") {
      const gain = ctx.createGain();
      gain.gain.value = TONE_GAIN;
      osc.connect(gain);
      gain.connect(ctx.destination);
    } else {
      osc.connect(ctx.destination);
    }
    const at = typeof ctx.currentTime === "number" ? ctx.currentTime : 0;
    osc.start(at);
    osc.stop(at + TONE_S);
  } catch {
    // A broken or closed context plays nothing; the countdown text still runs.
  }
}

function say(word: string): void {
  try {
    const synth = window.speechSynthesis;
    const Utterance = window.SpeechSynthesisUtterance;
    if (!synth || typeof Utterance !== "function") return;
    synth.speak(new Utterance(word));
  } catch {
    // No voice on this device.
  }
}

/** The voice words (D-0119 §7), from the flow's strings. */
function voiceWord(atS: number): string | null {
  return atS === 3
    ? en.uf09.voiceThree
    : atS === 2
      ? en.uf09.voiceTwo
      : atS === 1
        ? en.uf09.voiceOne
        : null;
}

/** The running timer's seconds left as the cues see it: UF-09.7 counts its ring pause. */
function secondsLeft(state: FocusState, nowMs: number): number | null {
  if (!state.timer) return null;
  return state.phase === "timed" ? timedRemainingS(state, nowMs) : remainingS(state.timer, nowMs);
}

/** Holds a screen wake lock while `active` (D-0119 §9): one request at the start, another on a
 *  `visibilitychange` to visible with no live lock, and a release when `active` ends or on
 *  unmount. A rejected request (`NotAllowedError`) is caught and shows nothing. */
function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const api = wakeLockApi();
    if (!api) return;
    let live = true;
    let pending = false;
    let sentinel: WakeLockSentinelLike | null = null;
    const acquire = () => {
      if (sentinel?.released === true) sentinel = null;
      if (!live || pending || sentinel) return;
      let request: Promise<WakeLockSentinelLike>;
      try {
        request = api.request("screen");
      } catch {
        return;
      }
      pending = true;
      Promise.resolve(request).then(
        (lock) => {
          pending = false;
          if (!live) {
            quietly(() => lock.release());
            return;
          }
          sentinel = lock;
          try {
            lock.addEventListener("release", () => {
              if (sentinel === lock) sentinel = null;
            });
          } catch {
            // A sentinel with no events: the next visible re-checks `released`.
          }
        },
        () => {
          pending = false;
        },
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisibility);
      const lock = sentinel;
      sentinel = null;
      if (lock) quietly(() => lock.release());
    };
  }, [active]);
}

export interface FocusDevice {
  /** A `pointerdown` or `keydown` inside the host: creates the `AudioContext` once (D-0119 §8). */
  onGesture: () => void;
  /** A later activation (a touch's `pointerup`): resumes a context the browser left suspended. */
  onActivation: () => void;
  /** One observation of the running timer (a render, or the expiry check at its end). */
  observe: (key: string | null, state: FocusState, nowMs: number) => void;
}

/** The device side of one machine mount. `key` is the host's timer key for `state`. Call once in
 *  the `Machine` component, before its expiry effect. */
export function useFocusDevice(key: string | null, state: FocusState, nowMs: number): FocusDevice {
  // D-0119 §6: read once, when the machine starts; a change on UF-08.4 applies at the next mount.
  const [prefs] = useState<FocusPrefs>(readFocusPrefs);
  const audio = useRef<AudioContext | null>(null);
  const track = useRef<CueTrack>(NO_TRACK);
  const lastPhase = useRef<FocusState["phase"] | null>(null);
  const primed = useRef(false);

  useWakeLock(prefs.keepAwake && state.phase !== "done");

  useEffect(
    () => () => {
      const ctx = audio.current;
      audio.current = null;
      if (ctx) quietly(() => ctx.close());
      if (prefs.voice) cancelSpeech();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefs are read once per mount
    [],
  );

  const play = useCallback(
    (cues: readonly Cue[]) => {
      for (const cue of cues) {
        if (cue.kind === "sound") {
          // Before a gesture there is no context, and the due tone is skipped (D-0119 §8).
          if (prefs.sound && audio.current) playTone(audio.current);
        } else if (prefs.voice) {
          const word = voiceWord(cue.atS);
          if (word !== null) say(word);
        }
      }
    },
    [prefs],
  );

  const device = useMemo<FocusDevice>(
    () => ({
      onGesture() {
        if (!prefs.sound) return;
        if (audio.current) {
          resumeIfIdle(audio.current);
          return;
        }
        const Ctor = audioContextCtor();
        if (!Ctor) return;
        try {
          audio.current = new Ctor();
        } catch {
          audio.current = null;
        }
      },
      onActivation() {
        if (prefs.voice && !primed.current) {
          primed.current = true;
          primeSpeech();
        }
        if (audio.current) resumeIfIdle(audio.current);
      },
      observe(timerKey, current, atMs) {
        // A paused workout neither observes nor fires (D-0119 §7); Resume carries on.
        const before = lastPhase.current;
        lastPhase.current = current.phase;
        if (current.phase === "paused") {
          if (prefs.voice && before !== null && before !== "paused") cancelSpeech();
          return;
        }
        const left = secondsLeft(current, atMs);
        const next = observeCues(track.current, {
          key: left === null ? null : timerKey,
          phase: current.phase,
          remainingS: left ?? 0,
        });
        track.current = next.track;
        if (next.fire.length > 0) play(next.fire);
      },
    }),
    [prefs, play],
  );

  // Every render is an observation, in render order, before the host's expiry check.
  useEffect(() => {
    device.observe(key, state, nowMs);
  });

  return device;
}
