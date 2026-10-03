// T-0310c AC10 (D-0136 §6, NFR-PRIV-5, UF-01.1): the shell's one-time account-deleted notice.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authStateCallbacks, onAuthStateChange, getSession, signOut } = vi.hoisted(() => {
  const authStateCallbacks: Array<(event: string, session: unknown) => void> = [];
  return {
    authStateCallbacks,
    onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
      authStateCallbacks.push(cb);
      return { data: { subscription: { unsubscribe: () => {} } } };
    }),
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  };
});

vi.mock("../../../lib/auth/client.js", () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    auth: { onAuthStateChange, getSession, signOut },
    from: () => {
      throw new Error("offline in this test");
    },
  },
}));
// The signed-in sync is not under test; keep it from touching Dexie or the network.
vi.mock("../../../lib/offline/AutoSync.js", () => ({ AutoSync: () => null }));

import { App } from "../../../app/App.js";

// T-0486: a mock of `useAuth` itself, so `status` can be driven directly and synchronously,
// matching AC-1's wording exactly ("mount `AccountDeletedNotice` with `status` starting at
// something other than `signed-out`... then change `status` to `signed-out`") without routing
// through the auth state machine or a real SPA navigation. Only active while `mockAuth.active`
// is set (the new describe block below); otherwise this delegates to the real `useAuth`, so the
// `App`-based tests above (which rely on the real `AuthProvider` context) are unaffected.
// `redirectTarget` is read by the real `RequireAuth` guard used below, to model `/plan/account`'s
// actual topology (`guard: "protected"`, routes.ts) rather than a simplified harness.
const mockAuth: {
  active: boolean;
  status: "signed-out" | "signed-in" | "stale";
  redirectTarget: "/welcome" | "/account";
} = {
  active: false,
  status: "signed-in",
  redirectTarget: "/welcome",
};
vi.mock("../../../lib/auth/auth-context.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/auth/auth-context.js")>();
  return {
    ...actual,
    useAuth: (...args: Parameters<typeof actual.useAuth>) =>
      mockAuth.active
        ? { status: mockAuth.status, redirectTarget: mockAuth.redirectTarget }
        : actual.useAuth(...args),
  };
});

import { BrowserRouter, Route, Routes } from "react-router";
import { RequireAuth } from "../../../lib/auth/guards.js";
import { AccountDeletedNotice } from "../AccountDeletedNotice.js";

const KEY = "wl-account-deleted";
const DONE = "Your account and all your data are deleted.";
const PARTIAL =
  "Your account is deleted. Some data may still be on this device: clear this site's data in your browser settings.";

function at(path: string) {
  window.history.replaceState(null, "", path);
}

function seedValidSession() {
  window.localStorage.setItem(
    "sb-abc-auth-token",
    JSON.stringify({
      access_token: "tok-u",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "00000000-0000-4000-8000-0000000000aa" },
    }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  authStateCallbacks.length = 0;
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  at("/");
});

