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
// `Harness` models the *real* topology that defeated two earlier (rejected in review) versions
// of this fix: `/plan/account` is `guard: "protected"` (routes.ts), wrapped in the real
// `RequireAuth` (not a stand-in), which is itself a *live* guard — it renders
// `<Navigate to={redirectTarget} replace />` the instant `status` becomes `"signed-out"`, on
// *both* the SPA-navigate and the hard-navigate delete branches alike, via a genuine client-side
// (History API) redirect to `/welcome`. `AccountDeletedNotice` sits beside the guarded route,
// exactly as it does in `Shell` (`App.tsx`): a sibling of `<Routes>`, never inside the guard
// itself, and never remounted by any client-side route change.
//
// `useAuth()` is mocked (not the auth state machine), so `status` can be driven directly and
// synchronously; `RequireAuth` picks up the same mock. `firePagehide()` fires the one event the
// fix's write-back keys on: on a real hard navigation, `location.replace(...)` triggers
// `pagehide` as the browser actually tears the document down (unlike `beforeunload`, `pagehide`
// is reliable cross-browser, including iOS Safari). The SPA-navigate and live-guard-redirect
// cases never trigger it, because this document never actually unloads for them.
//
// `BrowserRouter`, not `MemoryRouter`: the real app uses `BrowserRouter` (`App.tsx`), which
// drives `window.location`/`window.history` directly. A `MemoryRouter` here would keep its own
// in-memory history, never touching `window.location`, which silently stopped an earlier draft
// of this harness from being able to tell a pathname-based (rejected) variant apart from the
// real fix — caught before relying on it.
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
  });

  afterEach(() => {
    mockAuth.active = false;
  });

  it(
    "T-0486 AC-1 root cause (pre-fix behaviour, now exercised as the reactive-consume path's " +
      "baseline): the reactive status->signed-out effect consumes the key synchronously, same " +
      "tick, exactly like the pre-T-0486 code — proving the consume itself is no longer gated " +
      "on any guess about navigation",
    () => {
      const view = render(<Harness />);
      expect(screen.queryByText(DONE)).not.toBeInTheDocument();

      // What `deleteAccountAndSignOut` does: set the key, then sign out (fires SIGNED_OUT,
      // surfaced here as `status` becoming "signed-out").
      window.sessionStorage.setItem(KEY, "1");
      act(() => {
        mockAuth.status = "signed-out";
        view.rerender(<Harness />);
      });

      // RequireAuth's own effect has, by now, redirected the SPA route to /welcome — the same
      // behaviour that defeated the two earlier, rejected fix attempts (a pathname check, and a
      // pre-unload veto event that doesn't fire on iOS).
      expect(screen.getByText("welcome-route")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(DONE);

      // The consume already happened, synchronously, in the same commit as the status flip —
      // no deferral, no race window.
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    },
  );

  it(
    "T-0486 AC-2 SPA-navigate case: status flips to signed-out, RequireAuth's own redirect " +
      "lands on /welcome, and no pagehide ever fires (no real navigation happens) — shows the " +
      "notice, consumes the key, and it stays consumed",
    () => {
      const view = render(<Harness />);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      window.sessionStorage.setItem(KEY, "1");
      act(() => {
        mockAuth.status = "signed-out";
        view.rerender(<Harness />);
      });
      expect(screen.getByText("welcome-route")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(DONE);
      expect(window.sessionStorage.getItem(KEY)).toBeNull();

      // No pagehide ever fires for this (still-open) document, so nothing restores the key: a
      // later reload of /welcome in the same tab shows nothing.
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    },
  );

  it(
    "T-0486 AC-2 hard-navigate case: the key is consumed synchronously, same as the SPA case, " +
      "but pagehide (the real unload beginning) writes it back before the document is torn " +
      "down, so the next page's mount-time read still finds and re-consumes it",
    () => {
      const view = render(<Harness />);
      window.sessionStorage.setItem(KEY, "1");

      act(() => {
        mockAuth.status = "signed-out";
        view.rerender(<Harness />);
      });
      // Consumed already, same as the SPA case — there is no behavioural difference yet.
      expect(window.sessionStorage.getItem(KEY)).toBeNull();

      // The hard-navigate branch's `window.location.replace("/welcome")` call triggers this.
      act(() => {
        firePagehide();
      });
      // Written back: a document that is actually about to unload gets its key restored.
      expect(window.sessionStorage.getItem(KEY)).toBe("1");

      // A real hard navigation unloads the document (and so unmounts this instance) right
      // about here — simulated by `cleanup()`.
      cleanup();

      // The "next page" mount-time read (a fresh instance, as a hard navigation would produce)
      // still sees and consumes the restored key.
      at("/welcome");
      render(<AccountDeletedNotice />);
      expect(screen.getByRole("status")).toHaveTextContent(DONE);
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    },
  );

  it(
    "T-0486 AC-2 Dismiss before any pagehide clears the pending-restore state: a pagehide " +
      "that fires afterwards (e.g. the tab closing for an unrelated reason) must not resurrect " +
      "a notice the user already dismissed",
    () => {
      const view = render(<Harness />);
      window.sessionStorage.setItem(KEY, "1");
      act(() => {
        mockAuth.status = "signed-out";
        view.rerender(<Harness />);
      });
      expect(window.sessionStorage.getItem(KEY)).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      act(() => {
        firePagehide();
      });
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    },
  );

  it(
    "T-0486 AC-2 a pagehide that fires without an actual unload (e.g. the tab merely " +
      "backgrounded, bfcache-eligible) restores the key harmlessly; the user can still " +
      "dismiss afterwards, which clears it again",
    () => {
      const view = render(<Harness />);
      window.sessionStorage.setItem(KEY, "1");
      act(() => {
        mockAuth.status = "signed-out";
        view.rerender(<Harness />);
      });
      expect(window.sessionStorage.getItem(KEY)).toBeNull();

      // A `pagehide` that doesn't lead to a real unload (e.g. Safari firing it on backgrounding
      // for bfcache purposes): the key is restored, but the in-memory component state (and the
      // notice still on screen) is untouched, so there is nothing stuck or broken here.
      act(() => {
        firePagehide();
      });
      expect(window.sessionStorage.getItem(KEY)).toBe("1");
      expect(screen.getByRole("status")).toHaveTextContent(DONE);

      // The user comes back to this same tab and dismisses: the key is removed again, and a
      // later real pagehide (the tab actually closing) must not resurrect it a second time.
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
      act(() => {
        firePagehide();
      });
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    },
  );

  it(
    "T-0486 AC-2 a second pagehide (e.g. a duplicate event) after the key was already " +
      "re-consumed by a fresh mount doesn't resurrect it",
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
      expect(window.sessionStorage.getItem(KEY)).toBe("1");

      // The next page mounts (a fresh instance) and consumes the restored key, same as the
      // hard-navigate test above.
      cleanup();
      at("/welcome");
      const next = render(<AccountDeletedNotice />);
      expect(window.sessionStorage.getItem(KEY)).toBeNull();

      // A second pagehide on *this* (the next page's) instance, before any reactive consume of
      // its own has happened, must not write anything back (nothing is pending here).
      act(() => {
        firePagehide();
      });
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
      next.unmount();
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
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    },
  );

  // QA (T-0486): two signed-out transitions in quick succession while already on /welcome
  // (e.g. a duplicate SIGNED_OUT event, or two renders landing in the same macrotask) must not
  // double-consume, crash, or warn — and the notice must still show and the key still end up
  // cleared exactly once.
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
          // A second, synchronous transition in the same commit — e.g. a duplicate auth event,
          // or React batching two state updates into the same render.
          mockAuth.status = "stale";
          view.rerender(<AccountDeletedNotice />);
          mockAuth.status = "signed-out";
          view.rerender(<AccountDeletedNotice />);
        });
        expect(screen.getByRole("status")).toHaveTextContent(DONE);
        expect(window.sessionStorage.getItem(KEY)).toBeNull();
      } finally {
        expect(errorSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
      }
    },
  );

  it(
    "T-0486 AC-4-style discriminator: a fix that consumes reactively but never writes the key " +
      "back on pagehide (the pre-T-0486 code, and the first two rejected fix attempts in their " +
      "hard-navigate branch) loses the key on an actual hard navigation — this test only " +
      "passes against a fix with the pagehide write-back",
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
      cleanup();
      at("/welcome");
      render(<AccountDeletedNotice />);
      expect(screen.getByRole("status")).toHaveTextContent(DONE);
    },
  );
});
