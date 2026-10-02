// T-0304a test helpers: a signed-in user stubbed through the supabase-js `localStorage` key
// `currentUserId()` reads (D-0111 §2), session rows written with the REAL `upsertSession` over
// `fake-indexeddb`, a host renderer, and a fake clock that leaves IndexedDB on real time.
import { act, render, type RenderResult } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { vi } from "vitest";
import type { Json, SessionPlan } from "@workoutlab/shared";
import { resetOfflineDbForTest } from "../../../lib/offline/db.js";
import { upsertSession } from "../../../lib/offline/queue.js";
import { SessionHost, type SessionHostProps } from "../host.js";
import { P1, S1, STARTED_AT, USER_A } from "./fixtures.js";

const AUTH_KEY = "sb-abc-auth-token";

// Captured before any test fakes the clock: fake-indexeddb and Dexie run on real macrotasks.
const realSetTimeout = globalThis.setTimeout;

let dbCounter = 0;
export function freshDb(): void {
  dbCounter += 1;
  resetOfflineDbForTest(`wl-offline-uf09-${dbCounter}`);
}

export function signIn(userId: string = USER_A): void {
  window.localStorage.setItem(
    AUTH_KEY,
    JSON.stringify({
      access_token: "test-access-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId },
    }),
  );
}

export interface SeedRow {
  id?: string;
  plan?: SessionPlan | Json | null;
  started_at?: string;
  ended_at?: string | null;
  warmup_in_budget?: boolean;
}

/** Writes a P1-shaped session row through the real `upsertSession`. */
export async function seedSession(row: SeedRow = {}): Promise<void> {
  await upsertSession({
    id: row.id ?? S1,
    started_at: row.started_at ?? STARTED_AT,
    time_budget_min: 45,
    energy: "normal",
    warmup_in_budget: row.warmup_in_budget ?? true,
    ended_at: row.ended_at ?? null,
    plan: (row.plan === undefined ? P1 : row.plan) as Json,
  });
}

/** Fakes timers and `Date` only: IndexedDB keeps its real `setImmediate`. */
export function useFakeClock(atMs: number): void {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  vi.setSystemTime(atMs);
}

/** A real 50 ms macrotask (the fake clock doesn't move), so pending IndexedDB work and the
 *  host's load settle. Also the wait for every negative assert. */
export async function flushReal(ms = 50): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => realSetTimeout(resolve, ms));
  });
}

/** Advances the fake clock inside `act`, then lets real macrotasks run. */
export async function advance(ms: number): Promise<void> {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
  await flushReal();
}

export function HostAt({
  path = `/session/${S1}`,
  ...props
}: SessionHostProps & { path?: string }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/session/:sessionId" element={<SessionHost {...props} />} />
        <Route path="/" element={<span data-testid="home" />} />
      </Routes>
    </MemoryRouter>
  );
}

export function renderHost(props: SessionHostProps & { path?: string } = {}): RenderResult {
  return render(<HostAt {...props} />);
}

export async function renderLoaded(
  props: SessionHostProps & { path?: string } = {},
): Promise<RenderResult> {
  const view = renderHost(props);
  await flushReal();
  return view;
}

export function screenIds(): string[] {
  return Array.from(document.querySelectorAll("[data-screen-id]")).map((el) =>
    el.getAttribute("data-screen-id")!,
  );
}

/** The one `[data-screen-id]` on the page; fails if there are 0 or 2+. */
export function screenId(): string {
  const ids = screenIds();
  if (ids.length !== 1) throw new Error(`expected one [data-screen-id], found ${ids.join(",")}`);
  return ids[0]!;
}

export function timerText(): string | null {
  return document.querySelector('[role="timer"]')?.textContent ?? null;
}

export function storedFocus(sessionId: string = S1): Record<string, unknown> | null {
  const raw = window.localStorage.getItem(`wl-focus:${sessionId}`);
  return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
}
