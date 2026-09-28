// T-0102a AC6–AC11: component schemas against the engine-rules fixtures (D-0037 §5–§9).
// Ajv 2020-12, strict, ajv-formats (test/support/spec.ts).
import { describe, expect, it } from "vitest";
import { AREAS } from "../src/index.js";
import { OPERATIONS, clone, errorsFor, exampleOf, isValid, spec } from "./support/spec.js";

type Obj = Record<string, unknown>;
type Plan = { items: Obj[]; warmup: Obj[]; startDeficits: Record<string, number> } & Obj;

const expectValid = (component: string, value: unknown) =>
  expect(isValid(component, value), JSON.stringify(errorsFor(component, value))).toBe(true);
const expectInvalid = (component: string, value: unknown) =>
  expect(isValid(component, value)).toBe(false);

describe("every component has an example that validates (D-0037 scope)", () => {
  it.each(Object.keys(spec.components.schemas))("%s", (name) => {
    expectValid(name, exampleOf(name));
  });
});

describe("AC6 SuggestRequest (UF-08.1, time running out)", () => {
  const base = {
    sessionInput: {
      budgetMin: 30,
      warmupInBudget: true,
      energy: "normal",
      shuffle: 0,
      mainLiftId: null,
      pinnedIds: [],
      excludeIds: [],
    },
    tz: "Europe/Stockholm",
  };
  const withInput = (patch: Obj) => ({ ...base, sessionInput: { ...base.sessionInput, ...patch } });

  it("accepts the UF-08.1 request and the 7 / 480 budget bounds", () => {
    expectValid("SuggestRequest", base);
    expectValid("SuggestRequest", withInput({ budgetMin: 7 }));
    expectValid("SuggestRequest", withInput({ budgetMin: 480 }));
  });

  it.each([
    ["budgetMin 0", withInput({ budgetMin: 0 })],
    ["budgetMin 481", withInput({ budgetMin: 481 })],
    ["budgetMin 30.5", withInput({ budgetMin: 30.5 })],
    ["energy medium", withInput({ energy: "medium" })],
    ["shuffle -1", withInput({ shuffle: -1 })],
    ["no tz", { sessionInput: base.sessionInput }],
    ["client-supplied now", { ...base, now: "2026-09-27T12:00:00+02:00" }],
  ])("rejects %s", (_label, value) => {
    expectInvalid("SuggestRequest", value);
  });
});

describe("AC7 Workout + SessionPlan (R7-E4 zero history, R7-E10 warm-up)", () => {
  const workout = exampleOf<{ plan: Plan } & Obj>("Workout");

  it("the R7-E4 fixture carries the rule numbers", () => {
    expect(workout).toMatchObject({ itemsTotalS: 1545, totalS: 1725, unusedS: 75 });
    expect(workout["sessionReasons"]).toEqual(
      ["chest", "back", "quads"].map((area) => ({ code: "area_deficit", area, deficit: 1 })),
    );
    const plan = workout.plan;
    expect(plan).toMatchObject({ version: 1, mainLiftId: "bench-press" });
    expect(plan.warmup).toEqual(
      ["wu-scap-push-up", "wu-band-pull-apart", "wu-bodyweight-squat", "wu-arm-circle"].map(
        (exerciseId) => ({ exerciseId, durationS: 40 }),
      ),
    );
    expect(
      plan.items.map((i) => [i["exerciseId"], i["sets"], i["isMain"], i["costS"], i["prefill"]]),
    ).toEqual([
      [
        "bench-press",
        4,
        true,
        720,
        { weightKg: null, reps: 6, durationS: null, kind: "first_time" },
      ],
      [
        "inverted-row",
        3,
        false,
        555,
        { weightKg: 0, reps: 8, durationS: null, kind: "first_time" },
      ],
      [
        "leg-extension",
        2,
        false,
        270,
        { weightKg: null, reps: 10, durationS: null, kind: "first_time" },
      ],
    ]);
    expect(plan.startDeficits).toEqual(Object.fromEntries(AREAS.map((a) => [a, 1])));
  });

  it("Workout is valid and workout.plan is a valid SessionPlan", () => {
    expectValid("Workout", workout);
    expectValid("SessionPlan", workout.plan);
  });

  const mutate = (fn: (p: Plan) => void) => {
    const p = clone(workout.plan);
    fn(p);
    return p;
  };
  const firstItem = (p: Plan): Obj => p.items[0] as Obj;

  it.each([
    ["startDeficits without calves", mutate((p) => delete p.startDeficits["calves"])],
    ["a deficit of 1.2", mutate((p) => (p.startDeficits["chest"] = 1.2))],
    ["an item with sets 0", mutate((p) => (firstItem(p)["sets"] = 0))],
    ["an item with sets 5", mutate((p) => (firstItem(p)["sets"] = 5))],
    ["9 items", mutate((p) => (p.items = Array.from({ length: 9 }, () => clone(firstItem(p)))))],
    [
      "5 warm-up moves",
      mutate((p) => p.warmup.push({ exerciseId: "wu-hip-circle", durationS: 40 })),
    ],
    ["version 2", mutate((p) => (p["version"] = 2))],
  ])("SessionPlan rejects %s", (_label, plan) => {
    expectInvalid("SessionPlan", plan);
    expectInvalid("Workout", { ...workout, plan });
  });
});

