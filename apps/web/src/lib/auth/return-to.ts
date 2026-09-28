// Where to send the user back after `/auth/callback` (AC-B4) or after re-signing in from
// `/account` (AC-B7). Session-scoped: a fresh tab has no stale return path.
const KEY = "wl-return-to";

export function rememberReturnTo(path: string): void {
  try {
    window.sessionStorage.setItem(KEY, path);
  } catch {
    // best-effort only
  }
}

export function consumeReturnTo(): string {
  try {
    const value = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return value ?? "/";
  } catch {
    return "/";
  }
}
