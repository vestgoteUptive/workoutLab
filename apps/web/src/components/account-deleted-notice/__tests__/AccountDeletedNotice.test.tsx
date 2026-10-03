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
const mockAuth: { active: boolean; status: "signed-out" | "signed-in" | "stale" } = {
  active: false,
  status: "signed-in",
};
vi.mock("../../../lib/auth/auth-context.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/auth/auth-context.js")>();
  return {
    ...actual,
    useAuth: (...args: Parameters<typeof actual.useAuth>) =>
      mockAuth.active ? { status: mockAuth.status } : actual.useAuth(...args),
  };
});

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
// `AccountDeletedNotice` is mounted directly (not through `App`), with `useAuth()` mocked, so
// `status` can be driven without any real navigation or auth event plumbing — exactly the
// repro AC-1 asks for. `at()` (declared above) drives `window.location.pathname` via
// `history.replaceState`, exactly as `BrowserRouter` does under a real `navigate()` call, with
// no document reload — matching the component's own plain DOM read.
describe("T-0486 the hard-navigation race", () => {
  beforeEach(() => {
    mockAuth.active = true;
    mockAuth.status = "signed-in";
    at("/");
    vi.useFakeTimers();
  });

  afterEach(() => {
    mockAuth.active = false;
    vi.useRealTimers();
  });

  it(
    "T-0486 AC-1 root cause / AC-2 fix: the reactive status->signed-out effect must not " +
      "consume the key when no SPA navigation follows (that would empty storage before a hard " +
      "navigation's unload ever happens, so the next page's mount-time read would find " +
      "nothing) — against the pre-fix code, this fails: the key was removed here",
    () => {
      // Mount while signed in, still on "/" (no key yet): the mount-time peek() sees nothing,
      // same as the real page before a delete happens in this session.
      const view = render(<AccountDeletedNotice />);
      expect(screen.queryByText(DONE)).not.toBeInTheDocument();

      // What `deleteAccountAndSignOut` does: set the key, then sign out (fires SIGNED_OUT,
      // which this page's `useAuth()` surfaces as `status` becoming "signed-out"). The
      // hard-navigate branch never changes the SPA route — it reloads the document instead —
      // so the pathname stays "/": that is exactly the repro.
      window.sessionStorage.setItem(KEY, "1");
      act(() => {
        mockAuth.status = "signed-out";
        view.rerender(<AccountDeletedNotice />);
      });
      // Run the deferred-consume timer all the way out: even then, with the pathname still
      // "/" (no SPA navigation happened), the key must not have been consumed.
      act(() => {
        vi.runAllTimers();
      });

      // The notice may still show on this (about-to-be-replaced) page, but the key must survive
      // in storage: with no SPA navigation and no unmount, a hard navigation hasn't unloaded the
      // document yet, so the *next* page's own mount-time read must still find the key.
      expect(window.sessionStorage.getItem(KEY)).toBe("1");
    },
  );

  it(
    "T-0486 AC-2 SPA-navigate case: status flips to signed-out and the URL becomes " +
      "/welcome (as AccountSettingsBody's own branch does) shows the notice and consumes the key",
    () => {
      const view = render(<AccountDeletedNotice />);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      window.sessionStorage.setItem(KEY, "1");
      act(() => {
        mockAuth.status = "signed-out";
        at("/welcome");
        view.rerender(<AccountDeletedNotice />);
      });

      // The same mounted instance (never unmounted by an SPA navigate) now shows the notice
      // immediately (the peek, same tick).
      expect(screen.getByRole("status")).toHaveTextContent(DONE);

      // The consume is deferred one tick past this commit's other effects (T-0486); once that
      // runs, a later reload of /welcome in the same tab shows nothing.
      act(() => {
        vi.runAllTimers();
      });
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    },
  );

  it(
    "T-0486 AC-2 hard-navigate case: after status flips to signed-out on the old page (URL " +
      "unchanged, no unload happened), the key is still in storage for the next page's " +
      "mount-time read, exactly as a real hard navigation's fresh document load would do",
    () => {
      const view = render(<AccountDeletedNotice />);
      window.sessionStorage.setItem(KEY, "1");

      act(() => {
        mockAuth.status = "signed-out";
        view.rerender(<AccountDeletedNotice />);
      });
      // The old page's instance may show the notice too (harmless; the document is about to
      // unload) but must not have removed the key. A real hard navigation would unload (and so
      // unmount this instance, cancelling its pending timer) right about here — simulated by
      // `cleanup()` below, before the timer ever gets a chance to run.
      expect(window.sessionStorage.getItem(KEY)).toBe("1");
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
    "T-0486 AC-2 a second old-page re-render after signed-out (still no SPA navigation) " +
      "doesn't re-show or touch storage",
    () => {
      const view = render(<AccountDeletedNotice />);
      window.sessionStorage.setItem(KEY, "1");
      act(() => {
        mockAuth.status = "signed-out";
        view.rerender(<AccountDeletedNotice />);
      });
      view.rerender(<AccountDeletedNotice />);
      act(() => {
        vi.runAllTimers();
      });
      expect(window.sessionStorage.getItem(KEY)).toBe("1");
    },
  );

  // QA (T-0486): the builder's own notes flagged this as the subtle remaining case — not a
  // redirect landing on /welcome, but the user already sitting on /welcome (e.g. they opened
  // account settings in a second tab/window that itself navigated there some other way, or a
  // dev reloaded into /welcome then triggered delete some other way) when SIGNED_OUT fires.
  // Unlike the SPA-navigate test above, `at("/welcome")` here happens *before* the status flip,
  // in no `act()` at all — there is no redirect to wait on, because there isn't one.
  it(
    "T-0486 AC-2 QA: already sitting on /welcome (no redirect) when status flips to " +
      "signed-out shows the notice and still consumes the key",
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
});
