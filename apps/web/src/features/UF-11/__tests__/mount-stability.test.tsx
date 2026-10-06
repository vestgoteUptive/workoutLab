// T-0308b regression, after T-0307a: a screen mounted WITHOUT the `now` test seam — the real
// router path, where `now` defaults to `systemClock` and every render would produce a new instant
// — loads its data ONCE, not once per render.
//
// T-0307a's e2e found this the hard way on UF-10: a per-render `new Date()` changed the hook's
// dependency every render and froze the page in a reload loop. No unit test could see it, because
// every unit test injected a fixed `now`. So this file deliberately passes no `now` at all, and
// also passes a FRESH clock function identity on every render, which is the worst case the router
// can produce.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { EditPlan, Plan } from "../index.js";
import { profileF, targetsF } from "./fixtures.js";
import {
  createFromSpy,
  freshDb,
  listRows,
  seedCache,
  signIn,
  signOut,
  useTimeZone,
} from "./test-helpers.js";
import { en } from "../../../lib/i18n/en.js";

// T-0471: `Plan` now also mounts `CheckinCard`, whose `insertIfFirstShown` effect is a no-op here
// (every test below is offline), but the real `lib/auth/client.js` is still mocked, as every other
// UF-11 file that mounts `Plan` with a proposal-bearing profile does — a real unconfigured-or-not
// client's background session refresh is a cross-test hazard (`plan.render.test.tsx`'s own note).
const checkinSpy = createFromSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => checkinSpy.from(table) },
  isSupabaseConfigured: () => true,
}));

// `loadProfile` is counted THROUGH the mocked index, the module the feature actually imports.
// Spying on `lib/offline/history.js` would count nothing: the `...actual` spread below binds the
// export once, at mock-factory time, so a later `vi.spyOn` on the source module never runs.
const loadProfileCalls = { n: 0 };

vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return {
    ...actual,
    refreshAll: vi.fn(async () => undefined),
    refreshRoutines: vi.fn(async () => undefined),
    loadProfile: (...args: Parameters<typeof actual.loadProfile>) => {
      loadProfileCalls.n += 1;
      return actual.loadProfile(...args);
    },
  };
});

const u = en.uf11;

beforeEach(() => {
  signIn();
  checkinSpy.reset();
  useTimeZone("Europe/Stockholm");
  loadProfileCalls.n = 0;
  // Offline, so the refresh path is out of the picture and any repeat read is a real loop.
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

describe("mounting with no `now` prop (the real router path)", () => {
  it("/plan reads the cache a bounded number of times", async () => {
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    render(
      <MemoryRouter initialEntries={["/plan"]}>
        <Routes>
          <Route path="/plan" element={<Plan />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(listRows(u.headings.targets)).toHaveLength(9));
    // Let any loop show itself: each iteration is at least one IDB round trip.
    await new Promise((r) => setTimeout(r, 300));
    expect(loadProfileCalls.n).toBeGreaterThanOrEqual(1);
    expect(loadProfileCalls.n).toBeLessThanOrEqual(2);
  });

  it("/plan/edit reads the cache a bounded number of times", async () => {
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    render(
      <MemoryRouter initialEntries={["/plan/edit"]}>
        <Routes>
          <Route path="/plan/edit" element={<EditPlan />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(listRows(u.previewHeading)).toHaveLength(9));
    await new Promise((r) => setTimeout(r, 300));
    expect(loadProfileCalls.n).toBeGreaterThanOrEqual(1);
    expect(loadProfileCalls.n).toBeLessThanOrEqual(2);
  });

  it("a NEW clock function identity on every re-render does not restart the load", async () => {
    // The hard case: the parent hands down a fresh closure each render, which is exactly what
    // `now={() => new Date()}` would do. The hook must have pinned the instant at mount.
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    const { rerender } = render(
      <MemoryRouter initialEntries={["/plan"]}>
        <Routes>
          <Route path="/plan" element={<Plan now={() => new Date()} />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(listRows(u.headings.targets)).toHaveLength(9));
    // `CheckinCard` (T-0471) reads the profile too; wait until the mount's own reads have
    // settled (count stable across a quiet window) so the baseline is not taken mid-flight.
    let afterFirstLoad = -1;
    await waitFor(
      () => {
        const seen = loadProfileCalls.n;
        const stable = seen === afterFirstLoad;
        afterFirstLoad = seen;
        expect(stable).toBe(true);
      },
      { interval: 100 },
    );
    expect(afterFirstLoad).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < 10; i += 1) {
      rerender(
        <MemoryRouter initialEntries={["/plan"]}>
          <Routes>
            <Route path="/plan" element={<Plan now={() => new Date()} />} />
          </Routes>
        </MemoryRouter>,
      );
    }
    await new Promise((r) => setTimeout(r, 200));
    // Ten re-renders, each with a brand-new clock: not one extra load.
    expect(loadProfileCalls.n).toBe(afterFirstLoad);
  });
});
