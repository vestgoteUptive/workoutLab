// T-0954 (D-0251, D-0259 §13, UF-04.2): the user's own weight step per exercise, offline-first.
//
// Unlike favorites and excluded (online-only writes), a step change applies on the device at once
// and its write is queued (`exerciseSettingsQueue`, one entry per exercise, replayed oldest first).
// The server stamps `updated_at` itself (trigger), so the client cannot send its own time. Last
// write wins is therefore decided on the device before a send: if the server row is newer than
// the queued write, the write is dropped and the device adopts the server value (it converges).
import { supabase } from "../auth/client.js";
import { cacheGeneration, cacheWriteAllowed } from "./cache-generation.js";
import { monotonicEditedAt } from "./clock.js";
import { currentUserId } from "./current-user.js";
import {
  offlineDb,
  userScopedKey,
  type CachedExerciseSetting,
  type QueuedExerciseSetting,
} from "./db.js";

export const STEP_MIN_KG = 0.25;
export const STEP_MAX_KG = 10;

/** `0.25 <= kg <= 10`, a multiple of 0.25 (the table's two checks). */
export function isValidStep(kg: number): boolean {
  return (
    Number.isFinite(kg) && kg >= STEP_MIN_KG && kg <= STEP_MAX_KG && kg * 4 === Math.round(kg * 4)
  );
}

export class ExerciseSettingError extends Error {
  readonly reason: "invalid" | "no-user";
  constructor(reason: "invalid" | "no-user") {
    super(`exercise_setting_${reason}`);
    this.name = "ExerciseSettingError";
    this.reason = reason;
  }
}

/** A queued write the server refused (a check constraint, a missing exercise). The device value
 *  has been reverted; this is what the UI shows until `dismissExerciseSettingError`. */
export interface ExerciseSettingRejection {
  exerciseId: string;
  /** What the user tried to set (null = a reset). */
  attemptedKg: number | null;
  /** The value the device went back to (null = the library default). */
  revertedKg: number | null;
}

const isOnline = (): boolean => typeof navigator === "undefined" || navigator.onLine !== false;

function isAuthError(error: { code?: string; message?: string }, status?: number): boolean {
  return (
    status === 401 ||
    error.code === "PGRST301" ||
    error.message?.toLowerCase().includes("jwt") === true
  );
}

/** Codes that mean "this value is invalid, not merely delayed" (flush.ts AC-C11), plus an FK miss
 *  (the exercise is gone), which no retry fixes. */
function isRejectable(error: { code?: string }): boolean {
  return ["23514", "23502", "22P02", "23503"].includes(error.code ?? "");
}

// A refresh that started before a write holds data older than it and must not replace the device
// row. Each write bumps the counter; a refresh compares it on commit.
const writeSeq = new Map<string, number>();
const seqOf = (userId: string): number => writeSeq.get(userId) ?? 0;
const bumpSeq = (userId: string): void => void writeSeq.set(userId, seqOf(userId) + 1);

/** Reverts every rejected entry's device row to its `base` (idempotent). */
async function revertRejected(userId: string): Promise<void> {
  const db = offlineDb();
  const rejected = await db.exerciseSettingsQueue
    .where({ userId })
    .filter((q) => q.status === "rejected")
    .toArray();
  if (rejected.length === 0) return;
  await db.transaction("rw", db.exerciseSettings, db.exerciseSettingsQueue, async () => {
    for (const q of rejected) {
      const current = await db.exerciseSettingsQueue.get(q.key);
      if (current?.status !== "rejected") continue;
      await applyDevice(userId, q.exerciseId, q.base);
    }
  });
}

async function applyDevice(
  userId: string,
  exerciseId: string,
  kg: number | null,
  updatedAt: string | null = null,
): Promise<void> {
  const key = userScopedKey(userId, exerciseId);
  const table = offlineDb().exerciseSettings;
  if (kg === null) await table.delete(key);
  else await table.put({ key, userId, exerciseId, incrementKg: kg, updatedAt });
}

/** The user's own steps by exercise id (device rows). A rejected write is reverted first, so a
 *  load never shows a value the server refused, even offline. */
export async function loadExerciseSteps(userId: string): Promise<Map<string, number>> {
  await revertRejected(userId);
  return readExerciseSteps(userId);
}

/** Read-only (safe inside a live query): the device rows, with a rejected write's exercise shown
 *  at its reverted value even before `loadExerciseSteps` has persisted the revert. */
