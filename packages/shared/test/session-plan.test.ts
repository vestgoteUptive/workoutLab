// T-0102b AC17: parseSessionPlan never throws; plus the drift check for the embedded schema.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLAN_SCHEMA_PATH, generateSessionPlanSchema } from "../scripts/gen-api.js";
import { parseSessionPlan } from "../src/index.js";
import { clone, exampleOf, isValid } from "./support/spec.js";

type Obj = Record<string, unknown>;
const plan = exampleOf<{ plan: Obj }>("Workout").plan;

function without(value: Obj, key: string): Obj {
  const copy = clone(value);
  delete copy[key];
  return copy;
}

const hostile = Object.defineProperty({}, "version", {
  get() {
    throw new Error("boom");
  },
  enumerable: true,
});

const TABLE: Array<[string, unknown, unknown]> = [
  ["the AC7 (R7-E4) plan", plan, { ok: true, plan }],
  ["null", null, { ok: true, plan: null }],
  [
    "version 2 (newer app)",
    { ...clone(plan), version: 2 },
    { ok: false, error: "unsupported_version" },
  ],
  [
    "version 2 with other fields",
    { version: 2, steps: [] },
    { ok: false, error: "unsupported_version" },
  ],
  ["version 0", { ...clone(plan), version: 0 }, { ok: false, error: "unsupported_version" }],
  ["no startDeficits", without(plan, "startDeficits"), { ok: false, error: "invalid" }],
  ["no version", without(plan, "version"), { ok: false, error: "invalid" }],
  ['version "1"', { ...clone(plan), version: "1" }, { ok: false, error: "invalid" }],
  ['the string "{}"', "{}", { ok: false, error: "invalid" }],
  ["the plan as a JSON string", JSON.stringify(plan), { ok: false, error: "invalid" }],
  ["{}", {}, { ok: false, error: "invalid" }],
  ["[]", [], { ok: false, error: "invalid" }],
  ["undefined", undefined, { ok: false, error: "invalid" }],
  ["a number", 42, { ok: false, error: "invalid" }],
  ["an extra key", { ...clone(plan), note: "x" }, { ok: false, error: "invalid" }],
  ["a throwing getter", hostile, { ok: false, error: "invalid" }],
];

describe("AC17 parseSessionPlan never throws", () => {
  it.each(TABLE)("%s", (_label, input, expected) => {
    let result: unknown;
    expect(() => (result = parseSessionPlan(input))).not.toThrow();
    expect(result).toEqual(expected);
  });

  it("returns the plan deep-equal to the input", () => {
    const result = parseSessionPlan(clone(plan));
    expect(result.ok && result.plan).toEqual(plan);
  });

  it("agrees with the OpenAPI SessionPlan component (Ajv) on every object in the table", () => {
    for (const [label, input] of TABLE) {
      if (input === null || typeof input !== "object" || input === hostile) continue;
      const result = parseSessionPlan(input);
      expect({ label, ok: result.ok }).toEqual({ label, ok: isValid("SessionPlan", input) });
    }
  });
});

describe("session-plan.schema.gen.ts has no drift (D-0043)", () => {
  it("is byte-identical to a fresh generation from api/openapi.yaml", async () => {
    expect(readFileSync(PLAN_SCHEMA_PATH, "utf8")).toBe(await generateSessionPlanSchema());
  });
});
