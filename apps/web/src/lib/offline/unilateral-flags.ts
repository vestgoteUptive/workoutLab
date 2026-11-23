// T-0979 (D-0260, D-0263 §1): an in-memory copy of each exercise's one-side flag, so UF-09, UF-03
// and UF-06 can paint "per arm" on the first frame. IndexedDB cannot be read before first paint,
// so this store is filled earlier (import time, sign-in, `refreshLibrary`) and read synchronously.
// A cold store changes nothing: the screen reads the one detail row after paint, as before.
import { useEffect, useState, useSyncExternalStore } from "react";
import { toUnilateral, type Unilateral } from "@workoutlab/shared";
import { cacheGeneration, cacheWriteAllowed } from "./cache-generation.js";
import { currentUserId } from "./current-user.js";
import { offlineDb } from "./db.js";
// Read through the barrel on purpose: the cold path is "today's read", and the feature tests mock
// `loadExerciseDetail` there. Used only at call time, so the import cycle is harmless.
import { loadExerciseDetail } from "./index.js";

interface Store {
  userId: string;
  generation: number;
  flags: Map<string, Unilateral | null>;
}

let store: Store | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of [...listeners]) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function peekFor(userId: string | null, exerciseId: string): Unilateral | null | undefined {
  if (userId === null || store === null) return undefined;
  if (store.userId !== userId || store.generation !== cacheGeneration()) return undefined;
  return store.flags.get(exerciseId);
}

/** `undefined` = cold (unknown), `null` = known and unflagged, else the word. Synchronous. */
export function peekUnilateral(exerciseId: string): Unilateral | null | undefined {
  return peekFor(currentUserId(), exerciseId);
}

// Out-of-order guard: every warm or refresh takes a number before its read starts, and a result
// older than the newest one already applied is dropped.
let issued = 0;
let applied = 0;

/** A sequence number for a read that is about to start. */
export function takeFlagSeq(): number {
  issued += 1;
  return issued;
}

/** Replaces the store from rows already in hand (`refreshLibrary`). `seq` comes from
 *  `takeFlagSeq()` before the read began; a result older than the last one applied is ignored. */
export function setUnilateralFlags(
  userId: string,
  rows: ReadonlyArray<{ id: string; unilateral?: string | null }>,
  seq: number = takeFlagSeq(),
): void {
  if (seq < applied) return;
  applied = seq;
  const flags = new Map<string, Unilateral | null>();
  for (const r of rows) flags.set(r.id, toUnilateral(r));
  store = { userId, generation: cacheGeneration(), flags };
  notify();
}

/** Adds one id after its single cold read. `gen` and `userId` were captured before the read; the
 *  write is dropped when the cache was invalidated or the user changed since (D-0195). It never
 *  replaces another user's live store. */
export function rememberUnilateral(
  userId: string,
  gen: number,
  exerciseId: string,
  word: unknown,
): void {
  if (!cacheWriteAllowed(gen) || currentUserId() !== userId) return;
  const live = store !== null && store.generation === gen;
  if (live && store!.userId !== userId) return;
  if (!live) store = { userId, generation: gen, flags: new Map() };
  store!.flags.set(
    exerciseId,
    toUnilateral({ unilateral: typeof word === "string" ? word : null }),
  );
  notify();
}

/** Reads this user's cached details once and fills the store. Never throws. */
export async function warmUnilateralFlags(): Promise<void> {
  try {
    const userId = currentUserId();
    if (!userId) return;
    const gen = cacheGeneration();
    const seq = takeFlagSeq();
    const rows = await offlineDb().exerciseDetails.where({ userId }).toArray();
    if (!cacheWriteAllowed(gen)) return;
    setUnilateralFlags(
      userId,
      rows.map((r) => r.detail),
      seq,
    );
  } catch {
    // Best effort: a failed read leaves the store cold.
  }
}

/** The store alone, no fallback read: for screens that already read the detail row themselves
 *  (they call `rememberUnilateral` with the result). `undefined` = cold. */
export function useStoredUnilateral(exerciseId: string): Unilateral | null | undefined {
  const [userId] = useState(currentUserId);
  return useSyncExternalStore(
    subscribe,
    () => peekFor(userId, exerciseId),
    () => undefined,
  );
}

/** The one-side word for an exercise. Warm: right on the first render. Cold: `null` first, then a
 *  single `loadExerciseDetail` read stores the answer and re-renders. A rejected read leaves null. */
export function useUnilateral(exerciseId: string): Unilateral | null {
  const [userId] = useState(currentUserId);
  const stored = useStoredUnilateral(exerciseId);
  const [local, setLocal] = useState<{ id: string; word: Unilateral | null } | null>(null);
  const cold = stored === undefined;
  useEffect(() => {
    if (!cold) return;
    let live = true;
    const gen = cacheGeneration();
    Promise.resolve()
      .then(() => loadExerciseDetail(exerciseId))
      .then(
        (detail) => {
          if (userId !== null) rememberUnilateral(userId, gen, exerciseId, detail?.unilateral);
          if (live) setLocal({ id: exerciseId, word: toUnilateral(detail) });
        },
        () => undefined,
      );
    return () => {
      live = false;
    };
  }, [exerciseId, cold, userId]);
  if (stored !== undefined) return stored;
  return local?.id === exerciseId ? local.word : null;
}

if (currentUserId() !== null) void warmUnilateralFlags();
