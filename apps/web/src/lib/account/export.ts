// NFR-PRIV-4 export v1 (D-0136 §2, UF-11.4). Built on the device from paged supabase-js reads
// under RLS (plain CRUD, D-0001), plus this user's not-yet-sent rows from Dexie.
//
// Paging: PostgREST caps every response at `max_rows = 1000` (supabase/config.toml), so an
// unpaged `select("*")` silently truncates 2 years of sets (~5,000). Each table is read with
// `.order(key).range(from, from + 999)` until a page comes back short.
//
// All or nothing: any `{error}`, any rejection, or a page whose `data` isn't an array makes the
// whole export reject with `Error("export_failed")`. No partial file is ever offered.
import type { Database } from "@workoutlab/shared";
import type { QueuedSession, QueuedSet } from "../offline/db.js";
import { clientOf, dbOf, readSession, type AccountClient, type AccountDeps } from "./deps.js";

type Tables = Database["public"]["Tables"];

export const EXPORT_TABLES = [
  "profiles",
  "area_targets",
  "sessions",
  "session_sets",
  "routines",
  "routine_items",
  "plan_checkins",
] as const;

export type ExportTable = (typeof EXPORT_TABLES)[number];

/** D-0136 §2: the order key of each table. Rows appear in the file in this order. */
export const ORDER_KEYS: Record<ExportTable, string> = {
  profiles: "user_id",
  area_targets: "area_id",
  sessions: "id",
  session_sets: "id",
  routines: "id",
  routine_items: "id",
  plan_checkins: "id",
};

export const PAGE_SIZE = 1000;

export type QueuedSetExport = Omit<QueuedSet, "key" | "userId">;

export interface AccountExport {
  format: "workoutlab-export";
  version: 1;
  exportedAt: string;
  account: { userId: string; email: string | null };
  tables: { [T in ExportTable]: Tables[T]["Row"][] };
  device: {
    queuedSessions: QueuedSession["row"][];
    queuedSets: QueuedSetExport[];
  };
}

export interface ExportInput {
  userId: string;
  email: string | null;
  now?: Date;
}

export const EXPORT_FAILED = "export_failed";

function exportFailed(): Error {
  return new Error(EXPORT_FAILED);
}

async function readAll(client: AccountClient, table: ExportTable): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .order(ORDER_KEYS[table], { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error || !Array.isArray(data)) throw exportFailed();
    for (const row of data) rows.push(row);
    if (data.length < PAGE_SIZE) return rows;
  }
}

async function readDevice(deps: AccountDeps, userId: string): Promise<AccountExport["device"]> {
  const db = dbOf(deps);
  const [sessions, sets] = await Promise.all([
    db.sessions.where("userId").equals(userId).toArray(),
    db.sets.where("userId").equals(userId).toArray(),
  ]);
  return {
    queuedSessions: sessions
      .filter((s) => s.userId === userId && s.pending)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((s) => s.row),
    queuedSets: sets
      .filter((s) => s.userId === userId)
      .map(({ key: _key, userId: _userId, ...rest }) => rest),
  };
}

/** Builds the D-0136 §2 export. Rejects with `Error("export_failed")` on any failure. */
export async function exportAccountData(
  input: ExportInput,
  deps: AccountDeps = {},
): Promise<AccountExport> {
  const now = input.now ?? (deps.clock ? deps.clock() : new Date());
  const client = clientOf(deps);
  // L1: the device section is read for the session's user, checked against `input.userId`
  // before any request, so a tab that switched accounts can't put another user's queue in
  // this user's file. RLS already scopes the 7 tables to the same session.
  let sessionUserId: string | null;
  try {
    sessionUserId = (await readSession(deps)).userId;
  } catch {
    throw exportFailed();
  }
  if (!sessionUserId || sessionUserId !== input.userId) throw exportFailed();
  let tableRows: unknown[][];
  let device: AccountExport["device"];
  try {
    // `Promise.all` attaches a handler to every read, so a second failure after the first
    // can't surface as an unhandled rejection.
    [tableRows, device] = await Promise.all([
      Promise.all(EXPORT_TABLES.map((t) => readAll(client, t))),
      readDevice(deps, sessionUserId),
    ]);
  } catch {
    throw exportFailed();
  }
  const tables = Object.fromEntries(
    EXPORT_TABLES.map((t, i) => [t, tableRows[i]]),
  ) as AccountExport["tables"];
  return {
    format: "workoutlab-export",
    version: 1,
    exportedAt: now.toISOString(),
    account: { userId: input.userId, email: input.email },
    tables,
    device,
  };
}
