// @vitest-environment node
// T-0302c AC-7 (D-0106 §4–§5): the shared workout formatters in `lib/i18n/workout.ts`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Reason } from "@workoutlab/shared";
import { en } from "../en.js";
import * as workout from "../workout.js";
import {
  areaName,
  itemReasonLine,
  itemSummary,
  reasonLine,
  restLabel,
  sessionReasonChips,
} from "../workout.js";

const PREFILL_KINDS = [
  "first_time",
  "carry",
  "reentry",
  "hold_after_break",
  "increase",
  "deload",
  "hold",
  "add_rep",
] as const;

/** W-R7E4 (`api/openapi.yaml` `Workout` example): the bench-press item's reasons. */
const BENCH_REASONS: Reason[] = [
  { code: "main_lift" },
  { code: "area_deficit", area: "chest", deficit: 1 },
  { code: "days_since", area: "chest", days: null },
  { code: "prefill", kind: "first_time" },
];
const R7E4_SESSION: Reason[] = [
  { code: "area_deficit", area: "chest", deficit: 1 },
  { code: "area_deficit", area: "back", deficit: 1 },
  { code: "area_deficit", area: "quads", deficit: 1 },
];

describe("AC-7 exports", () => {
  it("exports exactly the six D-0106 §4 names", () => {
    expect(Object.keys(workout).sort()).toEqual([
      "areaName",
      "itemReasonLine",
      "itemSummary",
      "reasonLine",
      "restLabel",
      "sessionReasonChips",
    ]);
  });
});

describe("AC-7 itemSummary", () => {
  it("a rep range: 4 × 6–8", () => {
    expect(itemSummary({ sets: 4, repsMin: 6, repsMax: 8, durationS: null })).toBe("4 × 6–8");
  });
  it("repsMin === repsMax: 4 × 5 (no range)", () => {
    expect(itemSummary({ sets: 4, repsMin: 5, repsMax: 5, durationS: null })).toBe("4 × 5");
  });
  it("timed: 3 × 45 s", () => {
    expect(itemSummary({ sets: 3, repsMin: null, repsMax: null, durationS: 45 })).toBe("3 × 45 s");
  });
});

describe("AC-7 restLabel", () => {
  it.each([
    [120, "2:00"],
    [60, "1:00"],
    [90, "1:30"],
  ])("restLabel(%i) = %s", (seconds, label) => {
    expect(restLabel(seconds)).toBe(label);
  });
});

describe("AC-7 reasonLine", () => {
  it.each<[string, Reason, string]>([
    ["main_lift", { code: "main_lift" }, "Main lift"],
    [
      "area_deficit 0.625 (half up)",
      { code: "area_deficit", area: "hamstrings", deficit: 0.625 },
      "Hamstrings 63 % below target",
    ],
    [
      "area_deficit 1",
      { code: "area_deficit", area: "chest", deficit: 1 },
      "Chest 100 % below target",
    ],
    [
      "area_deficit 0.145 (float half up)",
      { code: "area_deficit", area: "back", deficit: 0.145 },
      "Back 15 % below target",
    ],
    ["days_since null", { code: "days_since", area: "quads", days: null }, "Quads not trained yet"],
    ["days_since 0", { code: "days_since", area: "quads", days: 0 }, "Quads last trained today"],
    [
      "days_since 1",
      { code: "days_since", area: "quads", days: 1 },
      "Quads last trained 1 day ago",
    ],
    [
      "days_since 12",
      { code: "days_since", area: "quads", days: 12 },
      "Quads last trained 12 days ago",
    ],
    [
      "recovering_skipped",
      { code: "recovering_skipped", area: "quads" },
      "Quads recovering, skipped",
    ],
    ["energy_low_trim", { code: "energy_low_trim" }, "Trimmed for low energy"],
    ["energy_high_backoff", { code: "energy_high_backoff" }, "Back-off set added"],
    ["swap null", { code: "swap", reason: null }, "Swapped"],
    [
      "swap equipment_taken",
      { code: "swap", reason: "equipment_taken" },
      "Swapped: equipment taken",
    ],
    ["swap discomfort", { code: "swap", reason: "discomfort" }, "Swapped for comfort"],
    ["swap variety", { code: "swap", reason: "variety" }, "Swapped for variety"],
    ["swap short_on_time", { code: "swap", reason: "short_on_time" }, "Swapped to save time"],
  ])("%s", (_name, reason, line) => {
    expect(reasonLine(reason)).toBe(line);
  });

  it.each(PREFILL_KINDS)("prefill {%s} → empty", (kind) => {
    expect(reasonLine({ code: "prefill", kind })).toBe("");
  });
});

