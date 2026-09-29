// The Supabase spy and `lib/offline` wrappers for UF-07.1 tests. Kept free of product imports so
// a `vi.mock` factory can load it without a cycle.
import { vi } from "vitest";

export interface SpyCall {
  table: string;
  method: string;
  payload?: unknown;
  options?: unknown;
  filters: Array<[string, string, unknown]>;
}

export type FailMode = "ok" | "reject" | "error";

export const spy = {
  calls: [] as SpyCall[],
  plan: new Map<string, FailMode[]>(),
  tables: [] as string[],
  reset() {
    spy.calls.length = 0;
    spy.plan.clear();
    spy.tables.length = 0;
  },
  /** Fail the next calls of `table.method`, in the given form. `[]` entries mean "ok". */
  fail(key: string, ...modes: FailMode[]) {
    spy.plan.set(key, modes);
  },
  settle(call: SpyCall): Promise<unknown> {
    const queue = spy.plan.get(`${call.table}.${call.method}`);
    const mode = queue?.shift();
    if (mode === "reject") return Promise.reject(new Error("network down"));
    if (mode === "error") {
      return Promise.resolve({
        data: null,
        error: { code: "42501", message: "denied" },
        status: 403,
      });
    }
    return Promise.resolve({ data: null, error: null, status: 200 });
  },
  from: vi.fn((table: string) => {
    spy.tables.push(table);
    const record = (method: string, payload?: unknown, options?: unknown): SpyCall => {
      const call: SpyCall = { table, method, payload, options, filters: [] };
      spy.calls.push(call);
      return call;
    };
    const chain = (call: SpyCall) => {
      const builder = {
        eq(col: string, value: unknown) {
          call.filters.push(["eq", col, value]);
          return builder;
        },
        gte(col: string, value: unknown) {
          call.filters.push(["gte", col, value]);
          return builder;
        },
        then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
          return spy.settle(call).then(resolve, reject);
        },
      };
      return builder;
    };
    return {
      upsert: (payload: unknown, options?: unknown) => chain(record("upsert", payload, options)),
      delete: () => chain(record("delete")),
      insert: (payload: unknown) => chain(record("insert", payload)),
      update: (payload: unknown) => chain(record("update", payload)),
      select: () => chain(record("select")),
    };
  }),
};

/** `lib/offline` wrappers: `refreshRoutines` is a stub, and the loaders can be held or counted. */
export const offline = {
  refreshRoutines: vi.fn(async () => {}),
  loadRoutinesCalls: 0,
  loadLibraryCalls: 0,
  gate: null as Promise<void> | null,
  reset() {
    offline.refreshRoutines = vi.fn(async () => {});
    offline.loadRoutinesCalls = 0;
    offline.loadLibraryCalls = 0;
    offline.gate = null;
  },
};

export function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
}

/** The `vi.mock` bodies, shared so each test file states them in one line. */
export async function mockedClient() {
  return { supabase: { from: spy.from } };
}

export async function mockedOffline(
  importActual: () => Promise<typeof import("../../../lib/offline/index.js")>,
) {
  const actual = await importActual();
  return {
    ...actual,
    refreshRoutines: (...args: []) => offline.refreshRoutines(...args),
    loadRoutines: async () => {
      offline.loadRoutinesCalls += 1;
      await offline.gate;
      return actual.loadRoutines();
    },
    loadLibrary: async () => {
      offline.loadLibraryCalls += 1;
      await offline.gate;
      return actual.loadLibrary();
    },
  };
}