describe("AC8 Reason, SwapReason, PrefillKind (rule 10, D-0025, D-0026)", () => {
  const reason = spec.components.schemas["Reason"] as {
    oneOf: { $ref: string }[];
    discriminator: { propertyName: string; mapping: Record<string, string> };
  };
  const enumOf = (name: string) => (spec.components.schemas[name] as { enum: string[] }).enum;

  it("discriminates on code with exactly the 8 rule-10 codes", () => {
    const codes = [
      "main_lift",
      "area_deficit",
      "days_since",
      "recovering_skipped",
      "energy_low_trim",
      "energy_high_backoff",
      "swap",
      "prefill",
    ];
    expect(reason.discriminator.propertyName).toBe("code");
    expect(Object.keys(reason.discriminator.mapping)).toEqual(codes);
    expect(reason.oneOf).toHaveLength(8);
    const consts = reason.oneOf.map((r) => {
      const name = r.$ref.replace("#/components/schemas/", "");
      const props = (spec.components.schemas[name] as { properties: { code: { const: string } } })
        .properties;
      return props.code.const;
    });
    expect(consts).toEqual(codes);
  });

  it("validates reason payloads", () => {
    expectValid("Reason", { code: "area_deficit", area: "chest", deficit: 1 });
    expectValid("Reason", { code: "days_since", area: "hamstrings", days: null });
    expectValid("Reason", { code: "swap", reason: null });
    expectInvalid("Reason", { code: "bored" });
    expectInvalid("Reason", { code: "area_deficit", area: "neck", deficit: 1 });
  });

  it("has the exact SwapReason and PrefillKind enums", () => {
    expect(enumOf("SwapReason")).toEqual([
      "equipment_taken",
      "discomfort",
      "variety",
      "short_on_time",
    ]);
    expect(enumOf("PrefillKind")).toEqual([
      "first_time",
      "carry",
      "reentry",
      "hold_after_break",
      "increase",
      "deload",
      "hold",
      "add_rep",
    ]);
  });
});

