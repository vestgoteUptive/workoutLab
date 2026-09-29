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
    },
  );
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

  // The same bounce, reached by a *transition* instead of a cold load — and this is the primary
  // path, not an edge case: D-0045 §5 is the magic link / OTP verify firing `SIGNED_IN` in place
  // while the user sits on `/welcome`, with the onboarding answers in this browser context and
  // no `profiles` row yet. `resolved` comes from a `useState` initialiser, which runs once, so
  // before the fix it was still `true` from the signed-out render when `signedIn` flipped: the
  // stand-down saw `resolved && "unknown"`, stood aside, and the user went
  // `/welcome` → `/` → `/welcome/save`. The cold-load tests above cannot catch it, because they
  // never change the auth status after mount.
  it.each(["/welcome", "/welcome/goal"])(
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

  // The contrast, so the test above cannot pass by the stand-down having been disabled for every
  // transition: the same in-place `SIGNED_IN`, but the gate answers `present`, and T-0300b's
  // `guest-only` redirect must still fire.
  it("`/welcome/goal` still redirects on an in-place SIGNED_IN when the profile is `present`", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    loadProfile.mockResolvedValue(PROFILE_ROW);
    render(<Harness start="/welcome/goal" />);
    await waitFor(() => expect(screenOf("UF-01.1")).toBeInTheDocument());
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
    ["missing", stateMissing, "/welcome/save", "UF-01.1"],
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
      expect(screenOf(expectedScreen)).toBeInTheDocument();
      expect(screenOf("UF-01.5")).not.toBeInTheDocument();
    },
  );

  // Slow network, signed in: the gate's source never settles, so `resolved` never flips. The
  // stand-down must fail *open* — hold the `guest-only` redirect and render `/welcome/*` —
  // rather than leave the route permanently un-standable-down or blank. There is no timeout in
  // the gate, so "never settles" is the worst case, and this pins which way it fails.
  it.each(["/welcome", "/welcome/goal", "/welcome/save"])(
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

// QA (T-0301a): the account switch. The only auth transition the gate re-resolves on is
// `signedIn` flipping, because `run()`'s dep list is `[signedIn]` and the `wasSignedIn` transition
// check only fires on that same flip. A `SIGNED_IN` for a *different user* with no intervening
// `SIGNED_OUT` leaves `signedIn === true`, so nothing re-runs and user B inherits user A's answer.
//
// This is reachable through the product's own UI, not a synthetic event: AC-7 requires
// `/welcome/*` to render for a signed-in `missing` user, and that splat screen
// (`features/UF-01/index.tsx`) is the live email + code form calling `requestMagicLink` /
// `verifyCode`. So a `missing` user standing down on `/welcome` can verify a different account
// without ever signing out, which is exactly this sequence.
// Both cases below are **currently broken**, so they are `it.fails`: the assertion is the
// behaviour the gate must have, and vitest fails the test if it ever starts passing. Whoever
// fixes the gate (web-shell owns `lib/profile`) flips these two to `it` in the same commit.
// Filed as a follow-up in the QA result; the fix needs a user identity the gate can compare,
// which `useAuth()` does not expose today (it publishes `status` only), so it is not a
// test-only change and is out of QA's lane.
describe("QA: a SIGNED_IN for a different user re-resolves the gate", () => {
  it.fails("`present` → switch to an account with NO profile: the new user is gated", async () => {
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

  it.fails(
    "`missing` on /welcome → switch to an account that HAS a profile: no longer stood down",
    async () => {
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
      expect(screenOf("UF-02.1")).toBeInTheDocument();
    },
  );
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
    expect(screenOf("UF-01.1")).toBeInTheDocument();
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
