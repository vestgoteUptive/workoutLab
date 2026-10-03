// T-0308b UF-11 test helpers: a real `lib/offline` cache seeder (so the "through the engine" ACs
// run the real `evaluateCheckin`/`previewTargets` over real IndexedDB via `fake-indexeddb`), a
// router shell for `/plan` and `/plan/edit`, and a `supabase.from()` spy that records method,
// payload, options and filters in call order.
import { render, type RenderResult } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { vi } from "vitest";
import type { AreaTarget, EngineProfile, LibraryExercise, PlanCheckin } from "@workoutlab/shared";
import {
  resetOfflineDbForTest,
  type CachedRoutineItem,
  type OfflineDb,
} from "../../../lib/offline/db.js";
import { EditPlan, Plan } from "../index.js";
import { NOW } from "./fixtures.js";

export const TEST_USER = "11111111-1111-4111-8111-111111111111";
const STORAGE_KEY = "sb-abc-auth-token";

let dbCounter = 0;

/** A fresh Dexie database per test, so no test sees another's rows. */
export function freshDb(): OfflineDb {
  dbCounter += 1;
  return resetOfflineDbForTest(`wl-offline-uf11-${dbCounter}`);
}

/** Writes the fake supabase-js session `currentUserId()` reads, so the loaders see a user. */
export function signIn(userId: string = TEST_USER): string {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      access_token: "test-access-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId },
    }),
  );
  return userId;
}

export function signOut(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export interface SeedRoutine {
  id: string;
  name: string;
  items: CachedRoutineItem[];
  updatedAt?: string;
}

export interface SeedSet {
  id: string;
  sessionId: string;
  exerciseId: string;
  completedAt: string;
  isWarmup?: boolean;
}

export interface SeedSession {
  id: string;
  startedAt: string;
}

export interface SeedOptions {
  profile?: EngineProfile | null;
  /** Written in the given order, so AC-B1's reverse-order contrast is expressible. */
  targets?: readonly AreaTarget[];
  /** Written in the given order, so AC-B4's K2/K4/K1/K3 insertion order is expressible. */
  checkins?: readonly PlanCheckin[];
  routines?: readonly SeedRoutine[];
  sessions?: readonly SeedSession[];
  sets?: readonly SeedSet[];
  library?: readonly LibraryExercise[];
  lastSyncedAt?: string | null;
  userId?: string;
}

/** Seeds the real caches with the same rows `refreshAll` would write, so the screens' own
 *  loaders read them with no mock anywhere. */
export async function seedCache(db: OfflineDb, options: SeedOptions = {}): Promise<void> {
  const userId = options.userId ?? TEST_USER;

  if (options.profile) {
    await db.profileCache.put({ userId, profile: options.profile });
  }
  for (const target of options.targets ?? []) {
    await db.targetCache.put({ key: `${userId}:${target.area}`, userId, target });
  }
  for (const c of options.checkins ?? []) {
    await db.checkinCache.put({ key: `${userId}:${c.id}`, userId, checkin: c });
  }
  for (const r of options.routines ?? []) {
    await db.routineCache.put({
      key: `${userId}:${r.id}`,
      userId,
      id: r.id,
      name: r.name,
      updatedAt: r.updatedAt ?? "2026-09-01T08:00:00Z",
      items: r.items,
    });
  }
  for (const s of options.sessions ?? []) {
    await db.sessionCache.put({
      key: `${userId}:${s.id}`,
      userId,
      id: s.id,
      startedAt: s.startedAt,
      endedAt: null,
      timeBudgetMin: 45,
      effortRating: null,
      energy: "normal",
    });
  }
  for (const s of options.sets ?? []) {
    await db.historyCache.put({
      key: `${userId}:${s.id}`,
      userId,
      clientId: s.id,
      sessionId: s.sessionId,
      exerciseId: s.exerciseId,
      isWarmup: s.isWarmup ?? false,
      completedAt: s.completedAt,
      editedAt: s.completedAt,
      deletedAt: null,
      reps: 8,
      weightKg: 60,
      durationS: null,
    });
  }
  for (const exercise of options.library ?? []) {
    await db.libraryCache.put({ key: `${userId}:${exercise.id}`, userId, exercise });
  }
  if (options.lastSyncedAt !== undefined) {
    await db.syncMeta.put({ userId, lastSyncedAt: options.lastSyncedAt, persistRequested: false });
  }
}

/**
 * Makes `Intl.DateTimeFormat().resolvedOptions().timeZone` report `tz`, which is how
 * `resolveTimeZone()` finds the zone. Only `resolvedOptions` is patched, and only when the
 * formatter was built with no explicit `timeZone`: replacing the constructor itself breaks every
 * `new Intl.DateTimeFormat(...)` in `lib/format/intl.ts` and in Dexie's internals.
 *
 * Returns a restore function; `vi.restoreAllMocks()` also undoes it.
 */
export function useTimeZone(tz: string): () => void {
  const proto = Intl.DateTimeFormat.prototype as unknown as {
    resolvedOptions: () => Intl.ResolvedDateTimeFormatOptions;
  };
  // `TRUE_RESOLVED_OPTIONS` and `AMBIENT_TZ` are captured once at module load, before any spy
  // exists. Reading `proto.resolvedOptions` here instead would chain one spy onto the last and
  // blow the stack the second time a test calls this.
  const spy = vi.spyOn(proto, "resolvedOptions").mockImplementation(function (
    this: Intl.DateTimeFormat,
  ) {
    const resolved = TRUE_RESOLVED_OPTIONS.call(this);
    // A formatter asked for a specific zone keeps it; only the ambient default is overridden.
    return resolved.timeZone === AMBIENT_TZ ? { ...resolved, timeZone: tz } : resolved;
  });
  return () => spy.mockRestore();
}

const TRUE_RESOLVED_OPTIONS = Intl.DateTimeFormat.prototype.resolvedOptions;
const AMBIENT_TZ = TRUE_RESOLVED_OPTIONS.call(new Intl.DateTimeFormat()).timeZone;

// ---- the router shell ----

/** Reports the current location. The path goes in an attribute, never in children:
 *  `react/jsx-no-literals` covers every non-`*.test.tsx` file under `src/`, this one included. */
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location" aria-hidden="true" title={location.pathname} />;
}

