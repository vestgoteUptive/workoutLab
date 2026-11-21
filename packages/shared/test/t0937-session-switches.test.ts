// T-0937 UF-08.2: SessionInput gains the optional `autoMainLift` and `fill` (D-0237 §3, D-0239).
import { describe, expect, expectTypeOf, it } from "vitest";
import type { SessionInput } from "../src/index.js";
import type { components } from "../src/api.gen.js";
import { errorsFor, exampleOf, isValid, spec } from "./support/spec.js";

type Obj = Record<string, unknown>;

const base = exampleOf<Obj>("SessionInput");
const withKeys = (extra: Obj) => ({ ...base, ...extra });

describe("AC1 generated type", () => {
  it("both keys are optional booleans", () => {
    expectTypeOf<components["schemas"]["SessionInput"]["autoMainLift"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<components["schemas"]["SessionInput"]["fill"]>().toEqualTypeOf<
      boolean | undefined
    >();
    const input = {} as SessionInput;
    // @ts-expect-error a string is not a boolean
    input.autoMainLift = "false";
    // @ts-expect-error a string is not a boolean
    input.fill = "false";
  });
});

describe("AC2 openapi", () => {
  it("required is unchanged and additionalProperties stays false", () => {
    const schema = spec.components.schemas["SessionInput"] as Obj;
    expect(schema["required"]).toEqual([
      "budgetMin",
      "warmupInBudget",
      "energy",
      "shuffle",
      "mainLiftId",
      "pinnedIds",
      "excludeIds",
    ]);
    expect(schema["additionalProperties"]).toBe(false);
  });
  it("the empty-mode example validates", () => {
    const examples = spec.components.schemas["SessionInput"]?.["examples"] as Obj[];
    const ex = examples.find((e) => "autoMainLift" in e);
    expect(ex).toMatchObject({ autoMainLift: false, fill: false, pinnedIds: ["leg-extension"] });
    expect(isValid("SessionInput", ex), JSON.stringify(errorsFor("SessionInput", ex))).toBe(true);
    expect(isValid("SuggestRequest", { sessionInput: ex, tz: "Europe/Stockholm" })).toBe(true);
  });
});

describe("AC3 absent keys stay valid", () => {
  it("every example without the keys validates", () => {
    const examples = spec.components.schemas["SessionInput"]?.["examples"] as Obj[];
    const without = examples.filter((e) => !("autoMainLift" in e) && !("fill" in e));
    expect(without.length).toBeGreaterThanOrEqual(3);
    for (const e of without) expect(isValid("SessionInput", e)).toBe(true);
    expect(isValid("SessionInput", withKeys({ autoMainLift: true, fill: true }))).toBe(true);
  });
});

describe("AC4 non-booleans are rejected", () => {
  it.each(["autoMainLift", "fill"])("%s", (key) => {
    for (const v of ["false", 0, null]) {
      expect(isValid("SessionInput", withKeys({ [key]: v }))).toBe(false);
    }
  });
});
