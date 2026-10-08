// T-0565 UF-08.1: SessionInput gains the optional `favoriteIds` (D-0202 §4, GitHub #46).
import { describe, expect, expectTypeOf, it } from "vitest";
import type { SessionInput, SuggestRequest } from "../src/index.js";
import type { components } from "../src/api.gen.js";
import { errorsFor, exampleOf, isValid, spec } from "./support/spec.js";

type Obj = Record<string, unknown>;
type ExerciseId = components["schemas"]["ExerciseId"];

const base = exampleOf<Obj>("SessionInput");
const withFav = (favoriteIds: unknown) => ({ ...base, favoriteIds });

describe("AC1 generated type", () => {
  it('SessionInput["favoriteIds"] is ExerciseId[] | undefined', () => {
    expectTypeOf<components["schemas"]["SessionInput"]["favoriteIds"]>().toEqualTypeOf<
      ExerciseId[] | undefined
    >();
    expectTypeOf<SessionInput["favoriteIds"]>().toEqualTypeOf<ExerciseId[] | undefined>();
    expectTypeOf<SuggestRequest["sessionInput"]["favoriteIds"]>().toEqualTypeOf<
      ExerciseId[] | undefined
    >();
  });
});

describe("AC2 favoriteIds is optional and typed", () => {
  it("absent stays valid and is not required", () => {
    expect(base).not.toHaveProperty("favoriteIds");
    expect(isValid("SessionInput", base)).toBe(true);
    expect(spec.components.schemas["SessionInput"]?.["required"] as string[]).not.toContain(
      "favoriteIds",
    );
  });
  it("accepts [] and [back-squat], also inside a SuggestRequest", () => {
    for (const v of [[], ["back-squat"]]) {
      expect(
        isValid("SessionInput", withFav(v)),
        JSON.stringify(errorsFor("SessionInput", withFav(v))),
      ).toBe(true);
      expect(isValid("SuggestRequest", { sessionInput: withFav(v), tz: "Europe/Stockholm" })).toBe(
        true,
      );
    }
  });
  it("the third SessionInput example carries favoriteIds [back-squat]", () => {
    const examples = spec.components.schemas["SessionInput"]?.["examples"] as Obj[];
    expect(examples[2]).toEqual(withFav(["back-squat"]));
    expect(isValid("SessionInput", examples[2])).toBe(true);
  });
  it.each([
    ["a string", "back-squat"],
    ["null", null],
    ["a non-string item", [1]],
    ["a duplicate", ["back-squat", "back-squat"]],
  ])("rejects %s", (_l, v) => {
    expect(isValid("SessionInput", withFav(v))).toBe(false);
  });
});
