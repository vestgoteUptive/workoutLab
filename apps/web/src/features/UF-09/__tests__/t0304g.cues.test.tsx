// T-0304g AC-3 (cues only on an observed crossing, D-0066 §7, D-0119 §7) and AC-4 (sound needs a
// gesture, D-0119 §8). The real SessionHost over P1 with a fake clock; `AudioContext` (with
// `createOscillator` spies) and `speechSynthesis.speak` are stubbed per test and restored after.
// Planted fault for AC-3 (build log): a cue that fires on any render with `remainingS ≤ t`
// fires on restore, and turns the restore tests red.
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { STARTED_AT_MS, USER_A } from "./fixtures.js";
import {
  HostAt,
  advance,
  flushReal,
  freshDb,
  renderLoaded,
  screenId,
  seedSession,
  signIn,
  timerText,
  useFakeClock,
} from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { L2, defaultDetail } from "./set-loop-fixtures.js";
import { doneButton, findScreen, seedFocus, tap } from "./set-loop-helpers.js";
import { loggedSets, seedRest } from "./countdown-helpers.js";
import {
  gesture,
  hideAudio,
  hideSpeech,
  restoreDeviceStubs,
  setPrefs,
  stubAudio,
  stubSpeech,
  stubWakeLock,
} from "./t0304g-stubs.js";

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
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

