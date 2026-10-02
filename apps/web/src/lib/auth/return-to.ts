// Where to send the user back after `/auth/callback` (AC-B4) or after re-signing in from
// `/account` (AC-B7). Session-scoped: a fresh tab has no stale return path.
const KEY = "wl-return-to";

// ASCII control characters, space and DEL (T-0392).
// eslint-disable-next-line no-control-regex
const CONTROL_OR_SPACE = /[\u0000- \u007f]/;

export function rememberReturnTo(path: string): void {
  try {
    window.sessionStorage.setItem(KEY, path);
  } catch {
    // best-effort only
  }
}

// T-0392 (UF-01.5): only same-origin app paths survive; anything else is "/". Defence in
// depth against an open redirect (`//evil.example`, `/\evil.example`) or a scheme URL.
function isSafeAppPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!value.startsWith("/")) return false;
  if (value[1] === "/" || value[1] === "\\") return false;
  if (value.includes("\\")) return false;
  if (CONTROL_OR_SPACE.test(value)) return false;
  try {
    const origin = window.location.origin;
    return new URL(value, origin).origin === origin;
  } catch {
    return false;
  }
}

export function consumeReturnTo(): string {
  let value: string | null = null;
  try {
    value = window.sessionStorage.getItem(KEY);
  } catch {
    value = null;
  }
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // best-effort only
  }
  if (!isSafeAppPath(value)) return "/";
  return normalise(value);
}

// T-0396 (UF-01.5): return what the URL parser resolved (dot segments, `%2e%2e`), not the raw
// string, and check that result again: `/..//evil.example` resolves to `//evil.example`.
function normalise(value: string): string {
  try {
    const u = new URL(value, window.location.origin);
    const out = u.pathname + u.search + u.hash;
    return isSafeAppPath(out) ? out : "/";
  } catch {
    return "/";
  }
}
