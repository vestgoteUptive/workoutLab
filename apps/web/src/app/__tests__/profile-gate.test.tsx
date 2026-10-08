// T-0301a AC-5..AC-12: the profile gate wired into the real shell (D-0064 §9, D-0071 §11,
// D-0073). Same harness as `auth-guard.phase3.test.tsx` — `MemoryRouter` + `AuthProvider` +
// `Shell`, `vi.mock` of `lib/auth/client.js`, `seedValidSession()` — plus the
// `ProfileStatusProvider` the real `App` mounts. `lib/offline` and `supabase.from` are mocked
// with the `select-spy.ts` pattern. Every assertion is on behaviour: which screen id is on the
// DOM, which router location settled, which spy was called.
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Shell } from "../App.js";
import { AuthProvider } from "../../lib/auth/auth-context.js";
import {
  ProfileStatusProvider,
  useProfileStatus,
  useRecheckProfile,
} from "../../lib/profile/index.js";
import { gatedPaths } from "../../lib/profile/gated-routes.js";
import { routes } from "../routes.js";
import { createSelectSpy, type SelectSpy } from "../../lib/offline/__tests__/select-spy.js";
import { freshOfflineDb } from "../../lib/offline/__tests__/test-helpers.js";
import { seedLibrary } from "../../lib/offline/__tests__/seed-library.js";
import { toLibraryExercise, type Tables } from "@workoutlab/shared";

const { loadProfile, refreshProfile, uf06Loaders } = vi.hoisted(() => ({
  loadProfile: vi.fn(),
  refreshProfile: vi.fn(),
  // UF-06.2 (`/progress/:exerciseId`) reads the T-0319 loaders and redirects to `/progress`
  // when its id is not a known exercise (D-0079 §4). The gate cases below assert that a
  // *gated* route still renders, so the library must contain `back-squat`; an empty library
  // would make the screen redirect for its own reasons and stop testing the gate at all
  // (D-0088 §2: keep the guarantee, seed the fixture). `refreshAll` is a no-op so nothing
  // here depends on the network.
  uf06Loaders: {
    loadSessions: vi.fn(async () => []),
    loadEngineHistory: vi.fn(async () => []),
    loadLibrary: vi.fn(async () => [
      {
        id: "back-squat",
        name: "Back squat",
        kind: "exercise",
        type: "compound",
        level: "beginner",
        equipment: [],
        areas: { quads: 1 },
        timed: false,
        defaultDurationS: null,
        incrementKg: 2.5,
        externalLoad: true,
      },
    ]),
    loadTargets: vi.fn(async () => []),
    refreshAll: vi.fn(async () => undefined),
  },
}));
vi.mock("../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/offline/index.js")>();
  return { ...actual, loadProfile, refreshProfile, ...uf06Loaders };
});

const { selectSpy, onAuthStateChange, getSession, signOut, authStateCallbacks } = vi.hoisted(() => {
  const authStateCallbacks: Array<(event: string, session: unknown) => void> = [];
  return {
    // A mutable holder, because `vi.hoisted` runs before module scope: the spy is created
    // at module scope below and dropped in here.
    selectSpy: { current: null as SelectSpy | null },
    authStateCallbacks,
    onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
      authStateCallbacks.push(cb);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    getSession: vi.fn(),
    signOut: vi.fn(),
  };
});
vi.mock("../../lib/auth/client.js", () => ({
  supabase: {
    auth: { onAuthStateChange, getSession, signOut },
    from: (table: string) => selectSpy.current!.from(table),
  },
}));
selectSpy.current = createSelectSpy();
const spy = selectSpy.current;

const PROFILE_ROW = { id: "u1", goal: "build" };

// T-0408 (D-0096): local budgets on waits for lazy route chunks (the --concurrency=1 gate).
const LAZY_WAIT_MS = 5_000;
const LAZY_TEST_MS = 15_000;

let navigateRef: ((path: string) => void) | undefined;
let locationRef = "";
let recheckRef: (() => Promise<void>) | undefined;

function Probes() {
  const navigate = useNavigate();
  const location = useLocation();
  const recheck = useRecheckProfile();
  locationRef = location.pathname;
  useEffect(() => {
    navigateRef = (path: string) => navigate(path);
    recheckRef = recheck;
  }, [navigate, recheck]);
  return null;
}

function Harness({ start }: { start: string }) {
  return (
    <MemoryRouter initialEntries={[start]}>
      <AuthProvider>
        <ProfileStatusProvider>
          <Probes />
          <Shell />
        </ProfileStatusProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

function seedValidSession() {
  window.localStorage.setItem(
    "sb-abc-auth-token",
    JSON.stringify({
      access_token: "tok",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "u1" },
    }),
  );
}

function screenOf(id: string): Element | null {
  return document.querySelector(`[data-screen-id="${id}"]`);
}

/** The state the gate resolves as `missing`: signed in, online, no cache, no row. */
function stateMissing() {
  seedValidSession();
  vi.stubGlobal("navigator", { onLine: true });
  loadProfile.mockResolvedValue(null);
  spy.setRows("profiles", []);
}

/** `unknown`: signed in, offline, no cache — the D-0064 §9 step 4 case. */
function stateUnknown() {
  seedValidSession();
  vi.stubGlobal("navigator", { onLine: false });
  loadProfile.mockResolvedValue(null);
}

/** `present`: signed in with a cached profile — the D-0064 §9 step 2 fast path. */
function statePresent() {
  seedValidSession();
  vi.stubGlobal("navigator", { onLine: true });
  loadProfile.mockResolvedValue(PROFILE_ROW);
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  loadProfile.mockReset();
  loadProfile.mockResolvedValue(null);
  refreshProfile.mockReset();
  refreshProfile.mockResolvedValue(undefined);
  spy.reset();
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  navigateRef = undefined;
  recheckRef = undefined;
  locationRef = "";
  authStateCallbacks.length = 0;
  freshOfflineDb();
});