export async function readExerciseSteps(userId: string): Promise<Map<string, number>> {
  const db = offlineDb();
  const [rows, entries] = await Promise.all([
    db.exerciseSettings.where({ userId }).toArray(),
    db.exerciseSettingsQueue.where({ userId }).toArray(),
  ]);
  const steps = new Map(rows.map((r) => [r.exerciseId, r.incrementKg]));
  for (const q of entries) {
    if (q.status !== "rejected") continue;
    if (q.base === null) steps.delete(q.exerciseId);
    else steps.set(q.exerciseId, q.base);
  }
  return steps;
}

/** Rejected writes not yet dismissed. */
export async function loadExerciseSettingErrors(
  userId: string,
): Promise<ExerciseSettingRejection[]> {
  const rows = await offlineDb()
    .exerciseSettingsQueue.where({ userId })
    .filter((q) => q.status === "rejected")
    .toArray();
  return rows
    .map((q) => ({ exerciseId: q.exerciseId, attemptedKg: q.incrementKg, revertedKg: q.base }))
    .sort((a, b) => a.exerciseId.localeCompare(b.exerciseId));
}

/** Clears a surfaced rejection. */
export async function dismissExerciseSettingError(
  userId: string,
  exerciseId: string,
): Promise<void> {
  const key = userScopedKey(userId, exerciseId);
  const db = offlineDb();
  await db.transaction("rw", db.exerciseSettingsQueue, async () => {
    if ((await db.exerciseSettingsQueue.get(key))?.status === "rejected") {
      await db.exerciseSettingsQueue.delete(key);
    }
  });
}

async function enqueue(
  userId: string,
  exerciseId: string,
  op: "upsert" | "delete",
  kg: number | null,
): Promise<void> {
  const db = offlineDb();
  const key = userScopedKey(userId, exerciseId);
  bumpSeq(userId);
  await db.transaction("rw", db.exerciseSettings, db.exerciseSettingsQueue, async () => {
    const existing = await db.exerciseSettingsQueue.get(key);
    const device = await db.exerciseSettings.get(key);
    // Another write already waiting keeps its `base`; otherwise the device value is the base.
    const waiting = existing?.status === "queued";
    const base = waiting ? existing.base : (device?.incrementKg ?? null);
    const seen = waiting ? existing.seen : (device?.updatedAt ?? null);
    const last = (await db.exerciseSettingsQueue.where({ userId }).toArray())
      .map((q) => q.queuedAt)
      .sort()
      .at(-1);
    const queuedAt = monotonicEditedAt(new Date(), last ?? null);
    await applyDevice(userId, exerciseId, kg);
    await db.exerciseSettingsQueue.put({
      key,
      userId,
      exerciseId,
      op,
      incrementKg: kg,
      queuedAt,
      base,
      seen,
      status: "queued",
    });
  });
}

async function writeThenSend(
  exerciseId: string,
  op: "upsert" | "delete",
  kg: number | null,
): Promise<void> {
  const userId = currentUserId();
  if (!userId) throw new ExerciseSettingError("no-user");
  await enqueue(userId, exerciseId, op, kg);
  if (!isOnline()) return;
  try {
    await flushExerciseSettings(userId);
  } catch {
    // Stays queued; the `online` event or the next flush sends it.
  }
}

/** Sets the step: applies on the device at once, queues the upsert, sends it now when online. */
export async function setExerciseStep(exerciseId: string, incrementKg: number): Promise<void> {
  if (!isValidStep(incrementKg)) throw new ExerciseSettingError("invalid");
  await writeThenSend(exerciseId, "upsert", incrementKg);
}

/** "Use default": removes the device row at once and queues (or sends) the delete. */
export async function resetExerciseStep(exerciseId: string): Promise<void> {
  await writeThenSend(exerciseId, "delete", null);
}

interface ServerRow {
  increment_kg: number | string;
  updated_at: string;
}

export interface SettingsFlushResult {
  sentAny: boolean;
  authBlocked: boolean;
}

/** Sends this user's queued writes, oldest first, one at a time (the order is the order the user
 *  made them). A write the server has already overtaken is dropped and the device adopts the
 *  server value. A network `TypeError` propagates (`flush()` maps it to the backoff). */
