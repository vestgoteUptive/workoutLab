// T-0307a UF-10 test helpers: a router shell for the two screens, and a real `lib/offline`
// cache seeder so the "through the engine" ACs run the real `balance()` over real IndexedDB
// (`fake-indexeddb`, polyfilled globally in vitest.setup.ts) with no stub anywhere.
import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router";
import type { Area, AreaTarget, LibraryExercise } from "@workoutlab/shared";
import { resetOfflineDbForTest, type OfflineDb } from "../../../lib/offline/db.js";
import { Balance, BalanceDetail, type BalanceScreenProps } from "../index.js";
import { AREA_ORDER, type SetSpec } from "./fixtures.js";

const TEST_USER = "11111111-1111-4111-8111-111111111111";
const STORAGE_KEY = "sb-abc-auth-token";

let dbCounter = 0;

/** A fresh Dexie database per test, so no test sees another's rows. */
export function freshDb(): OfflineDb {
  dbCounter += 1;
  return resetOfflineDbForTest(`wl-offline-uf10-${dbCounter}`);
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

export interface SeedOptions {
  sets?: readonly SetSpec[];
  /** Written to `sets` (the QUEUED table) instead of `historyCache` (AC-A8). */
  queuedSets?: readonly SetSpec[];
  library?: readonly LibraryExercise[];
  targets?: readonly AreaTarget[];
  lastSyncedAt?: string | null;
  userId?: string;
}

/**
 * Seeds the real `lib/offline` caches. This writes the same rows `refreshHistory`/
 * `refreshLibrary`/`refreshTargets` would, so the screens' own loaders (`loadEngineHistory`,
 * `loadLibrary`, `loadTargets`) read them without a single mock.
 */
export async function seedCache(db: OfflineDb, options: SeedOptions = {}): Promise<void> {
  const userId = options.userId ?? TEST_USER;

  for (const spec of options.sets ?? []) {
    await db.historyCache.put({
      key: `${userId}:${spec.id}`,
      userId,
      clientId: spec.id,
      sessionId: "S1",
      exerciseId: spec.exerciseId,
      isWarmup: spec.isWarmup ?? false,
      completedAt: new Date(spec.completedAt).toISOString(),
      editedAt: new Date(spec.completedAt).toISOString(),
      deletedAt: null,
      reps: 8,
      weightKg: 60,
      durationS: null,
    });
  }

  for (const spec of options.queuedSets ?? []) {
    await db.sets.put({
      key: `${userId}:${spec.id}`,
      userId,
      clientId: spec.id,
      sessionId: "S2",
      exerciseId: spec.exerciseId,
      setIndex: 0,
      kind: "reps",
      reps: 8,
      weightKg: 60,
      durationS: null,
      rir: null,
      isWarmup: spec.isWarmup ?? false,
      backoff: false,
      completedAt: new Date(spec.completedAt).toISOString(),
      editedAt: new Date(spec.completedAt).toISOString(),
      deletedAt: null,
      status: "queued",
    });
  }

  for (const exercise of options.library ?? []) {
    await db.libraryCache.put({ key: `${userId}:${exercise.id}`, userId, exercise });
  }

  for (const target of options.targets ?? []) {
    await db.targetCache.put({ key: `${userId}:${target.area}`, userId, target });
  }

  if (options.lastSyncedAt !== undefined) {
    await db.syncMeta.put({ userId, lastSyncedAt: options.lastSyncedAt, persistRequested: false });
  }
}

/** Reports the current location, so a navigation assertion doesn't need a real browser.
 *  The path goes in an attribute, not in children: `react/jsx-no-literals` covers every
 *  non-`*.test.tsx` file under `src/`, this helper included. */
function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="location" aria-hidden="true" title={location.pathname + location.search} />
  );
}

/** Mirrors the shell's own `isArea` guard on `/balance/:area` (`app/App.tsx`), so AC-A19 tests
 *  the shipped behaviour rather than a redirect this feature invented. */
function DetailGuard({ children }: { children: ReactElement }) {
  const { area } = useParams();
  const known = !!area && (AREA_ORDER as readonly string[]).includes(area);
  if (!known) return <Navigate to="/balance" replace />;
  return children;
}

export interface RenderOptions extends BalanceScreenProps {
  at?: string;
}

/** The tree `renderBalance` mounts. Exported so a test can `rerender(<BalanceTree …/>)` with a
 *  mutated stub and prove the map and the rows both follow it (AC-A15). */
export function BalanceTree({ at = "/balance", ...props }: RenderOptions) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <LocationProbe />
      <Routes>
        <Route path="/balance" element={<Balance {...props} />} />
        <Route
          path="/balance/:area"
          element={
            <DetailGuard>
              <BalanceDetail {...props} />
            </DetailGuard>
          }
        />
        <Route path="*" element={<span data-testid="elsewhere" />} />
      </Routes>
    </MemoryRouter>
  );
}

/** Renders both UF-10 routes behind a MemoryRouter, at `at` (default `/balance`). */
export function renderBalance(options: RenderOptions = {}): RenderResult {
  return render(<BalanceTree {...options} />);
}

// ---- DOM readers ----

/** The `[data-part="row"]` links, in DOM order. */
export function rowElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[data-part="row"]'));
}

/** The `data-area` of every row, in DOM order — the assertion AC-A5 turns on. */
export function rowAreas(): string[] {
  return rowElements().map((el) => el.getAttribute("data-area")!);
}

/** One row by area, or `null`. */
export function row(area: Area | string): HTMLElement | null {
  return document.querySelector(`[data-part="row"][data-area="${area}"]`);
}

/** The `load / target` text of a row. */
export function rowValue(area: Area | string): string | null {
  return row(area)?.querySelector('[data-part="value"]')?.textContent ?? null;
}

/** The inline `background-color` of a row's bar fill, e.g. `var(--wl-color-coverage-2)`. */
export function rowFill(area: Area | string): string | undefined {
  const fill = row(area)?.querySelector<HTMLElement>('[data-part="bar-fill"]');
  return fill?.style.backgroundColor;
}

export function rowBarWidth(area: Area | string): string | undefined {
  return row(area)?.querySelector<HTMLElement>('[data-part="bar-fill"]')?.style.width;
}

/** The areas whose row carries the D-0003 attention outline, in DOM order. */
export function outlinedRowAreas(): string[] {
  return rowElements()
    .filter((el) => el.style.outline !== "")
    .map((el) => el.getAttribute("data-area")!);
}

/** The C-01 button for one area. */
export function mapButton(area: Area | string): HTMLElement | null {
  return document.querySelector(
    `[data-component="C-01"][data-variant="full"] button[data-area="${area}"]`,
  );
}

export function mapButtonValue(area: Area | string): string | null {
  return mapButton(area)?.querySelector('[data-part="value"]')?.textContent ?? null;
}

export function mapButtonFill(area: Area | string): string | undefined {
  return mapButton(area)?.querySelector<HTMLElement>('[data-part="fill"]')?.style.backgroundColor;
}

export function location(): string {
  return document.querySelector('[data-testid="location"]')!.getAttribute("title")!;
}