afterEach(() => {
  vi.unstubAllGlobals();
  freshOfflineDb();
});

// ---------------------------------------------------------------------------
// The gated set, derived from the table (not a hand-written list).
// ---------------------------------------------------------------------------

/** A concrete path for every param in a route pattern, so it can actually be visited. */
const PARAM_VALUES: Record<string, string> = {
  ":exerciseId": "back-squat",
  ":otherId": "leg-press",
  ":area": "core",
  ":routineId": "R1",
  ":sessionId": "0b9e1f",
};

function concrete(pattern: string): string {
  return pattern
    .split("/")
    .map((seg) => (seg.startsWith(":") ? (PARAM_VALUES[seg] ?? seg.slice(1)) : seg))
    .join("/");
}

/** The screen each gated path renders when the gate stands down (the AC-6 contrast). */
const GATED: ReadonlyArray<readonly [string, string]> = gatedPaths(routes).map((pattern) => {
  const route = routes.find((r) => r.path === pattern)!;
  return [concrete(pattern), route.screenId] as const;
});

// ---------------------------------------------------------------------------
// T-0366 (D-0088 §2, D-0091 §1): the AC-6 fixtures for the two built UF-04 screens.
//
// UF-04.2 and UF-04.3 render their `data-screen-id` wrapper during the first cache read, then
// redirect to /library when the exercise isn't cached (D-0079 §3). On an empty cache the AC-6
// rows could therefore pass on the wrapper alone. These rows seed the library and assert the
// built content and that the location holds. UF-04 reads `lib/offline/history.js` directly (not
// the mocked `index.js`), so the seed goes into the real (fake-indexeddb) Dexie cache for `u1`.
// Online (`present`) the screen runs its own `refreshAll`, which replaces the cache from
// `supabase.from`; the select spy returns the same exercises, so the refresh writes them back.
// ---------------------------------------------------------------------------

const USER_ID = "u1"; // the id `seedValidSession()` stores

function exerciseRow(id: string, name: string): Tables<"exercises"> {
  return {
    id,
    name,
    kind: "exercise",
    type: "compound",
    level: "intermediate",
    equipment: ["barbell"],
    instructions: ["Brace.", "Drive up."],
    mistakes: [],
    cue: "Chest up",
    source: "workoutlab",
    license: "LicenseRef-workoutLab",
    attribution: null,
    source_url: null,
    timed: false,
    increment_kg: 2.5,
    default_duration_s: null,
    external_load: true,
  };
}

const UF04_EXERCISES = [
  exerciseRow("back-squat", "Back squat"),
  exerciseRow("leg-press", "Leg press"),
];
const UF04_AREAS = UF04_EXERCISES.flatMap((e) => [
  { exercise_id: e.id, area_id: "quads", weight: 1 },
  { exercise_id: e.id, area_id: "glutes", weight: 0.5 },
]);
const UF04_VARIANTS = [{ exercise_id: "back-squat", variant_id: "leg-press" }];

interface Uf04Fixture {
  /** The exercise ids the screen needs in the cache. */
  exerciseIds: readonly string[];
  /** Resolves once the built content (not just the wrapper) is on screen. */
  built: () => Promise<void>;
  /** Asserts the built content is still on screen. */
  stillBuilt: () => void;
}

