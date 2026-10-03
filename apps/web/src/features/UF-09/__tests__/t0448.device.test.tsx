// T-0448 AC-1…AC-5 (D-0164 §5): speech cancelled on Pause and unmount, the iOS speech prime on the
// first pointerup, an "interrupted" AudioContext resumed, and missing APIs never throwing. The real
// SessionHost over P1 with a fake clock, as in t0304g.cues.test.tsx.
// Planted faults (build log): cancel on every render; prime on pointerdown; resume only
// "suspended"; unguarded cancel.
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { STARTED_AT_MS, USER_A } from "./fixtures.js";
import {
  advance,
  flushReal,
  freshDb,
  screenId,
  seedSession,
  signIn,
  timerText,
  useFakeClock,
} from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { L2, defaultDetail } from "./set-loop-fixtures.js";
import { seedFocus } from "./set-loop-helpers.js";
import { seedRest } from "./countdown-helpers.js";
import {
  gesture,
  hideAudio,
  restoreDeviceStubs,
  setPrefs,
  stubAudio,
  stubSpeech,
  stubWakeLock,
} from "./t0304g-stubs.js";
import { behindStartedAt } from "./fixtures.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./set-loop-mock.js").then((m) => m.setLoopMock(orig)),
);

const NOW = STARTED_AT_MS + 10 * 60_000;

beforeEach(async () => {
  window.localStorage.clear();
  vi.mocked(offline.loadLibrary).mockImplementation(async () => L2);
  vi.mocked(offline.loadExerciseDetail).mockImplementation(defaultDetail);
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession();
  stubWakeLock();
});