describe("AC9 BalanceResult (UF-10, rule 11, zero history and 10 days off)", () => {
  const zero = exampleOf<{ areas: Obj[] } & Obj>("BalanceResult");
  const targets: Record<string, number> = {
    chest: 20,
    back: 20,
    shoulders: 16,
    arms: 12,
    core: 12,
    glutes: 20,
    quads: 20,
    hamstrings: 16,
    calves: 12,
  };

  it("the zero-history result is valid and matches F-targets", () => {
    expectValid("BalanceResult", zero);
    expect(zero.areas.map((a) => a["area"])).toEqual([...AREAS]);
    for (const a of zero.areas) {
      expect(a).toMatchObject({
        load: 0,
        target: targets[a["area"] as string],
        targetSource: "default",
        targetUpdatedAt: "2026-08-02T09:00:00Z",
        deficit: 1,
        coverageStep: 0,
        needsAttention: false,
        recovering: false,
        lastTrainedDate: null,
        days: Array(14).fill(0),
        contributors: [],
      });
    }
  });

  const withArea = (index: number, patch: Obj) => {
    const r = clone(zero);
    r.areas[index] = { ...r.areas[index], ...patch };
    return r;
  };
  const hamstrings = AREAS.indexOf("hamstrings");

  it("R11-E2 hamstrings entry is valid", () => {
    const days = Array<number>(14).fill(0);
    days[6] = 4;
    days[11] = 2;
    const entry = {
      load: 6,
      target: 16,
      deficit: 0.625,
      coverageStep: 1,
      lastTrainedDate: "2026-09-25",
      days,
      contributors: [
        { exerciseId: "romanian-deadlift", weightedSets: 4, lastDate: "2026-09-20" },
        { exerciseId: "back-squat", weightedSets: 2, lastDate: "2026-09-25" },
      ],
    };
    expectValid("AreaBalance", { ...zero.areas[hamstrings], ...entry });
    expectValid("BalanceResult", withArea(hamstrings, entry));
  });

  it("R11-E3 entry (10 days off) is valid", () => {
    expectValid("BalanceResult", withArea(0, { load: 0, lastTrainedDate: "2026-09-17" }));
  });

  it.each([
    ["8 areas", { ...clone(zero), areas: zero.areas.slice(0, 8) }],
    ["days with 13 entries", withArea(0, { days: Array(13).fill(0) })],
    ["coverageStep 5", withArea(0, { coverageStep: 5 })],
    ["windowStart 14/09/2026", { ...clone(zero), windowStart: "14/09/2026" }],
    ["computedAt without offset", { ...clone(zero), computedAt: "2026-09-27T12:00:00" }],
    ["targetSource auto", withArea(0, { targetSource: "auto" })],
    ["negative load", withArea(0, { load: -1 })],
  ])("rejects %s", (_label, value) => {
    expectInvalid("BalanceResult", value);
  });
});

describe("AC10 finish (UF-03.3, time running out)", () => {
  const request = { endedAt: "2026-09-27T11:35:00+02:00", effortRating: 4, tz: "Europe/Stockholm" };

  it("validates FinishRequest", () => {
    expectValid("FinishRequest", request);
    const { effortRating: _dropped, ...withoutEffort } = request;
    expectValid("FinishRequest", withoutEffort);
    expectInvalid("FinishRequest", { ...request, effortRating: 6 });
  });

  it("a 95-min finish on a 45-min budget is a valid summary with withinBudget false", () => {
    const summary = exampleOf("SessionSummary");
    expect(summary).toMatchObject({
      timeBudgetMin: 45,
      startedAt: "2026-09-27T10:00:00+02:00",
      endedAt: "2026-09-27T11:35:00+02:00",
      durationS: 5700,
      withinBudget: false,
    });
    expectValid("SessionSummary", summary);
  });

  it("documents idempotency and the budget + 120 s boundary", () => {
    const finish = OPERATIONS.find((o) => o.path === "/sessions/{id}/finish");
    const description = String(finish?.op["description"] ?? "");
    expect(description).toContain("a repeat finish returns 200");
    expect(description).toContain("timeBudgetMin × 60 + 120");
  });
});