/** Per route pattern; only the AC-6 `unknown`/`present` rows look this up. */
const UF04_FIXTURES: Record<string, Uf04Fixture> = {
  "/library/:exerciseId": {
    exerciseIds: ["back-squat"],
    built: async () => {
      await screen.findByRole("heading", { level: 1, name: "Back squat" });
    },
    stillBuilt: () => {
      expect(screen.getByRole("heading", { level: 1, name: "Back squat" })).toBeInTheDocument();
    },
  },
  "/library/:exerciseId/compare/:otherId": {
    exerciseIds: ["back-squat", "leg-press"],
    built: async () => {
      await screen.findByRole("columnheader", { name: "Back squat" });
      await screen.findByRole("columnheader", { name: "Leg press" });
    },
    stillBuilt: () => {
      expect(screen.getByRole("columnheader", { name: "Back squat" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Leg press" })).toBeInTheDocument();
    },
  },
};

/** The fixture for a concrete AC-6 path, found through the pattern it was built from. */
function uf04FixtureFor(path: string): Uf04Fixture | undefined {
  const pattern = gatedPaths(routes).find((p) => concrete(p) === path);
  return pattern === undefined ? undefined : UF04_FIXTURES[pattern];
}

/** Seeds the Dexie cache for `u1` (both iterations) and, online, the spy rows the refresh reads. */
async function seedUf04(fixture: Uf04Fixture, online: boolean): Promise<void> {
  const rows = UF04_EXERCISES.filter((e) => fixture.exerciseIds.includes(e.id));
  const areasOf = (id: string) => UF04_AREAS.filter((a) => a.exercise_id === id);
  await seedLibrary(
    USER_ID,
    rows.map((row) => toLibraryExercise(row, areasOf(row.id))),
  );
  if (online) {
    spy.setRows("exercises", rows);
    spy.setRows(
      "exercise_areas",
      UF04_AREAS.filter((a) => fixture.exerciseIds.includes(a.exercise_id)),
    );
    spy.setRows(
      "exercise_variants",
      UF04_VARIANTS.filter(
        (v) =>
          fixture.exerciseIds.includes(v.exercise_id) && fixture.exerciseIds.includes(v.variant_id),
      ),
    );
  }
}

/** One macrotask turn, so a redirect queued behind the cache read (or the refresh) has landed. */
async function settleTurn(): Promise<void> {
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
}

describe("the gated set is derived from routes.ts, with an exact expected count", () => {
  it("is the 15 `protected` entries plus /session/setup, and nothing else", () => {
    const protectedCount = routes.filter((r) => r.guard === "protected").length;
    expect(protectedCount).toBe(15);
    expect(gatedPaths(routes)).toHaveLength(16);
    expect(gatedPaths(routes)).toEqual([
      "/",
      "/library",
      "/library/:exerciseId",
      "/library/:exerciseId/compare/:otherId",
      "/progress",
      "/progress/:exerciseId",
      "/balance",
      "/balance/:area",
      "/plan",
      "/plan/edit",
      "/plan/account",
      "/plan/excluded",
      "/plan/favorites",
      "/plan/routines/new",
      "/plan/routines/:routineId",
      "/session/setup",
    ]);
  });

  it("excludes /session/:sessionId and its summary (principle 1) and the guest-only routes", () => {
    const gated = gatedPaths(routes);
    expect(gated).not.toContain("/session/:sessionId");
    expect(gated).not.toContain("/session/:sessionId/summary");
    expect(gated).not.toContain("/welcome/*");
    expect(gated).not.toContain("/account");
    expect(gated).not.toContain("/auth/callback");
  });

  it("the concrete paths the routing tests visit match the ticket's list", () => {
    expect(GATED.map(([path]) => path)).toEqual([
      "/",
      "/library",
      "/library/back-squat",
      "/library/back-squat/compare/leg-press",
      "/progress",
      "/progress/back-squat",
      "/balance",
      "/balance/core",
      "/plan",
      "/plan/edit",
      "/plan/account",
      "/plan/excluded",
      "/plan/favorites",
      "/plan/routines/new",
      "/plan/routines/R1",
      "/session/setup",
    ]);
  });
});

describe("AC-5 signed in + `missing`: every gated route redirects to /welcome/save", () => {
  it.each(GATED)(
    "%s redirects to /welcome/save",
    async (path) => {
      stateMissing();
      render(<Harness start={path} />);
      await waitFor(() => expect(screenOf("UF-01.5-save")).toBeInTheDocument(), {
        timeout: LAZY_WAIT_MS,
      });
      expect(locationRef).toBe("/welcome/save");
    },
    LAZY_TEST_MS,
  );

  it("visits a non-zero number of paths", () => {
    expect(GATED.length).toBe(16);
  });
});

describe("AC-6 `unknown` and `present` never redirect (the contrast to AC-5)", () => {
  it.each(GATED)("`unknown`: %s renders %s, not /welcome/save", async (path, screenId) => {
    stateUnknown();
    const uf04 = uf04FixtureFor(path);
    if (uf04) await seedUf04(uf04, false);
    render(<Harness start={path} />);
    await waitFor(() => expect(screenOf(screenId)).toBeInTheDocument());
    if (uf04) {
      // T-0366: the built screen, not the transient wrapper, then a macrotask turn.
      await uf04.built();
      await settleTurn();
      uf04.stillBuilt();
      expect(screenOf("UF-04.1")).not.toBeInTheDocument();
    }
    // Settle one more tick, so a late redirect would still be caught.
    await act(async () => {});
    expect(screenOf(screenId)).toBeInTheDocument();
    expect(locationRef).toBe(path);
    expect(screenOf("UF-01.1")).not.toBeInTheDocument();
    expect(screenOf("UF-01.5-save")).not.toBeInTheDocument();
  });

  it.each(GATED)("`present`: %s renders %s, not /welcome/save", async (path, screenId) => {
    statePresent();
    const uf04 = uf04FixtureFor(path);
    if (uf04) await seedUf04(uf04, true);
    render(<Harness start={path} />);
    await waitFor(() => expect(screenOf(screenId)).toBeInTheDocument());
    if (uf04) {
      // T-0366: the built screen survives the screen's own `refreshAll` against the spy.
      await uf04.built();
      await waitFor(() => expect(spy.countFor("exercises")).toBeGreaterThanOrEqual(1));
      await settleTurn();
      uf04.stillBuilt();
      expect(screenOf("UF-04.1")).not.toBeInTheDocument();
    }
    await act(async () => {});
    expect(locationRef).toBe(path);
    expect(screenOf("UF-01.1")).not.toBeInTheDocument();
    expect(screenOf("UF-01.5-save")).not.toBeInTheDocument();
  });

  // Slow network on a *gated* route: the gate's source never settles, so the status stays at the
  // pre-resolution `unknown` forever. `unknown` never redirects (AC-6), so the route must render
  // its own screen indefinitely — the gate must not hold the app behind a spinner or a blank
  // screen while it waits, and must not eventually give up and redirect.
  it.each(["/", "/plan", "/session/setup"])(
    "a profile read that never settles leaves %s rendering, never redirected",
    async (path) => {
      seedValidSession();
      vi.stubGlobal("navigator", { onLine: true });
      loadProfile.mockReturnValue(new Promise(() => {}));
      const screenId = routes.find((r) => r.path === path)!.screenId;
      render(<Harness start={path} />);
      await waitFor(() => expect(screenOf(screenId)).toBeInTheDocument());
      await act(async () => {});
      await act(async () => {});
      expect(screenOf(screenId)).toBeInTheDocument();
      expect(locationRef).toBe(path);
      expect(screenOf("UF-01.1")).not.toBeInTheDocument();
      expect(screenOf("UF-01.5-save")).not.toBeInTheDocument();
    },
  );
});

describe("AC-7 /welcome/* renders instead of redirecting for a `missing` profile", () => {
  it.each(["/welcome"])("signed in + `missing`: %s renders UF-01.1 and stays put", async (path) => {
    stateMissing();
    render(<Harness start={path} />);
    await waitFor(() => expect(screenOf("UF-01.1")).toBeInTheDocument());
    await act(async () => {});
    expect(screenOf("UF-01.1")).toBeInTheDocument();
    expect(locationRef).toBe(path);
  });

  it("signed in + `missing`: /welcome/save renders UF-01.5-save and stays put", async () => {
    stateMissing();
    render(<Harness start="/welcome/save" />);
    await waitFor(() => expect(screenOf("UF-01.5-save")).toBeInTheDocument());
    await act(async () => {});
    expect(screenOf("UF-01.5-save")).toBeInTheDocument();
    expect(locationRef).toBe("/welcome/save");
  });

  it("signed in + `missing`: /welcome/goal renders UF-01.2 and stays put", async () => {
    stateMissing();
    render(<Harness start="/welcome/goal" />);
    await waitFor(() => expect(screenOf("UF-01.2")).toBeInTheDocument());
    await act(async () => {});
    expect(screenOf("UF-01.2")).toBeInTheDocument();
    expect(locationRef).toBe("/welcome/goal");
  });

  // The contrast pair. Without it, a `guest-only` guard disabled outright would pass AC-7.
  it("signed in + `present`: /welcome/goal still redirects to / (UF-02.1)", async () => {
    statePresent();
    render(<Harness start="/welcome/goal" />);
    await waitFor(() => expect(screenOf("UF-02.1")).toBeInTheDocument());
    expect(locationRef).toBe("/");
  });

  it("signed in + `unknown`: /welcome/goal still redirects to / (UF-02.1)", async () => {
    stateUnknown();
    render(<Harness start="/welcome/goal" />);
    await waitFor(() => expect(screenOf("UF-02.1")).toBeInTheDocument());
    expect(locationRef).toBe("/");
  });

  it("signed in + `present`: /welcome honours a stored wl-return-to (T-0300b)", async () => {
    statePresent();
    window.sessionStorage.setItem("wl-return-to", "/library");
    render(<Harness start="/welcome" />);
    await waitFor(() => expect(screenOf("UF-04.1")).toBeInTheDocument());
    expect(locationRef).toBe("/library");
  });

  // The regression this ticket found: `"unknown"` is both "not resolved yet" and "resolved,
  // answer unknown". A `guest-only` stand-down that keyed on the status alone fired its
  // redirect on the *first* render, before the gate had spoken, sending a `missing` user
  // /welcome → / and then (via the gate on `/`) → /welcome/save. The visible symptom is the
  // intermediate `/` in the location history, so that is what this asserts — not just the end
  // state, which happened to be right.
  it.each(["/welcome"])(
    "%s never passes through `/` on the way (no first-render bounce)",
    async (path) => {
      stateMissing();
      const visited: string[] = [];
      function Recorder() {
        visited.push(useLocation().pathname);
        return null;
      }
      render(
        <MemoryRouter initialEntries={[path]}>
          <AuthProvider>
            <ProfileStatusProvider>
              <Recorder />
              <Shell />
            </ProfileStatusProvider>
          </AuthProvider>
        </MemoryRouter>,
      );
      await waitFor(() => expect(screenOf("UF-01.1")).toBeInTheDocument());
      await act(async () => {});
      expect(new Set(visited)).toEqual(new Set([path]));
    },
  );

  it("/welcome/save never passes through `/` on the way (no first-render bounce)", async () => {
    stateMissing();
    const visited: string[] = [];
    function Recorder() {
      visited.push(useLocation().pathname);
      return null;
    }
    render(
      <MemoryRouter initialEntries={["/welcome/save"]}>
        <AuthProvider>
          <ProfileStatusProvider>
            <Recorder />
            <Shell />
          </ProfileStatusProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screenOf("UF-01.5-save")).toBeInTheDocument());
    await act(async () => {});
    expect(new Set(visited)).toEqual(new Set(["/welcome/save"]));
  });

  it("/welcome/goal never passes through `/` on the way (no first-render bounce)", async () => {
    stateMissing();
    const visited: string[] = [];
    function Recorder() {
      visited.push(useLocation().pathname);
      return null;
    }
    render(
      <MemoryRouter initialEntries={["/welcome/goal"]}>
        <AuthProvider>
          <ProfileStatusProvider>
            <Recorder />
            <Shell />
          </ProfileStatusProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screenOf("UF-01.2")).toBeInTheDocument());
    await act(async () => {});
    expect(new Set(visited)).toEqual(new Set(["/welcome/goal"]));
  });

  // The same bounce, reached by a *transition* instead of a cold load — and this is the primary
  // path, not an edge case: D-0045 §5 is the magic link / OTP verify firing `SIGNED_IN` in place
  // while the user sits on `/welcome`, with the onboarding answers in this browser context and
  // no `profiles` row yet. `resolved` comes from a `useState` initialiser, which runs once, so
  // before the fix it was still `true` from the signed-out render when `signedIn` flipped: the
  // stand-down saw `resolved && "unknown"`, stood aside, and the user went
  // `/welcome` → `/` → `/welcome/save`. The cold-load tests above cannot catch it, because they
  // never change the auth status after mount.
  it.each(["/welcome"])(
    "%s does not bounce through `/` when SIGNED_IN fires in place with a missing profile",
    async (path) => {
      vi.stubGlobal("navigator", { onLine: true });
      spy.setRows("profiles", []);
      // Hold the cache read open, so the window between the auth flip and the gate's answer —
      // the window the bug lived in — is wide enough to observe.
      let release: (() => void) | undefined;
      loadProfile.mockImplementation(
        () => new Promise<null>((resolve) => (release = () => resolve(null))),
      );

      const visited: string[] = [];
      const at = () => visited[visited.length - 1];
      function Recorder() {
        visited.push(useLocation().pathname);
        return null;
      }
      // Signed out to begin with: no stored session (`beforeEach` cleared it).
      render(
        <MemoryRouter initialEntries={[path]}>
          <AuthProvider>
            <ProfileStatusProvider>
              <Recorder />
              <Shell />
            </ProfileStatusProvider>
          </AuthProvider>
        </MemoryRouter>,
      );
      await waitFor(() => expect(screenOf("UF-01.1")).toBeInTheDocument());
      expect(at()).toBe(path);

      // The verify lands: `SIGNED_IN` in place, no reload.
      await act(async () => {
        authStateCallbacks.forEach((cb) => cb("SIGNED_IN", { user: { id: "u1" } }));
      });
      await act(async () => {});
      // Still put, and still on UF-01.1: the gate has not answered yet, so `guest-only` waits.
      expect(at()).toBe(path);

      // Now let the gate resolve, to `missing`.
      await waitFor(() => expect(release).toBeDefined());
      await act(async () => {
        release!();
        await Promise.resolve();
      });
      await act(async () => {});

      expect(screenOf("UF-01.1")).toBeInTheDocument();
      expect(at()).toBe(path);
      expect(new Set(visited)).toEqual(new Set([path]));
    },
  );

  it("/welcome/goal does not bounce through `/` when SIGNED_IN fires in place with a missing profile", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    spy.setRows("profiles", []);
    // Hold the cache read open, so the window between the auth flip and the gate's answer —
    // the window the bug lived in — is wide enough to observe.
    let release: (() => void) | undefined;
    loadProfile.mockImplementation(
      () => new Promise<null>((resolve) => (release = () => resolve(null))),
    );

    const visited: string[] = [];
    const at = () => visited[visited.length - 1];
    function Recorder() {
      visited.push(useLocation().pathname);
      return null;
    }
    // Signed out to begin with: no stored session (`beforeEach` cleared it).
    render(
      <MemoryRouter initialEntries={["/welcome/goal"]}>
        <AuthProvider>
          <ProfileStatusProvider>
            <Recorder />
            <Shell />
          </ProfileStatusProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screenOf("UF-01.2")).toBeInTheDocument());
    expect(at()).toBe("/welcome/goal");

    // The verify lands: `SIGNED_IN` in place, no reload.
    await act(async () => {
      authStateCallbacks.forEach((cb) => cb("SIGNED_IN", { user: { id: "u1" } }));
    });
    await act(async () => {});
    // Still put, and still on UF-01.2: the gate has not answered yet, so `guest-only` waits.
    expect(at()).toBe("/welcome/goal");

    // Now let the gate resolve, to `missing`.
    await waitFor(() => expect(release).toBeDefined());
    await act(async () => {
      release!();
      await Promise.resolve();
    });
    await act(async () => {});

    expect(screenOf("UF-01.2")).toBeInTheDocument();
    expect(at()).toBe("/welcome/goal");
    expect(new Set(visited)).toEqual(new Set(["/welcome/goal"]));
  });

  // The contrast, so the test above cannot pass by the stand-down having been disabled for every
  // transition: the same in-place `SIGNED_IN`, but the gate answers `present`, and T-0300b's
  // `guest-only` redirect must still fire.
  it("`/welcome/goal` still redirects on an in-place SIGNED_IN when the profile is `present`", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    loadProfile.mockResolvedValue(PROFILE_ROW);
    render(<Harness start="/welcome/goal" />);
    await waitFor(() => expect(screenOf("UF-01.2")).toBeInTheDocument());
    expect(locationRef).toBe("/welcome/goal");

    await act(async () => {
      authStateCallbacks.forEach((cb) => cb("SIGNED_IN", { user: { id: "u1" } }));
    });
    await waitFor(() => expect(screenOf("UF-02.1")).toBeInTheDocument());
    expect(locationRef).toBe("/");
  });

  // `/account` is `guest-only` too, and the stand-down is keyed on the pathname, so it must be
  // unaffected in every case. The expected destination is asserted exactly, not just
  // "somewhere other than /account": a stand-down that leaked to `/account` would leave the
  // user *on* `/account`, but so would several other bugs, and only the exact target
  // distinguishes "redirected correctly" from "redirected somewhere odd".
  it.each([
    ["missing", stateMissing, "/welcome/save", "UF-01.5-save"],
    ["present", statePresent, "/", "UF-02.1"],
    ["unknown", stateUnknown, "/", "UF-02.1"],
  ])(
    "/account redirects for a `%s` profile too (it is not stood down)",
    async (_name, seed, expected, expectedScreen) => {
      seed();
      render(<Harness start="/account" />);
      // `missing` lands on /welcome/save via the gate on `/`; the others land on `/`.
      await waitFor(() => expect(locationRef).toBe(expected));
      await act(async () => {});
      expect(locationRef).toBe(expected);
      await waitFor(() => expect(screenOf(expectedScreen)).toBeInTheDocument());
      expect(screenOf("UF-01.5")).not.toBeInTheDocument();
    },
  );

  // Slow network, signed in: the gate's source never settles, so `resolved` never flips. The
  // stand-down must fail *open* — hold the `guest-only` redirect and render `/welcome/*` —
  // rather than leave the route permanently un-standable-down or blank. There is no timeout in
  // the gate, so "never settles" is the worst case, and this pins which way it fails.
  it.each(["/welcome"])(
    "%s renders for a signed-in user whose profile read never settles (fails open)",
    async (path) => {
      seedValidSession();
      vi.stubGlobal("navigator", { onLine: true });
      loadProfile.mockReturnValue(new Promise(() => {}));
      render(<Harness start={path} />);
      await waitFor(() => expect(screenOf("UF-01.1")).toBeInTheDocument());
      await act(async () => {});
      await act(async () => {});
      expect(screenOf("UF-01.1")).toBeInTheDocument();
      expect(locationRef).toBe(path);
    },
  );

  it("/welcome/save renders for a signed-in user whose profile read never settles (fails open)", async () => {
    seedValidSession();
    vi.stubGlobal("navigator", { onLine: true });
    loadProfile.mockReturnValue(new Promise(() => {}));
    render(<Harness start="/welcome/save" />);
    await waitFor(() => expect(screenOf("UF-01.5-save")).toBeInTheDocument());
    await act(async () => {});
    await act(async () => {});
    expect(screenOf("UF-01.5-save")).toBeInTheDocument();
    expect(locationRef).toBe("/welcome/save");
  });

  it("/welcome/goal renders for a signed-in user whose profile read never settles (fails open)", async () => {
    seedValidSession();
    vi.stubGlobal("navigator", { onLine: true });
    loadProfile.mockReturnValue(new Promise(() => {}));
    render(<Harness start="/welcome/goal" />);
    await waitFor(() => expect(screenOf("UF-01.2")).toBeInTheDocument());
    await act(async () => {});
    await act(async () => {});
    expect(screenOf("UF-01.2")).toBeInTheDocument();
    expect(locationRef).toBe("/welcome/goal");
  });
});

