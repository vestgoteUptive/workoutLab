// T-0692 UF-08.1 (D-0269): rule 7.2 step 1, the main lift prefers a loaded compound. R7-E37…E41
// and the real-library check (AC8). L1+ is L1 plus two test-local bodyweight compounds.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  suggest,
  type EngineProfile,
  type HistorySet,
  type LibraryExercise,
  type SessionInput,
  type Workout,
} from "@workoutlab/engine";
import {
  F_PROFILE,
  F_TARGETS,
  FULL_EQUIPMENT,
  L1,
  NOW,
  TZ,
  WARMUPS,
  input,
  itemsOf,
} from "./fixtures/common.js";
import { LIBRARY_PLUS } from "./fixtures/main-loaded.js";

const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function run(
  si: Partial<SessionInput> = {},
  opts: {
    library?: readonly LibraryExercise[];
    profile?: EngineProfile;
    history?: HistorySet[];
  } = {},
): Workout {
  return suggest(
    opts.history ?? [],
    F_TARGETS,
    opts.profile ?? F_PROFILE,
    opts.library ?? LIBRARY_PLUS,
    input(si),
    NOW,
    TZ,
  );
}

describe("rule 7.2 step 1: the main lift prefers a loaded compound (D-0269)", () => {
  it("R7-E37 rule-7.2 (AC1) the chest tie no longer goes to id order: bench-press, not archer-push-up", () => {
    const w = run();
    expect(w.plan.mainLiftId).toBe("bench-press");
    expect(itemsOf(w)[0]).toEqual(["bench-press", 4]);
    expect(w.plan.items[0]?.isMain).toBe(true);
    expect(w.plan.mainLiftId).not.toBe("archer-push-up");
  });

  it("R7-E38 rule-7.2 (AC2) a bodyweight row with a higher gap fit does not win: barbell-row × 4 = 720 s", () => {
    const w = run({ avoidAreas: ["chest"] });
    expect(w.plan.mainLiftId).toBe("barbell-row");
    expect(w.plan.mainLiftId).not.toBe("bird-dog");
    expect(w.plan.mainLiftId).not.toBe("inverted-row");
    expect(itemsOf(w)[0]).toEqual(["barbell-row", 4]);
    expect(w.plan.items[0]?.costS).toBe(720);
  });

  it("R7-E39 rule-7.2 (AC3) no loaded compound in the area: today's behaviour", () => {
    const e6 = run(
      { budgetMin: 15 },
      { profile: { ...F_PROFILE, equipment: [] }, library: [...L1, ...WARMUPS] },
    );
    expect(itemsOf(e6)).toEqual([["push-up", 4]]);
    expect(e6.plan.items[0]?.repsMin).toBe(6);
    expect(e6.plan.items[0]?.prefill).toEqual({
      weightKg: 0,
      reps: 6,
      durationS: null,
      kind: "first_time",
    });
    const w = run({ avoidAreas: ["chest"] }, { profile: { ...F_PROFILE, equipment: [] } });
    expect(w.plan.mainLiftId).toBe("bird-dog");
  });

  it("R7-E40 rule-7.2 (AC4) a favorite wins, as rule 0.2 says", () => {
    expect(run({ favoriteIds: ["push-up"] }).plan.mainLiftId).toBe("push-up");
    expect(run({ favoriteIds: ["push-up", "db-bench-press"] }).plan.mainLiftId).toBe(
      "db-bench-press",
    );
    expect(run({ avoidAreas: ["chest"], favoriteIds: ["inverted-row"] }).plan.mainLiftId).toBe(
      "inverted-row",
    );
    expect(run({ favoriteIds: ["archer-push-up"] }).plan.mainLiftId).toBe("archer-push-up");
  });

  it("R7-E41 rule-7.2 (AC5) an explicit main lift is untouched", () => {
    const a = run({ mainLiftId: "push-up" }, { library: [...L1, ...WARMUPS] });
    expect(itemsOf(a)[0]).toEqual(["push-up", 4]);
    expect(a.plan.items[0]?.isMain).toBe(true);
    const b = run({ mainLiftId: "archer-push-up", autoMainLift: false, fill: false });
    expect(itemsOf(b)).toEqual([["archer-push-up", 4]]);
    expect(b.plan.items[0]?.isMain).toBe(true);
    expect(run({ excludeIds: ["bench-press"] }).plan.mainLiftId).toBe("db-bench-press");
  });
});

// ---- AC8: the real library ----

interface LibraryJson {
  id: string;
  name: string;
  kind: "exercise" | "warmup";
  type: "compound" | "isolation";
  level: "beginner" | "intermediate" | "advanced";
  equipment: string[];
  areas: LibraryExercise["areas"];
  bodyweight?: boolean;
  timed?: boolean;
  default_duration_s?: number | null;
  increment_kg?: number | null;
}

function realLibrary(): LibraryExercise[] {
  const dir = path.join(REPO_DIR, "data", "exercises", "library");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as LibraryJson)
    .map((j) => ({
      id: j.id,
      name: j.name,
      kind: j.kind,
      type: j.type,
      level: j.level,
      equipment: j.equipment,
      areas: j.areas,
      timed: j.timed ?? false,
      defaultDurationS: j.default_duration_s ?? null,
      incrementKg: j.increment_kg ?? null,
      externalLoad: j.bodyweight !== true,
    }));
}

describe("rule 7.2 step 1 on the real library (D-0269, the bug as reported)", () => {
  it("rule-7.2 (AC8) zero history: every level × {full, full + band} × {chest, no avoid} gets a loaded main lift", () => {
    const real = realLibrary();
    const byId = new Map(real.map((e) => [e.id, e]));
    expect(real.filter((e) => e.kind === "exercise").length).toBeGreaterThan(50);
    const picked: string[] = [];
    for (const level of ["beginner", "intermediate", "advanced"] as const) {
      for (const equipment of [FULL_EQUIPMENT, [...FULL_EQUIPMENT, "band"]]) {
        for (const avoidAreas of [[], ["chest"]] as const) {
          const w = run(
            { avoidAreas: [...avoidAreas] },
            { library: real, profile: { ...F_PROFILE, level, equipment } },
          );
          const id = w.plan.mainLiftId;
          const label = `${level} ${equipment.length} ${JSON.stringify(avoidAreas)} -> ${id}`;
          expect(id, label).not.toBeNull();
          expect(byId.get(id as string)?.externalLoad, label).toBe(true);
          picked.push(label);
        }
      }
    }
    // Recorded in the ticket log.
    if (process.env["WL_LOG_PICKS"] !== undefined) console.log(picked.join("\n"));
  });
});
