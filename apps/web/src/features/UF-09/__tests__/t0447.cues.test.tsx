// T-0447 AC-2 (D-0161): through the real host, a background tab returns after one big wall-clock
// step. `setSystemTime` moves the clock with no timers firing, then one 1 s flush is the one
// observation; a spy on `observeCues` proves it.
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import * as cues from "../cues.js";
import { STARTED_AT_MS, USER_A } from "./fixtures.js";
import {
  advance,
  freshDb,
  screenId,
  seedSession,
  signIn,
  timerText,
  useFakeClock,
} from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { L2, defaultDetail } from "./set-loop-fixtures.js";
import { seedRest } from "./countdown-helpers.js";
import {
  gesture,
  restoreDeviceStubs,
  stubAudio,
  stubSpeech,
  stubWakeLock,
} from "./t0304g-stubs.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./set-loop-mock.js").then((m) => m.setLoopMock(orig)),
);
vi.mock("../cues.js", async (orig) => {
  const actual = await orig<typeof import("../cues.js")>();
  return { ...actual, observeCues: vi.fn(actual.observeCues) };
});

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
});

/** The wall clock jumps `jumpS` s with no timer firing, then one 1 s flush. React may re-render
 *  more than once; returns the distinct `remainingS` values observed after the jump (one value
 *  means no step in between was ever seen). */
async function jump(jumpS: number): Promise<number[]> {
  const before = vi.mocked(cues.observeCues).mock.calls.length;
  vi.setSystemTime(Date.now() + (jumpS - 1) * 1000);
  await advance(1000);
  const seen = vi.mocked(cues.observeCues).mock.calls.slice(before);
  return [...new Set(seen.map((c) => c[1].remainingS))];
}

async function restAt12() {
  const audio = stubAudio();
  const speech = stubSpeech();
  seedRest(NOW);
  await renderSession({ locale: "en-GB" });
  gesture();
  await advance(108_000);
  expect(timerText()).toBe("0:12");
  return { audio, speech };
}

describe("AC-2 a background tab returns", () => {
  it("12 s left, +15 s: one observation (12 to 0), one tone (the 0 s), no voice", async () => {
    const { audio, speech } = await restAt12();
    expect(await jump(15)).toEqual([0]);
    expect(screenId()).toBe("UF-09.3");
    expect(audio.starts()).toBe(1);
    expect(speech.speak).not.toHaveBeenCalled();
  });

  it("12 s left, +10 s: one observation (12 to 2), the 10 s tone and one voice, '2'", async () => {
    const { audio, speech } = await restAt12();
    expect(await jump(10)).toEqual([2]);
    expect(timerText()).toBe("0:02");
    expect(audio.starts()).toBe(1);
    expect(speech.words()).toEqual(["2"]);
  });

  it("the pair: one-second steps from 12 s to 0 give 2 tones and '3', '2', '1'", async () => {
    const { audio, speech } = await restAt12();
    for (let i = 0; i < 12; i += 1)
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    await advance(0);
    expect(audio.starts()).toBe(2);
    expect(speech.words()).toEqual(["3", "2", "1"]);
  });
});
