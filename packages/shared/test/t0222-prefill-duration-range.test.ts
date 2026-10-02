// T-0222 (D-0133, UF-09.1/UF-09.3/UF-09.5): a timed pre-fill duration is 15..120 s, matching
// the engine's TIMED_MIN_S..TIMED_MAX_S clamp (D-0062 §5).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSessionPlan } from "../src/index.js";
import { REPO_ROOT, SPEC_TEXT, clone, exampleOf } from "./support/spec.js";
import { parse } from "yaml";

type Obj = Record<string, unknown>;
const plan = exampleOf<{ plan: Obj }>("Workout").plan;

/** `plan` with its first item turned into a timed item whose pre-fill duration is `d`. */
function timed(d: number | null): Obj {
  const copy = clone(plan);
  const items = copy.items as Obj[];
  const base = items[0] as Obj;
  items[0] = {
    ...base,
    repsMin: null,
    repsMax: null,
    durationS: 45,
    prefill: { weightKg: null, reps: null, durationS: d, kind: "add_rep" },
  };
  return copy;
}

const doc = parse(SPEC_TEXT) as {
  components: { schemas: Record<string, { description?: string; properties: Obj }> };
};
const prefillSchema = doc.components.schemas.PrefillResult!;

function engineConstant(name: string): number {
  const text = readFileSync(`${REPO_ROOT}packages/engine/src/prefill.ts`, "utf8");
  const match = new RegExp(`export const ${name}\\s*=\\s*(\\d+)\\s*;`).exec(text);
  if (!match) throw new Error(`${name} is missing from packages/engine/src/prefill.ts`);
  return Number(match[1]);
}

describe("T-0222 PrefillResult.durationS is 15..120", () => {
  it("T-0222 AC1 the schema declares 15..120 and cites D-0133", () => {
    expect(prefillSchema.properties.durationS).toEqual({
      type: ["integer", "null"],
      minimum: 15,
      maximum: 120,
    });
    expect(prefillSchema.description).toContain("15..120");
    expect(prefillSchema.description).toContain("D-0133");
  });

  it.each([15, 45, 120, null])("T-0222 AC2 parseSessionPlan accepts durationS %s", (d) => {
    const input = timed(d);
    expect(parseSessionPlan(input)).toEqual({ ok: true, plan: input });
  });

  it.each([14, 121, 1, 600])("T-0222 AC2 parseSessionPlan rejects durationS %s", (d) => {
    expect(parseSessionPlan(timed(d))).toEqual({ ok: false, error: "invalid" });
  });

  it("T-0222 AC3 the schema range equals the engine's TIMED_MIN_S..TIMED_MAX_S", () => {
    const durationS = prefillSchema.properties.durationS as { minimum: number; maximum: number };
    expect(engineConstant("TIMED_MIN_S")).toBe(durationS.minimum);
    expect(engineConstant("TIMED_MAX_S")).toBe(durationS.maximum);
  });

  it("T-0222 AC3 @workoutlab/shared gains no engine dependency", () => {
    const pkg = JSON.parse(
      readFileSync(`${REPO_ROOT}packages/shared/package.json`, "utf8"),
    ) as Record<string, Record<string, string> | undefined>;
    for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
      expect(Object.keys(pkg[field] ?? {})).not.toContain("@workoutlab/engine");
    }
  });

  it("T-0222 AC4 the generated schema carries maximum: 120 in the PrefillResult closure", () => {
    const text = readFileSync(`${REPO_ROOT}packages/shared/src/session-plan.schema.gen.ts`, "utf8");
    const start = text.indexOf("PrefillResult:");
    expect(start).toBeGreaterThan(-1);
    const block = text.slice(start, text.indexOf("\n    },", start));
    expect(block).toMatch(
      /durationS: \{ type: \["integer", "null"\], minimum: 15, maximum: 120 \}/,
    );
  });
});
