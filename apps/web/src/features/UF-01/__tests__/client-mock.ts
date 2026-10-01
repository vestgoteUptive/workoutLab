// The `lib/auth/client.js` mock for the UF-01 tests. The harness mounts the real `AuthProvider`,
// which subscribes to `supabase.auth.onAuthStateChange` on mount; nothing else is reached.
//
// Use as: `vi.mock("../../../lib/auth/client.js", async () => (await import("./client-mock.js")).clientMock(from));`
import { vi } from "vitest";

export function clientMock(from: (...args: unknown[]) => unknown = vi.fn()): {
  supabase: Record<string, unknown>;
} {
  return {
    supabase: {
      from,
      auth: {
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        getSession: vi.fn(() => new Promise(() => {})),
      },
    },
  };
}
