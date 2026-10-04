// T-0470 UF-11.1 CheckinCard writes: helpers of this ticket's own (D-0172 §8), so T-0216 and
// T-0469 run in parallel without touching this file. Imports only from `test-helpers.tsx` and
// `fixtures.ts` — neither is edited here.
import { vi } from "vitest";
import type { LibraryExercise } from "@workoutlab/shared";
import { freshDb, seedCache, type SeedOptions, type SpyCall } from "./test-helpers.js";
import { profileF } from "./fixtures.js";

export const BENCH: LibraryExercise = {
  id: "bench",
  name: "Bench press",
  kind: "exercise",
  areas: [{ area: "chest", weight: 1 }],
  equipment: [],
  setupS: 60,
  perSetS: 45,
  defaultRestS: 90,
  level: "beginner",
  isUnilateral: false,
} as never;

/** `n` sessions, one hard set each, spread across the 14-day period starting at `startYmd` (a
 *  few same-day sessions once `n` exceeds 14, mirroring `checkin-card.test.tsx`'s own helper so
 *  both files feed the real engine the same shape of history). */
export function sessionsFrom(prefix: string, startYmd: string, n: number) {
  const sessions: { id: string; startedAt: string }[] = [];
  const sets: { id: string; sessionId: string; exerciseId: string; completedAt: string }[] = [];
  const start = new Date(`${startYmd}T08:00:00Z`);
  for (let i = 0; i < n; i++) {
    const dayOffset = i % 14;
    const hour = 8 + Math.floor(i / 14);
    const at = new Date(
      start.getTime() + dayOffset * 86_400_000 + (hour - 8) * 3_600_000,
    ).toISOString();
    const id = `${prefix}${i}`;
    sessions.push({ id, startedAt: at });
    sets.push({ id: `${id}-set`, sessionId: id, exerciseId: "bench", completedAt: at });
  }
  return { sessions, sets };
}

export interface SeedPeriodsOptions {
  rhythmMin?: number;
  rhythmMax?: number;
  p2?: number;
  p3?: number;
  checkins?: SeedOptions["checkins"];
}

/** Seeds fixture F's profile (with the given rhythm) and P2/P3 session counts through the real
 *  engine feed (library + sessions + sets), so the AC-1 insert under test runs over the real
 *  `evaluateCheckin`, never a stub. */
export async function seedPeriods({
  rhythmMin = 3,
  rhythmMax = 4,
  p2 = 0,
  p3 = 0,
  checkins,
}: SeedPeriodsOptions) {
  const db = freshDb();
  const p2Sessions = sessionsFrom("p2-", "2026-08-30", p2);
  const p3Sessions = sessionsFrom("p3-", "2026-09-13", p3);
  await seedCache(db, {
    profile: profileF({ rhythmMin, rhythmMax }),
    library: [BENCH],
    sessions: [...p2Sessions.sessions, ...p3Sessions.sessions],
    sets: [...p2Sessions.sets, ...p3Sessions.sets],
    // `exactOptionalPropertyTypes` rejects `checkins: undefined`: the key is omitted entirely
    // when the caller passed none.
    ...(checkins ? { checkins } : {}),
  });
  return db;
}

// ---- the writes spy ----
//
// `test-helpers.tsx`'s `createFromSpy` has no way to make an insert resolve a `23505` or a
// select resolve a chosen row, which AC-1b needs. This spy is this ticket's own, in the same
// `{table, method, payload, options, filters}` shape (`SpyCall`), so assertions read the same
// way; it adds two one-shot controls on top of `createFromSpy`'s plain ok/reject/error.