describe("AC-8 /session/:sessionId and its summary are never gated (principle 1)", () => {
  it.each([
    ["/session/0b9e1f", "UF-09"],
    ["/session/0b9e1f/summary", "UF-03.3"],
  ])("signed in + `missing`: %s renders %s", async (path, screenId) => {
    stateMissing();
    render(<Harness start={path} />);
    await waitFor(() => expect(screenOf(screenId)).toBeInTheDocument());
    await act(async () => {});
    expect(screenOf(screenId)).toBeInTheDocument();
    expect(locationRef).toBe(path);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });

  it.each([
    ["/session/0b9e1f", "UF-09"],
    ["/session/0b9e1f/summary", "UF-03.3"],
  ])("%s stays on screen when the status settles to `missing` late", async (path, screenId) => {
    seedValidSession();
    vi.stubGlobal("navigator", { onLine: true });
    spy.setRows("profiles", []);
    let release: (() => void) | undefined;
    loadProfile.mockImplementation(
      () => new Promise<null>((resolve) => (release = () => resolve(null))),
    );

    render(<Harness start={path} />);
    await waitFor(() => expect(screenOf(screenId)).toBeInTheDocument());
    await waitFor(() => expect(release).toBeDefined());
    // Now let the gate resolve, to `missing`, with the session route already mounted.
    await act(async () => {
      release!();
      await Promise.resolve();
    });
    await act(async () => {});
    expect(screenOf(screenId)).toBeInTheDocument();
    expect(locationRef).toBe(path);
  });

  // The contrast: a loose `/session/*` prefix exclusion would make this fail.
  it("signed in + `missing`: /session/setup DOES redirect to /welcome/save", async () => {
    stateMissing();
    render(<Harness start="/session/setup" />);
    await waitFor(() => expect(locationRef).toBe("/welcome/save"));
    expect(screenOf("UF-08.1")).not.toBeInTheDocument();
  });
});

