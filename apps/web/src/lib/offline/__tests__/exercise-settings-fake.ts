// T-0954: a fake `exercise_settings` server for the weight-step store tests. Mock
// `../../auth/client.js` with `fakeSupabase(server)`. The server stamps `updated_at` itself, like
// the table's trigger, from `server.clock()` (the real clock).
export interface ServerRow {
  exercise_id: string;
  increment_kg: number;
  updated_at: string;
}

export interface FakeServer {
  rows: Map<string, ServerRow>;
  /** Every write that reached the server, in order. */
  log: Array<{ op: "upsert" | "delete"; exerciseId: string; incrementKg?: number }>;
  clock: () => string;
  /** When set, the next write answers this error. */
  failWith: { code: string; message: string } | null;
  /** When true, every call throws like a dropped connection. */
  offline: boolean;
}

export function newServer(): FakeServer {
  return {
    rows: new Map(),
    log: [],
    clock: () => new Date().toISOString(),
    failWith: null,
    offline: false,
  };
}

export function fakeSupabase(server: FakeServer) {
  const guard = () => {
    if (server.offline) throw new TypeError("Failed to fetch");
  };
  return {
    from: (table: string) => {
      if (table !== "exercise_settings") {
        return {
          select: () => ({
            gte: async () => ({ data: [], error: null }),
            maybeSingle: async () => ({ data: null, error: null }),
            then: (a: (v: unknown) => unknown) =>
              Promise.resolve({ data: [], error: null }).then(a),
          }),
        };
      }
      return {
        select: () => {
          const all = async () => {
            guard();
            return { data: [...server.rows.values()], error: null };
          };
          return {
            eq: (_col: string, id: string) => ({
              maybeSingle: async () => {
                guard();
                return { data: server.rows.get(id) ?? null, error: null, status: 200 };
              },
            }),
            then: (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => all().then(a, b),
          };
        },
        upsert: (row: { exercise_id: string; increment_kg: number }) => ({
          select: async () => {
            guard();
            if (server.failWith) {
              const error = server.failWith;
              server.failWith = null;
              return { data: null, error, status: 400 };
            }
            const next = { ...row, updated_at: server.clock() };
            server.rows.set(row.exercise_id, next);
            server.log.push({
              op: "upsert",
              exerciseId: row.exercise_id,
              incrementKg: row.increment_kg,
            });
            return { data: [next], error: null, status: 200 };
          },
        }),
        delete: () => ({
          eq: async (_col: string, id: string) => {
            guard();
            if (server.failWith) {
              const error = server.failWith;
              server.failWith = null;
              return { error, status: 400 };
            }
            server.rows.delete(id);
            server.log.push({ op: "delete", exerciseId: id });
            return { error: null, status: 200 };
          },
        }),
      };
    },
  };
}