afterEach(() => {
  cleanup();
  restoreDeviceStubs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const render = () => renderSession({ locale: "en-GB" });
const tick = () =>
  act(() => {
    vi.advanceTimersByTime(1000);
  });
const heading = () => document.querySelector("[data-screen-id] h1")!;
const up = () => fireEvent.pointerUp(heading());
const press = async (name: string) => {
  fireEvent.click(screen.getByRole("button", { name }));
  await flushReal();
};
const quiet = () => flushReal(60);
const prefs = (p: Partial<{ sound: boolean; voice: boolean }> = {}) =>
  setPrefs({ sound: false, voice: false, keepAwake: false, ...p });

describe("AC-1 cancel on Pause", () => {
  it.each([
    [true, 1, 2],
    [false, 0, 0],
  ])(
    "voice %s: cancel calls after Pause = %i, after Resume + Pause = %i",
    async (voice, one, two) => {
      prefs({ voice });
      const speech = stubSpeech();
      seedRest(NOW - 116_000);
      await render();
      await press("Pause workout");
      expect(screenId()).toBe("UF-09.9");
      expect(speech.cancel).toHaveBeenCalledTimes(one);
      for (let i = 0; i < 60; i += 1) tick();
      await quiet();
      expect(speech.cancel).toHaveBeenCalledTimes(one);
      await press("Resume");
      expect(screenId()).toBe("UF-09.5");
      expect(speech.cancel).toHaveBeenCalledTimes(one);
      await press("Pause workout");
      expect(speech.cancel).toHaveBeenCalledTimes(two);
    },
  );

  it("the time check (UF-09.8) is not paused: no cancel", async () => {
    prefs({ voice: true });
    const speech = stubSpeech();
    await seedSession({ started_at: behindStartedAt(NOW) });
    seedFocus(NOW, { phase: "timeCheck", itemIndex: 1 });
    await render();
    expect(screenId()).toBe("UF-09.8");
    tick();
    await quiet();
    expect(speech.cancel).not.toHaveBeenCalled();
  });

  it("a rest running under no pause (re-rendering each second) makes no cancel", async () => {
    prefs({ voice: true });
    const speech = stubSpeech();
    seedRest(NOW);
    await render();
    for (let i = 0; i < 30; i += 1) tick();
    await quiet();
    expect(speech.cancel).not.toHaveBeenCalled();
  });

  it("a restore into paused makes no cancel", async () => {
    prefs({ voice: true });
    const speech = stubSpeech();
    seedFocus(NOW, {
      phase: "paused",
      resumePhase: "rest",
      pausedAtMs: NOW,
      timer: { startedAtMs: NOW, durationS: 120, pausedMs: 0 },
    });
    await render();
    expect(screenId()).toBe("UF-09.9");
    tick();
    await quiet();
    expect(speech.cancel).not.toHaveBeenCalled();
  });
});

describe("AC-2 cancel on unmount", () => {
  it.each([
    [true, 1],
    [false, 0],
  ])("voice %s: %i cancel call", async (voice, calls) => {
    prefs({ voice });
    const speech = stubSpeech();
    seedRest(NOW - 60_000);
    const view = await render();
    expect(speech.cancel).not.toHaveBeenCalled();
    view.unmount();
    expect(speech.cancel).toHaveBeenCalledTimes(calls);
  });
});

describe("AC-3 the iOS prime", () => {
  it("voice on: the first pointerUp speaks one silent empty utterance, the second none", async () => {
    prefs({ voice: true });
    const speech = stubSpeech();
    seedRest(NOW);
    await render();
    up();
    expect(speech.speak).toHaveBeenCalledTimes(1);
    expect(speech.utterances()[0]).toMatchObject({ text: "", volume: 0 });
    up();
    await quiet();
    expect(speech.speak).toHaveBeenCalledTimes(1);
  });

  it("order: after a pointerUp and a full rest the words are '', 3, 2, 1", async () => {
    prefs({ voice: true });
    const speech = stubSpeech();
    seedRest(NOW);
    await render();
    up();
    for (let i = 0; i < 119; i += 1) tick();
    await advance(1000);
    expect(screenId()).toBe("UF-09.3");
    expect(speech.words()).toEqual(["", "3", "2", "1"]);
  });

  it("voice off: a pointerUp makes no speak call", async () => {
    prefs({ voice: false });
    const speech = stubSpeech();
    seedRest(NOW);
    await render();
    up();
    await quiet();
    expect(speech.speak).not.toHaveBeenCalled();
  });

  it("not on pointerdown or keydown", async () => {
    prefs({ voice: true });
    const speech = stubSpeech();
    seedRest(NOW);
    await render();
    gesture();
    fireEvent.keyDown(heading(), { key: "a" });
    await quiet();
    expect(speech.speak).not.toHaveBeenCalled();
  });

  it("a remount primes again on its own first pointerUp", async () => {
    prefs({ voice: true });
    const speech = stubSpeech();
    seedRest(NOW);
    const view = await render();
    up();
    view.unmount();
    expect(speech.speak).toHaveBeenCalledTimes(1);
    await render();
    up();
    expect(speech.speak).toHaveBeenCalledTimes(2);
    up();
    expect(speech.speak).toHaveBeenCalledTimes(2);
  });
});

describe("AC-4 resume a suspended or interrupted context", () => {
  const states = [
    ["interrupted", 1],
    ["suspended", 1],
    ["running", 0],
    ["closed", 0],
  ] as const;

  it.each(states)("%s: pointerUp resumes %i time(s)", async (state, n) => {
    prefs({ sound: true });
    const audio = stubAudio();
    seedRest(NOW);
    await render();
    gesture();
    audio.contexts[0]!.state = state;
    up();
    expect(audio.contexts[0]!.resume).toHaveBeenCalledTimes(n);
  });

  it.each(states)("%s: the 10 s tone resumes it (%i) and still starts", async (state, n) => {
    prefs({ sound: true });
    const audio = stubAudio();
    seedRest(NOW);
    await render();
    gesture();
    audio.contexts[0]!.state = state;
    for (let i = 0; i < 110; i += 1) tick();
    expect(timerText()).toBe("0:10");
    expect(audio.contexts[0]!.resume).toHaveBeenCalledTimes(n);
    expect(audio.starts()).toBe(1);
  });

  it.each(states)("%s: a keyDown resumes it (%i), with no second context", async (state, n) => {
    prefs({ sound: true });
    const audio = stubAudio();
    seedRest(NOW);
    await render();
    gesture();
    audio.contexts[0]!.state = state;
    fireEvent.keyDown(heading(), { key: "a" });
    expect(audio.contexts[0]!.resume).toHaveBeenCalledTimes(n);
    expect(audio.ctor).toHaveBeenCalledTimes(1);
  });
});

describe("AC-5 missing or broken APIs never throw", () => {
  const rejections = vi.fn();
  const resumeRejects = (audio: ReturnType<typeof stubAudio>) => {
    gesture();
    audio.contexts[0]!.state = "interrupted";
    audio.contexts[0]!.resume.mockImplementation(() => Promise.reject(new Error("no")));
  };
  const variants: Array<[string, () => (() => void) | void]> = [
    [
      "no speechSynthesis",
      () => {
        stubSpeech();
        Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
      },
    ],
    [
      "a speechSynthesis without cancel",
      () => {
        stubSpeech();
        (window.speechSynthesis as { cancel?: unknown }).cancel = undefined;
      },
    ],
    [
      "a cancel that throws",
      () => {
        stubSpeech().cancel.mockImplementation(() => {
          throw new Error("no");
        });
      },
    ],
    [
      "a speak that throws on the prime",
      () => {
        stubSpeech().speak.mockImplementation(() => {
          throw new Error("no");
        });
      },
    ],
    ["no AudioContext", () => hideAudio()],
    [
      "a resume that rejects",
      () => {
        stubSpeech();
        const audio = stubAudio();
        return () => resumeRejects(audio);
      },
    ],
  ];

  beforeEach(() => {
    process.on("unhandledRejection", rejections);
  });
  afterEach(() => {
    process.off("unhandledRejection", rejections);
    rejections.mockClear();
  });

  it.each(variants)("%s", async (_name, setup) => {
    prefs({ sound: true, voice: true });
    const afterRender = setup();
    seedRest(NOW - 116_000);
    await render();
    if (afterRender) afterRender();
    up();
    gesture();
    await press("Pause workout");
    expect(screenId()).toBe("UF-09.9");
    await press("Resume");
    up();
    expect(timerText()).toBe("0:04");
    tick();
    expect(timerText()).toBe("0:03");
    await quiet();
    cleanup();
    expect(rejections).not.toHaveBeenCalled();
  });
});
