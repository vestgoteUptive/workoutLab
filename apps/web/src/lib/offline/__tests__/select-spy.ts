// A `supabase.from(table).select(cols)[.gte(col, value)][.maybeSingle()]` spy for the T-0319
// cache tests. Same idea as the inline mock in `history.test.ts`, extracted because five refresh
// suites need it, and extended with per-table failure injection (AC-6).
//
// It counts calls per table, which is how AC-2 ("the `exercises` table is selected once per
// refresh") and AC-5 ("no Supabase call is awaited") are asserted.
import { vi } from "vitest";

export interface SelectCall {
  table: string;
  columns: string;
  gte?: [string, string];
}

export interface SelectSpy {
  from: ReturnType<typeof vi.fn>;
  calls: SelectCall[];
  /** Sets the rows `select()` resolves for one table. */
  setRows: (table: string, rows: unknown[]) => void;
  /** Makes every select on this table reject with a PostgrestError-like object (AC-6). */
  fail: (table: string, error: { code: string; message: string }) => void;
  clearFailure: (table: string) => void;
  reset: () => void;
  countFor: (table: string) => number;
}

export function createSelectSpy(): SelectSpy {
  const calls: SelectCall[] = [];
  const rowsByTable = new Map<string, unknown[]>();
  const failures = new Map<string, { code: string; message: string }>();

  function makeQuery(table: string, columns: string) {
    const call: SelectCall = { table, columns };
    calls.push(call);
    const failure = failures.get(table);
    const rows = rowsByTable.get(table) ?? [];
    const result = failure ? { data: null, error: failure } : { data: rows, error: null };
    return {
      gte: (col: string, value: string) => {
        call.gte = [col, value];
        return Promise.resolve(result);
      },
      maybeSingle: () =>
        Promise.resolve(
          failure ? result : { data: (rows[0] as unknown) ?? null, error: null },
        ),
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
    reset: () => {
      calls.length = 0;
      rowsByTable.clear();
      failures.clear();
      from.mockClear();
    },
    countFor: (table) => calls.filter((c) => c.table === table).length,
  };
}
