// T-0301a AC-5..AC-12: the profile gate wired into the real shell (D-0064 §9, D-0071 §11,
// D-0073). Same harness as `auth-guard.phase3.test.tsx` — `MemoryRouter` + `AuthProvider` +
// `Shell`, `vi.mock` of `lib/auth/client.js`, `seedValidSession()` — plus the
// `ProfileStatusProvider` the real `App` mounts. `lib/offline` and `supabase.from` are mocked
// with the `select-spy.ts` pattern. Every assertion is on behaviour: which screen id is on the
// DOM, which router location settled, which spy was called.
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Shell } from "../App.js";
import { AuthProvider } from "../../lib/auth/auth-context.js";
import { ProfileStatusProvider, useRecheckProfile } from "../../lib/profile/index.js";
import { gatedPaths } from "../../lib/profile/gated-routes.js";
import { routes } from "../routes.js";
import { createSelectSpy, type SelectSpy } from "../../lib/offline/__tests__/select-spy.js";

const { loadProfile, refreshProfile } = vi.hoisted(() => ({
  loadProfile: vi.fn(),
  refreshProfile: vi.fn(),
}));
vi.mock("../../lib/offline/index.js", () => ({ loadProfile, refreshProfile }));

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
    // `SelectSpy.from` is typed `ReturnType<typeof vi.fn>`, which `tsc` widens to
    // `Mock<Procedure | Constructable>` and therefore does not treat as callable. The cast is
    // on the *call*, so the holder keeps the real `SelectSpy` type and `setRows`/`countFor`
    // stay checked. (Tightening `select-spy.ts` itself belongs to T-0319's file, not this
    // ticket — see the follow-up in the result.)
    from: (table: string) => (selectSpy.current!.from as (t: string) => unknown)(table),
  },
}));
selectSpy.current = createSelectSpy();
const spy = selectSpy.current;

const PROFILE_ROW = { id: "u1", goal: "build" };

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
});

afterEach(() => {
  vi.unstubAllGlobals();
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

describe("the gated set is derived from routes.ts, with an exact expected count", () => {
  it("is the 12 `protected` entries plus /session/setup, and nothing else", () => {
    const protectedCount = routes.filter((r) => r.guard === "protected").length;
    expect(protectedCount).toBe(12);
    expect(gatedPaths(routes)).toHaveLength(13);
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
      "/plan/routines/new",
      "/plan/routines/R1",
      "/session/setup",
    ]);
  });
});

describe("AC-5 signed in + `missing`: every gated route redirects to /welcome/save", () => {
  it.each(GATED)("%s redirects to /welcome/save", async (path) => {
    stateMissing();
    render(<Harness start={path} />);
    await waitFor(() => expect(screenOf("UF-01.1")).toBeInTheDocument());
    expect(locationRef).toBe("/welcome/save");
  });

  it("visits a non-zero number of paths", () => {
    expect(GATED.length).toBe(13);
  });
});

describe("AC-6 `unknown` and `present` never redirect (the contrast to AC-5)", () => {
  it.each(GATED)("`unknown`: %s renders %s, not /welcome/save", async (path, screenId) => {
    stateUnknown();
    render(<Harness start={path} />);
    await waitFor(() => expect(screenOf(screenId)).toBeInTheDocument());
    // Settle one more tick, so a late redirect would still be caught.
    await act(async () => {});
    expect(screenOf(screenId)).toBeInTheDocument();
    expect(locationRef).toBe(path);
    expect(screenOf("UF-01.1")).not.toBeInTheDocument();
  });

  it.each(GATED)("`present`: %s renders %s, not /welcome/save", async (path, screenId) => {
    statePresent();
    render(<Harness start={path} />);
    await waitFor(() => expect(screenOf(screenId)).toBeInTheDocument());
    await act(async () => {});
    expect(locationRef).toBe(path);
    expect(screenOf("UF-01.1")).not.toBeInTheDocument();
  });
});

describe("AC-7 /welcome/* renders instead of redirecting for a `missing` profile", () => {
  it.each(["/welcome/save", "/welcome", "/welcome/goal"])(
    "signed in + `missing`: %s renders UF-01.1 and stays put",
    async (path) => {
      stateMissing();
      render(<Harness start={path} />);
      await waitFor(() => expect(screenOf("UF-01.1")).toBeInTheDocument());
      await act(async () => {});
      expect(screenOf("UF-01.1")).toBeInTheDocument();
      expect(locationRef).toBe(path);
    },
  );

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
  it.each(["/welcome", "/welcome/goal", "/welcome/save"])(
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

  it.each([
    ["missing", stateMissing],
    ["present", statePresent],
    ["unknown", stateUnknown],
  ])("/account redirects for a `%s` profile too (it is not stood down)", async (_name, seed) => {
    seed();
    render(<Harness start="/account" />);
    await waitFor(() => expect(screenOf("UF-01.5")).not.toBeInTheDocument());
    await act(async () => {});
    // `missing` lands on /welcome/save via the gate on `/`; the others land on `/`.
    expect(locationRef).not.toBe("/account");
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

describe("AC-9 signed out is unchanged (principle 5) — the AC-B5 table, against the wired shell", () => {
  it.each(["/", "/library", "/progress", "/balance", "/plan", "/session/setup"])(
    "signed out: %s renders UF-01.1",
    async (path) => {
      render(<Harness start={path} />);
      await waitFor(() => expect(screenOf("UF-01.1")).toBeInTheDocument());
    },
  );

  it.each(["/welcome", "/welcome/goal"])("signed out: %s renders UF-01.1", async (path) => {
    render(<Harness start={path} />);
    await waitFor(() => expect(screenOf("UF-01.1")).toBeInTheDocument());
    expect(locationRef).toBe(path);
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

describe("AC-10 signed out: the gate costs nothing (principle 5)", () => {
  it("/welcome renders on the first committed render, with no loader, refresh or select", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    getSession.mockReturnValue(new Promise(() => {}));
    render(<Harness start="/welcome" />);
    // Synchronous: no `await`/`waitFor` before these assertions (the T-0300b AC-B6 pattern).
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(loadProfile).not.toHaveBeenCalled();
    expect(refreshProfile).not.toHaveBeenCalled();
    expect(spy.from).not.toHaveBeenCalled();
    expect(spy.countFor("profiles")).toBe(0);
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
    await waitFor(() => expect(screenOf("UF-01.1")).toBeInTheDocument());
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
