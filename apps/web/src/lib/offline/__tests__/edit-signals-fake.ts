// T-1008: an in-memory fake of the account side of the edit ledger: the `edit_signals` table
// (unique key `user_id,device_id,key`, the stale-write rule of D-0281 §1) and the `profiles` row.
// It records every request so a test can check what was sent.
export interface FakeRow {
  id: string;
  user_id: string;
  device_id: string;
  key: string;
  kind: string;
  exercise_id: string;
  to_exercise_id: string | null;
  count: number;
  window_start: string;
  last_seen: string;
  asked_at: string | null;
}
export interface Req {
  table: string;
  op: "select" | "upsert" | "delete" | "update";
  body?: unknown;
  opts?: unknown;
}

export function createAccountFake() {
  const rows = new Map<string, FakeRow>();
  const profile: Record<string, unknown> = {
    goal: "build_muscle",
    level: "beginner",
    equipment: [],
    rhythm_min: 3,
    rhythm_max: 4,
    priority_areas: [],
    onboarded_at: "2026-09-01T00:00:00.000Z",
    plan_changed_at: "2026-09-01T00:00:00.000Z",
    learn_from_edits: true,
    learn_reset_at: null,
  };
  const log: Req[] = [];
  const state = {
    failUpsert: false,
    /** Apply the upsert, then answer with a network error (a lost response). */
    loseResponse: false,
    failDeleteSignals: false,
    failProfileUpdate: false,
    failProfileSelect: false,
    /** When set, an upsert waits for this promise before answering. */
    hold: null as Promise<void> | null,
    upsertError: null as { code: string; message: string } | null,
  };
  let nextId = 1;
  const ok = { error: null };
  const fail = { error: { code: "08006", message: "network" } };

  function applyUpsert(row: Omit<FakeRow, "id">): void {
    const k = `${row.user_id}|${row.device_id}|${row.key}`;
    const prev = rows.get(k);
    if (!prev) {
      rows.set(k, { id: `id-${nextId++}`, ...row });
      return;
    }
    // D-0281 §1 trigger: an update with an older `last_seen` is a no-op; an equal one applies.
    if (new Date(row.last_seen).getTime() < new Date(prev.last_seen).getTime()) return;
    rows.set(k, { id: prev.id, ...row });
  }

  function from(table: string) {
    if (table === "edit_signals") {
      return {
        upsert: async (body: Omit<FakeRow, "id">, opts?: unknown) => {
          log.push({ table, op: "upsert", body, opts });
          if (state.hold) await state.hold;
          if (state.failUpsert) return fail;
          if (state.upsertError) return { error: state.upsertError };
          applyUpsert(body);
          return state.loseResponse ? fail : ok;
        },
        select: (cols?: string) => ({
          eq: async (_c: string, userId: string) => {
            log.push({ table, op: "select", body: cols });
            return { data: [...rows.values()].filter((r) => r.user_id === userId), error: null };
          },
        }),
        delete: () => ({
          eq: (_c: string, userId: string) => {
            const run = (pred: (r: FakeRow) => boolean) => {
              log.push({ table, op: "delete" });
              if (state.failDeleteSignals) return Promise.resolve(fail);
              for (const [k, r] of [...rows]) if (r.user_id === userId && pred(r)) rows.delete(k);
              return Promise.resolve(ok);
            };
            return {
              in: (_c2: string, ids: string[]) => run((r) => ids.includes(r.id)),
              then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
                run(() => true).then(res, rej),
            };
          },
        }),
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({
          maybeSingle: async () => {
            log.push({ table, op: "select" });
            if (state.failProfileSelect) return { data: null, error: fail.error };
            return { data: { ...profile }, error: null };
          },
        }),
        update: (body: Record<string, unknown>) => ({
          eq: async () => {
            log.push({ table, op: "update", body });
            if (state.failProfileUpdate) return fail;
            Object.assign(profile, body);
            return ok;
          },
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  }
  return { from, rows, profile, log, state };
}
