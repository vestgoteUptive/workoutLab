// T-0303d AC-6 (NFR-OFF-2, NFR-SYNC-4, D-0110 §5): Start through the REAL `upsertSession` over
// `fake-indexeddb`, with a signed-in user stubbed through the supabase-js `localStorage` auth key
// that `currentUserId()` reads. Offline and online take the same path, and Start makes no fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { Workout } from "@workoutlab/engine";
import { offlineDb, resetOfflineDbForTest } from "../../../lib/offline/db.js";
import { Ready } from "../Ready.js";
import { LOCALE, TZ } from "./fixtures.js";
import { setOnline, settle } from "./harness.js";
import { wR7E4 } from "./workouts.js";

const USER = "33333333-3333-4333-8333-333333333333";
const STORAGE_KEY = "sb-abc-auth-token";
const TAP = "2026-09-27T12:04:00+02:00";
let counter = 0;

function Probe() {
  const loc = useLocation();
  return <span data-testid="loc" data-path={loc.pathname} />;
}

function show(workout: Workout) {
  return render(
    <MemoryRouter initialEntries={["/session/setup?step=ready"]}>
      <Probe />
      <Routes>
        <Route
          path="/session/setup"
          element={
            <Ready workout={workout} clock={() => new Date(TAP)} locale={LOCALE} timeZone={TZ} />
          }
        />
        <Route path="/session/:id" element={<span data-testid="focus" />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Start, then the id from the URL once navigation has happened. */
async function start(): Promise<string> {
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  await waitFor(() => expect(screen.getByTestId("focus")).toBeInTheDocument());
  const path = screen.getByTestId("loc").getAttribute("data-path")!;
  return path.slice("/session/".length);
}

function expectedRow(id: string, workout: Workout) {
  return {
    id,
    started_at: "2026-09-27T10:04:00.000Z",
    ended_at: null,
    time_budget_min: 30,
    energy: "normal",
    warmup_in_budget: true,
    plan: workout.plan,
  };
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  counter += 1;
  resetOfflineDbForTest(`wl-offline-uf08-ready-${counter}`);
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ access_token: "t", expires_at: 9_999_999_999, user: { id: USER } }),
  );
  fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  window.localStorage.removeItem(STORAGE_KEY);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AC-6 Start over the real queue (D-0110 §5)", () => {
  it("offline: the IndexedDB row is pending, and navigation happened", async () => {
    setOnline(false);
    const workout = wR7E4();
    show(workout);
    const id = await start();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await offlineDb().sessions.get(id)).toEqual({
      id,
      userId: USER,
      row: expectedRow(id, workout),
      pending: true,
      finished: false,
    });
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("online (the pair): same row, no wait for a never-resolving fetch, and Start makes no fetch", async () => {
    setOnline(true);
    const workout = wR7E4();
    show(workout);
    const id = await start();
    expect(await offlineDb().sessions.get(id)).toEqual({
      id,
      userId: USER,
      row: expectedRow(id, workout),
      pending: true,
      finished: false,
    });
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("two starts: two setups give two ids and two rows", async () => {
    setOnline(false);
    const first = show(wR7E4());
    const a = await start();
    first.unmount();
    show(wR7E4());
    const b = await start();
    expect(a).not.toBe(b);
    const rows = await offlineDb().sessions.toArray();
    expect(rows.map((r) => r.id).sort()).toEqual([a, b].sort());
    expect(rows.every((r) => r.pending && !r.finished)).toBe(true);
  });
});
