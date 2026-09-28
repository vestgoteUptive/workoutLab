// Test helpers shared by the T-0300c offline suite.
import { resetOfflineDbForTest } from "../db.js";

let counter = 0;

/** A fresh Dexie database per test (AC-C1 "a new Dexie instance on the same database name" is
 *  covered by the dedicated `db.test.ts`; other tests just need isolation from each other). */
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
