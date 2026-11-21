// T-0961 rule 16 fixtures: hand-built weighted sets and the inline seeded PRNG.
import type { HistorySet } from "../../src/index.js";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MkOptions {
  clientId?: string;
  isWarmup?: boolean;
  deletedAt?: string | null;
  editedAt?: string;
  pending?: boolean;
  durationS?: number | null;
}

/** One set of `exerciseId` in `sessionId` at the instant `at`. */
export function mk(
  exerciseId: string,
  sessionId: string,
  at: string,
  weightKg: number | null,
  reps: number | null,
  o: MkOptions = {},
): HistorySet {
  const row: HistorySet = {
    clientId: o.clientId ?? `${exerciseId}|${sessionId}|${at}|${weightKg}x${reps}`,
    sessionId,
    exerciseId,
    isWarmup: o.isWarmup ?? false,
    completedAt: at,
    editedAt: o.editedAt ?? at,
    deletedAt: o.deletedAt ?? null,
    reps,
    weightKg,
    durationS: o.durationS ?? null,
  };
  if (o.pending !== undefined) row.pending = o.pending;
  return row;
}

export const round3 = (x: number): number => Math.round(x * 1000) / 1000;
