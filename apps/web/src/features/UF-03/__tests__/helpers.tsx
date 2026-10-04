// T-0419 test helpers: a real (fake-indexeddb) `lib/offline` database seeded the way the queue
// and `refreshHistory`/`refreshLibrary`/`refreshTargets` write it, a signed-in user through the
// supabase-js `localStorage` key `currentUserId()` reads (the T-0304a way), and a router with the
// real `Summary` and a location probe. No `AuthProvider`: the summary never calls `useAuth()`.
import { render, type RenderResult } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  type NavigateFunction,
} from "react-router";
import type { AreaTarget, EngineProfile, LibraryExercise, PlanCheckin } from "@workoutlab/shared";
import {
  resetOfflineDbForTest,
  setKey,
  userScopedKey,
  type OfflineDb,
} from "../../../lib/offline/db.js";
import { Summary } from "../index.js";
import {
  ENDED_AT,
  L1,
  LOCALE,
  PLAN,
  S0_SETS,
  S1,
  S1_SETS,
  STARTED_AT,
  TZ,
  USER_A,
  defaultTargets,
  type SetSpec,
} from "./fixtures.js";

const STORAGE_KEY = "sb-abc-auth-token";
let dbCounter = 0;

export function freshDb(): OfflineDb {
  dbCounter += 1;
  return resetOfflineDbForTest(`wl-offline-uf03-${dbCounter}`);
}

export function signIn(userId: string = USER_A): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      access_token: "test-access-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId },
    }),
  );
}

