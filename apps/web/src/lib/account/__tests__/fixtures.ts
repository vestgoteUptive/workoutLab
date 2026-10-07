// T-0310c fixtures: the two users, the clock, and the fake PostgREST client `pg(rows)`.
//
// `pg(rows)`: `from(table).select("*")` records the table, every `.order(col, opts)` and every
// `.range(a, b)`, and resolves `{data, error: null}`. With a range, `data` is the rows sorted by
// the last order column, sliced `[a, min(b, a + 999)]`. Without a range, `data` is the first
// 1,000 rows, as PostgREST's `max_rows = 1000` does. A per-call hook can return an error result,
// reject, or add latency.
import type { AccountClient, PageResult } from "../deps.js";

export const U = "00000000-0000-4000-8000-0000000000aa";
export const V = "00000000-0000-4000-8000-0000000000bb";
export const NOW = new Date("2026-09-27T23:30:00Z");
export const TZ = "Europe/Stockholm";

export const MAX_ROWS = 1000;

export type Row = Record<string, unknown>;

export interface PgCall {
  table: string;
  columns: string | undefined;
  orders: Array<[string, { ascending: boolean } | undefined]>;
  ranges: Array<[number, number]>;
}

/** What a hook can do with one request. Return `undefined` to answer normally. */
export type PgHook = (
  call: PgCall,
  /** 1-based index of this request among the requests to the same table. */
  nthForTable: number,
) => PageResult | undefined | Promise<PageResult | undefined>;

export interface Pg {
  client: AccountClient;
  calls: PgCall[];
  tablesCalled: string[];
  rangesFor(table: string): Array<[number, number]>;
  ordersFor(table: string): Array<[string, { ascending: boolean } | undefined]>;
}

export interface PgOptions {
  latencyMs?: number;
  hook?: PgHook;
  /** The user of the session `auth.getSession()` reports (L1). Default U; `null` = no session. */
  sessionUserId?: string | null;
}

function compare(a: unknown, b: unknown): number {
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function pg(rows: Record<string, Row[]>, options: PgOptions = {}): Pg {
  const calls: PgCall[] = [];
  const perTable = new Map<string, number>();

  async function answer(call: PgCall): Promise<PageResult> {
    const nth = (perTable.get(call.table) ?? 0) + 1;
    perTable.set(call.table, nth);
    if (options.latencyMs) await new Promise((r) => setTimeout(r, options.latencyMs));
    const hooked = options.hook ? await options.hook(call, nth) : undefined;
    if (hooked) return hooked;
    let data = [...(rows[call.table] ?? [])];
    const lastOrder = call.orders.at(-1);
    if (lastOrder) {
      const [col, opts] = lastOrder;
      const dir = opts?.ascending === false ? -1 : 1;
      data.sort((a, b) => dir * compare(a[col], b[col]));
    }
    const lastRange = call.ranges.at(-1);
    if (lastRange) {
      const [a, b] = lastRange;
      data = data.slice(a, Math.min(b, a + MAX_ROWS - 1) + 1);
    } else {
      data = data.slice(0, MAX_ROWS);
    }
    return { data, error: null };
  }

  function builder(call: PgCall) {
    const self = {
      order(col: string, opts?: { ascending: boolean }) {
        call.orders.push([col, opts]);
        return self;
      },
      range(a: number, b: number) {
        call.ranges.push([a, b]);
        return self;
      },
      then<T1 = PageResult, T2 = never>(
        onFulfilled?: ((value: PageResult) => T1 | PromiseLike<T1>) | null,
        onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
      ): Promise<T1 | T2> {
        return answer(call).then(onFulfilled, onRejected);
      },
    };
    return self;
  }

  const client = {
    from(table: string) {
      return {
        select(columns?: string) {
          const call: PgCall = { table, columns, orders: [], ranges: [] };
          calls.push(call);
          return builder(call);
        },
      };
    },
    auth: {
      getSession: async () => {
        const id = options.sessionUserId === undefined ? U : options.sessionUserId;
        return {
          data: { session: id ? { access_token: `tok-${id}`, user: { id } } : null },
          error: null,
        };
      },
      signOut: async () => ({ error: null }),
    },
  } as unknown as AccountClient;

  return {
    client,
    calls,
    get tablesCalled() {
      return calls.map((c) => c.table);
    },
    rangesFor: (table) => calls.filter((c) => c.table === table).flatMap((c) => c.ranges),
    ordersFor: (table) => calls.filter((c) => c.table === table).flatMap((c) => c.orders),
  };
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

export function setRows(userId: string, count: number, tombstones = 0): Row[] {
  const rows: Row[] = [];
  // Every `every`-th row is a tombstone, so they spread across every page.
  const every = tombstones > 0 ? Math.floor(count / tombstones) : 0;
  for (let i = 0; i < count; i++) {
    rows.push({
      id: `s${pad(i, 4)}`,
      user_id: userId,
      client_id: `c${pad(i, 4)}`,
      session_id: `sess${pad(i % 400, 3)}`,
      exercise_id: "back-squat",
      set_index: i % 5,
      reps: 8,
      weight_kg: 60,
      duration_s: null,
      rir: 2,
      is_warmup: false,
      completed_at: "2025-01-01T10:00:00.000Z",
      edited_at: "2025-01-01T10:00:00.000Z",
      deleted_at: every > 0 && i % every === 0 ? "2025-01-02T10:00:00.000Z" : null,
    });
  }
  // Seeded out of order: the export's order comes from `.order("id")`, not from insertion.
  return rows.reverse();
}

export const AREAS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
];

/** AC1's data set for one user: 5,000 sets (40 tombstoned), 400 sessions, 1 profile, 9 targets,
 *  2 routines with 5 items, 3 check-ins and 2 exclusions (T-0535, seeded lateral-raise first).
 *  `setCount` overrides the 5,000. */
export function twoYears(userId: string, setCount = 5000): Record<string, Row[]> {
  return {
    profiles: [{ user_id: userId, goal: "balanced", experience: "intermediate" }],
    area_targets: AREAS.map((area_id) => ({ user_id: userId, area_id, target_sets: 10 })),
    sessions: Array.from({ length: 400 }, (_, i) => ({
      id: `sess${pad(i, 3)}`,
      user_id: userId,
      started_at: "2025-01-01T09:00:00.000Z",
      ended_at: "2025-01-01T10:00:00.000Z",
      time_budget_min: 45,
    })).reverse(),
    session_sets: setRows(userId, setCount, setCount === 5000 ? 40 : 0),
    routines: [
      { id: "r1", user_id: userId, name: "Push" },
      { id: "r2", user_id: userId, name: "Pull" },
    ],
    routine_items: Array.from({ length: 5 }, (_, i) => ({
      id: `ri${i}`,
      user_id: userId,
      routine_id: i < 3 ? "r1" : "r2",
      position: i,
      exercise_id: "back-squat",
    })),
    plan_checkins: Array.from({ length: 3 }, (_, i) => ({
      id: `pc${i}`,
      user_id: userId,
      created_at: "2025-06-01T10:00:00.000Z",
    })),
    excluded_exercises: [
      { user_id: userId, exercise_id: "lateral-raise", created_at: "2025-06-01T10:00:00.000Z" },
      { user_id: userId, exercise_id: "bench-press", created_at: "2025-06-02T10:00:00.000Z" },
    ],
  };
}

export const EXPORT_TABLE_NAMES = [
  "area_targets",
  "excluded_exercises",
  "plan_checkins",
  "profiles",
  "routine_items",
  "routines",
  "session_sets",
  "sessions",
];
