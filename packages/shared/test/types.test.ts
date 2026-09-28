// T-0102a AC12–AC14: engine input types (D-0034 §1, D-0037 §6), generated types without drift
// (D-0037 §10) and the D-0023 placeholder replaced (TR-0015, D-0037 §12).
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import { OUT_PATH, generateApiTypes } from "../scripts/gen-api.js";
import * as shared from "../src/index.js";
import type {
  ApiError,
  Area,
  AreaBalance,
  AreaTarget,
  BalanceResult,
  CheckinEvaluation,
  CheckinSession,
  EngineProfile,
  FinishRequest,
  HistorySet,
  LibraryExercise,
  PlanCheckin,
  PrefillKind,
  PrefillResult,
  Reason,
  SessionInput,
  SessionPlan,
  SessionSummary,
  SuggestRequest,
  SwapCandidate,
  SwapReason,
  TimeCheckProgress,
  TimeCheckResult,
  Workout,
  WorkoutItem,
} from "../src/index.js";
import { REPO_ROOT, isValid } from "./support/spec.js";

describe("AC12 engine input types (D-0034 §1)", () => {
  it("HistorySet is exactly the D-0034 shape", () => {
    expectTypeOf<HistorySet>().toEqualTypeOf<{
      clientId: string;
      sessionId: string;
      exerciseId: string;
      isWarmup: boolean;
      completedAt: string;
      editedAt: string;
      deletedAt: string | null;
      pending?: boolean;
      reps: number | null;
      weightKg: number | null;
      durationS: number | null;
    }>();
  });

  it("Area is the 9-literal union", () => {
    expectTypeOf<Area>().toEqualTypeOf<
      | "chest"
      | "back"
      | "shoulders"
      | "arms"
      | "core"
      | "glutes"
      | "quads"
      | "hamstrings"
      | "calves"
    >();
    expect(shared.AREAS).toEqual([
      "chest",
      "back",
      "shoulders",
      "arms",
      "core",
      "glutes",
      "quads",
      "hamstrings",
      "calves",
    ]);
  });

  it("AreaTarget is exactly the D-0034 shape", () => {
    expectTypeOf<AreaTarget>().toEqualTypeOf<{
      area: Area;
      setsPer14d: number;
      source: "default" | "adapted" | "manual";
      updatedAt: string;
    }>();
  });

  it("LibraryExercise is the D-0034 superset (D-0037 §6)", () => {
    expectTypeOf<LibraryExercise>().toMatchTypeOf<{
      id: string;
      name: string;
      kind: "exercise" | "warmup";
      type: "compound" | "isolation";
      level: "beginner" | "intermediate" | "advanced";
      equipment: readonly string[];
      areas: Partial<Record<Area, number>>;
    }>();
    expectTypeOf<LibraryExercise["timed"]>().toEqualTypeOf<boolean>();
    expectTypeOf<LibraryExercise["incrementKg"]>().toEqualTypeOf<number>();
    expectTypeOf<LibraryExercise["defaultDurationS"]>().toEqualTypeOf<number | null>();
    expectTypeOf<LibraryExercise["externalLoad"]>().toEqualTypeOf<boolean>();
  });

  it("EngineProfile has planUpdatedAt: string", () => {
    expectTypeOf<EngineProfile["planUpdatedAt"]>().toEqualTypeOf<string>();
  });

  it("HistorySet needs an instant, not a local date, at runtime", () => {
    const set = {
      clientId: "C1",
      sessionId: "S1",
      exerciseId: "back-squat",
      isWarmup: false,
      completedAt: "2026-09-20T10:00:00Z",
      editedAt: "2026-09-20T10:05:00Z",
      deletedAt: null,
      reps: 8,
      weightKg: 60,
      durationS: null,
    } satisfies HistorySet;
    expect(isValid("HistorySet", set)).toBe(true);
    expect(isValid("HistorySet", { ...set, pending: true })).toBe(true);
    expect(isValid("HistorySet", { ...set, completedAt: "2026-09-20" })).toBe(false);
  });
});

describe("AC13 generated types, no drift (D-0037 §10)", () => {
  it("api.gen.ts is byte-identical to a fresh openapi-typescript run", async () => {
    expect(await generateApiTypes()).toBe(readFileSync(OUT_PATH, "utf8"));
  });

  it("index.ts exports every named type", () => {
    // A type-level import of each name above fails typecheck if any is missing.
    expectTypeOf<Area>().not.toBeNever();
    expectTypeOf<SessionInput>().not.toBeNever();
    expectTypeOf<SuggestRequest>().not.toBeNever();
    expectTypeOf<Workout>().not.toBeNever();
    expectTypeOf<WorkoutItem>().not.toBeNever();
    expectTypeOf<SessionPlan>().not.toBeNever();
    expectTypeOf<Reason>().not.toBeNever();
    expectTypeOf<SwapReason>().not.toBeNever();
    expectTypeOf<PrefillKind>().not.toBeNever();
    expectTypeOf<PrefillResult>().not.toBeNever();
    expectTypeOf<BalanceResult>().not.toBeNever();
    expectTypeOf<AreaBalance>().not.toBeNever();
    expectTypeOf<CheckinEvaluation>().not.toBeNever();
    expectTypeOf<SwapCandidate>().not.toBeNever();
    expectTypeOf<TimeCheckResult>().not.toBeNever();
    expectTypeOf<TimeCheckProgress>().not.toBeNever();
    expectTypeOf<HistorySet>().not.toBeNever();
    expectTypeOf<LibraryExercise>().not.toBeNever();
    expectTypeOf<AreaTarget>().not.toBeNever();
    expectTypeOf<EngineProfile>().not.toBeNever();
    expectTypeOf<CheckinSession>().not.toBeNever();
    expectTypeOf<PlanCheckin>().not.toBeNever();
    expectTypeOf<FinishRequest>().not.toBeNever();
    expectTypeOf<SessionSummary>().not.toBeNever();
    expectTypeOf<ApiError>().not.toBeNever();
    expectTypeOf<Reason["code"]>().toEqualTypeOf<
      | "main_lift"
      | "area_deficit"
      | "days_since"
      | "recovering_skipped"
      | "energy_low_trim"
      | "energy_high_backoff"
      | "swap"
      | "prefill"
    >();
  });
});

describe("AC14 placeholder replaced (D-0023, TR-0015)", () => {
  const pkgRoot = fileURLToPath(new URL("../", import.meta.url));
  // Built from parts so this file doesn't match its own scan.
  const marker = ["@", "placeholder"].join("");
  const oldExport = ["SHARED", "VERSION"].join("_");

  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.name === "node_modules"
        ? []
        : e.isDirectory()
          ? files(path.join(dir, e.name))
          : [path.join(dir, e.name)],
    );

  it("no file under packages/shared carries the marker or the old version export", () => {
    const offenders = files(pkgRoot).filter((f) => {
      const text = readFileSync(f, "utf8");
      return text.includes(marker) || text.includes(oldExport);
    });
    expect(offenders).toEqual([]);
    expect(Object.keys(shared)).not.toContain(oldExport);
  });

  it("the D-0023 §4 placeholder checker exits 0", () => {
    const script = path.join(REPO_ROOT, ".github/scripts/check-placeholder-tests.mjs");
    expect(() =>
      execFileSync(process.execPath, [script], { cwd: REPO_ROOT, stdio: "pipe" }),
    ).not.toThrow();
  });
});
