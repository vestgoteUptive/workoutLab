// AC-B2 (magic link) and AC-B3 (6-digit code, D-0045 §5).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { signInWithOtp, verifyOtp } = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));
vi.mock("./client.js", () => ({
  supabase: { auth: { signInWithOtp, verifyOtp } },
}));

import { requestMagicLink, verifyCode } from "./magic-link.js";

describe("requestMagicLink (AC-B2)", () => {
  beforeEach(() => {
    signInWithOtp.mockReset();
    signInWithOtp.mockResolvedValue({ error: null });
    vi.stubGlobal("navigator", { onLine: true });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("normalises the email and calls signInWithOtp", async () => {
    const result = await requestMagicLink(" Ada@Example.com ");
    expect(result).toEqual({ ok: true });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "ada@example.com",
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });
  });

  it("rejects an invalid email without calling supabase", async () => {
    const result = await requestMagicLink("ada@");
    expect(result).toEqual({ ok: false, error: "invalid_email" });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("returns offline without calling supabase when navigator.onLine is false", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const result = await requestMagicLink("ada@example.com");
    expect(result).toEqual({ ok: false, error: "offline" });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("maps a 429 to rate_limited", async () => {
    signInWithOtp.mockResolvedValue({ error: { status: 429, message: "rate" } });
    const result = await requestMagicLink("ada@example.com");
    expect(result).toEqual({ ok: false, error: "rate_limited" });
  });
});

describe("verifyCode (AC-B3)", () => {
  beforeEach(() => {
    verifyOtp.mockReset();
    verifyOtp.mockResolvedValue({ error: null });
  });

  it("calls verifyOtp with type email", async () => {
    const result = await verifyCode("ada@example.com", "123456");
    expect(result).toEqual({ ok: true });
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "ada@example.com",
      token: "123456",
      type: "email",
    });
  });

  it.each(["12345", "12a456"])("rejects %s without calling supabase", async (code) => {
    const result = await verifyCode("ada@example.com", code);
    expect(result).toEqual({ ok: false, error: "invalid_code" });
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
