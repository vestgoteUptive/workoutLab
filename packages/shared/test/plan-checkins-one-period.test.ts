// T-0223 AC-4 to AC-7: one-period check-ins (UF-11.1, D-0070 §6, D-0094). Period 0 can propose and
// completedPrev is null when there is no earlier period.
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  toPlanCheckin,
  type CheckinEvaluation,
  type PlanCheckin,
  type Tables,
  type TablesInsert,
  type TablesUpdate,
} from "../src/index.js";
import { errorsFor, isValid, spec } from "./support/spec.js";

type Obj = Record<string, unknown>;

const A = "00000000-0000-0000-0000-00000000000a";

const expectValid = (component: string, value: unknown) =>
  expect(isValid(component, value), JSON.stringify(errorsFor(component, value))).toBe(true);
const expectInvalid = (component: string, value: unknown) =>
  expect(isValid(component, value)).toBe(false);

describe("AC-4 plan_checkins database types (D-0043)", () => {
  it("completed_prev is number | null on Row, optional and nullable on Insert and Update", () => {
    expectTypeOf<Tables<"plan_checkins">["completed_prev"]>().toEqualTypeOf<number | null>();
    expectTypeOf<Required<TablesInsert<"plan_checkins">>["completed_prev"]>().toEqualTypeOf<
      number | null
    >();
    expectTypeOf<Required<TablesUpdate<"plan_checkins">>["completed_prev"]>().toEqualTypeOf<
      number | null
    >();
    const insert: TablesInsert<"plan_checkins"> = {
      period_index: 0,
      completed_last: 0,
      rhythm_min_before: 3,
      rhythm_max_before: 4,
      proposed_min: 2,
      proposed_max: 3,
      proposed_at: "2026-10-04T07:00:00Z",
    };
    const withNull: TablesInsert<"plan_checkins"> = { ...insert, completed_prev: null };
    expect(withNull.completed_prev).toBeNull();
    expect("completed_prev" in insert).toBe(false);
  });

  it("period_index stays number (not null)", () => {
    expectTypeOf<Tables<"plan_checkins">["period_index"]>().toEqualTypeOf<number>();
    expectTypeOf<TablesInsert<"plan_checkins">["period_index"]>().toEqualTypeOf<number>();
  });
});

describe("AC-5 PlanCheckin and CheckinEvaluation in api/openapi.yaml", () => {
  const p0 = {
    id: "P0",
    periodIndex: 0,
    completedPrev: null,
    completedLast: 0,
    rhythmMinBefore: 3,
    rhythmMaxBefore: 4,
    proposedMin: 2,
    proposedMax: 3,
    proposedAt: "2026-10-04T07:00:00Z",
    answer: null,
    answeredAt: null,
  };
  const p1 = {
    ...p0,
    id: "P1",
    periodIndex: 3,
    completedPrev: 4,
    completedLast: 3,
    proposedAt: "2026-09-27T09:00:00Z",
  };

  it("accepts the period-0 one-period row and the existing P1 row", () => {
    expectValid("PlanCheckin", p0);
    expectValid("PlanCheckin", p1);
  });

  it.each<[string, Obj]>([
    ["periodIndex -1", { ...p0, periodIndex: -1 }],
    ["completedPrev -1", { ...p0, completedPrev: -1 }],
    ['completedPrev "0"', { ...p0, completedPrev: "0" }],
  ])("rejects %s", (_label, value) => {
    expectInvalid("PlanCheckin", value);
  });

  it("rejects a PlanCheckin without completedPrev (present, possibly null)", () => {
    const { completedPrev: _omit, ...missing } = p0;
    expectInvalid("PlanCheckin", missing);
  });

  const preview = Object.entries({
    chest: 14,
    back: 14,
    shoulders: 11,
    arms: 9,
    core: 9,
    glutes: 14,
    quads: 14,
    hamstrings: 11,
    calves: 9,
  }).map(([area, setsPer14d]) => ({ area, setsPer14d }));
  const r9e8 = {
    periods: [{ index: 0, start: "2026-09-20", end: "2026-10-03", completed: 0, status: "under" }],
    proposal: { direction: "down", rhythmMin: 2, rhythmMax: 3, previewTargets: preview },
    nextCheckinDate: "2026-10-18",
  };

  it("accepts the R9-E8 one-period evaluation (period 0, zero history)", () => {
    expectValid("CheckinEvaluation", r9e8);
  });

  it("rejects a period with index -1", () => {
    expectInvalid("CheckinEvaluation", {
      ...r9e8,
      periods: [{ ...r9e8.periods[0], index: -1 }],
    });
    expectInvalid("CheckinPeriod", { ...r9e8.periods[0], index: -1 });
  });

  it("documents the period-0 examples, and every PlanCheckin / CheckinPeriod example validates", () => {
    const examples = (name: string) => (spec.components.schemas[name]?.["examples"] ?? []) as Obj[];
    expect(examples("PlanCheckin")).toContainEqual(p0);
    expect(examples("CheckinPeriod").some((e) => e["index"] === 0)).toBe(true);
    for (const name of ["PlanCheckin", "CheckinPeriod"]) {
      for (const e of examples(name)) expectValid(name, e);
    }
  });
});

describe("AC-6 generated API types", () => {
  it("PlanCheckin.completedPrev is number | null and periodIndex is number", () => {
    expectTypeOf<PlanCheckin["completedPrev"]>().toEqualTypeOf<number | null>();
    expectTypeOf<PlanCheckin["periodIndex"]>().toEqualTypeOf<number>();
    expectTypeOf<CheckinEvaluation["periods"][number]["index"]>().toEqualTypeOf<number>();
  });
});

describe("AC-7 toPlanCheckin passes a null completed_prev through", () => {
  it("maps the period-0 row to completedPrev null", () => {
    const c = toPlanCheckin({
      id: "20000000-0000-4000-8000-000000000002",
      user_id: A,
      period_index: 0,
      completed_prev: null,
      completed_last: 0,
      rhythm_min_before: 3,
      rhythm_max_before: 4,
      proposed_min: 2,
      proposed_max: 3,
      proposed_at: "2026-10-04T07:00:00+00:00",
      answer: null,
      answered_at: null,
    });
    expect(c.periodIndex).toBe(0);
    expect(c).toHaveProperty("completedPrev", null);
    expect(c.completedPrev).not.toBe(0);
    expect(c.completedPrev).not.toBeUndefined();
    expectValid("PlanCheckin", c);
  });
});