// QA (T-0301a): the account switch, found by QA and fixed in the T-0301a rework. The gate used
// to re-resolve only on `signedIn` flipping, because `run()`'s dep list was `[signedIn]` and the
// transition check keyed on the same boolean. A `SIGNED_IN` for a *different user* with no
// intervening `SIGNED_OUT` leaves `signedIn === true`, so nothing re-ran and user B inherited
// user A's answer: `present` → B is never gated (the silent-corruption class D-0064 §9 exists to
// close), `missing` → B is stranded on onboarding.
//
// This is reachable through the product's own UI, not a synthetic event: AC-7 requires
// `/welcome/*` to render for a signed-in `missing` user, and that splat screen
// (`features/UF-01/index.tsx`) is the live email + code form calling `requestMagicLink` /
// `verifyCode`. So a `missing` user standing down on `/welcome` can verify a different account
// without ever signing out, which is exactly this sequence.
//
// The fix (D-0073 §4): `useAuth()` publishes `userId`, read from the stored session on the first
// render and from each auth event's session after that, and the gate keys both `run()` and its
// render-phase transition check on that identity instead of on the signed-in boolean. A
// signed-in → signed-in identity change also resets `status` to `"unknown"`, so neither
// direction can be answered with the previous user's result. Both cases were `it.fails` when QA
// filed them; they are plain `it` now and must stay passing.
describe("QA: a SIGNED_IN for a different user re-resolves the gate", () => {
  it("`present` → switch to an account with NO profile: the new user is gated", async () => {
    // User A is signed in with a cached profile, on `/`.
    statePresent();
    render(<Harness start="/" />);
    await waitFor(() => expect(screenOf("UF-02.1")).toBeInTheDocument());

    // User B verifies. No SIGNED_OUT: supabase-js fires SIGNED_IN for the new session.
    // B has no cache and no row, so B must be sent to /welcome/save.
    loadProfile.mockResolvedValue(null);
    spy.setRows("profiles", []);
    await act(async () => {
      authStateCallbacks.forEach((cb) => cb("SIGNED_IN", { user: { id: "u2" } }));
    });
    await act(async () => {});
    await act(async () => {});
    await act(async () => {});
    expect(locationRef).toBe("/welcome/save");
  });

  it("`missing` on /welcome → switch to an account that HAS a profile: no longer stood down", async () => {
    // User A is signed in, `missing`, standing down on /welcome (AC-7) with the OTP form.
    stateMissing();
    render(<Harness start="/welcome" />);
    await waitFor(() => expect(screenOf("UF-01.1")).toBeInTheDocument());
    expect(locationRef).toBe("/welcome");

    // User B verifies on that form. B *has* a profile, so `guest-only` must resume and take
    // them into the app rather than leaving them stranded on onboarding.
    loadProfile.mockResolvedValue(PROFILE_ROW);
    spy.setRows("profiles", [PROFILE_ROW]);
    await act(async () => {
      authStateCallbacks.forEach((cb) => cb("SIGNED_IN", { user: { id: "u2" } }));
    });
    await act(async () => {});
    await act(async () => {});
    await act(async () => {});
    expect(locationRef).toBe("/");
    await waitFor(() => expect(screenOf("UF-02.1")).toBeInTheDocument());
  });

  // The two cases above are satisfied by re-running the resolution alone, because both end
  // states are right once B's own answer lands. This one pins the *window* in between, which
  // re-running does not cover: `ProfileGate` keys on `status` only and ignores `resolved`, so
  // for as long as the held `status` is user A's, every gated route is deciding B's fate from
  // A's profile. A's answer must therefore be dropped at the identity change, during render,
  // not merely overwritten whenever B's read happens to settle. With B's read never settling,
  // the window is unbounded and the whole sequence of committed statuses is observable.
  it("no committed frame carries the previous user's status once the identity changes", async () => {
    const committed: string[] = [];
    function StatusProbe() {
      committed.push(useProfileStatus());
      return null;
    }
    statePresent();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <ProfileStatusProvider>
            <StatusProbe />
            <Shell />
          </ProfileStatusProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(committed).toContain("present"));

    // User B verifies in place, and B's profile read never settles.
    loadProfile.mockReturnValue(new Promise(() => {}));
    committed.length = 0;
    await act(async () => {
      authStateCallbacks.forEach((cb) => cb("SIGNED_IN", { user: { id: "u2" } }));
    });
    await act(async () => {});
    await act(async () => {});

    // Every frame after the switch is `unknown`: A's `present` is gone, and B has not answered.
    expect(committed.length).toBeGreaterThan(0);
    expect(committed).not.toContain("present");
    expect(new Set(committed)).toEqual(new Set(["unknown"]));
  });
});

