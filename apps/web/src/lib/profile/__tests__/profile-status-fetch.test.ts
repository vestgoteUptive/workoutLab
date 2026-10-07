// T-0351 AC-1..AC-4: `resolveProfileStatus()` against a real postgrest client with a fake `fetch`
// (profile-status.test.tsx mocks `supabase.from`, which cannot see retry or abort behaviour).
import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROFILE_READ_TIMEOUT_MS, resolveProfileStatus } from "../status.js";

const { loadProfile, fetchFn } = vi.hoisted(() => ({ loadProfile: vi.fn(), fetchFn: vi.fn() }));
vi.mock("../../offline/index.js", () => ({ loadProfile }));
vi.mock("../../auth/client.js", () => ({
  supabase: createClient("http://localhost:54321", "anon", {
    global: { fetch: (...a: Parameters<typeof fetch>) => fetchFn(...a) },
    auth: { persistSession: false, autoRefreshToken: false },
  }),
}));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("resolveProfileStatus network behaviour (T-0351)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    loadProfile.mockResolvedValue(null);
    fetchFn.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("AC-1: a throwing network is unknown at once, after one call", async () => {
    fetchFn.mockRejectedValue(new TypeError("Failed to fetch"));
    const p = resolveProfileStatus();
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toEqual({ status: "unknown", shouldRefreshCache: false });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("AC-2: a hanging network is unknown at 3000 ms, not before", async () => {
    fetchFn.mockImplementation(
      (_u: unknown, init?: RequestInit) =>
        new Promise((_res, rej) => {
          init?.signal?.addEventListener("abort", () => rej(init.signal?.reason));
        }),
    );
    let out: unknown;
    void resolveProfileStatus().then((r) => (out = r));
    await vi.advanceTimersByTimeAsync(PROFILE_READ_TIMEOUT_MS - 1);
    expect(out).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(out).toEqual({ status: "unknown", shouldRefreshCache: false });
  });

  it("AC-3: row, no row and HTTP 500 keep their answers", async () => {
    fetchFn.mockResolvedValueOnce(json(200, { id: "u1" }));
    expect(await resolveProfileStatus()).toEqual({ status: "present", shouldRefreshCache: true });
    fetchFn.mockResolvedValueOnce(json(200, null));
    expect((await resolveProfileStatus()).status).toBe("missing");
    fetchFn.mockResolvedValueOnce(json(500, { message: "boom" }));
    expect((await resolveProfileStatus()).status).toBe("unknown");
  });

  it("AC-4: a cached profile is present and fetch is never called", async () => {
    loadProfile.mockResolvedValue({ id: "u1" });
    expect(await resolveProfileStatus()).toEqual({ status: "present", shouldRefreshCache: false });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
