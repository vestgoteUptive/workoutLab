// @vitest-environment node
// T-0304g AC-3 (D-0119 §7), the pure detector: a cue fires only on an observed crossing, the
// first observation of a timer fires nothing, and each (timer, threshold) fires at most once.
import { describe, expect, it } from "vitest";
import { NO_TRACK, observeCues, type CueTrack, type Observation } from "../cues.js";

/** Runs a sequence of observations and returns every fired cue as "kind@s", per observation. */
function run(seen: Observation[], start: CueTrack = NO_TRACK): string[][] {
  let track = start;
  return seen.map((s) => {
    const out = observeCues(track, s);
    track = out.track;
    return out.fire.map((c) => `${c.kind}@${c.atS}`);
  });
}

const rest = (remainingS: number, key = "rest:A"): Observation => ({
  key,
  phase: "rest",
  remainingS,
});

describe("AC-3 the crossing detector", () => {
  it("a rest seen from 12 to 0, one second at a time", () => {
    const fired = run([12, 11, 10, 9, 4, 3, 2, 1, 0].map((s) => rest(s)));
    expect(fired).toEqual([
      [],
      [],
      ["sound@10"],
      [],
      [],
      ["voice@3"],
      ["voice@2"],
      ["voice@1"],
      ["sound@0"],
    ]);
  });

  it("the first observation never fires (a restore at 5 s, at 0)", () => {
    expect(run([rest(5)])).toEqual([[]]);
    expect(run([rest(0)])).toEqual([[]]);
  });

  it("the pair: a restore at 5 s fires the 3-2-1 and the 0 it then sees, and no 10", () => {
    expect(run([5, 4, 3, 2, 1, 0].map((s) => rest(s))).flat()).toEqual([
      "voice@3",
      "voice@2",
      "voice@1",
      "sound@0",
    ]);
  });

  it("the same second again fires nothing more", () => {
    expect(run([11, 10, 10, 10].map((s) => rest(s)))).toEqual([[], ["sound@10"], [], []]);
  });

  it("at most once per timer: back above 10 (+15 s) and down again fires no second 10", () => {
    expect(run([11, 10, 25, 11, 10].map((s) => rest(s))).flat()).toEqual(["sound@10"]);
  });

  it("a new key is a new timer: its first observation fires nothing, its crossings do", () => {
    expect(run([rest(11, "A"), rest(10, "A"), rest(11, "B"), rest(10, "B")])).toEqual([
      [],
      ["sound@10"],
      [],
      ["sound@10"],
    ]);
  });

  it("no timer (key null) resets the track", () => {
    const out = observeCues({ key: "A", lastS: 11, fired: [] }, { ...rest(0), key: null });
    expect(out).toEqual({ track: NO_TRACK, fire: [] });
  });

  it("UF-09.7 has only the hold's 0; UF-09.1 only the voice; UF-09.6 none", () => {
    const timed = (s: number): Observation => ({ key: "t", phase: "timed", remainingS: s });
    const ready = (s: number): Observation => ({ key: "g", phase: "getReady", remainingS: s });
    const next = (s: number): Observation => ({ key: "n", phase: "next", remainingS: s });
    expect(run([12, 10, 3, 2, 1, 0].map(timed)).flat()).toEqual(["sound@0"]);
    expect(run([5, 4, 3, 2, 1, 0].map(ready)).flat()).toEqual(["voice@3", "voice@2", "voice@1"]);
    expect(run([12, 10, 3, 2, 1, 0].map(next)).flat()).toEqual([]);
  });
});
