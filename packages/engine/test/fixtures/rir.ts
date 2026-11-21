// T-0952 fixtures: rule 14 sessions with `rir`, and effective-library helpers (D-0252 §2).
import type { HistorySet, LibraryExercise } from "../../src/index.js";
import { LIBRARY, setsWithReps } from "./common.js";

/** One logged set: `[weightKg, reps, rir?]`; `rir` may be any value (invalid ones are tested). */
export type RirEntry = readonly [number | null, number | null, unknown?];

/** One session on local `date` with one hard set per entry; `rir` is set where given. */
export function rirSession(
  date: string,
  exerciseId: string,
  entries: readonly RirEntry[],
  time?: string,
): HistorySet[] {
  const rows = setsWithReps(
    date,
    exerciseId,
    entries.map((e) => [e[0], e[1]] as const),
    time === undefined ? {} : { time },
  );
  return rows.map((row, i) => {
    const rir = (entries[i] as RirEntry)[2];
    return rir === undefined ? row : ({ ...row, rir } as HistorySet);
  });
}

/** `n` sets at one weight and reps, with the given RIR per set (shorter lists leave null). */
export function top(
  w: number,
  reps: number,
  rirs: readonly unknown[],
  n = rirs.length,
): RirEntry[] {
  return Array.from({ length: n }, (_, i) => [w, reps, rirs[i] ?? null] as const);
}

/** The test LIBRARY with `incrementKg` replaced for the listed exercises (the effective library). */
export function withSteps(steps: Readonly<Record<string, number>>): LibraryExercise[] {
  return LIBRARY.map((e) => {
    const step = steps[e.id];
    return step === undefined ? e : { ...e, incrementKg: step };
  });
}
