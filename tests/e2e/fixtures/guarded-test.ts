// T-0904 (D-0086): the e2e fixture guard. Every spec header in this directory promises "this
// spec never hits the network", and until now nothing checked it. T-0301a's profile gate added a
// `GET /rest/v1/profiles` that `auth.spec.ts` did not mock, the request went to the real
// `abc.supabase.co`, postgrest-js retried the thrown `ERR_NAME_NOT_RESOLVED` for ~7 s, and the
// job went red as a 5 s *visibility timeout* three layers away from the cause. See
// docs/ci/CI-T-0904-auth-e2e-unmocked-profile-read.md.
//
// A spec that imports `test`/`expect` from this file gets one extra, automatic fixture: any
// Supabase request that no route claimed fails the test at teardown, naming the method and URL.
//
// Import as: `import { expect, test } from "./fixtures/guarded-test.js";`
import { test as base, type BrowserContext, expect, type Request } from "@playwright/test";
import { VITE_SUPABASE_URL } from "../playwright.config.js";

/** What a spec gets back from `installSupabaseGuard`, so AC-6 can assert on the guard itself. */
export interface SupabaseGuard {
  /** Every unclaimed request seen so far, as `"<METHOD> <URL>"`, in arrival order. */
  unclaimed(): string[];
  /** Throws, listing every unclaimed request, if there was one. A no-op when there were none. */
  assertClean(): void;
  /**
   * Clears the record, so a test that *deliberately* leaks doesn't fail its own teardown.
   *
   * Only `fixture-guard.spec.ts` should ever need this — it plants leaks on purpose to prove the
   * guard notices them. Calling it from a product spec would silence the guard, which is the one
   * thing this fixture exists to prevent, so it is named to be conspicuous in review.
   */
  forgetPlantedLeaks(): void;
}

/** The literal every guard failure message contains, so a spec can assert on it by name. */
export const UNCLAIMED_MESSAGE = "unclaimed supabase request";

/**
 * Registers the last-resort Supabase route on `context` and returns the recorder.
 *
 * Why **context** level rather than `page.route`: Playwright consults context routes only after
 * every matching *page* route has fallen back. The guard is therefore the true last resort no
 * matter what order a spec's `beforeEach` registers its own page routes in — page-route order
 * cannot shadow it, which is exactly the hazard that made the original bug order-dependent.
 * The one gap is `route.continue()`, which skips context routes entirely; detector 2 covers it.
 *
 * Why it **fulfils 501 instead of aborting**: an aborted fetch *throws* in page context, and
 * postgrest-js's `fetchWithRetry` retries a throw three times with 1 s / 2 s / 4 s backoff. The
 * test would then fail as a ~7 s timeout — the very symptom this guard exists to replace with a
 * named error. An HTTP error status is not retried, so 501 fails fast and stays diagnosable.
 *
 * Definition of "claimed" (D-0086): a request to `VITE_SUPABASE_URL` is claimed when any route
 * consulted *before* this one answers it with `route.fulfill` or `route.abort`, whichever file
 * registered that route. The 501 catch-alls (`mockSupabaseAuth`, `mockSupabaseRest`) count as
 * claims — they keep the request off the network, which is the property being enforced — so this
 * guard does **not** replace them. A handler that calls `route.continue()` lets the request reach
 * the network, so it is *not* a claim and the guard reports it. A request that failed only
 * because the context is offline is exempt — but note `context.setOffline(true)` does **not**
 * suspend interception, so an *unmocked* request made while offline is still claimed by this
 * route and still reported (measured; D-0086 §4 corrects the ticket on this point).
 */