export interface RenderPlanOptions {
  at?: "/plan" | "/plan/edit";
  /** Defaults to fixture F's instant. Pass `undefined` explicitly to exercise the real clock. */
  now?: () => Date;
}

export function PlanTree({ at = "/plan", now = () => NOW }: RenderPlanOptions = {}) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <LocationProbe />
      <Routes>
        <Route path="/plan" element={<Plan now={now} />} />
        <Route path="/plan/edit" element={<EditPlan now={now} />} />
        <Route path="*" element={<span data-testid="elsewhere" />} />
      </Routes>
    </MemoryRouter>
  );
}

export function renderPlan(options: RenderPlanOptions = {}): RenderResult {
  return render(<PlanTree {...options} />);
}

export function location(): string {
  return document.querySelector('[data-testid="location"]')!.getAttribute("title")!;
}

// ---- DOM readers ----

/** The text of every `<li>` in the list labelled `label`, in DOM order. */
export function listRows(label: string): string[] {
  const list = document.querySelector(`ul[aria-label="${label}"]`);
  if (!list) return [];
  return Array.from(list.querySelectorAll("li")).map((li) => li.textContent ?? "");
}

// ---- the supabase spy ----

export interface SpyCall {
  table: string;
  method: "upsert" | "update" | "insert" | "delete" | "select";
  payload: unknown;
  options: unknown;
  filters: { op: "eq" | "is"; column: string; value: unknown }[];
}

export interface StepResult {
  /** `reject` throws; `error` resolves `{data: null, error}` the way supabase-js does on a 4xx. */
  mode: "ok" | "reject" | "error";
}

/** The subset of a PostgrestQueryBuilder the UF-11 writes use. */
export interface FromBuilder {
  upsert: (payload: unknown, options?: unknown) => unknown;
  update: (payload: unknown, options?: unknown) => unknown;
  insert: (payload: unknown, options?: unknown) => unknown;
  delete: (options?: unknown) => unknown;
  select: (payload?: unknown) => unknown;
}

export interface SupabaseFromSpy {
  from: ReturnType<typeof vi.fn<(table: string) => FromBuilder>>;
  calls: SpyCall[];
  /** Fail the next call on `table` with `mode`; every other call succeeds. */
  failOn: (table: string, mode: "reject" | "error") => void;
  reset: () => void;
}

/** Records `from(table).<method>(payload, options).eq(...).is(...)` in call order. Awaiting the
 *  builder is what resolves it, so `.eq`/`.is` chain before the await, exactly as in the product
 *  code. A step "fails" either by rejecting or by resolving with a non-null `error` — supabase-js
 *  does the latter on a 4xx/5xx and never throws (AC-B12 runs both forms). */
export function createFromSpy(): SupabaseFromSpy {
  const calls: SpyCall[] = [];
  const failures = new Map<string, "reject" | "error">();

  function builder(table: string, method: SpyCall["method"], payload: unknown, options: unknown) {
    const call: SpyCall = { table, method, payload, options, filters: [] };
    calls.push(call);
    const settle = () => {
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

  const from = vi.fn((table: string): FromBuilder => ({
    upsert: (payload: unknown, options?: unknown) => builder(table, "upsert", payload, options),
    update: (payload: unknown, options?: unknown) => builder(table, "update", payload, options),
    insert: (payload: unknown, options?: unknown) => builder(table, "insert", payload, options),
    delete: (options?: unknown) => builder(table, "delete", undefined, options),
    select: (payload?: unknown) => builder(table, "select", payload, undefined),
  }));

  return {
    from,
    calls,
    failOn: (table, mode) => failures.set(table, mode),
    reset: () => {
      calls.length = 0;
      failures.clear();
      from.mockClear();
    },
  };
}