describe("AC-3 sound on a 120 s rest (UF-09.5)", () => {
  it("one oscillator start at the render where remainingS is first ≤ 10, and one at 0", async () => {
    const audio = stubAudio();
    seedRest(NOW);
    await render();
    gesture();
    for (let left = 119; left >= 11; left -= 1) {
      tick();
      expect(timerText()).toBe(clock(left));
      expect(audio.starts()).toBe(0);
    }
    tick();
    expect(timerText()).toBe("0:10");
    expect(audio.starts()).toBe(1);
    for (let left = 9; left >= 1; left -= 1) {
      tick();
      expect(timerText()).toBe(clock(left));
      expect(audio.starts()).toBe(1);
    }
    await advance(1000);
    expect(screenId()).toBe("UF-09.3");
    expect(audio.starts()).toBe(2);
    await advance(5000);
    expect(audio.starts()).toBe(2);
  });

  it("once each: re-renders at the same second fire nothing more", async () => {
    const audio = stubAudio();
    seedRest(NOW);
    const view = await renderLoaded({ locale: "en-GB" });
    gesture();
    await advance(109_000);
    expect(timerText()).toBe("0:11");
    tick();
    expect(timerText()).toBe("0:10");
    expect(audio.starts()).toBe(1);
    for (let i = 0; i < 3; i += 1) view.rerender(<HostAt locale="en-GB" />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await flushReal(50);
    expect(timerText()).toBe("0:10");
    expect(audio.starts()).toBe(1);
  });
});

describe("AC-3 sound on UF-09.7", () => {
  it("one start at the hold's 0, none before it (Get in position, the hold)", async () => {
    const audio = stubAudio();
    // Plank: 3 s Get in position + a 50 s hold.
    seedFocus(NOW, {
      phase: "timed",
      itemIndex: 3,
      timer: { startedAtMs: NOW, durationS: 53, pausedMs: 0 },
    });
    await render();
    expect(screenId()).toBe("UF-09.7");
    gesture();
    for (let i = 0; i < 52; i += 1) tick();
    expect(timerText()).toBe("0:01");
    expect(audio.starts()).toBe(0);
    await advance(1000);
    expect(audio.starts()).toBe(1);
    await advance(3000);
    expect(audio.starts()).toBe(1);
  });
});

describe("AC-3 voice '3', '2', '1'", () => {
  it("UF-09.5: in order, at 3, 2 and 1 s", async () => {
    stubAudio();
    const speech = stubSpeech();
    seedRest(NOW);
    await render();
    await advance(116_000);
    expect(timerText()).toBe("0:04");
    expect(speech.words()).toEqual([]);
    tick();
    expect(timerText()).toBe("0:03");
    expect(speech.words()).toEqual(["3"]);
    tick();
    expect(speech.words()).toEqual(["3", "2"]);
    tick();
    expect(timerText()).toBe("0:01");
    expect(speech.words()).toEqual(["3", "2", "1"]);
    await advance(1000);
    expect(screenId()).toBe("UF-09.3");
    expect(speech.words()).toEqual(["3", "2", "1"]);
  });

  it("UF-09.1: in order, at 3, 2 and 1 s of the 5 s countdown", async () => {
    const speech = stubSpeech();
    await render();
    expect(screenId()).toBe("UF-09.1");
    expect(timerText()).toBe("5");
    tick();
    expect(timerText()).toBe("4");
    expect(speech.words()).toEqual([]);
    tick();
    expect(timerText()).toBe("3");
    expect(speech.words()).toEqual(["3"]);
    tick();
    expect(speech.words()).toEqual(["3", "2"]);
    tick();
    expect(timerText()).toBe("1");
    expect(speech.words()).toEqual(["3", "2", "1"]);
    await advance(1000);
    expect(screenId()).toBe("UF-09.2");
    await advance(3000);
    expect(speech.words()).toEqual(["3", "2", "1"]);
  });

  it("the other countdowns say nothing: UF-09.6's set-up countdown", async () => {
    const speech = stubSpeech();
    seedFocus(NOW, {
      phase: "next",
      itemIndex: 1,
      timer: { startedAtMs: NOW, durationS: 60, pausedMs: 0 },
    });
    await render();
    expect(screenId()).toBe("UF-09.6");
    for (let i = 0; i < 59; i += 1) tick();
    await advance(1000);
    expect(screenId()).toBe("UF-09.3");
    await flushReal(50);
    expect(speech.speak).not.toHaveBeenCalled();
  });
});

describe("AC-3 the pair, restore (D-0119 §7)", () => {
  it("a remount 115 s into a 120 s rest: no 10 s tone; the voice 3-2-1 and the 0 tone it sees", async () => {
    const audio = stubAudio();
    const speech = stubSpeech();
    seedRest(NOW - 115_000);
    await render();
    expect(timerText()).toBe("0:05");
    gesture();
    await flushReal(50);
    expect(audio.starts()).toBe(0);
    tick();
    expect(timerText()).toBe("0:04");
    expect(audio.starts()).toBe(0);
    expect(speech.words()).toEqual([]);
    tick();
    tick();
    tick();
    expect(timerText()).toBe("0:01");
    expect(speech.words()).toEqual(["3", "2", "1"]);
    expect(audio.starts()).toBe(0);
    await advance(1000);
    expect(screenId()).toBe("UF-09.3");
    expect(audio.starts()).toBe(1);
  });

  it("a remount 118 s in: no '3' or '2' (those crossings weren't seen); '1' and the 0 tone are", async () => {
    const audio = stubAudio();
    const speech = stubSpeech();
    seedRest(NOW - 118_000);
    await render();
    expect(timerText()).toBe("0:02");
    gesture();
    await flushReal(50);
    expect(speech.words()).toEqual([]);
    tick();
    expect(timerText()).toBe("0:01");
    expect(speech.words()).toEqual(["1"]);
    await advance(1000);
    expect(screenId()).toBe("UF-09.3");
    expect(speech.words()).toEqual(["1"]);
    expect(audio.starts()).toBe(1);
  });

  it("restored paused at 5 s left, a gesture, then Resume: no 10 s tone; the 0 tone at the end", async () => {
    // The first observation of this rest is after Resume, with a context already made.
    const audio = stubAudio();
    seedFocus(NOW, {
      phase: "paused",
      resumePhase: "rest",
      pausedAtMs: NOW,
      timer: { startedAtMs: NOW - 115_000, durationS: 120, pausedMs: 0 },
      loggedSets: loggedSets(0, 1),
    });
    await render();
    expect(screenId()).toBe("UF-09.9");
    gesture();
    expect(audio.ctor).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await flushReal();
    expect(screenId()).toBe("UF-09.5");
    expect(timerText()).toBe("0:05");
    tick();
    expect(timerText()).toBe("0:04");
    expect(audio.starts()).toBe(0);
    for (let i = 0; i < 3; i += 1) tick();
    await advance(1000);
    expect(screenId()).toBe("UF-09.3");
    expect(audio.starts()).toBe(1);
  });

  it("a remount 125 s into a 120 s rest fires nothing", async () => {
    const audio = stubAudio();
    const speech = stubSpeech();
    seedRest(NOW - 125_000);
    await render();
    expect(screenId()).toBe("UF-09.3");
    gesture();
    await advance(5000);
    await flushReal(50);
    expect(audio.starts()).toBe(0);
    expect(speech.speak).not.toHaveBeenCalled();
  });

  it("a remount 4 s into UF-09.1's 5 s countdown says nothing (no crossing was seen)", async () => {
    const speech = stubSpeech();
    seedFocus(NOW, {
      phase: "getReady",
      timer: { startedAtMs: NOW - 4_000, durationS: 5, pausedMs: 0 },
    });
    await render();
    expect(timerText()).toBe("1");
    await advance(1000);
    expect(screenId()).toBe("UF-09.2");
    await flushReal(50);
    expect(speech.speak).not.toHaveBeenCalled();
  });
});

describe("AC-3 paused", () => {
  it("paused at 12 s left, then 60 s of fake time, fires nothing; resumed, the 10 s tone fires at its crossing", async () => {
    const audio = stubAudio();
    const speech = stubSpeech();
    seedRest(NOW);
    await render();
    gesture();
    await advance(108_000);
    expect(timerText()).toBe("0:12");
    fireEvent.click(screen.getByRole("button", { name: "Pause workout" }));
    await flushReal();
    expect(screenId()).toBe("UF-09.9");
    for (let i = 0; i < 60; i += 1) tick();
    await flushReal(50);
    expect(audio.starts()).toBe(0);
    expect(speech.speak).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await flushReal();
    expect(screenId()).toBe("UF-09.5");
    expect(timerText()).toBe("0:12");
    expect(audio.starts()).toBe(0);
    tick();
    expect(timerText()).toBe("0:11");
    expect(audio.starts()).toBe(0);
    tick();
    expect(timerText()).toBe("0:10");
    expect(audio.starts()).toBe(1);
  });
});

describe("AC-3 only the flagged cues", () => {
  it("sound false, voice true: speak calls and no oscillator (no AudioContext at all)", async () => {
    setPrefs({ sound: false, voice: true, keepAwake: true });
    const audio = stubAudio();
    const speech = stubSpeech();
    seedRest(NOW);
    await render();
    gesture();
    for (let i = 0; i < 119; i += 1) tick();
    await advance(1000);
    expect(screenId()).toBe("UF-09.3");
    expect(speech.words()).toEqual(["3", "2", "1"]);
    expect(audio.ctor).not.toHaveBeenCalled();
    expect(audio.starts()).toBe(0);
  });

  it("the other way round: oscillators and no speak calls", async () => {
    setPrefs({ sound: true, voice: false, keepAwake: true });
    const audio = stubAudio();
    const speech = stubSpeech();
    seedRest(NOW);
    await render();
    gesture();
    for (let i = 0; i < 119; i += 1) tick();
    await advance(1000);
    expect(screenId()).toBe("UF-09.3");
    expect(audio.starts()).toBe(2);
    expect(speech.speak).not.toHaveBeenCalled();
  });
});

describe("AC-4 sound needs a gesture (D-0119 §8)", () => {
  it("no gesture: no AudioContext is constructed, and the due tones are skipped with no throw", async () => {
    const audio = stubAudio();
    const errors = vi.spyOn(console, "error");
    seedRest(NOW);
    await render();
    for (let i = 0; i < 119; i += 1) tick();
    await advance(1000);
    expect(screenId()).toBe("UF-09.3");
    await flushReal(50);
    expect(audio.ctor).not.toHaveBeenCalled();
    expect(audio.starts()).toBe(0);
    expect(errors).not.toHaveBeenCalled();
  });

  it("after Done set (a click), the constructor is called once and the 10 s tone plays; a second gesture constructs nothing more", async () => {
    const audio = stubAudio();
    seedFocus(NOW, { phase: "set" });
    await render();
    expect(screenId()).toBe("UF-09.3");
    expect(audio.ctor).not.toHaveBeenCalled();
    await tap(doneButton());
    await findScreen("UF-09.4");
    expect(audio.ctor).toHaveBeenCalledTimes(1);
    // The 5 s auto-save, then the bench rest.
    await advance(5000);
    expect(screenId()).toBe("UF-09.5");
    fireEvent.keyDown(screen.getByRole("button", { name: "Skip rest" }), { key: "a" });
    fireEvent.pointerDown(screen.getByRole("heading", { level: 1 }));
    expect(audio.ctor).toHaveBeenCalledTimes(1);
    const [m, s] = timerText()!.split(":").map(Number);
    await advance((m! * 60 + s! - 11) * 1000);
    expect(timerText()).toBe("0:11");
    expect(audio.starts()).toBe(0);
    tick();
    expect(timerText()).toBe("0:10");
    expect(audio.starts()).toBe(1);
  });

  it("a keydown in the host is a gesture too", async () => {
    const audio = stubAudio();
    seedRest(NOW);
    await render();
    fireEvent.keyDown(screen.getByRole("button", { name: "Skip rest" }), { key: "Tab" });
    expect(audio.ctor).toHaveBeenCalledTimes(1);
  });

  it("the pair: a gesture outside the host constructs nothing", async () => {
    const audio = stubAudio();
    seedRest(NOW);
    await render();
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document.body, { key: "a" });
    await flushReal(50);
    expect(audio.ctor).not.toHaveBeenCalled();
  });

  it.each([
    ["AudioContext", () => (hideAudio(), stubSpeech())],
    ["speechSynthesis", () => (stubAudio(), hideSpeech())],
    ["both", () => (hideAudio(), hideSpeech())],
  ])("missing %s: a full rest throws nothing and logs no console.error", async (_, setUp) => {
    setUp();
    const errors = vi.spyOn(console, "error");
    seedRest(NOW);
    await render();
    gesture();
    for (let i = 0; i < 119; i += 1) tick();
    await advance(1000);
    expect(screenId()).toBe("UF-09.3");
    await flushReal(50);
    expect(errors).not.toHaveBeenCalled();
  });
});
