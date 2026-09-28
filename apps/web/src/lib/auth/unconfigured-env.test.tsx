// T-0902 AC3: the *render* path with both Supabase env vars empty.
//
// The pre-existing `client.test.ts` only asserted that *importing* the client module does not
// throw. That is why the live bug got through: `auth-context.tsx` subscribes to
// `onAuthStateChange` in a mount effect, so rendering the app reached `createClient("", "")`
// and threw `supabaseUrl is required.`, leaving a blank page.
//
// These tests deliberately do NOT mock `@supabase/supabase-js` or `./client.js`: mocking either
// is what hid the defect. They render the real shell through the real client module with empty
// env, so they fail again if anything starts touching the client eagerly, or if the
// unconfigured fallback is removed.
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
  // The real missing-env case: Vite substitutes nothing, so both read as empty.
  vi.stubEnv("VITE_SUPABASE_URL", "");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  warnSpy.mockRestore();
});

describe("unconfigured Supabase env (T-0902 AC2, AC3)", () => {
  it("renders /welcome (UF-01.1) without throwing", async () => {
    const { Shell } = await import("../../app/App.js");
    const { AuthProvider } = await import("./auth-context.js");

    expect(() =>
      render(
        <MemoryRouter initialEntries={["/welcome"]}>
          <AuthProvider>
            <Shell />
          </AuthProvider>
        </MemoryRouter>,
      ),
    ).not.toThrow();

    await waitFor(() => {
      expect(document.querySelector('[data-screen-id="UF-01.1"]')).toBeInTheDocument();
    });
  });

  it("mounting AuthProvider does not throw, and the client reports no session", async () => {
    const { AuthProvider, useAuth } = await import("./auth-context.js");

    function ShowStatus() {
      const { status } = useAuth();
      return <p>status: {status}</p>;
    }

    expect(() =>
      render(
        <MemoryRouter>
          <AuthProvider>
            <ShowStatus />
          </AuthProvider>
        </MemoryRouter>,
      ),
    ).not.toThrow();

    // Settles into signed-out rather than crashing or hanging (principle 5, AC-A5).
    expect(screen.getByText("status: signed-out")).toBeInTheDocument();
  });

  it("a protected route still redirects to /welcome instead of crashing", async () => {
    const { Shell } = await import("../../app/App.js");
    const { AuthProvider } = await import("./auth-context.js");

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-screen-id="UF-01.1"]')).toBeInTheDocument();
    });
  });

  it("warns exactly once, naming both variables", async () => {
    const { AuthProvider } = await import("./auth-context.js");
    const { supabase } = await import("./client.js");

    render(
      <MemoryRouter>
        <AuthProvider>
          <span />
        </AuthProvider>
      </MemoryRouter>,
    );
    // Extra auth traffic must not add more noise.
    await supabase.auth.getSession();
    await supabase.auth.signOut();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warning = warnSpy.mock.calls[0]!.join(" ");
    expect(warning).toContain("VITE_SUPABASE_URL");
    expect(warning).toContain("VITE_SUPABASE_ANON_KEY");
  });

  it("magic link reports a failure instead of throwing (no client to call)", async () => {
    vi.stubGlobal("navigator", { ...window.navigator, onLine: true });
    const { requestMagicLink } = await import("./magic-link.js");

    await expect(requestMagicLink("lifter@example.com")).resolves.toEqual({
      ok: false,
      error: "unknown",
    });
    vi.unstubAllGlobals();
  });

  it("isSupabaseConfigured() is false when empty and true when both are set", async () => {
    const { isSupabaseConfigured } = await import("./client.js");
    expect(isSupabaseConfigured()).toBe(false);

    vi.stubEnv("VITE_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
    expect(isSupabaseConfigured()).toBe(true);

    // Whitespace-only is treated as unset, not as a URL.
    vi.stubEnv("VITE_SUPABASE_URL", "   ");
    expect(isSupabaseConfigured()).toBe(false);
  });
});

// A second, narrower net for the same defect: even with env *present*, importing the auth
// modules must not construct a client. This is the "does not touch the client eagerly"
// half of AC3 — it fails if `auth-context.tsx` moves a `supabase.*` call out of its mount
// effect and into module scope or a render body.
describe("no eager client construction (T-0902 AC3)", () => {
  it("importing auth-context and rendering nothing never calls createClient", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");

    const createClient = vi.fn(() => ({ auth: { onAuthStateChange: vi.fn() } }));
    vi.doMock("@supabase/supabase-js", () => ({ createClient }));

    await import("./auth-context.js");
    await import("./magic-link.js");
    await import("../../app/App.js");

    expect(createClient).not.toHaveBeenCalled();
    vi.doUnmock("@supabase/supabase-js");
  });
});