export interface WritesSpy {
  from: (table: string) => {
    upsert: (payload: unknown, options?: unknown) => unknown;
    update: (payload: unknown, options?: unknown) => unknown;
    insert: (payload: unknown, options?: unknown) => unknown;
    delete: (options?: unknown) => unknown;
    select: (payload?: unknown) => unknown;
  };
  calls: SpyCall[];
  /** The next write to `table` fails, by rejecting or resolving `{error}` (`save-plan.ts`'s two
   *  failure forms). */
  failOn: (table: string, mode: "reject" | "error") => void;
  /** The next `insert` on `table` resolves `{error: {code: "23505"}}` instead of succeeding. */
  collideOn: (table: string) => void;
  /** The next `select` on `table` resolves one row with this `answer` (`null` for unanswered). */
  answerRowOn: (table: string, answer: "accepted" | "kept" | "withdrawn" | null) => void;
  /** The next write to `table` waits for the returned releaser before it settles ok — the AC-5
   *  double tap needs a write that is still "in flight" when the second tap fires. */
  gateOn: (table: string) => () => void;
  reset: () => void;
}

export function createWritesSpy(): WritesSpy {
  const calls: SpyCall[] = [];
  const failures = new Map<string, "reject" | "error">();
  const collisions = new Set<string>();
  const answerRows = new Map<string, "accepted" | "kept" | "withdrawn" | null>();
  const gates = new Map<string, Promise<void>>();

  function chainFor(table: string, method: SpyCall["method"], payload: unknown, options: unknown) {
    const call: SpyCall = { table, method, payload, options, filters: [] };
    calls.push(call);
    const settle = async () => {
      const gate = gates.get(table);
      if (gate) {
        gates.delete(table);
        await gate;
      }
      if (method === "insert" && collisions.has(table)) {
        collisions.delete(table);
        return Promise.resolve({
          data: null,
          error: { code: "23505", message: `spy: ${table} duplicate key` },
          status: 409,
        });
      }
      if (method === "select" && answerRows.has(table)) {
        const answer = answerRows.get(table) ?? null;
        answerRows.delete(table);
        return Promise.resolve({ data: [{ answer }], error: null, status: 200 });
      }
      const mode = failures.get(table);
      if (mode === "reject") {
        failures.delete(table);
        return Promise.reject(new Error(`spy: ${table}.${method} rejected`));
      }
      if (mode === "error") {
        failures.delete(table);
        return Promise.resolve({
          data: null,
          error: { code: "42501", message: `spy: ${table}.${method} refused` },
          status: 403,
        });
      }
      return Promise.resolve({ data: payload, error: null, status: 200 });
    };
    const chain = {
      eq(column: string, value: unknown) {
        call.filters.push({ op: "eq", column, value });
        return chain;
      },
      is(column: string, value: unknown) {
        call.filters.push({ op: "is", column, value });
        return chain;
      },
      then<A, B>(
        onOk?: ((v: unknown) => A | PromiseLike<A>) | null,
        onErr?: ((e: unknown) => B | PromiseLike<B>) | null,
      ) {
        return settle().then(onOk, onErr);
      },
      catch<B>(onErr?: ((e: unknown) => B | PromiseLike<B>) | null) {
        return settle().catch(onErr);
      },
    };
    return chain;
  }

  const from = vi.fn((table: string) => ({
    upsert: (payload: unknown, options?: unknown) => chainFor(table, "upsert", payload, options),
    update: (payload: unknown, options?: unknown) => chainFor(table, "update", payload, options),
    insert: (payload: unknown, options?: unknown) => chainFor(table, "insert", payload, options),
    delete: (options?: unknown) => chainFor(table, "delete", undefined, options),
    select: (payload?: unknown) => chainFor(table, "select", payload, undefined),
  }));

  return {
    from,
    calls,
    failOn: (table, mode) => failures.set(table, mode),
    collideOn: (table) => collisions.add(table),
    answerRowOn: (table, answer) => answerRows.set(table, answer),
    gateOn: (table) => {
      let release: () => void = () => {};
      gates.set(
        table,
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      );
      return release;
    },
    reset: () => {
      calls.length = 0;
      failures.clear();
      collisions.clear();
      answerRows.clear();
      gates.clear();
      from.mockClear();
    },
  };
}