describe("AC-9 signed out is unchanged (principle 5) — the AC-B5 table, against the wired shell", () => {
  it.each(["/", "/library", "/progress", "/balance", "/plan", "/session/setup"])(
    "signed out: %s renders UF-01.1",
    async (path) => {
      render(<Harness start={path} />);
      await waitFor(() => expect(screenOf("UF-01.1")).toBeInTheDocument());
    },
  );

  it.each(["/welcome"])("signed out: %s renders UF-01.1", async (path) => {
    render(<Harness start={path} />);
    await waitFor(() => expect(screenOf("UF-01.1")).toBeInTheDocument());
    expect(locationRef).toBe(path);
  });

  it("signed out: /welcome/goal renders UF-01.2", async () => {
    render(<Harness start="/welcome/goal" />);
    await waitFor(() => expect(screenOf("UF-01.2")).toBeInTheDocument());
    expect(locationRef).toBe("/welcome/goal");
  });

  it.each([
    ["/account", "UF-01.5"],
    ["/auth/callback", "UF-01.5-auth-callback"],
  ])("signed out: %s renders %s", async (path, screenId) => {
    render(<Harness start={path} />);
    await waitFor(() => expect(screenOf(screenId)).toBeInTheDocument());
    expect(locationRef).toBe(path);
  });
});

