// Test helpers shared by the T-0300c offline suite.
import { resetOfflineDbForTest } from "../db.js";

let counter = 0;

/** A fresh Dexie database per test, so tests are isolated from each other.
 *
 *  AC-C1's "a fresh `openDB` right after the resolve sees the row" clause is covered by
 *  `queue.record.test.ts` → "resolves only after the IDB transaction commits: a fresh Dexie
 *  instance sees the row", which reopens the *same* database name deliberately. */
export function freshOfflineDb() {
  counter += 1;
  return resetOfflineDbForTest(`wl-offline-test-${counter}`);
}

const STORAGE_KEY = "sb-abc-auth-token";

/** Writes a fake supabase-js session to `localStorage`, the way `currentUserId()` reads it. */
export function signIn(userId: string): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      access_token: "test-access-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId },
    }),
  );
}

export function signOut(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
