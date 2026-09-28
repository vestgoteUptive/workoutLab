// Node-only loader for the library (D-0022 §2). Used by tests here and by the T-0203 seed.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Area } from "./profiles.js";

export type Kind = "exercise" | "warmup";
export type ExerciseType = "compound" | "isolation";
export type Level = "beginner" | "intermediate" | "advanced";
export type Source = "wger" | "workoutlab";

export interface Exercise {
  readonly id: string;
  readonly name: string;
  readonly kind: Kind;
  readonly type: ExerciseType;
  readonly level: Level;
  readonly equipment: readonly string[];
  readonly bodyweight: boolean;
  readonly areas: Readonly<Partial<Record<Area, 1 | 0.5>>>;
  readonly instructions: readonly string[];
  readonly cue: string;
  readonly mistakes: readonly string[];
  readonly variants: readonly string[];
  readonly timed: boolean;
  readonly increment_kg?: number;
  readonly default_duration_s?: number;
  readonly source: Source;
  readonly license: string;
  readonly source_url?: string;
  readonly attribution?: string;
}

const srcDir = dirname(fileURLToPath(import.meta.url));
export const libraryDir = join(srcDir, "..", "library");

/**
 * File names (== ids + ".json"), sorted by the `id` portion in code-point order (AC16).
 * Sorting the raw file names (with the ".json" suffix) is NOT equivalent: "-" (0x2D) sorts
 * before "." (0x2E), so e.g. "calf-raise-hold.json" would sort before "calf-raise.json" even
 * though "calf-raise" < "calf-raise-hold" as ids.
 */
export function libraryFileNames(): string[] {
  return readdirSync(libraryDir)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => {
      const idA = a.slice(0, -".json".length);
      const idB = b.slice(0, -".json".length);
      return idA < idB ? -1 : idA > idB ? 1 : 0;
    });
}

/**
 * Parses every file in `library/`, sorted by `id` ascending (code-point order, AC16).
 * Pure: same file contents in, same array out, every call.
 */
export function loadLibrary(): Exercise[] {
  return libraryFileNames().map(
    (file) => JSON.parse(readFileSync(join(libraryDir, file), "utf8")) as Exercise,
  );
}

export * from "./profiles.js";