export function installSupabaseGuard(context: BrowserContext): SupabaseGuard {
  const routed = new Set<string>();
  const seen: string[] = [];
  const record = (entry: string) => {
    if (!seen.includes(entry)) seen.push(entry);
  };

  // Detector 1: the last-resort route. Deliberately `${VITE_SUPABASE_URL}/**` and not a
  // `/rest/v1` prefix — an unmocked `/auth/v1`, `/storage/v1` or `/functions/v1` call is just as
  // much a network leak. This catches the common case: nothing matched, or a page route called
  // `route.fallback()`.
  void context.route(`${VITE_SUPABASE_URL}/**`, (route) => {
    const request = route.request();
    const entry = `${request.method()} ${request.url()}`;
    routed.add(entry);
    record(entry);
    return route.fulfill({
      status: 501,
      body: `${UNCLAIMED_MESSAGE} in e2e: ${entry}`,
    });
  });

  // Detector 2: requests that actually reached the network.
  //
  // Detector 1 alone is not sufficient, and this was measured rather than assumed. A page route
  // that calls `route.continue()` does **not** fall through to a context route — Chromium sends
  // the request straight to the network and the context handler is never invoked — so the exact
  // leak the guard exists to catch (a handler passing a Supabase call through to the real host)
  // is invisible to detector 1:
  //   page.route -> route.continue()  =>  context route NOT hit, fetch threw "Failed to fetch"
  //   page.route -> route.fallback()  =>  context route hit, fetch got the guard's 501
  //
  // This listens to `requestfailed` **only**, and that distinction is also measured. Probing
  // `requestfinished` showed it fires for route-*fulfilled* requests as well (with
  // `failure() === null` and `serverAddr() === null`), so keying on "the event fired" would
  // report every legitimate mock — it made `offline.spec.ts`'s 10 mocked AutoSync selects fail.
  // Real traffic to the fixture's fake host cannot succeed, so it always surfaces as a
  // `requestfailed` with a DNS error:
  //   route.fulfill        => requestfinished, failure null,                 serverAddr null
  //   route.continue()     => requestfailed,   failure net::ERR_NAME_NOT_RESOLVED
  //
  // The consequence, stated plainly: if a spec ever points `VITE_SUPABASE_URL` at a host that
  // genuinely answers, a `route.continue()` leak would succeed and this detector would miss it.
  // The fixture hard-codes an unresolvable host, so that cannot happen today.
  //
  // Requests that fail only because the context is offline are exempt (D-0086, AC-8): they are
  // the *point* of the offline specs, not a missing mock.
  //
  // Note this is a safety net rather than the reason those specs pass. `context.setOffline(true)`
  // does **not** suspend route interception — measured: with the guard installed and the context
  // offline, an unrouted Supabase fetch still hit the context route and got its 501, and never
  // fired `requestfailed` at all. So the offline specs stay green because their own page routes
  // (`mockSupabaseData`, `mockSupabaseRest`) claim their requests, exactly like the online ones.
  // The ticket's expectation that offline requests "never reach any route" does not hold; this
  // exemption covers the *navigation* case, where `page.reload()` while offline fails for real.
  const OFFLINE_FAILURES = ["net::ERR_INTERNET_DISCONNECTED", "net::ERR_NETWORK_CHANGED"];
  context.on("requestfailed", (request: Request) => {
    if (!request.url().startsWith(VITE_SUPABASE_URL)) return;
    const entry = `${request.method()} ${request.url()}`;
    if (routed.has(entry)) return;
    const failure = request.failure()?.errorText ?? "";
    if (OFFLINE_FAILURES.some((text) => failure.includes(text))) return;
    record(entry);
  });

  return {
    unclaimed: () => [...seen],
    forgetPlantedLeaks: () => {
      seen.length = 0;
      routed.clear();
    },
    assertClean: () => {
      if (seen.length === 0) return;
      throw new Error(
        `${UNCLAIMED_MESSAGE}: ${seen.length} Supabase request(s) were not claimed by any ` +
          `route — they either reached the last-resort guard or went to the real network. ` +
          `Mock them in this spec (see fixtures/supabase-mock.ts — mockSupabaseRest / ` +
          `mockProfilePresent / mockProfileMissing):\n` +
          seen.map((entry) => `  - ${entry}`).join("\n"),
      );
    },
  };
}

/**
 * `test` with the guard attached as an `auto` fixture, so every test in an importing spec is
 * checked without opting in test by test. `expect` is re-exported unchanged, purely so a spec
 * has one import line and can't accidentally pull `test` from `@playwright/test` alongside it.
 *
 * The assertion runs *after* the test body, on teardown. A test that already failed still gets
 * its own error reported first; the guard only adds a failure where there wasn't one.
 */
export const test = base.extend<{ supabaseGuard: SupabaseGuard }>({
  supabaseGuard: [
    async ({ context }, use) => {
      const guard = installSupabaseGuard(context);
      await use(guard);
      guard.assertClean();
    },
    { auto: true },
  ],
});

export { expect, VITE_SUPABASE_URL };
