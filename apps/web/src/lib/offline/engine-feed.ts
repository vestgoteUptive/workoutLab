// The engine feed (AC-C14, AC-C15, D-0034 §3, D-0045 §7): 56 local days of cached server rows
// first (no `pending` key), then every queued row for the same user with `pending: true`,
// including tombstones and rejected rows (D-0045 §6: "never dropped"). The feed doesn't dedupe;
// `@workoutlab/engine` rule 0 does, with the D-0034 §3 equal-`editedAt` tie-break (server wins).
import { toHistorySet, type HistorySet } from "@workoutlab/shared";
import { offlineDb } from "./db.js";
import { currentUserId } from "./current-user.js";

export async function loadEngineHistory(): Promise<HistorySet[]> {
  const userId = currentUserId();
  if (!userId) return [];
  const db = offlineDb();

  const [cached, queued] = await Promise.all([
    db.historyCache.where({ userId }).toArray(),
    db.sets.where({ userId }).toArray(),
  ]);

  const server: HistorySet[] = cached.map((row) =>
    toHistorySet({
      client_id: row.clientId,
      session_id: row.sessionId,
      exercise_id: row.exerciseId,
      is_warmup: row.isWarmup,
      completed_at: row.completedAt,
      edited_at: row.editedAt,
      deleted_at: row.deletedAt,
      reps: row.reps,
      weight_kg: row.weightKg,
      duration_s: row.durationS,
    }),
  );

  const pending: HistorySet[] = queued.map((row) =>
    toHistorySet(
      {
        client_id: row.clientId,
        session_id: row.sessionId,
        exercise_id: row.exerciseId,
        is_warmup: row.isWarmup,
        completed_at: row.completedAt,
        edited_at: row.editedAt,
        deleted_at: row.deletedAt,
        reps: row.reps,
        weight_kg: row.weightKg,
        duration_s: row.durationS,
      },
      { pending: true },
    ),
  );

  return [...server, ...pending];
}