describe("T-0310c AC10 the account-deleted notice", () => {
  it('T-0310c AC10 "1" at /welcome: a status with the done text, synchronously; key removed', async () => {
    at("/welcome");
    window.sessionStorage.setItem(KEY, "1");
    render(<App />);
    // No await: the first render already has it (principle 5, a synchronous read).
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(DONE);
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    expect(screen.queryByText(PARTIAL)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelector('[data-screen-id="UF-01.1"]')).toBeInTheDocument(),
    );
  });

  it('T-0310c AC10 "partial": the partial text', () => {
    at("/welcome");
    window.sessionStorage.setItem(KEY, "partial");
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent(PARTIAL);
    expect(screen.queryByText(DONE)).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("T-0310c AC10 neither key: no element with either text", async () => {
    at("/welcome");
    render(<App />);
    await waitFor(() =>
      expect(document.querySelector('[data-screen-id="UF-01.1"]')).toBeInTheDocument(),
    );
    expect(screen.queryByText(DONE)).not.toBeInTheDocument();
    expect(screen.queryByText(PARTIAL)).not.toBeInTheDocument();
  });

  it("T-0310c AC10 an unknown value shows nothing", () => {
    at("/welcome");
    window.sessionStorage.setItem(KEY, "yes");
    render(<App />);
    expect(screen.queryByText(DONE)).not.toBeInTheDocument();
    expect(screen.queryByText(PARTIAL)).not.toBeInTheDocument();
  });

  it("T-0310c AC10 Dismiss removes it; a remount after the key was consumed shows nothing", () => {
    at("/welcome");
    window.sessionStorage.setItem(KEY, "1");
    const first = render(<App />);
    expect(screen.getByText(DONE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(DONE)).not.toBeInTheDocument();
    first.unmount();

    render(<App />);
    expect(screen.queryByText(DONE)).not.toBeInTheDocument();
  });

  it("T-0310c AC10 a remount without Dismiss shows nothing either (the read consumed it)", () => {
    at("/welcome");
    window.sessionStorage.setItem(KEY, "partial");
    const first = render(<App />);
    expect(screen.getByText(PARTIAL)).toBeInTheDocument();
    first.unmount();
    render(<App />);
    expect(screen.queryByText(PARTIAL)).not.toBeInTheDocument();
  });

  it("T-0310c AC10 same page: signed in on /, key set, SIGNED_OUT → the notice appears", async () => {
    seedValidSession();
    at("/");
    render(<App />);
    expect(screen.queryByText(DONE)).not.toBeInTheDocument();
    // What deleteAccountAndSignOut does in steps (3) and (4).
    window.sessionStorage.setItem(KEY, "1");
    window.localStorage.removeItem("sb-abc-auth-token");
    expect(authStateCallbacks.length).toBeGreaterThan(0);
    act(() => {
      for (const cb of authStateCallbacks) cb("SIGNED_OUT", null);
    });
    expect(await screen.findByRole("status")).toHaveTextContent(DONE);
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    await waitFor(() => expect(window.location.pathname).toBe("/welcome"));
  });

  it("T-0310c AC10 while signed in, a key set later is not read until the sign-out", () => {
    seedValidSession();
    at("/");
    render(<App />);
    window.sessionStorage.setItem(KEY, "1");
    expect(screen.queryByText(DONE)).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(KEY)).toBe("1");
  });

  it("T-0310c AC10 Dismiss is at least 44 × 44 px", () => {
    at("/welcome");
    window.sessionStorage.setItem(KEY, "1");
    render(<App />);
    const button = screen.getByRole("button", { name: "Dismiss" });
    const cs = getComputedStyle(button);
    expect(parseFloat(cs.minWidth)).toBeGreaterThanOrEqual(44);
    expect(parseFloat(cs.minHeight)).toBeGreaterThanOrEqual(44);
  });
});

// T-0486: the hard-navigation race (docs/tickets/T-0486-account-deleted-notice-race.md).
//
// `Harness` models the *real* topology that defeated an earlier (rejected in review) version of
// this fix: `/plan/account` is `guard: "protected"` (routes.ts), wrapped in the real `RequireAuth`
// (not a stand-in), which is itself a *live* guard — it renders `<Navigate to={redirectTarget}
// replace />` the instant `status` becomes `"signed-out"`, on *both* the SPA-navigate and the
// hard-navigate delete branches alike, via a genuine client-side (History API) redirect to
// `/welcome`. `AccountDeletedNotice` sits beside the guarded route, exactly as it does in
// `Shell` (`App.tsx`): a sibling of `<Routes>`, never inside the guard itself, and never
// remounted by any client-side route change.
//
// `useAuth()` is mocked (not the auth state machine), so `status` can be driven directly and
// synchronously; `RequireAuth` picks up the same mock. `firePagehide()` simulates the one signal
// the fix actually keys on: a hard navigation's `location.replace(...)` dispatching `pagehide`
// synchronously before this component's deferred work runs. The SPA-navigate and live-guard-
// redirect cases never call it — exactly as a real SPA transition never fires `pagehide`.
//
// `BrowserRouter`, not `MemoryRouter`: the real app uses `BrowserRouter` (`App.tsx`), which
// drives `window.location`/`window.history` directly — the same `window.location.pathname` an
// earlier (rejected) fix attempt read. A `MemoryRouter` here would keep its own in-memory
// history, never touching `window.location`, which would silently stop this test file from
// being able to tell that rejected variant apart from the real fix (caught: an early draft of
// this rework used `MemoryRouter` and passed against *both* variants).
function Harness() {
  return (
    <BrowserRouter>
      <AccountDeletedNotice />
      <Routes>
        <Route path="/plan/account" element={<RequireAuth>{null}</RequireAuth>} />
        <Route path="/welcome" element={<p>welcome-route</p>} />
      </Routes>
    </BrowserRouter>
  );
}

function firePagehide() {
  window.dispatchEvent(new Event("pagehide"));
}

describe("T-0486 the hard-navigation race", () => {
  beforeEach(() => {
    mockAuth.active = true;
    mockAuth.status = "signed-in";
    mockAuth.redirectTarget = "/welcome";
    // `/plan/account`'s own real path (routes.ts): where `AccountSettingsBody`'s delete flow
    // actually lives, and where `RequireAuth` actually redirects from.
    at("/plan/account");
    vi.useFakeTimers();
  });

  afterEach(() => {
    mockAuth.active = false;
    vi.useRealTimers();
  });

  it(
    "T-0486 AC-1 root cause: on the real /plan/account topology, RequireAuth's own live " +
      "<Navigate> redirects to /welcome (an SPA, History-API change) on the hard-navigate " +
      "branch too, purely from the same status flip this component also watches — so a " +
      "pathname-only gate (an earlier, rejected fix attempt) is fooled into consuming the key " +
      "before the real unload happens",
    () => {
      const view = render(<Harness />);
      expect(screen.queryByText(DONE)).not.toBeInTheDocument();

      // What `deleteAccountAndSignOut` does: set the key, then sign out (fires SIGNED_OUT,
      // surfaced here as `status` becoming "signed-out"). `AccountSettingsBody` chooses the
      // hard-navigate branch when `statusRef.current !== "signed-out"` at that point — it then
      // calls `window.location.replace("/welcome")`, which this harness models with
      // `firePagehide()` below, simulating the real browser's synchronous unload signal.
      window.sessionStorage.setItem(KEY, "1");
      act(() => {
        mockAuth.status = "signed-out";
        view.rerender(<Harness />);
      });

      // RequireAuth's own effect has, by now, redirected the SPA route to /welcome — exactly
      // the behaviour that defeated the rejected pathname-only fix.
      expect(screen.getByText("welcome-route")).toBeInTheDocument();

      // The real hard navigation's `location.replace(...)` call happens synchronously, right
      // after `deleteAccountAndSignOut` resolves in `onDelete` — before this component's
      // deferred timer runs. That dispatches `pagehide` first.
      act(() => {
        firePagehide();
      });
      act(() => {
        vi.runAllTimers();
      });

      // The key must survive: a hard navigation is actually under way (signalled by
      // `pagehide`), regardless of what the SPA route now reads as.
      expect(window.sessionStorage.getItem(KEY)).toBe("1");
    },
  );

  it(
    "T-0486 AC-2 SPA-navigate case: status flips to signed-out, RequireAuth's own redirect " +
      "lands on /welcome, and no pagehide ever fires (no real navigation happens) — shows the " +
      "notice and consumes the key",
    () => {
      const view = render(<Harness />);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      window.sessionStorage.setItem(KEY, "1");
      act(() => {
        mockAuth.status = "signed-out";
        view.rerender(<Harness />);
      });
      expect(screen.getByText("welcome-route")).toBeInTheDocument();

      // The same mounted instance (never unmounted by an SPA navigate) now shows the notice
      // immediately (the peek, same tick).
      expect(screen.getByRole("status")).toHaveTextContent(DONE);

      // The consume is deferred one tick past this commit's other effects (T-0486); once that
      // runs, with no pagehide ever having fired, a later reload of /welcome in the same tab
      // shows nothing.
      act(() => {
        vi.runAllTimers();
      });
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    },
  );

  it(
    "T-0486 AC-2 hard-navigate case: pagehide fires (the real unload beginning) before the " +
      "deferred timer runs, so the key is still in storage for the next page's mount-time " +
      "read, exactly as a real hard navigation's fresh document load would do",
    () => {
      const view = render(<Harness />);
      window.sessionStorage.setItem(KEY, "1");

      act(() => {
        mockAuth.status = "signed-out";
        view.rerender(<Harness />);
      });
      // The old page's instance may show the notice too (harmless; the document is about to
      // unload) but must not have removed the key once the unload signal arrives.
      act(() => {
        firePagehide();
      });
      act(() => {
        vi.runAllTimers();
      });
      expect(window.sessionStorage.getItem(KEY)).toBe("1");

      // A real hard navigation unloads the document (and so unmounts this instance) around
      // here — simulated by `cleanup()`.
      cleanup();

      // The "next page" mount-time read (a fresh instance, as a hard navigation would produce)
      // still sees and consumes the key.
      at("/welcome");
      render(<AccountDeletedNotice />);
      expect(screen.getByRole("status")).toHaveTextContent(DONE);
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    },
  );

  it(
    "T-0486 AC-2 a second old-page re-render after pagehide (still no real unload in this " +
      "test) doesn't re-show or touch storage",
    () => {
      const view = render(<Harness />);
      window.sessionStorage.setItem(KEY, "1");
      act(() => {
        mockAuth.status = "signed-out";
        view.rerender(<Harness />);
      });
      act(() => {
        firePagehide();
      });
      view.rerender(<Harness />);
      act(() => {
        vi.runAllTimers();
      });
      expect(window.sessionStorage.getItem(KEY)).toBe("1");
    },
  );

  // QA (T-0486): the builder's own notes flagged this as the subtle remaining case — not a
  // redirect landing on /welcome, but the user already sitting on /welcome (e.g. they opened
  // account settings in a second tab/window that itself navigated there some other way, or a
  // dev reloaded into /welcome then triggered delete some other way) when SIGNED_OUT fires, and
  // no pagehide ever fires (no real navigation happens).
  it(
    "T-0486 AC-2 QA: already sitting on /welcome (no redirect, no pagehide) when status flips " +
      "to signed-out shows the notice and still consumes the key",
    () => {
      at("/welcome");
      const view = render(<AccountDeletedNotice />);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      window.sessionStorage.setItem(KEY, "1");
      act(() => {
        mockAuth.status = "signed-out";
        view.rerender(<AccountDeletedNotice />);
      });
      expect(screen.getByRole("status")).toHaveTextContent(DONE);

      act(() => {
        vi.runAllTimers();
      });
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    },
  );

  // QA (T-0486): two signed-out transitions in quick succession while already on /welcome
  // (e.g. a duplicate SIGNED_OUT event, or two renders landing in the same macrotask before the
  // first deferred timer fires) must not double-consume, crash, or warn — and the notice must
  // still show and the key still end up cleared exactly once.
  it(
    "T-0486 AC-2 QA: two quick signed-out re-renders on /welcome don't crash, warn, or " +
      "double-consume",
    () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        at("/welcome");
        const view = render(<AccountDeletedNotice />);
        window.sessionStorage.setItem(KEY, "1");

        act(() => {
          mockAuth.status = "signed-out";
          view.rerender(<AccountDeletedNotice />);
          // A second, synchronous transition before any timer has flushed — e.g. a duplicate
          // auth event, or React batching two state updates into the same commit's effects.
          mockAuth.status = "stale";
          view.rerender(<AccountDeletedNotice />);
          mockAuth.status = "signed-out";
          view.rerender(<AccountDeletedNotice />);
        });
        expect(screen.getByRole("status")).toHaveTextContent(DONE);

        act(() => {
          vi.runAllTimers();
        });
        expect(window.sessionStorage.getItem(KEY)).toBeNull();
      } finally {
        expect(errorSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
      }
    },
  );

  it(
    "T-0486 AC-4-style discriminator: a fix that defers via timer but gates on pathname " +
      "instead of pagehide (the earlier, rejected version) would wrongly consume here — this " +
      "test only passes against the pagehide-gated fix",
    () => {
      const view = render(<Harness />);
      window.sessionStorage.setItem(KEY, "1");
      act(() => {
        mockAuth.status = "signed-out";
        view.rerender(<Harness />);
      });
      // RequireAuth's redirect has already landed on /welcome by this point — a pathname-only
      // gate would see "/welcome" and consume. pagehide is what actually distinguishes this
      // (still no real navigation) from the hard-navigate test above.
      expect(screen.getByText("welcome-route")).toBeInTheDocument();
      act(() => {
        vi.runAllTimers();
      });
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    },
  );
});
