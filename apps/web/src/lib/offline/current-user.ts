// Reads the signed-in user id the same way `lib/auth/auth-context.tsx` reads the session: from
// whatever supabase-js already persisted to `localStorage`, with no network call (principle 5).
// The queue is keyed by this id so one user's rows are never sent, or fed to the engine, for
// another user (D-0045 §6, AC-C12).
const STORAGE_KEY_RE = /-auth-token$/;

interface StoredSessionShape {
  user?: { id?: string };
  currentSession?: { user?: { id?: string } };
}

/** The current user id, or `null` when signed out. Never throws, never awaits the network. */
export function currentUserId(): string | null {
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !STORAGE_KEY_RE.test(key)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as StoredSessionShape;
      const id = parsed.currentSession?.user?.id ?? parsed.user?.id;
      if (id) return id;
    }
  } catch {
    // Unreadable storage: treat as signed out.
  }
  return null;
}

/** Throws when signed out: every queue-writing call needs a user to attribute the row to. */
export function requireUserId(): string {
  const id = currentUserId();
  if (!id) throw new Error("offline queue: no signed-in user");
  return id;
}
