import { describe, expect, it } from "vitest";
import { loadLibrary } from "../src/index.js";

const lib = loadLibrary();
const ONE_SENTENCE = /[.!?]\s+\S/;
const NO_EDGE_WHITESPACE = (s: string) => s === s.trim();

describe("AC4 text fits one-task screens (UF-09.3, UF-09.6, UF-04.2)", () => {
  it("name is 3-40 characters", () => {
    for (const e of lib) expect(e.name.length, e.id).toBeGreaterThanOrEqual(3);
    for (const e of lib) expect(e.name.length, e.id).toBeLessThanOrEqual(40);
  });

  it("instructions has 1-5 items, each 1-120 chars, one sentence", () => {
    for (const e of lib) {
      expect(e.instructions.length, e.id).toBeGreaterThanOrEqual(1);
      expect(e.instructions.length, e.id).toBeLessThanOrEqual(5);
      for (const step of e.instructions) {
        expect(step.length, `${e.id}: ${step}`).toBeGreaterThanOrEqual(1);
        expect(step.length, `${e.id}: ${step}`).toBeLessThanOrEqual(120);
        expect(step, `${e.id}: ${step}`).not.toMatch(ONE_SENTENCE);
      }
    }
  });

  it("cue is 3-60 characters with no newline", () => {
    for (const e of lib) {
      expect(e.cue.length, e.id).toBeGreaterThanOrEqual(3);
      expect(e.cue.length, e.id).toBeLessThanOrEqual(60);
      expect(e.cue, e.id).not.toMatch(/\n/);
    }
  });

  it("mistakes has 1-3 items of at most 120 characters each", () => {
    for (const e of lib) {
      expect(e.mistakes.length, e.id).toBeGreaterThanOrEqual(1);
      expect(e.mistakes.length, e.id).toBeLessThanOrEqual(3);
      for (const m of e.mistakes) expect(m.length, `${e.id}: ${m}`).toBeLessThanOrEqual(120);
    }
  });

  it("no text field has leading or trailing whitespace", () => {
    for (const e of lib) {
      expect(NO_EDGE_WHITESPACE(e.name), e.id).toBe(true);
      expect(NO_EDGE_WHITESPACE(e.cue), e.id).toBe(true);
      for (const s of e.instructions) expect(NO_EDGE_WHITESPACE(s), e.id).toBe(true);
      for (const m of e.mistakes) expect(NO_EDGE_WHITESPACE(m), e.id).toBe(true);
    }
  });
});
