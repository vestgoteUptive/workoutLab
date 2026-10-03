// @vitest-environment node
// T-0447 AC-1 (D-0161): one observation that crosses several thresholds fires only the lowest of
// each kind, no voice at 0, and every crossed threshold counts as fired.
import { describe, expect, it } from "vitest";
import { NO_TRACK, observeCues, type CueTrack, type Observation } from "../cues.js";
import type { Phase } from "../machine.js";

function run(seen: Observation[]): { fired: string[][]; track: CueTrack } {
  let track = NO_TRACK;
  const fired = seen.map((s) => {
    const out = observeCues(track, s);
    track = out.track;
    return out.fire.map((c) => `${c.kind}@${c.atS}`);
  });
  return { fired, track };
}

const at =
  (phase: Phase, key: string) =>
  (...left: number[]): Observation[] =>
    left.map((remainingS) => ({ key, phase, remainingS }));
const rest = at("rest", "rest:A");

describe("AC-1 the lowest crossed cue of each kind (D-0161)", () => {
  it("rest 12 to 0 fires only the 0 tone", () => {
    expect(run(rest(12, 0)).fired[1]).toEqual(["sound@0"]);
  });

  it("rest 12 to 2 to 1 to 0", () => {
    expect(run(rest(12, 2, 1, 0)).fired.slice(1)).toEqual([
      ["sound@10", "voice@2"],
      ["voice@1"],
      ["sound@0"],
    ]);
  });

  it("rest 4 to 1 fires only voice 1", () => {
    expect(run(rest(4, 1)).fired[1]).toEqual(["voice@1"]);
  });

  it("rest 2 to 0 fires no voice at 0", () => {
    expect(run(rest(2, 0)).fired[1]).toEqual(["sound@0"]);
  });

  it("get ready 5 to 0 fires nothing", () => {
    expect(run(at("getReady", "gr")(5, 0)).fired[1]).toEqual([]);
  });

  it("timed 12 to 0 fires the 0 tone (pin)", () => {
    expect(run(at("timed", "t")(12, 0)).fired[1]).toEqual(["sound@0"]);
  });

  it("crossed counts as fired: 12 to 0, then +15 s and down again fires nothing", () => {
    const first = run(rest(12, 0));
    expect([...first.track.fired].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 10]);
    expect(run(rest(12, 0, 17, 9, 2, 0)).fired.slice(2)).toEqual([[], [], [], []]);
  });

  it("the pair: one second at a time still fires each in order", () => {
    const all = run(rest(12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0)).fired;
    expect(all.flat()).toEqual(["sound@10", "voice@3", "voice@2", "voice@1", "sound@0"]);
  });
});
