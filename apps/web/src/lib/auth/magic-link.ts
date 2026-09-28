// Magic link + the 6-digit code that rides in the same email (D-0045 §5, AC-B2, AC-B3).
import { supabase } from "./client.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^\d{6}$/;
const LAST_EMAIL_KEY = "wl-last-email";

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function rememberEmail(email: string): void {
  try {
    window.localStorage.setItem(LAST_EMAIL_KEY, email);
  } catch {
    // best-effort only
  }
}

export function lastEmail(): string {
  try {
    return window.localStorage.getItem(LAST_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

export type MagicLinkError = "invalid_email" | "offline" | "rate_limited" | "unknown";
export type MagicLinkResult = { ok: true } | { ok: false; error: MagicLinkError };

export async function requestMagicLink(rawEmail: string): Promise<MagicLinkResult> {
  const email = normalizeEmail(rawEmail);
  if (!EMAIL_RE.test(email)) return { ok: false, error: "invalid_email" };
  if (!navigator.onLine) return { ok: false, error: "offline" };

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    rememberEmail(email);
    if ("status" in error && error.status === 429) return { ok: false, error: "rate_limited" };
    return { ok: false, error: "unknown" };
  }

  rememberEmail(email);
  return { ok: true };
}

export type VerifyCodeError = "invalid_code" | "unknown";
export type VerifyCodeResult = { ok: true } | { ok: false; error: VerifyCodeError };

export async function verifyCode(rawEmail: string, code: string): Promise<VerifyCodeResult> {
  if (!CODE_RE.test(code)) return { ok: false, error: "invalid_code" };
  const email = normalizeEmail(rawEmail);

  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) return { ok: false, error: "unknown" };

  rememberEmail(email);
  return { ok: true };
}