export function signOut(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export interface SessionSeed {
  id?: string;
  userId?: string;
  endedAt?: string | null;
  plan?: unknown;
  budget?: number;
  /** T-0420: a stored `effort_rating`; absent leaves the key out of the row. */
  effortRating?: number | null;
}

export async function seedSession(db: OfflineDb, seed: SessionSeed = {}): Promise<void> {
  const id = seed.id ?? S1;
  const endedAt = seed.endedAt === undefined ? ENDED_AT : seed.endedAt;
  await db.sessions.put({
    id,
    userId: seed.userId ?? USER_A,
    row: {
      id,
      user_id: seed.userId ?? USER_A,
      started_at: STARTED_AT,
      ended_at: endedAt,
      time_budget_min: seed.budget ?? 45,
      energy: "normal",
      warmup_in_budget: true,
      plan: (seed.plan === undefined ? PLAN : seed.plan) as never,
      ...(seed.effortRating === undefined ? {} : { effort_rating: seed.effortRating }),
    },
    finished: endedAt !== null,
    pending: true,
  });
}

export async function seedQueued(db: OfflineDb, sets: readonly SetSpec[], userId = USER_A) {
  for (const s of sets) {
    await db.sets.put({
      key: setKey(userId, s.clientId),
      userId,
      clientId: s.clientId,
      sessionId: s.sessionId,
      exerciseId: s.exerciseId,
      setIndex: s.setIndex,
      kind: "reps",
      reps: s.reps,
      weightKg: s.weightKg,
      durationS: null,
      rir: null,
      isWarmup: s.isWarmup ?? false,
      backoff: false,
      completedAt: s.completedAt,
      editedAt: s.editedAt ?? s.completedAt,
      deletedAt: s.deletedAt ?? null,
      status: "queued",
    });
  }
}

export async function seedCached(db: OfflineDb, sets: readonly SetSpec[], userId = USER_A) {
  for (const s of sets) {
    await db.historyCache.put({
      key: userScopedKey(userId, s.clientId),
      userId,
      clientId: s.clientId,
      sessionId: s.sessionId,
      exerciseId: s.exerciseId,
      isWarmup: s.isWarmup ?? false,
      completedAt: s.completedAt,
      editedAt: s.editedAt ?? s.completedAt,
      deletedAt: s.deletedAt ?? null,
      reps: s.reps,
      weightKg: s.weightKg,
      durationS: null,
    });
  }
}

export async function seedLibraryAndTargets(
  db: OfflineDb,
  library: readonly LibraryExercise[] = L1,
  targets: readonly AreaTarget[] = defaultTargets(),
  userId = USER_A,
) {
  for (const exercise of library) {
    await db.libraryCache.put({ key: userScopedKey(userId, exercise.id), userId, exercise });
  }
  for (const target of targets) {
    await db.targetCache.put({ key: userScopedKey(userId, target.area), userId, target });
  }
}

/** T-0478: the F-profile shape (D-0037 §6), the way `refreshProfile` writes `profileCache`.
 *  `SwapSheet`'s own `loadProfile()` read needs this row before `rankSwaps`/`applySwap` run. */
export function engineProfile(over: Partial<EngineProfile> = {}): EngineProfile {
  return {
    goal: "build_muscle",
    level: "beginner",
    equipment: ["barbell", "rack", "bench", "dumbbell", "cable", "machine", "pullup-bar"],
    rhythmMin: 3,
    rhythmMax: 4,
    priorityAreas: [],
    onboardedAt: "2026-08-02T10:00:00Z",
    planUpdatedAt: "2026-08-02T10:00:00Z",
    ...over,
  };
}

export async function seedProfile(
  db: OfflineDb,
  profile: EngineProfile = engineProfile(),
  userId = USER_A,
): Promise<void> {
  await db.profileCache.put({ userId, profile });
}

/** T-0433: a cached server `sessions` row, as `refreshSessions` writes `sessionCache`. */
export interface CachedSessionSeed {
  id?: string;
  userId?: string;
  startedAt?: string;
  endedAt?: string | null;
  budget?: number;
  effortRating?: number | null;
  energy?: string;
}

export async function seedSessionCache(db: OfflineDb, seed: CachedSessionSeed = {}): Promise<void> {
  const id = seed.id ?? S1;
  const userId = seed.userId ?? USER_A;
  await db.sessionCache.put({
    key: userScopedKey(userId, id),
    userId,
    id,
    startedAt: seed.startedAt ?? STARTED_AT,
    endedAt: seed.endedAt === undefined ? ENDED_AT : seed.endedAt,
    timeBudgetMin: seed.budget ?? 45,
    effortRating: seed.effortRating === undefined ? null : seed.effortRating,
    energy: seed.energy ?? "normal",
  });
}

/** T-0433: set a queued entry's `pending` and D-0151 `cacheCurrent` flags. `cacheCurrent: false`
 *  leaves the key out, as an unmarked entry has it. The row and `finished` stay as stored. */
export async function setQueuedFlags(
  db: OfflineDb,
  flags: { pending: boolean; cacheCurrent: boolean },
  id: string = S1,
): Promise<void> {
  const entry = await db.sessions.get(id);
  if (!entry) throw new Error(`setQueuedFlags: no queued entry ${id}`);
  const { cacheCurrent: _old, ...rest } = entry;
  await db.sessions.put({
    ...rest,
    pending: flags.pending,
    ...(flags.cacheCurrent ? { cacheCurrent: true as const } : {}),
  });
}

/** A pending (unanswered) plan check-in proposal in the cache (AC-8). */
export async function seedPendingCheckin(db: OfflineDb, userId = USER_A) {
  const checkin: PlanCheckin = {
    id: "C1",
    periodIndex: 1,
    completedPrev: 2,
    completedLast: 5,
    rhythmMinBefore: 2,
    rhythmMaxBefore: 3,
    proposedMin: 3,
    proposedMax: 4,
    proposedAt: "2026-09-26T08:00:00.000Z",
    answer: null,
    answeredAt: null,
  };
  await db.checkinCache.put({ key: userScopedKey(userId, checkin.id), userId, checkin });
}

/** The ticket's full fixture: S1 ended (queue only), S0 cached, L1 and the default targets. */
export async function seedAll(db: OfflineDb, seed: SessionSeed = {}): Promise<void> {
  await seedSession(db, seed);
  await seedQueued(db, S1_SETS);
  await seedCached(db, S0_SETS);
  await seedLibraryAndTargets(db);
}

export const location: { pathname: string; navigate: NavigateFunction | null } = {
  pathname: "",
  navigate: null,
};

function LocationProbe() {
  location.pathname = useLocation().pathname;
  // T-0420 AC-3: a test steps back through the history to prove Save replaced its entry.
  location.navigate = useNavigate();
  return null;
}

export function renderSummary(
  sessionId: string = S1,
  props: { timeZone?: string; locale?: string } = { timeZone: TZ, locale: LOCALE },
  /** T-0420: entries below the summary in the history, oldest first. */
  before: readonly string[] = [],
): RenderResult {
  return render(
    <MemoryRouter initialEntries={[...before, `/session/${sessionId}/summary`]}>
      <LocationProbe />
      {/* A landmark for axe's "region" rule, as the OfflineStatus axe test does. */}
      <main>
        <Routes>
          <Route path="/session/:sessionId/summary" element={<Summary {...props} />} />
          <Route path="/session/:sessionId" element={<span data-testid="session" />} />
          <Route path="/" element={<span data-testid="home" />} />
          {/* T-0433 AC-4: "See balance" leads here. */}
          <Route path="/balance" element={<span data-testid="balance" />} />
        </Routes>
      </main>
    </MemoryRouter>,
  );
}

/** A real macrotask wait, for the ≥ 50 ms negative asserts. */
export function waitReal(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const part = (name: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-part="${name}"]`);

export const rowTexts = (): string[] =>
  Array.from(document.querySelectorAll('[data-part="row"]')).map((el) => el.textContent ?? "");

export const rowAreas = (): string[] =>
  Array.from(document.querySelectorAll('[data-part="row"]')).map(
    (el) => el.getAttribute("data-area") ?? "",
  );

/** Every number the ended summary shows, for AC-6/AC-7's "the same numbers" comparisons. */
export function snapshot() {
  return {
    time: part("time")?.textContent ?? null,
    budget: part("budget")?.textContent ?? null,
    exercises: part("exercises")?.textContent ?? null,
    sets: part("sets")?.textContent ?? null,
    rows: rowTexts(),
    nextUp: part("next-up")?.textContent ?? null,
  };
}
