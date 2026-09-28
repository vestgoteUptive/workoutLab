// AC-B1: the client is built with the D-0045 §5 auth flags, from env, and never logs the key.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn(() => ({ auth: {} }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

describe("lib/auth/client (AC-B1)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    createClient.mockClear();
    vi.stubEnv("VITE_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key-value");
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    logSpy.mockRestore();
  });

  it("creates the client with the PKCE auth flags from env", async () => {
    await import("./client.js");
    expect(createClient).toHaveBeenCalledWith("https://abc.supabase.co", "test-anon-key-value", {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  });

  it("never logs the anon key", async () => {
    await import("./client.js");
    for (const call of logSpy.mock.calls) {
      expect(call.join(" ")).not.toContain("test-anon-key-value");
    }
  });
});
