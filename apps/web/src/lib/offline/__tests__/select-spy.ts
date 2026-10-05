// A `supabase.from(table).select(cols)[.gte(col, value)][.maybeSingle()]` spy for the T-0319
// cache tests. Same idea as the inline mock in `history.test.ts`, extracted because five refresh
// suites need it, and extended with per-table failure injection (AC-6).
//
// It counts calls per table, which is how AC-2 ("the `exercises` table is selected once per
// refresh") and AC-5 ("no Supabase call is awaited") are asserted.
import { vi, type Mock } from "vitest";

export interface SelectCall {
  table: string;
  columns: string;
  gte?: [string, string];
}

/** What `select(columns)` returns: awaitable, or chained through `gte` / `maybeSingle`. */
export interface SelectQuery {
  gte: (col: string, value: string) => Promise<{ data: unknown; error: unknown }>;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: (resolve: (v: { data: unknown; error: unknown }) => void) => void;
}

/** What `from(table)` returns. */
export interface SelectFrom {
  select: (columns: string) => SelectQuery;
}

export interface SelectSpy {
  from: Mock<(table: string) => SelectFrom>;
  calls: SelectCall[];
  /** Sets the rows `select()` resolves for one table. */
  setRows: (table: string, rows: unknown[]) => void;
  /** Makes every select on this table reject with a PostgrestError-like object (AC-6). */
  fail: (table: string, error: { code: string; message: string }) => void;
  clearFailure: (table: string) => void;
  /** Holds every select on this table issued from now on, until `release(table)` or the
   *  returned function opens it (T-0431 AC-4). Each call starts a new gate, so two selects held
   *  by two calls can be released in either order (the T-0431 rework: concurrent refreshes). */
  hold: (table: string) => () => void;
  /** Resolves every held select on this table, and stops holding it. */
  release: (table: string) => void;
  reset: () => void;
  countFor: (table: string) => number;
}

export function createSelectSpy(): SelectSpy {
  const calls: SelectCall[] = [];
  const rowsByTable = new Map<string, unknown[]>();
  const failures = new Map<string, { code: string; message: string }>();
  /** The gate new selects on a table wait for, and every opener issued for that table. */
  const holds = new Map<string, Promise<void>>();
  const openers = new Map<string, Array<() => void>>();

  function makeQuery(table: string, columns: string): SelectQuery {
    const call: SelectCall = { table, columns };
    calls.push(call);
    const failure = failures.get(table);
    const rows = rowsByTable.get(table) ?? [];
    const result = failure ? { data: null, error: failure } : { data: rows, error: null };
    const gate = holds.get(table) ?? Promise.resolve();
    return {
      gte: (col: string, value: string) => {
        call.gte = [col, value];
        return gate.then(() => result);
      },
      maybeSingle: () =>
        Promise.resolve(failure ? result : { data: (rows[0] as unknown) ?? null, error: null }),
      then: (resolve: (v: typeof result) => void) => resolve(result),
    };
  }

  const from = vi.fn((table: string) => ({
    select: (columns: string) => makeQuery(table, columns),
  }));

  return {
    from,
    calls,
    setRows: (table, rows) => rowsByTable.set(table, rows),
    fail: (table, error) => failures.set(table, error),
    clearFailure: (table) => failures.delete(table),
    hold: (table) => {
      let open!: () => void;
      const gate = new Promise<void>((resolve) => (open = resolve));
      holds.set(table, gate);
      openers.set(table, [...(openers.get(table) ?? []), open]);
      return () => {
        open();
        if (holds.get(table) === gate) holds.delete(table);
      };
    },
    release: (table) => {
      for (const open of openers.get(table) ?? []) open();
      openers.delete(table);
      holds.delete(table);
    },
    reset: () => {
      calls.length = 0;
      rowsByTable.clear();
      failures.clear();
      for (const list of openers.values()) for (const open of list) open();
      openers.clear();
      holds.clear();
      from.mockClear();
    },
    countFor: (table) => calls.filter((c) => c.table === table).length,
  };
}