// QA (T-0301a): D-0073 §3 decides that `stale` is gated too ("the gate is active whenever
// `status !== "signed-out"`"), and flags it as the one of its three defaults a reviewer is most
// likely to push back on — a `stale` user landing on `/welcome/save` unexpectedly. It had no
// test, so the decision was unpinned: the `authStatus !== "signed-out"` in `profile-context.tsx`
// could be narrowed to `=== "signed-in"` with the whole suite still green. This pins it, so a
// future change of mind has to be a deliberate edit to a test that names the decision.
describe("QA: D-0073 §3 — a `stale` session is gated too", () => {
  it("stale + `missing` on `/` redirects to /welcome/save", async () => {
    // An expired token makes the initial status `stale`; `getSession` never settling keeps it
    // there, so the gate is observed against a genuinely `stale` auth status.
    window.localStorage.setItem(
      "sb-abc-auth-token",
      JSON.stringify({
        access_token: "tok",
        expires_at: Math.floor(Date.now() / 1000) - 100,
        user: { id: "u1" },
      }),
    );
    vi.stubGlobal("navigator", { onLine: true });
    getSession.mockReturnValue(new Promise(() => {}));
    loadProfile.mockResolvedValue(null);
    spy.setRows("profiles", []);

    render(<Harness start="/" />);
    await waitFor(() => expect(locationRef).toBe("/welcome/save"));
    await waitFor(() => expect(screenOf("UF-01.5-save")).toBeInTheDocument());
    // The mechanism, not just the destination: the gate really did read `profiles` for a
    // `stale` user, rather than the redirect coming from the auth guard.
    expect(spy.countFor("profiles")).toBe(1);
  });

  it("stale + `present` renders `/` (a stale user is not bounced when they do have a profile)", async () => {
    window.localStorage.setItem(
      "sb-abc-auth-token",
      JSON.stringify({
        access_token: "tok",
        expires_at: Math.floor(Date.now() / 1000) - 100,
        user: { id: "u1" },
      }),
    );
    vi.stubGlobal("navigator", { onLine: true });
    getSession.mockReturnValue(new Promise(() => {}));
    loadProfile.mockResolvedValue(PROFILE_ROW);

    render(<Harness start="/" />);
    await waitFor(() => expect(screenOf("UF-02.1")).toBeInTheDocument());
    await act(async () => {});
    expect(locationRef).toBe("/");
  });
});