describe("AC-7 itemReasonLine", () => {
  it("W-R7E4 bench press: the first 2 non-empty lines, ' · '-joined", () => {
    expect(itemReasonLine(BENCH_REASONS)).toBe("Main lift · Chest 100 % below target");
  });
  it("empties are skipped before the cap: a leading prefill doesn't use a slot", () => {
    expect(
      itemReasonLine([
        { code: "prefill", kind: "carry" },
        { code: "main_lift" },
        { code: "days_since", area: "chest", days: 3 },
      ]),
    ).toBe("Main lift · Chest last trained 3 days ago");
  });
  it("a single non-empty line has no separator", () => {
    expect(itemReasonLine([{ code: "main_lift" }])).toBe("Main lift");
  });
  it("only prefill → empty", () => {
    expect(itemReasonLine([{ code: "prefill", kind: "first_time" }])).toBe("");
  });
});

describe("AC-7 sessionReasonChips", () => {
  it("W-R7E4: Chest, Back, Quads (area_deficit → areaName)", () => {
    expect(sessionReasonChips(R7E4_SESSION)).toEqual(["Chest", "Back", "Quads"]);
  });
  it("area_deficit {chest, 1} → Chest, not its reason line", () => {
    expect(sessionReasonChips([{ code: "area_deficit", area: "chest", deficit: 1 }])).toEqual([
      "Chest",
    ]);
  });
  it("recovering_skipped keeps its reasonLine", () => {
    expect(sessionReasonChips([{ code: "recovering_skipped", area: "quads" }])).toEqual([
      "Quads recovering, skipped",
    ]);
  });
  it("any other code gives its reasonLine", () => {
    expect(sessionReasonChips([{ code: "days_since", area: "back", days: 2 }])).toEqual([
      "Back last trained 2 days ago",
    ]);
  });
  it("a list of 4 gives the first 3, in order", () => {
    expect(
      sessionReasonChips([...R7E4_SESSION, { code: "area_deficit", area: "calves", deficit: 1 }]),
    ).toEqual(["Chest", "Back", "Quads"]);
  });
  it("a list of 3 keeps all 3 (the cap boundary)", () => {
    expect(sessionReasonChips(R7E4_SESSION)).toHaveLength(3);
  });
  it("empties are skipped before the cap", () => {
    expect(
      sessionReasonChips([
        { code: "prefill", kind: "first_time" },
        ...R7E4_SESSION,
        { code: "area_deficit", area: "calves", deficit: 1 },
      ]),
    ).toEqual(["Chest", "Back", "Quads"]);
  });
  it("only prefill → []", () => {
    expect(sessionReasonChips([{ code: "prefill", kind: "hold" }])).toEqual([]);
  });
});

describe("AC-7 areaName", () => {
  it("reads en.bodyMap.areas", () => {
    expect(areaName("hamstrings")).toBe(en.bodyMap.areas.hamstrings);
    for (const [area, name] of Object.entries(en.bodyMap.areas)) {
      expect(areaName(area as keyof typeof en.bodyMap.areas)).toBe(name);
    }
  });
});

describe("AC-7 strings: literals in workout.ts, area names from en.bodyMap.areas", () => {
  const source = readFileSync(resolve(__dirname, "../workout.ts"), "utf8");
  const areaNames = Object.values(en.bodyMap.areas);

  it("the area names are not copied into workout.ts", () => {
    for (const name of areaNames) expect(source).not.toMatch(new RegExp(`["'\`]${name}["'\`]`));
  });

  /** Every fragment left after taking out area names and numbers is a literal in the file. */
  function fragments(output: string): string[] {
    let rest = output;
    for (const name of areaNames) rest = rest.split(name).join("¦");
    return rest
      .split(/¦|\d+| · /)
      .map((s) => s.trim())
      .filter((s) => s !== "");
  }

  const outputs = [
    itemSummary({ sets: 4, repsMin: 6, repsMax: 8, durationS: null }),
    itemSummary({ sets: 3, repsMin: null, repsMax: null, durationS: 45 }),
    itemSummary({ sets: 3, repsMin: null, repsMax: null, durationS: null }),
    itemReasonLine(BENCH_REASONS),
    ...[
      { code: "main_lift" },
      { code: "area_deficit", area: "chest", deficit: 0.5 },
      { code: "days_since", area: "quads", days: null },
      { code: "days_since", area: "quads", days: 0 },
      { code: "days_since", area: "quads", days: 1 },
      { code: "days_since", area: "quads", days: 12 },
      { code: "recovering_skipped", area: "quads" },
      { code: "energy_low_trim" },
      { code: "energy_high_backoff" },
      { code: "swap", reason: null },
      { code: "swap", reason: "equipment_taken" },
      { code: "swap", reason: "discomfort" },
      { code: "swap", reason: "variety" },
      { code: "swap", reason: "short_on_time" },
    ].map((r) => reasonLine(r as Reason)),
  ];

  it.each(outputs)("%s", (output) => {
    for (const fragment of fragments(output)) {
      expect(source, fragment).toContain(fragment);
    }
  });

  it("CONTRAST: a string that isn't in the file is caught", () => {
    expect(fragments("Quads shuffled").some((f) => !source.includes(f))).toBe(true);
  });
});