export async function flushExerciseSettings(userId: string): Promise<SettingsFlushResult> {
  const db = offlineDb();
  const queued = (await db.exerciseSettingsQueue.where({ userId }).sortBy("queuedAt")).filter(
    (q) => q.status === "queued",
  );
  const result: SettingsFlushResult = { sentAny: false, authBlocked: false };
  const table = () => supabase.from("exercise_settings");

  /** Removes the entry only when it is still the one that was sent. */
  const settle = async (sent: QueuedExerciseSetting, after: () => Promise<void>) => {
    await db.transaction("rw", db.exerciseSettings, db.exerciseSettingsQueue, async () => {
      const current = await db.exerciseSettingsQueue.get(sent.key);
      if (current?.queuedAt !== sent.queuedAt) return;
      await db.exerciseSettingsQueue.delete(sent.key);
      await after();
    });
  };

  for (const entry of queued) {
    // Last write wins by time: has another device written since this write was made? (A row
    // newer than the write, other than the one this device already knew, says yes.)
    const read = await table()
      .select("increment_kg, updated_at")
      .eq("exercise_id", entry.exerciseId)
      .maybeSingle();
    if (read.error) {
      if (isAuthError(read.error, read.status)) result.authBlocked = true;
      return result;
    }
    const server = read.data as ServerRow | null;
    if (server && server.updated_at > entry.queuedAt && server.updated_at !== entry.seen) {
      await settle(entry, () =>
        applyDevice(userId, entry.exerciseId, Number(server.increment_kg), server.updated_at),
      );
      result.sentAny = true;
      continue;
    }

    if (entry.op === "delete") {
      const { error, status } = await table().delete().eq("exercise_id", entry.exerciseId);
      if (error) {
        if (isAuthError(error, status)) {
          result.authBlocked = true;
          return result;
        }
        if (isRejectable(error)) {
          await reject(entry);
          continue;
        }
        return result;
      }
      await settle(entry, async () => undefined);
      result.sentAny = true;
      continue;
    }

    const { data, error, status } = await table()
      .upsert(
        { exercise_id: entry.exerciseId, increment_kg: entry.incrementKg as number },
        { onConflict: "user_id,exercise_id" },
      )
      .select("increment_kg, updated_at");
    if (error) {
      if (isAuthError(error, status)) {
        result.authBlocked = true;
        return result;
      }
      if (isRejectable(error)) {
        await reject(entry);
        continue;
      }
      return result;
    }
    const first = Array.isArray(data) ? (data[0] as Partial<ServerRow> | undefined) : undefined;
    await settle(entry, async () => {
      // Keep the device value; take the server's timestamp for it.
      if (first?.updated_at && entry.incrementKg !== null) {
        await applyDevice(userId, entry.exerciseId, entry.incrementKg, first.updated_at);
      }
    });
    result.sentAny = true;
  }
  return result;

  async function reject(entry: QueuedExerciseSetting): Promise<void> {
    await db.transaction("rw", db.exerciseSettings, db.exerciseSettingsQueue, async () => {
      const current = await db.exerciseSettingsQueue.get(entry.key);
      if (current?.queuedAt !== entry.queuedAt) return;
      await db.exerciseSettingsQueue.put({ ...current, status: "rejected" });
      await applyDevice(userId, entry.exerciseId, entry.base);
    });
  }
}

/** Replaces this user's device rows from the server, except an exercise with a write still
 *  queued (the device value wins until it is sent). A rejected write is reverted to the server
 *  value. Any error means "unknown": the device rows stay. Never throws. */
export async function refreshExerciseSettings(): Promise<void> {
  const userId = currentUserId();
  if (!userId || !isOnline()) return;
  const gen = cacheGeneration();
  const seq = seqOf(userId);
  const db = offlineDb();

  let rows: Array<{ exercise_id: string; increment_kg: number | string; updated_at: string }>;
  try {
    const { data, error } = await supabase
      .from("exercise_settings")
      .select("exercise_id, increment_kg, updated_at");
    if (error || !Array.isArray(data)) return;
    rows = data as typeof rows;
  } catch {
    return;
  }

  await db.transaction("rw", db.exerciseSettings, db.exerciseSettingsQueue, async () => {
    if (!cacheWriteAllowed(gen) || seqOf(userId) !== seq) return;
    const entries = await db.exerciseSettingsQueue.where({ userId }).toArray();
    const waiting = new Set(entries.filter((q) => q.status === "queued").map((q) => q.exerciseId));
    const next: CachedExerciseSetting[] = rows
      .filter((r) => !waiting.has(r.exercise_id))
      .map((r) => ({
        key: userScopedKey(userId, r.exercise_id),
        userId,
        exerciseId: r.exercise_id,
        incrementKg: Number(r.increment_kg),
        updatedAt: r.updated_at,
      }));
    const keep = (await db.exerciseSettings.where({ userId }).toArray()).filter((r) =>
      waiting.has(r.exerciseId),
    );
    await db.exerciseSettings.where({ userId }).delete();
    await db.exerciseSettings.bulkPut([...next, ...keep]);
  });
}
