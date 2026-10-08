// T-0517 UF-08.1: SessionInput gains the optional `avoidAreas` (rule 6.1, D-0191 §2 §3, GitHub #33).
import { describe, expect, expectTypeOf, it } from "vitest";
import { AREAS } from "../src/index.js";
import type { Area, SessionInput, SuggestRequest } from "../src/index.js";
import { errorsFor, exampleOf, isValid, spec } from "./support/spec.js";

type Obj = Record<string, unknown>;

const expectValid = (component: string, value: unknown) =>
  expect(isValid(component, value), JSON.stringify(errorsFor(component, value))).toBe(true);
const expectInvalid = (component: string, value: unknown) =>
  expect(isValid(component, value)).toBe(false);

const sessionInput30 = exampleOf<Obj>("SessionInput");
const withAvoid = (avoidAreas: unknown) => ({ ...sessionInput30, avoidAreas });

describe("AC1 sessionInput30 + avoidAreas [quads, glutes] is valid", () => {
  it("validates as SessionInput and inside a SuggestRequest", () => {
    expectValid("SessionInput", withAvoid(["quads", "glutes"]));
    expectValid("SuggestRequest", {
      sessionInput: withAvoid(["quads", "glutes"]),
      tz: "Europe/Stockholm",
    });
  });

  it("the second SessionInput example is exactly that input, and it validates", () => {
    const examples = spec.components.schemas["SessionInput"]?.["examples"] as Obj[];
    expect(examples).toHaveLength(3);
    expect(examples[1]).toEqual(withAvoid(["quads", "glutes"]));
    expectValid("SessionInput", examples[1]);
  });

  it("accepts [] and all nine areas", () => {
    expectValid("SessionInput", withAvoid([]));
    expectValid("SessionInput", withAvoid([...AREAS]));
  });
});

describe("AC2 avoidAreas is optional", () => {
  it("sessionInput30 without avoidAreas is still valid, and the field is not required", () => {
    expect(sessionInput30).not.toHaveProperty("avoidAreas");
    expectValid("SessionInput", sessionInput30);
    const required = spec.components.schemas["SessionInput"]?.["required"] as string[];
    expect(required).not.toContain("avoidAreas");
  });
});

describe("AC3 avoidAreas items are Areas, and unique", () => {
  it.each([
    ["an unknown area", ["legs"]],
    ["a duplicate", ["quads", "quads"]],
    ["a non-array", "quads"],
    ["null", null],
    ["a non-string item", [1]],
  ])("rejects %s", (_label, avoidAreas) => {
    expectInvalid("SessionInput", withAvoid(avoidAreas));
    expectInvalid("SuggestRequest", {
      sessionInput: withAvoid(avoidAreas),
      tz: "Europe/Stockholm",
    });
  });
});

describe("AC4 generated type", () => {
  it('SessionInput["avoidAreas"] is Area[] | undefined', () => {
    expectTypeOf<SessionInput["avoidAreas"]>().toEqualTypeOf<Area[] | undefined>();
    expectTypeOf<SuggestRequest["sessionInput"]["avoidAreas"]>().toEqualTypeOf<
      Area[] | undefined
    >();
    // Optional: an input without the field still type-checks.
    const input: SessionInput = {
      budgetMin: 30,
      warmupInBudget: true,
      energy: "normal",
      shuffle: 0,
      mainLiftId: null,
      pinnedIds: [],
      excludeIds: [],
    };
    expect(input).not.toHaveProperty("avoidAreas");
  });
});
