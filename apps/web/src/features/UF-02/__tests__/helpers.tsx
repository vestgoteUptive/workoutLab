// T-0302a UF-02.1 test helpers: a router around `Today` with a location probe, DOM readers for
// the C-01 tiles and the lines above Start, and a real `lib/offline` seeder for the "real" ACs.
import { render, type RenderResult } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { AreaTarget, EngineProfile, LibraryExercise } from "@workoutlab/shared";
import { resetOfflineDbForTest, userScopedKey, type OfflineDb } from "../../../lib/offline/db.js";
import { Today, type TodayProps } from "../Today.js";
import type { HistorySet } from "@workoutlab/shared";

export const TEST_USER = "22222222-2222-4222-8222-222222222222";
const STORAGE_KEY = "sb-abc-auth-token";

let dbCounter = 0;
export function freshDb(): OfflineDb {
  dbCounter += 1;
  return resetOfflineDbForTest(`wl-offline-uf02-${dbCounter}`);
}

export function signIn(userId: string = TEST_USER): void {
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

/** Writes cached server rows exactly as `refreshHistory`/`refreshLibrary`/… store them. */
export async function seedCache(
  db: OfflineDb,
  options: {
    history?: readonly HistorySet[];
    library?: readonly LibraryExercise[];
    targets?: readonly AreaTarget[];
    profile?: EngineProfile;
  },
): Promise<void> {
  const userId = TEST_USER;
  for (const s of options.history ?? []) {
    await db.historyCache.put({
      key: userScopedKey(userId, s.clientId),
      userId,
      clientId: s.clientId,
      sessionId: s.sessionId,
      exerciseId: s.exerciseId,
      isWarmup: s.isWarmup,
      completedAt: s.completedAt,
      editedAt: s.editedAt,
      deletedAt: s.deletedAt,
      reps: s.reps,
      weightKg: s.weightKg,
      durationS: s.durationS,
    });
  }
  for (const exercise of options.library ?? []) {
    await db.libraryCache.put({ key: userScopedKey(userId, exercise.id), userId, exercise });
  }
  for (const target of options.targets ?? []) {
    await db.targetCache.put({ key: userScopedKey(userId, target.area), userId, target });
  }
  if (options.profile) await db.profileCache.put({ userId, profile: options.profile });
}

/** The path goes in an attribute: `react/jsx-no-literals` covers this helper too. */
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location" aria-hidden="true" title={location.pathname} />;
}

export function TodayTree(props: TodayProps) {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <LocationProbe />
      <Routes>
        <Route path="/" element={<Today {...props} />} />
        <Route path="*" element={<span data-testid="elsewhere" />} />
      </Routes>
    </MemoryRouter>
  );
}

export function renderToday(props: TodayProps = {}): RenderResult {
  return render(<TodayTree {...props} />);
}

export function location(): string {
  return document.querySelector('[data-testid="location"]')!.getAttribute("title")!;
}

export function screenRoot(): HTMLElement {
  return document.querySelector('[data-screen-id="UF-02.1"]')!;
}

/** The "load / target" text of one compact C-01 tile, or null. */
export function tile(area: string): string | null {
  return (
    document.querySelector(`[data-component="C-01"] [data-area="${area}"] [data-part="value"]`)
      ?.textContent ?? null
  );
}

export function tileCount(): number {
  return document.querySelectorAll('[data-component="C-01"] [data-part="value"]').length;
}

export function part(name: string): HTMLElement | null {
  return document.querySelector(`[data-part="${name}"]`);
}

/** The element straight before Start, in DOM order. */
export function aboveStart(): Element | null {
  return part("start")?.previousElementSibling ?? null;
}

/** A real 50 ms macrotask, for negative timing asserts. */
export const macrotask = (): Promise<void> => new Promise((r) => setTimeout(r, 50));
