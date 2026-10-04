// T-0484 (D-0175 §3): one fixture that models "offline" faithfully for writes, for any spec that
// needs a context to be genuinely offline rather than merely `context.setOffline(true)`.
//
// `context.setOffline(true)` does not stop `page.route` interception (measured; see
// `fixtures/guarded-test.ts`'s "setOffline does not suspend interception" test, D-0086 §4). A
// spec's own mocks (`mockSupabaseData`) answer `POST`/`PATCH` writes with success regardless of
// the context's offline flag, so an "offline" spec that reloads or otherwise triggers a flush
// (AutoSync's mount flush, an auth-event flush, a backoff retry) gets that write fulfilled by the
// mock — which then lets the offline queue drain, exactly backwards from what "offline" means on
// a device. T-0906 hit this as a CI flake once `uf-03-list-summary.spec.ts` started reading the
// queue right after a reload.
//
// `goOffline(page, context)` arms a gate on every non-GET/HEAD request to
// `${VITE_SUPABASE_URL}/rest/v1/**` on `page`, *then* calls `context.setOffline(true)` — in that
// order, so there is no window where the context is offline and a write can still be fulfilled.
// While armed, a GET/HEAD (a read) always falls through unchanged, so the spec's own mocks keep
// answering reads exactly as before (D-0175 §3, "Revisit when": reads are out of scope here).
//
// Ordering hazard: Playwright runs the most-recently-registered matching `page.route` handler
// first, falling back to earlier ones via `route.fallback()`. This gate must therefore be the
// *last* registered handler on these URLs to be the first one consulted — call `goOffline` after
// `mockSupabaseData` and after any spec-local route on the same patterns. A route registered
// after `goOffline` shadows it silently (AC-2 in T-0484 pins this as a self-test, not a runtime
// guard — there's no way to detect "a later route" from in here).
//
// Scope: one page. A second page in the same context (a second browser tab/window) needs its own
// `goOffline`-style gate; this one only ever sees requests from the `page` it was given.
import type { BrowserContext, Page } from "@playwright/test";
import { VITE_SUPABASE_URL } from "../playwright.config.js";

/** What `goOffline` hands back. */
export interface OfflineGate {
  /** Non-GET/HEAD `rest/v1` requests that finished (fulfilled by some other route, e.g. a spec's
   *  own mock, or a later-registered route shadowing this gate) while armed. Counts nothing from
   *  before `goOffline` or after `goOnline`. */
  writesFulfilledOffline(): number;
  /** Non-GET/HEAD `rest/v1` requests this gate itself aborted while armed. Counts nothing from
   *  before `goOffline` or after `goOnline`. */
  writesAbortedOffline(): number;
  /** Disarms the gate, then calls `context.setOffline(false)` — in that order, so the `online`
   *  event's own flush (if any) reaches the mocks rather than this gate. */
  goOnline(): Promise<void>;
}

const REST_PATTERN = `${VITE_SUPABASE_URL}/rest/v1/**`;

/** Arms a write-abort gate on `page`, then puts `context` offline. See the file header for why
 *  that order matters and what "armed" covers. */
export async function goOffline(page: Page, context: BrowserContext): Promise<OfflineGate> {
  let armed = true;
  let fulfilled = 0;
  let aborted = 0;

  page.on("requestfinished", (request) => {
    if (!armed) return;
    if (!request.url().startsWith(`${VITE_SUPABASE_URL}/rest/v1/`)) return;
    const method = request.method();
    if (method === "GET" || method === "HEAD") return;
    fulfilled += 1;
  });

  await page.route(REST_PATTERN, async (route) => {
    const request = route.request();
    const method = request.method();
    if (!armed || method === "GET" || method === "HEAD") {
      await route.fallback();
      return;
    }
    aborted += 1;
    await route.abort("internetdisconnected");
  });

  await context.setOffline(true);

  return {
    writesFulfilledOffline: () => fulfilled,
    writesAbortedOffline: () => aborted,
    goOnline: async () => {
      armed = false;
      await context.setOffline(false);
    },
  };
}
