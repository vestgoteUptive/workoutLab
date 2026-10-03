// T-0304g test stubs: `navigator.wakeLock` (a sentinel with `release()` and a `release` event),
// `window.AudioContext` with `createOscillator` spies, `speechSynthesis.speak` with
// `SpeechSynthesisUtterance`, `window.matchMedia`, `document.visibilityState`, and the focus
// prefs through the real `localStorage["wl-focus-prefs"]` value T-0303d's `readFocusPrefs` reads.
// `restoreDeviceStubs()` (in `afterEach`) puts every one of them back.
import { fireEvent } from "@testing-library/react";
import { vi, type Mock } from "vitest";

export function setPrefs(prefs: { sound: boolean; voice: boolean; keepAwake: boolean }): void {
  window.localStorage.setItem("wl-focus-prefs", JSON.stringify({ version: 1, ...prefs }));
}

export const ALL_OFF = { sound: false, voice: false, keepAwake: false };

const restorers: Array<() => void> = [];

/** Defines `obj[key]` for this test; `undefined` hides the API. Restored after the test. */
function define(obj: object, key: string, value: unknown): void {
  const own = Object.getOwnPropertyDescriptor(obj, key);
  Object.defineProperty(obj, key, { value, configurable: true, writable: true });
  restorers.push(() => {
    if (own) Object.defineProperty(obj, key, own);
    else delete (obj as Record<string, unknown>)[key];
  });
}

export function restoreDeviceStubs(): void {
  while (restorers.length > 0) restorers.pop()!();
}

export class FakeSentinel extends EventTarget {
  released = false;
  readonly type = "screen";
  release = vi.fn(async () => {
    if (this.released) return;
    this.released = true;
    this.dispatchEvent(new Event("release"));
  });
  /** The browser dropping the lock (the tab went hidden). */
  drop(): void {
    this.released = true;
    this.dispatchEvent(new Event("release"));
  }
}

export interface WakeLockStub {
  request: Mock<(type: string) => Promise<FakeSentinel>>;
  sentinels: FakeSentinel[];
}

export function stubWakeLock(impl?: (type: string) => Promise<FakeSentinel>): WakeLockStub {
  const sentinels: FakeSentinel[] = [];
  const request = vi.fn(
    impl ??
      (async () => {
        const s = new FakeSentinel();
        sentinels.push(s);
        return s;
      }),
  );
  define(navigator, "wakeLock", { request });
  return { request, sentinels };
}

export function hideWakeLock(): void {
  define(navigator, "wakeLock", undefined);
}

/** Sets `document.visibilityState` and fires `visibilitychange`. */
export function setVisibility(state: "visible" | "hidden"): void {
  define(document, "visibilityState", state);
  document.dispatchEvent(new Event("visibilitychange"));
}

export interface FakeOscillator {
  frequency: { value: number };
  connect: Mock;
  start: Mock;
  stop: Mock;
}

export interface FakeContext {
  state: string;
  resume: Mock;
  close: Mock;
}

export interface AudioStub {
  ctor: Mock;
  oscillators: FakeOscillator[];
  /** Every context made so far (T-0448): set `state` to drive `resume`. */
  contexts: FakeContext[];
  /** Every oscillator `start` call so far. */
  starts: () => number;
}

export function stubAudio(): AudioStub {
  const ctor = vi.fn();
  const oscillators: FakeOscillator[] = [];
  const contexts: FakeContext[] = [];
  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    constructor() {
      ctor();
      contexts.push(this);
    }
    createOscillator = vi.fn(() => {
      const osc: FakeOscillator = {
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    });
    createGain = vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn() }));
    resume = vi.fn(async () => undefined);
    close = vi.fn(async () => undefined);
  }
  define(window, "AudioContext", FakeAudioContext);
  return {
    ctor,
    contexts,
    oscillators,
    starts: () => oscillators.reduce((n, o) => n + o.start.mock.calls.length, 0),
  };
}

export function hideAudio(): void {
  define(window, "AudioContext", undefined);
  define(window, "webkitAudioContext", undefined);
}

export interface SpeechStub {
  speak: Mock;
  /** `speechSynthesis.cancel` (T-0448). */
  cancel: Mock;
  /** The utterances spoken so far (T-0448). */
  utterances: () => Array<{ text: string; volume: number }>;
  /** The words spoken so far, in order. */
  words: () => string[];
}

export function stubSpeech(): SpeechStub {
  const speak = vi.fn();
  const cancel = vi.fn();
  class FakeUtterance {
    volume = 1;
    constructor(public text: string) {}
  }
  define(window, "speechSynthesis", { speak, cancel });
  define(window, "SpeechSynthesisUtterance", FakeUtterance);
  return {
    speak,
    cancel,
    utterances: () => speak.mock.calls.map((c) => c[0] as FakeUtterance),
    words: () => speak.mock.calls.map((c) => (c[0] as FakeUtterance).text),
  };
}

export function hideSpeech(): void {
  define(window, "speechSynthesis", undefined);
  define(window, "SpeechSynthesisUtterance", undefined);
}

export function stubMatchMedia(reduce: boolean): Mock {
  const matchMedia = vi.fn((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" ? reduce : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  define(window, "matchMedia", matchMedia);
  return matchMedia;
}

export function hideMatchMedia(): void {
  define(window, "matchMedia", undefined);
}

/** A `pointerdown` inside the host (on its one heading): the gesture D-0119 §8 waits for. */
export function gesture(): void {
  const target = document.querySelector("[data-screen-id] h1");
  if (!target) throw new Error("no heading in the host to touch");
  fireEvent.pointerDown(target);
}

/** The ring fill's inline transition, or `null` with no ring on screen. */
export function ringTransition(): string | null {
  const fill = document.querySelector<SVGElement>(".wl-uf09__ring-fill");
  return fill ? fill.style.transition : null;
}
