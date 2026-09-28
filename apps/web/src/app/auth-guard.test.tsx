// AC-B5 (guard), AC-B6 (principle 5 + stale session), AC-B7 (no auth interruption mid-workout).
import { useEffect } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Shell } from "./App.js";
import { AuthProvider } from "../lib/auth/auth-context.js";

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
vi.mock("../lib/auth/client.js", () => ({
  supabase: { auth: { onAuthStateChange, getSession, signOut } },
}));

let navigateRef: ((path: string) => void) | undefined;

function NavHelper() {
  const navigate = useNavigate();
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
  authStateCallbacks.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AC-B5 route guard", () => {
  it.each(["/", "/library", "/progress", "/balance", "/plan", "/session/setup"])(
    "signed out: %s redirects to /welcome",
    async (path) => {
      render(<Harness start={path} />);
      await waitFor(() => {
        expect(document.querySelector('[data-screen-id="UF-01.1"]')).toBeInTheDocument();
      });
    },
  );

  it("signed out: /welcome renders UF-01.1", async () => {
    render(<Harness start="/welcome" />);
    await waitFor(() => {
      expect(document.querySelector('[data-screen-id="UF-01.1"]')).toBeInTheDocument();
    });
  });

  it.each([
    ["/account", "UF-01.5"],
    ["/auth/callback", "UF-01.5-auth-callback"],
  ])("signed out: %s renders %s", async (path, expected) => {
    render(<Harness start={path} />);
    await waitFor(() => {
      expect(document.querySelector(`[data-screen-id="${expected}"]`)).toBeInTheDocument();
    });
  });

  it("signed out: /welcome/goal renders without a redirect (D-0014, TR-0022)", async () => {
    render(<Harness start="/welcome/goal" />);
    await waitFor(() => {
      expect(document.querySelector('[data-screen-id="UF-01.1"]')).toBeInTheDocument();
    });
  });

  it.each(["/welcome", "/account"])("signed in: %s redirects to /", async (path) => {
    window.localStorage.setItem(
      "sb-abc-auth-token",
      JSON.stringify({ access_token: "tok", expires_at: Math.floor(Date.now() / 1000) + 3600 }),
    );
    render(<Harness start={path} />);
    await waitFor(() => {
      expect(document.querySelector('[data-screen-id="UF-02.1"]')).toBeInTheDocument();
    });
  });

  it("signed in: /account consumes a stored return-to and lands there instead of /", async () => {
    window.localStorage.setItem(
      "sb-abc-auth-token",
      JSON.stringify({ access_token: "tok", expires_at: Math.floor(Date.now() / 1000) + 3600 }),
    );
    window.sessionStorage.setItem("wl-return-to", "/library");
    render(<Harness start="/account" />);
    await waitFor(() => {
      expect(document.querySelector('[data-screen-id="UF-04.1"]')).toBeInTheDocument();
    });
    expect(window.sessionStorage.getItem("wl-return-to")).toBeNull();
  });
});

describe("AC-B6 principle 5 + stale session", () => {
  it("renders UF-01.1 on the first committed render, with no network call awaited", () => {
    getSession.mockReturnValue(new Promise(() => {})); // never resolves
    render(<Harness start="/" />);
    // Synchronous: no `await`/`waitFor` before this assertion.
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("stale + offline renders UF-02.1 at /", async () => {
    seedExpiredSession();
    vi.stubGlobal("navigator", { onLine: false });
    render(<Harness start="/" />);
    await waitFor(() => {
      expect(document.querySelector('[data-screen-id="UF-02.1"]')).toBeInTheDocument();
    });
    expect(getSession).not.toHaveBeenCalled();
  });

  it("stale + online + 400 invalid_grant signs out and redirects to /welcome", async () => {
    seedExpiredSession();
    vi.stubGlobal("navigator", { onLine: true });
    getSession.mockResolvedValue({
      data: { session: null },
      error: { status: 400, message: "invalid_grant" },
    });
    render(<Harness start="/" />);
    await waitFor(() => {
      expect(document.querySelector('[data-screen-id="UF-01.1"]')).toBeInTheDocument();
    });
  });

  it("stale + online + network error stays signed in (stale), not bounced out", async () => {
    seedExpiredSession();
    vi.stubGlobal("navigator", { onLine: true });
    getSession.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<Harness start="/" />);
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    // Still on the protected route: a network hiccup must not sign the user out (AC-B6).
    expect(document.querySelector('[data-screen-id="UF-02.1"]')).toBeInTheDocument();
  });

  it("stale + online + 500 from Supabase stays signed in (stale), not bounced out", async () => {
    seedExpiredSession();
    vi.stubGlobal("navigator", { onLine: true });
    getSession.mockResolvedValue({
      data: { session: null },
      error: { status: 500, message: "internal_server_error" },
    });
    render(<Harness start="/" />);
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(document.querySelector('[data-screen-id="UF-02.1"]')).toBeInTheDocument();
  });
});

describe("AC-B7 no auth interruption mid-workout", () => {
  it("stays on /session/<id> with no alert, then goes to /account on navigating to /", async () => {
    seedExpiredSession();
    vi.stubGlobal("navigator", { onLine: true });
    getSession.mockResolvedValue({
      data: { session: null },
      error: { status: 400, message: "invalid_grant" },
    });

    render(<Harness start="/session/abc123" />);
    await waitFor(() => {
      expect(document.querySelector('[data-screen-id="UF-09"]')).toBeInTheDocument();
    });
    await waitFor(() => expect(getSession).toHaveBeenCalled());

    expect(document.querySelector('[data-screen-id="UF-09"]')).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();

    act(() => navigateRef!("/"));

    await waitFor(() => {
      expect(document.querySelector('[data-screen-id="UF-01.5"]')).toBeInTheDocument();
    });
  });

  it("a SIGNED_OUT event while on /session/<id> also lands on /account, not /welcome", async () => {
    window.localStorage.setItem(
      "sb-abc-auth-token",
      JSON.stringify({ access_token: "tok", expires_at: Math.floor(Date.now() / 1000) + 3600 }),
    );

    render(<Harness start="/session/abc123" />);
    await waitFor(() => {
      expect(document.querySelector('[data-screen-id="UF-09"]')).toBeInTheDocument();
    });
    await waitFor(() => expect(authStateCallbacks.length).toBeGreaterThan(0));

    act(() => {
      for (const cb of authStateCallbacks) cb("SIGNED_OUT", null);
    });

    // Still on the session route: token expiry mid-workout must not interrupt it.
    expect(document.querySelector('[data-screen-id="UF-09"]')).toBeInTheDocument();

    act(() => navigateRef!("/"));

    await waitFor(() => {
      expect(document.querySelector('[data-screen-id="UF-01.5"]')).toBeInTheDocument();
    });
  });
});
