// T-0304g AC-1 (the prefs, D-0119 §6) and AC-2 (the screen wake lock, NFR-TIME-3, D-0119 §9).
// The real SessionHost over P1 with a fake clock; the prefs are the real
// `localStorage["wl-focus-prefs"]` value; `navigator.wakeLock`, `AudioContext` and
// `speechSynthesis` are stubbed per test and restored after it.
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import * as uf08 from "../../UF-08/index.prefs.js";
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
import { BENCH_ONLY, L2, defaultDetail } from "./set-loop-fixtures.js";
import { seedFocus } from "./set-loop-helpers.js";
import { loggedSets, seedRest } from "./countdown-helpers.js";
import {
  ALL_OFF,
  FakeSentinel,
  gesture,
  hideWakeLock,
  restoreDeviceStubs,
  setPrefs,
  setVisibility,
  stubAudio,
  stubSpeech,
  stubWakeLock,
} from "./t0304g-stubs.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./set-loop-mock.js").then((m) => m.setLoopMock(orig)),
);
// A spy that wraps the real T-0303d reader, so the stored value is what it reads.
vi.mock("../../UF-08/index.prefs.js", async (orig) => {
  const real = (await orig()) as typeof import("../../UF-08/index.prefs.js");
  return { ...real, readFocusPrefs: vi.fn(real.readFocusPrefs) };
});

const NOW = STARTED_AT_MS + 10 * 60_000;

