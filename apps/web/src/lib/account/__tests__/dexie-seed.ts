// T-0310c: one row for each of U and V in every table of `offlineDb()` (AC8, AC9).
import type { Table } from "dexie";
import type { OfflineDb } from "../../offline/db.js";
import { U, V } from "./fixtures.js";

export const OFFLINE_TABLES = [
  "sessions",
  "sets",
  "historyCache",
  "libraryCache",
  "targetCache",
  "profileCache",
  "syncMeta",
  "exerciseDetails",
  "sessionCache",
  "checkinCache",
  "routineCache",
  "excludedCache",
  "favoriteCache",
];

/** One row for `userId` in every table of `offlineDb()`. U's `sets` row is `rejected`. */
export async function seedBothUsers(db: OfflineDb): Promise<void> {
  for (const userId of [U, V]) {
    for (const table of db.tables as unknown as Table<Record<string, unknown>, string>[]) {
      const row: Record<string, unknown> = {
        key: `${userId}:${table.name}`,
        id: `${userId}-${table.name}`,
        userId,
      };
      if (table.name === "sets") row.status = userId === U ? "rejected" : "queued";
      if (table.name === "sessions")
        Object.assign(row, { pending: true, finished: false, row: {} });
      await table.put(row);
    }
  }
}

export async function countFor(db: OfflineDb, table: string, userId: string): Promise<number> {
  return db
    .table(table)
    .filter((r: { userId?: string }) => r.userId === userId)
    .count();
}
