// T-0318 AC-5: the guards on the 6 new routes. Same harness as `auth-guard.test.tsx`
// (AC-B5/AC-B7), which stays unchanged: signed out, each new `protected` path redirects to
// the auth flow, and `/session/:sessionId/summary` behaves like `/session/:sessionId` —
// the `session` guard is decided once at mount, so an expiry mid-summary never redirects
// or shows a banner (principle 1, D-0071 §2).
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Shell } from "../App.js";
import { AuthProvider } from "../../lib/auth/auth-context.js";
import { freshOfflineDb, signIn } from "../../lib/offline/__tests__/test-helpers.js";
import { seedLibrary } from "../../lib/offline/__tests__/seed-library.js";
import type { CachedLibraryExercise } from "../../lib/offline/db.js";

const { onAuthStateChange, getSession, signOut, authStateCallbacks } = vi.hoisted(() => {
  const authStateCallbacks: Array<(event: string, session: unknown) => void> = [];
  return {
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
  supabase: { auth: { onAuthStateChange, getSession, signOut } },
}));

// UF-06.2 (`/progress/:exerciseId`) reads the T-0319 loaders and redirects to `/progress` when
// its id is not a known exercise (D-0079 §4). The "signed in" contrast case below asserts the
// route *reaches its screen*, so the library must contain `back-squat`; with the empty cache a
// stub never touched, the screen would leave for its own reasons and the guard would no longer
// be what the case tests (D-0088 §2: keep the guarantee, seed the fixture). Only the UF-06
// loaders are overridden, so every other route keeps the real `lib/offline`.
vi.mock("../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/offline/index.js")>();
  return {
    ...actual,
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
  };
});

let navigateRef: ((path: string) => void) | undefined;
/** The router's current pathname, so a test can check that the location holds (T-0365). */
let pathnameRef: string | undefined;

function NavHelper() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    pathnameRef = location.pathname;
  }, [location.pathname]);
  useEffect(() => {
    navigateRef = (path: string) => navigate(path);
  }, [navigate]);
  return null;
}

function Harness({ start }: { start: string }) {
  return (
    <MemoryRouter initialEntries={[start]}>
      <AuthProvider>
        <NavHelper />
        <Shell />
      </AuthProvider>
    </MemoryRouter>
  );
}

function seedValidSession() {
  window.localStorage.setItem(
    "sb-abc-auth-token",
    JSON.stringify({ access_token: "tok", expires_at: Math.floor(Date.now() / 1000) + 3600 }),
  );
}

