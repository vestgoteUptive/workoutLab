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