beforeEach(async () => {
  window.localStorage.clear();
  vi.mocked(offline.loadLibrary).mockImplementation(async () => L2);
  vi.mocked(offline.loadExerciseDetail).mockImplementation(defaultDetail);
  vi.mocked(uf08.readFocusPrefs).mockClear();
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession();
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

/** A full 120 s rest from 120 to its end, one second at a time, then UF-09.3. */
async function fullRest(): Promise<void> {
  for (let i = 0; i < 119; i += 1) tick();
  await advance(1000);
  expect(screenId()).toBe("UF-09.3");
}

describe("AC-1 the prefs are read once per mount (D-0119 §6)", () => {
  it("over a full rest, readFocusPrefs is called once; a second host mount calls it once more", async () => {
    stubWakeLock();
    seedRest(NOW);
    const view = await render();
    expect(screenId()).toBe("UF-09.5");
    expect(uf08.readFocusPrefs).toHaveBeenCalledTimes(1);
    await fullRest();
    expect(uf08.readFocusPrefs).toHaveBeenCalledTimes(1);
    view.unmount();
    seedRest(Date.now());
    await render();
    expect(screenId()).toBe("UF-09.5");
    expect(uf08.readFocusPrefs).toHaveBeenCalledTimes(2);
  });

  it("the default: with nothing stored, all three are on (wake lock, AudioContext, speak)", async () => {
    expect(window.localStorage.getItem("wl-focus-prefs")).toBeNull();
    const lock = stubWakeLock();
    const audio = stubAudio();
    const speech = stubSpeech();
    seedRest(NOW);
    await render();
    gesture();
    await fullRest();
    expect(uf08.readFocusPrefs).toHaveReturnedWith({ sound: true, voice: true, keepAwake: true });
    expect(lock.request).toHaveBeenCalledTimes(1);
    expect(audio.ctor).toHaveBeenCalledTimes(1);
    expect(audio.starts()).toBe(2);
    expect(speech.words()).toEqual(["3", "2", "1"]);
  });

  it("the pair: all three false → no wake-lock request, no AudioContext, no speak over a full rest", async () => {
    setPrefs(ALL_OFF);
    const lock = stubWakeLock();
    const audio = stubAudio();
    const speech = stubSpeech();
    seedRest(NOW);
    await render();
    gesture();
    await fullRest();
    await flushReal(50);
    expect(uf08.readFocusPrefs).toHaveReturnedWith(ALL_OFF);
    expect(lock.request).not.toHaveBeenCalled();
    expect(audio.ctor).not.toHaveBeenCalled();
    expect(speech.speak).not.toHaveBeenCalled();
  });
});

describe("AC-2 the wake lock (NFR-TIME-3, D-0119 §9)", () => {
  it("request: the machine starting calls navigator.wakeLock.request('screen') once", async () => {
    const lock = stubWakeLock();
    await render();
    expect(screenId()).toBe("UF-09.1");
    expect(lock.request).toHaveBeenCalledTimes(1);
    expect(lock.request).toHaveBeenCalledWith("screen");
    // The steps that follow don't ask again.
    await advance(5000);
    expect(screenId()).toBe("UF-09.2");
    await flushReal(50);
    expect(lock.request).toHaveBeenCalledTimes(1);
  });

  it("re-acquire: after the sentinel is released, a visibilitychange to visible requests again", async () => {
    const lock = stubWakeLock();
    await render();
    expect(lock.sentinels).toHaveLength(1);
    lock.sentinels[0]!.drop();
    setVisibility("visible");
    await flushReal();
    expect(lock.request).toHaveBeenCalledTimes(2);
    expect(lock.sentinels).toHaveLength(2);
  });

  it("the pair: a visibilitychange to hidden makes no call", async () => {
    const lock = stubWakeLock();
    await render();
    lock.sentinels[0]!.drop();
    setVisibility("hidden");
    await flushReal(50);
    expect(lock.request).toHaveBeenCalledTimes(1);
  });

  it("the pair: visible with the lock still live makes no call", async () => {
    const lock = stubWakeLock();
    await render();
    setVisibility("visible");
    await flushReal(50);
    expect(lock.request).toHaveBeenCalledTimes(1);
  });

  it("release: reaching done releases the sentinel (the host still mounted)", async () => {
    // One bench item at its last set, in confirm: the 5 s auto-save ends the workout.
    await seedSession({ plan: BENCH_ONLY });
    seedFocus(
      NOW,
      {
        phase: "confirm",
        setIndex: 3,
        timer: { startedAtMs: NOW, durationS: 5, pausedMs: 0 },
        loggedSets: loggedSets(0, 4, BENCH_ONLY),
      },
      BENCH_ONLY,
    );
    // finish() never settles, so the done screen stays and nothing navigates away.
    vi.mocked(offline.upsertSession).mockImplementation(() => new Promise(() => undefined));
    const lock = stubWakeLock();
    await render();
    expect(screenId()).toBe("UF-09.4");
    const sentinel = lock.sentinels[0]!;
    expect(sentinel.release).not.toHaveBeenCalled();
    await advance(5000);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Workout complete");
    expect(sentinel.release).toHaveBeenCalledTimes(1);
    // Done asks for nothing more, even when the tab comes back.
    setVisibility("visible");
    await flushReal(50);
    expect(lock.request).toHaveBeenCalledTimes(1);
  });

  it("release: unmount releases the sentinel", async () => {
    const lock = stubWakeLock();
    const view = await render();
    const sentinel = lock.sentinels[0]!;
    expect(sentinel.release).not.toHaveBeenCalled();
    view.unmount();
    await flushReal(50);
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it("a request still pending at unmount releases its lock when it lands", async () => {
    let land!: (s: FakeSentinel) => void;
    const late = new FakeSentinel();
    const lock = stubWakeLock(() => new Promise<FakeSentinel>((res) => (land = res)));
    const view = await render();
    expect(lock.request).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => {
      land(late);
    });
    await flushReal(50);
    expect(late.release).toHaveBeenCalledTimes(1);
  });

  describe("host-level states make no request", () => {
    it("loading", async () => {
      // The library read never settles, so the host stays loading.
      vi.mocked(offline.loadLibrary).mockImplementation(() => new Promise(() => undefined));
      const lock = stubWakeLock();
      await render();
      await flushReal(50);
      expect(screenId()).toBe("UF-09");
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Workout");
      expect(lock.request).not.toHaveBeenCalled();
    });

    it("this workout isn't on this device", async () => {
      freshDb();
      const lock = stubWakeLock();
      await render();
      await flushReal(50);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "This workout isn't on this device",
      );
      expect(lock.request).not.toHaveBeenCalled();
    });

    it("ended", async () => {
      await seedSession({ ended_at: new Date(NOW - 60_000).toISOString() });
      const lock = stubWakeLock();
      await render();
      await flushReal(50);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This workout has ended");
      expect(lock.request).not.toHaveBeenCalled();
    });

    it("stale", async () => {
      await seedSession({ started_at: new Date(NOW - 13 * 60 * 60_000).toISOString() });
      const lock = stubWakeLock();
      await render();
      await flushReal(50);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "This workout was started on",
      );
      expect(lock.request).not.toHaveBeenCalled();
    });
  });

  it("the pair: keepAwake false makes no request (sound and voice on)", async () => {
    setPrefs({ sound: true, voice: true, keepAwake: false });
    const lock = stubWakeLock();
    await render();
    await advance(5000);
    await flushReal(50);
    expect(lock.request).not.toHaveBeenCalled();
  });

  it("missing: navigator.wakeLock undefined → no call and no throw", async () => {
    hideWakeLock();
    const errors = vi.spyOn(console, "error");
    await render();
    expect(screenId()).toBe("UF-09.1");
    setVisibility("visible");
    await advance(5000);
    expect(screenId()).toBe("UF-09.2");
    expect(errors).not.toHaveBeenCalled();
  });

  it("rejected: a NotAllowedError → no unhandled rejection and no UI change", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    window.addEventListener("unhandledrejection", unhandled);
    try {
      const lock = stubWakeLock(() =>
        Promise.reject(new DOMException("Wake Lock permission denied", "NotAllowedError")),
      );
      await render();
      await flushReal(50);
      expect(lock.request).toHaveBeenCalledTimes(1);
      expect(screenId()).toBe("UF-09.1");
      expect(timerText()).toBe("5");
      expect(document.querySelector('[role="alert"]')).toBeNull();
      expect(document.querySelector('[data-field="announcer"]')?.textContent).toBe("");
      // The workout goes on as before; a later visible tries again, and is caught again.
      setVisibility("visible");
      await flushReal(50);
      expect(lock.request).toHaveBeenCalledTimes(2);
      fireEvent.click(screen.getByRole("button", { name: "Start now" }));
      await flushReal();
      expect(screenId()).toBe("UF-09.2");
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
      window.removeEventListener("unhandledrejection", unhandled);
    }
  });
});