function seedExpiredSession() {
  window.localStorage.setItem(
    "sb-abc-auth-token",
    JSON.stringify({ access_token: "tok", expires_at: Math.floor(Date.now() / 1000) - 60 }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  navigateRef = undefined;
  pathnameRef = undefined;
  authStateCallbacks.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The new `protected` routes, with the screen each must reach once signed in. */
const NEW_PROTECTED_PATHS = [
  ["/library/back-squat/compare/leg-press", "UF-04.3"],
  ["/progress/back-squat", "UF-06.2"],
  ["/plan/edit", "UF-11.3"],
  ["/plan/routines/new", "UF-07.1"],
  ["/plan/routines/R1", "UF-07.1"],
] as const;

/** UF-04.3 leaves the signed-in `it.each`: it gets its own seeded case below (T-0365, D-0088 §2). */
const COMPARE_PATH = "/library/back-squat/compare/leg-press";
const SIGNED_IN_PATHS = NEW_PROTECTED_PATHS.filter(([path]) => path !== COMPARE_PATH);

describe("AC-5 the new protected routes redirect when signed out (as AC-B5)", () => {
  it.each(NEW_PROTECTED_PATHS)("signed out: %s redirects to /welcome", async (path) => {
    render(<Harness start={path} />);
    await waitFor(() => {
      expect(document.querySelector('[data-screen-id="UF-01.1"]')).toBeInTheDocument();
    });
  });

  // The contrast case: without it, the redirect above would also pass if the route simply
  // never rendered. `waitFor` on the *expected* id, not on the absence of UF-01.1, which
  // would be satisfied by the empty first render before the lazy chunk resolves.
  it.each(SIGNED_IN_PATHS)("signed in: %s renders %s", async (path, screenId) => {
    seedValidSession();
    render(<Harness start={path} />);
    await waitFor(() => {
      expect(document.querySelector(`[data-screen-id="${screenId}"]`)).toBeInTheDocument();
    });
    expect(document.querySelector('[data-screen-id="UF-01.1"]')).not.toBeInTheDocument();
  });
});

// T-0365 AC-1 (D-0088 §2, D-0091 §1): the built Compare screen renders a UF-04.3 wrapper
// during its first cache read, then redirects to /library when the exercise isn't cached
// (D-0079 §3). So this case seeds the library for the signed-in user, runs offline (no refresh,
// no `supabase.from`), and asserts the built table and that the location holds.
describe("T-0365 signed in: UF-04.3 with a seeded library", () => {
  const USER_ID = "u-t0365";
  const exercise = (id: string, name: string): CachedLibraryExercise["exercise"] => ({
    id,
    name,
    kind: "exercise",
    type: "compound",
    level: "intermediate",
    equipment: ["machine"],
    areas: { quads: 1, glutes: 1 },
    timed: false,
    defaultDurationS: null,
    incrementKg: 2.5,
    externalLoad: true,
  });
  let onLine: PropertyDescriptor | undefined;

  beforeEach(async () => {
    freshOfflineDb();
    onLine = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    signIn(USER_ID);
    await seedLibrary(USER_ID, [
      exercise("back-squat", "Back squat"),
      exercise("leg-press", "Leg press"),
    ]);
  });

  afterEach(() => {
    if (onLine) Object.defineProperty(window.navigator, "onLine", onLine);
    else delete (window.navigator as { onLine?: boolean }).onLine;
    freshOfflineDb();
  });

  it(`signed in: ${COMPARE_PATH} renders the built UF-04.3 and stays`, async () => {
    render(<Harness start={COMPARE_PATH} />);
    expect(await screen.findByRole("columnheader", { name: "Leg press" })).toBeInTheDocument();
    expect(await screen.findByRole("columnheader", { name: "Back squat" })).toBeInTheDocument();
    // One macrotask turn, so a redirect queued behind the cache read would have landed.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(document.querySelector('[data-screen-id="UF-04.3"]')).toBeInTheDocument();
    expect(pathnameRef).toBe(COMPARE_PATH);
    expect(screen.getByRole("columnheader", { name: "Leg press" })).toBeInTheDocument();
    expect(document.querySelector('[data-screen-id="UF-01.1"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-screen-id="UF-04.1"]')).not.toBeInTheDocument();
  });
});

describe("AC-5 /session/:sessionId/summary uses the `session` guard", () => {
  it("signed out it redirects, like /session/:sessionId", async () => {
    render(<Harness start="/session/S1/summary" />);
    await waitFor(() => {
      expect(document.querySelector('[data-screen-id="UF-01.1"]')).toBeInTheDocument();
    });
  });

  it("a stale token that fails to refresh does not redirect or warn (decided once at mount)", async () => {
    seedExpiredSession();
    vi.stubGlobal("navigator", { onLine: true });
    getSession.mockResolvedValue({
      data: { session: null },
      error: { status: 400, message: "invalid_grant" },
    });

    render(<Harness start="/session/S1/summary" />);
    await waitFor(() => {
      expect(document.querySelector('[data-screen-id="UF-03.3"]')).toBeInTheDocument();
    });
    await waitFor(() => expect(getSession).toHaveBeenCalled());

    expect(document.querySelector('[data-screen-id="UF-03.3"]')).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();

    // Leaving the session routes is where the auth decision is taken again (AC-B7).
    act(() => navigateRef!("/"));
    await waitFor(() => {
      expect(document.querySelector('[data-screen-id="UF-01.5"]')).toBeInTheDocument();
    });
  });

  it("a SIGNED_OUT event while on the summary keeps it on screen", async () => {
    seedValidSession();
    render(<Harness start="/session/S1/summary" />);
    await waitFor(() => {
      expect(document.querySelector('[data-screen-id="UF-03.3"]')).toBeInTheDocument();
    });
    await waitFor(() => expect(authStateCallbacks.length).toBeGreaterThan(0));

    act(() => {
      for (const cb of authStateCallbacks) cb("SIGNED_OUT", null);
    });

    expect(document.querySelector('[data-screen-id="UF-03.3"]')).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a SIGNED_OUT event on /plan/edit (a `protected` route) does redirect", async () => {
    // The contrast case: without it, the test above would also pass if every new route were
    // wired to the `session` guard by mistake.
    seedValidSession();
    render(<Harness start="/plan/edit" />);
    await waitFor(() => {
      expect(document.querySelector('[data-screen-id="UF-11.3"]')).toBeInTheDocument();
    });
    await waitFor(() => expect(authStateCallbacks.length).toBeGreaterThan(0));

    act(() => {
      for (const cb of authStateCallbacks) cb("SIGNED_OUT", null);
    });

    await waitFor(() => {
      expect(document.querySelector('[data-screen-id="UF-11.3"]')).not.toBeInTheDocument();
    });
  });
});