describe("AC-10 signed out: the gate costs nothing (principle 5)", () => {
  it("/welcome renders on the first committed render, with no loader, refresh or select", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    getSession.mockReturnValue(new Promise(() => {}));
    // Warm-up (D-0103 §2): the shell renders every route through `React.lazy`, so "the first
    // committed render" means once this route's chunk is loaded. Load it here, in this test,
    // with the same route and auth state, so the check never depends on test order.
    render(<Harness start="/welcome" />);
    await screen.findByRole("heading", { level: 1, name: "Train with a plan. Log in seconds." });
    cleanup();
    // Clear call history only: every implementation (the never-settling `getSession`, the
    // stubbed `fetch`, the `from` spy) stays. `spy.calls` backs `countFor`, a counter, not a mock.
    loadProfile.mockClear();
    refreshProfile.mockClear();
    spy.from.mockClear();
    spy.calls.length = 0;
    render(<Harness start="/welcome" />);
    // Synchronous: no `await`/`waitFor` before these assertions (the T-0300b AC-B6 pattern).
    expect(
      screen
        .getByRole("heading", { level: 1, name: "Train with a plan. Log in seconds." })
        .closest('[data-screen-id="UF-01.1"]'),
    ).toBeInTheDocument();
    expect(loadProfile).not.toHaveBeenCalled();
    expect(refreshProfile).not.toHaveBeenCalled();
    expect(spy.from).not.toHaveBeenCalled();
    expect(spy.countFor("profiles")).toBe(0);
  });

  // The order-independent twin (D-0103 §3): no warm-up, so the chunk may be cold. With `fetch`
  // and `getSession` never settling, UF-01.1 can only appear if nothing waits on the network.
  it("/welcome renders UF-01.1 without a warm-up, with no loader, refresh or select (twin)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    getSession.mockReturnValue(new Promise(() => {}));
    render(<Harness start="/welcome" />);
    expect(loadProfile).not.toHaveBeenCalled();
    expect(refreshProfile).not.toHaveBeenCalled();
    expect(spy.from).not.toHaveBeenCalled();
    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Train with a plan. Log in seconds.",
    });
    expect(heading.closest('[data-screen-id="UF-01.1"]')).toBeInTheDocument();
  });

  it("and still nothing after the tree settles", async () => {
    render(<Harness start="/welcome" />);
    await waitFor(() => expect(screenOf("UF-01.1")).toBeInTheDocument());
    await act(async () => {});
    expect(loadProfile).not.toHaveBeenCalled();
    expect(refreshProfile).not.toHaveBeenCalled();
    expect(spy.countFor("profiles")).toBe(0);
  });
});

describe("AC-11 recheckProfile after a /welcome/save write, with no loop back", () => {
  it("`missing` on /welcome/save → recheck finds a row → navigating to / lands on UF-02.1", async () => {
    stateMissing();
    render(<Harness start="/welcome/save" />);
    await waitFor(() => expect(screenOf("UF-01.5-save")).toBeInTheDocument());
    expect(locationRef).toBe("/welcome/save");

    // T-0301c's write lands: the row now exists.
    spy.setRows("profiles", [PROFILE_ROW]);
    await act(async () => {
      await recheckRef!();
    });

    act(() => navigateRef!("/"));
    await waitFor(() => expect(screenOf("UF-02.1")).toBeInTheDocument());
    expect(locationRef).toBe("/");

    // No loop: it is still `/` after another settled tick.
    await act(async () => {});
    await act(async () => {});
    expect(locationRef).toBe("/");
    expect(screenOf("UF-02.1")).toBeInTheDocument();
  });

  it("without the recheck, the same navigation bounces back to /welcome/save", async () => {
    // The contrast that proves the test above is measuring the recheck, not the navigation.
    stateMissing();
    render(<Harness start="/welcome/save" />);
    await waitFor(() => expect(locationRef).toBe("/welcome/save"));
    spy.setRows("profiles", [PROFILE_ROW]);
    act(() => navigateRef!("/"));
    await waitFor(() => expect(locationRef).toBe("/welcome/save"));
  });
});