describe("AC11 device-only components (offline, D-0037 §2)", () => {
  const referenced = new Set(
    JSON.stringify(spec.paths)
      .match(/#\/components\/schemas\/\w+/g)
      ?.map((r) => r.split("/").pop()),
  );

  it.each([
    ["CheckinEvaluation", "evaluateCheckin"],
    ["SwapCandidate", "rankSwaps"],
    ["SwapCandidateList", "rankSwaps"],
    ["TimeCheckResult", "timeCheck"],
    ["TimeCheckProgress", "timeCheck"],
    ["PrefillResult", "prefill"],
    ["HistorySet", "balance"],
    ["LibraryExercise", "suggest"],
    ["AreaTarget", "balance"],
    ["EngineProfile", "suggest"],
    ["CheckinSession", "evaluateCheckin"],
    ["PlanCheckin", "evaluateCheckin"],
  ])("%s has x-engine-function %s", (name, fn) => {
    const schema = spec.components.schemas[name] as Obj;
    expect(String(schema["x-engine-function"]).split(/,\s*/)).toContain(fn);
  });

  it.each([
    "CheckinEvaluation",
    "SwapCandidate",
    "SwapCandidateList",
    "TimeCheckResult",
    "TimeCheckProgress",
  ])("%s is referenced by no path", (name) => {
    expect(referenced.has(name)).toBe(false);
  });

  describe("CheckinEvaluation (UF-11.1)", () => {
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
    const ac1 = {
      periods: [
        { index: 2, start: "2026-08-30", end: "2026-09-12", completed: 4, status: "under" },
        { index: 3, start: "2026-09-13", end: "2026-09-26", completed: 3, status: "under" },
      ],
      proposal: { direction: "down", rhythmMin: 2, rhythmMax: 3, previewTargets: preview },
      nextCheckinDate: "2026-10-11",
    };
    const withProposal = (patch: Obj) => ({ ...ac1, proposal: { ...ac1.proposal, ...patch } });

    it("UF-11 AC1 and zero history are valid", () => {
      expectValid("CheckinEvaluation", ac1);
      expectValid("CheckinEvaluation", {
        periods: [],
        proposal: null,
        nextCheckinDate: "2026-10-04",
      });
    });

    it.each([
      ["status late", { ...ac1, periods: [{ ...ac1.periods[0], status: "late" }] }],
      ["rhythmMin 0", withProposal({ rhythmMin: 0 })],
      ["rhythmMax 8", withProposal({ rhythmMax: 8 })],
      ["8 previewTargets", withProposal({ previewTargets: preview.slice(0, 8) })],
    ])("rejects %s", (_label, value) => {
      expectInvalid("CheckinEvaluation", value);
    });
  });

  describe("SwapCandidate[] (UF-08.3, UF-05.1, R12-E1)", () => {
    const candidate = (
      exerciseId: string,
      timeCostS: number,
      equipment: string[],
      bestMatch = false,
    ) => ({
      exerciseId,
      muscleMatch: 0.667,
      timeCostS,
      equipment,
      fitsBudget: true,
      bestMatch,
    });
    const r12e1 = [
      candidate("db-row", 555, ["dumbbell", "bench"], true),
      candidate("inverted-row", 555, ["rack"]),
      candidate("lat-pulldown", 555, ["cable"]),
      candidate("seated-cable-row", 555, ["cable"]),
      candidate("straight-arm-pulldown", 375, ["cable"]),
    ];

    it("R12-E1 is valid, bestMatch only at index 0", () => {
      expectValid("SwapCandidateList", r12e1);
      expect(r12e1.map((c) => c.bestMatch)).toEqual([true, false, false, false, false]);
    });

    it("rejects muscleMatch 1.2", () => {
      expectInvalid("SwapCandidate", { ...r12e1[0], muscleMatch: 1.2 });
    });
  });

  describe("TimeCheckResult / TimeCheckProgress (UF-09.8, rule 8)", () => {
    const lateralRaise = {
      exerciseId: "lateral-raise",
      isMain: false,
      sets: 2,
      repsMin: 10,
      repsMax: 15,
      durationS: null,
      costS: 270,
      backoff: null,
      prefill: { weightKg: null, reps: 10, durationS: null, kind: "first_time" },
      reasons: [],
    };

    it("R8-E1 (105 s behind, shown) and R8-E3 (59 s, hidden) are valid", () => {
      expectValid("TimeCheckResult", {
        behindS: 105,
        show: true,
        minutesBehind: 2,
        projectedS: 2805,
        trim: { items: [lateralRaise], projectedS: 2700 },
        skipNext: { items: [], projectedS: 2535 },
      });
      expectValid("TimeCheckResult", exampleOf("TimeCheckResult"));
      expect(exampleOf("TimeCheckResult")).toMatchObject({
        behindS: 59,
        show: false,
        minutesBehind: null,
      });
    });

    it("rejects negative elapsedS", () => {
      expectValid("TimeCheckProgress", { elapsedS: 1500, nextItemIndex: 1 });
      expectInvalid("TimeCheckProgress", { elapsedS: -1, nextItemIndex: 1 });
    });
  });
});
