// T-0904: the guard guards itself (D-0086). `fixtures/guarded-test.ts` is the thing that will
// catch the *next* unmocked-Supabase regression, so it needs its own tests — a guard nobody
// tests is a guard that quietly stops working.
//
// AC-6 drives `installSupabaseGuard` directly on the test's own context rather than nesting a
// Playwright run: a nested run would fight this one over the `--strictPort` preview server.
// AC-7 covers the part that cannot be reached that way — that the `auto` fixture actually fails
// a test — with Playwright's `test.fail()` annotation.
//
// T-0425 adds the same two layers for the console guard: `test.fail` tests prove the `auto`
// fixture fails a test that logs an error (red on code without the guard: "expected to fail, but
// passed"), and tests that drive `installConsoleGuard` directly pin the message, the exemptions
// and the per-test scope of `allow`.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BACKSTOP_MESSAGE,
  CONSOLE_ERROR_MESSAGE,
  expect,
  installConsoleGuard,
  installSupabaseGuard,
  test,
  UNCLAIMED_MESSAGE,
} from "./fixtures/guarded-test.js";
import { listSpecs, unguardedReason, unguardedSpecs } from "./fixtures/guard-source-check.js";
import { goOffline } from "./fixtures/offline.js";
import { allowCommentViolations, ownConsoleListeners } from "./fixtures/source-rules.js";
import {
  mockProfilePresent,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseEmailAuth,
  mockSupabaseRest,
  VITE_SUPABASE_URL,
} from "./fixtures/supabase-mock.js";

const PLANTED_URL = `${VITE_SUPABASE_URL}/rest/v1/planted_unmocked?select=*`;

/** Fetches from page context and resolves with the response status (never throws into the test). */
async function fetchStatus(page: import("@playwright/test").Page, url: string): Promise<number> {
  return page.evaluate(async (target) => {
    const res = await fetch(target);
    return res.status;
  }, url);
}

test.describe("AC-6 the guard reports exactly the requests no route claimed", () => {
  // Signed out, and `/welcome` is the one route that makes no Supabase REST call of its own, so
  // every request these tests observe is one they planted. `page.goto` also gives page context
  // for `fetch` and an origin the relative `/welcome` can resolve against.
  //
  // Note these tests install a *second* guard (the auto fixture already installed one). Both are
  // context routes and the most-recently-registered runs first, so the local one answers and the
  // auto one never sees the planted request — which is what lets these tests leak on purpose
  // without failing their own teardown. The two exceptions are the `route.continue()` and
  // `setOffline` tests, where the leak bypasses or precedes both routes; those call
  // `forgetPlantedLeaks()` and say why.
  test("a planted, unclaimed request is recorded, answered 501, and fails assertClean", async ({
    page,
    context,
  }) => {
    await page.goto("/welcome");
    const guard = installSupabaseGuard(context);

    expect(await fetchStatus(page, PLANTED_URL)).toBe(501);

    expect(guard.unclaimed()).toEqual([`GET ${PLANTED_URL}`]);
    expect(() => guard.assertClean()).toThrow(UNCLAIMED_MESSAGE);
    expect(() => guard.assertClean()).toThrow(PLANTED_URL);
  });

  test("a request claimed by a route from elsewhere is not reported", async ({ page, context }) => {
    await page.goto("/welcome");
    const guard = installSupabaseGuard(context);

    // Stands in for another branch's own fixture file: the guard must not care which file
    // registered the claim, only that the request was kept off the network.
    await page.route(`${VITE_SUPABASE_URL}/rest/v1/other_fixture*`, (route) =>
      route.fulfill({ status: 200, json: [] }),
    );

    expect(await fetchStatus(page, `${VITE_SUPABASE_URL}/rest/v1/other_fixture?select=*`)).toBe(
      200,
    );
    expect(guard.unclaimed()).toEqual([]);
    expect(() => guard.assertClean()).not.toThrow();
  });

  // T-0436 (D-0155 §4) inverts the D-0086 §2 test "a request claimed by the 501 backstop is not
  // reported": the request still stays off the network (501, not in `unclaimed()`), but it is now
  // a backstop hit, and `allowBackstop` exempts it.
  test("a request claimed by the 501 backstop is reported as a hit, and allowBackstop exempts it", async ({
    page,
    context,
    supabaseGuard,
  }) => {
    // T-0436: the auto guard sees this hit too (it listens on the context), so it acknowledges it.
    supabaseGuard.allowBackstop(/\/rest\/v1\/anything/);
    await page.goto("/welcome");
    const guard = installSupabaseGuard(context);
    await mockSupabaseRest(page);

    expect(await fetchStatus(page, `${VITE_SUPABASE_URL}/rest/v1/anything?select=*`)).toBe(501);
    expect(guard.unclaimed()).toEqual([]);
    expect(guard.backstopHits()).toEqual([`GET ${VITE_SUPABASE_URL}/rest/v1/anything?select=*`]);
    expect(() => guard.assertClean()).toThrow(BACKSTOP_MESSAGE);
    guard.allowBackstop(/\/rest\/v1\/anything/);
    expect(() => guard.assertClean()).not.toThrow();
  });

  test("route.fallback() is not a claim: the request is reported", async ({ page, context }) => {
    await page.goto("/welcome");
    const guard = installSupabaseGuard(context);

    // `fallback()` explicitly defers, so the request lands on the context guard.
    await page.route(`${VITE_SUPABASE_URL}/rest/v1/fellback*`, (route) => route.fallback());

    const url = `${VITE_SUPABASE_URL}/rest/v1/fellback?select=*`;
    expect(await fetchStatus(page, url)).toBe(501);
    expect(guard.unclaimed()).toEqual([`GET ${url}`]);
  });

  test("route.continue() is not a claim: the request is reported although it bypasses the route", async ({
    page,
    context,
    supabaseGuard,
  }) => {
    await page.goto("/welcome");
    const guard = installSupabaseGuard(context);

    // `route.continue()` sends the request to the real network and, measured rather than
    // assumed, does **not** fall through to a context route — so neither guard's last-resort
    // route ever sees it. This is precisely the leak the guard exists to catch, so it must still
    // be reported; the `requestfailed` detector is what catches it. Delete that detector and
    // this test is what goes red.
    await page.route(`${VITE_SUPABASE_URL}/rest/v1/passthrough*`, (route) => route.continue());

    const url = `${VITE_SUPABASE_URL}/rest/v1/passthrough?select=*`;
    // The fetch *throws* in page context (DNS failure on the fixture's fake host), unlike every
    // other case here — which is itself the evidence that it really did leave the browser.
    await page.evaluate(async (u) => {
      await fetch(u).catch(() => undefined);
    }, url);

    await expect.poll(() => guard.unclaimed()).toEqual([`GET ${url}`]);
    // The auto guard saw the same leak, since `continue()` bypasses both context routes equally.
    // Drop it, or this test fails its own teardown for doing exactly what it set out to prove.
    supabaseGuard.forgetPlantedLeaks();
  });

  // T-0480 (D-0173): a request a spec's own `page.route` fulfilled with a real response is not a
  // leak, even if Chromium then reports it `requestfailed: net::ERR_ABORTED` because a hard
  // navigation tore the frame down. It asserts nothing itself: the `auto` guard's teardown is
  // what fails it if the exemption is missing (red without the `fulfilledResponses` check).
  // The `route.continue()` test above is the other half: a real leak never gets a response.
  test("T-0480 a page-fulfilled request aborted by a hard navigation is not reported", async ({
    page,
  }) => {
    await page.goto("/welcome");
    const url = `${VITE_SUPABASE_URL}/functions/v1/fulfilled_then_nav`;
    await page.route(url, (route) => route.fulfill({ status: 204 }));
    await page.evaluate(async (u) => {
      const first = fetch(u, { method: "DELETE" });
      const second = fetch(u, { method: "POST" });
      await first;
      void second;
      window.location.replace("/welcome");
    }, url);
    await page.waitForLoadState("load");
  });

  // AC-8 background. The ticket expected offline requests to bypass routing entirely; measured,
  // they do not — `setOffline(true)` leaves interception fully active, so an *unmocked* Supabase
  // fetch made while offline is still caught by the guard's route and still reported. Pinned
  // here because it is the opposite of what the ticket says, and a future reader will otherwise
  // trust the ticket. What actually keeps `offline.spec.ts` green is that its own page routes
  // claim its requests, online and offline alike — covered by the suite itself (AC-5, AC-8).
  test("setOffline does not suspend interception: an unmocked request is still reported", async ({
    page,
    context,
    supabaseGuard,
  }) => {
    // T-0429: no console allow. The bundle's registration (src/lib/pwa/register.ts) catches a
    // failed `sw.js` fetch, so no unhandled rejection. Chromium still logs its own
    // "An unknown error occurred when fetching the script." when the fetch fails, which no page
    // code can catch, so this waits for the worker before going offline instead of racing it.
    await page.goto("/welcome");
    await page.evaluate(() => navigator.serviceWorker.ready);
    const guard = installSupabaseGuard(context);
    await context.setOffline(true);

    const url = `${VITE_SUPABASE_URL}/rest/v1/while_offline?select=*`;
    expect(await fetchStatus(page, url)).toBe(501);

    expect(guard.unclaimed()).toEqual([`GET ${url}`]);
    supabaseGuard.forgetPlantedLeaks();
  });
});

// AC-7: the `auto` fixture's teardown is the *only* thing that can fail this test. It asserts
// nothing, so if `test.fail()` reports it as unexpectedly passing, the guard is not wired in.
test.fail(
  "AC-7 the auto fixture fails a test that leaks, with no other assertion present",
  async ({ page }) => {
    await page.goto("/welcome");
    await page.evaluate(async (url) => {
      await fetch(url).catch(() => undefined);
    }, PLANTED_URL);
  },
);

// T-0425: the console guard. `/welcome` is signed out and logs nothing of its own, so every line
// these tests see is one they planted.
test.describe("T-0425 the console guard fails a test on a console error or page error", () => {
  // AC1/AC2/AC4: only the `auto` fixture's teardown can fail these — they assert nothing.
  test.fail("T-0425 AC1 a console.error fails the test at teardown", async ({ page }) => {
    await page.goto("/welcome");
    await page.evaluate(() => console.error("t0425-planted"));
  });

  test.fail("T-0425 AC2 an uncaught exception fails the test at teardown", async ({ page }) => {
    await page.goto("/welcome");
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("t0425-uncaught");
      });
    });
    await page.waitForTimeout(100);
  });

  test.fail(
    "T-0425 AC2 an unhandled promise rejection fails the test at teardown",
    async ({ page }) => {
      await page.goto("/welcome");
      await page.evaluate(() => {
        void Promise.reject(new Error("t0425-rejected"));
      });
      await page.waitForTimeout(100);
    },
  );

  test.fail(
    "T-0425 AC4 a console.error on a page opened later fails the test",
    async ({ page, context }) => {
      await page.goto("/welcome");
      const second = await context.newPage();
      await second.goto("/welcome");
      await second.evaluate(() => console.error("t0425-second-page"));
    },
  );

  // AC1/AC2 message: `test.fail` proves *that* the test fails, not *why*. The fixture's teardown
  // is `guard.assertClean()`, so a local guard on the same context pins the message it throws.
  // The planted lines also reach the auto guard, so each test allows them there.
  test("T-0425 AC1 the failure names CONSOLE_ERROR_MESSAGE and the planted text", async ({
    page,
    context,
    consoleGuard,
  }) => {
    await page.goto("/welcome");
    const guard = installConsoleGuard(context);
    consoleGuard.allow(/t0425-planted/);
    await page.evaluate(() => console.error("t0425-planted"));

    await expect.poll(() => guard.errors().length).toBe(1);
    expect(guard.errors()[0]).toMatch(/^console\.error: t0425-planted \(.*:\d+\)$/);
    expect(CONSOLE_ERROR_MESSAGE).toBe("console error in e2e");
    expect(() => guard.assertClean()).toThrow(CONSOLE_ERROR_MESSAGE);
    expect(() => guard.assertClean()).toThrow("t0425-planted");
  });

  test("T-0425 AC2 the failure names pageerror: <message> for a throw and a rejection", async ({
    page,
    context,
    consoleGuard,
  }) => {
    await page.goto("/welcome");
    const guard = installConsoleGuard(context);
    consoleGuard.allow(/t0425-(uncaught|rejected)/);
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("t0425-uncaught");
      });
      void Promise.reject(new Error("t0425-rejected"));
    });

    await expect
      .poll(() => [...guard.errors()].sort())
      .toEqual(["pageerror: t0425-rejected", "pageerror: t0425-uncaught"]);
    expect(() => guard.assertClean()).toThrow("pageerror: t0425-uncaught");
    expect(() => guard.assertClean()).toThrow("pageerror: t0425-rejected");
  });

  // AC3: what passes. No `test.fail` here: these are green only if the auto guard stays quiet.
  test("T-0425 AC3 console.warn, console.info and console.log pass", async ({ page }) => {
    await page.goto("/welcome");
    await page.evaluate(() => {
      console.warn("t0425-warn");
      console.info("t0425-info");
      console.log("t0425-log");
    });
    await page.waitForTimeout(100);
  });

  // The same lines on a local guard: proves they were delivered and skipped, not merely late. A
  // sentinel error logged after them is the one line recorded, and it is allowed on both guards.
  test("T-0425 AC3 warn/info/log are delivered and not recorded", async ({
    page,
    context,
    consoleGuard,
  }) => {
    await page.goto("/welcome");
    const guard = installConsoleGuard(context);
    consoleGuard.allow(/t0425-sentinel/);
    await page.evaluate(() => {
      console.warn("t0425-warn");
      console.info("t0425-info");
      console.log("t0425-log");
      console.error("t0425-sentinel");
    });
    await expect.poll(() => guard.errors().length).toBe(1);
    expect(guard.errors()[0]).toContain("t0425-sentinel");
  });

  test("T-0425 AC3 a claimed 501 (Failed to load resource) passes", async ({
    page,
    context,
    supabaseGuard,
  }) => {
    // T-0436: this test wants the backstop hit (its subject is the browser's 501 console line).
    supabaseGuard.allowBackstop(/\/rest\/v1\/anything/);
    await page.goto("/welcome");
    const guard = installConsoleGuard(context);
    await mockSupabaseRest(page);
    const network: string[] = [];
    page.on("console", (message) => {
      if (message.text().startsWith("Failed to load resource:")) network.push(message.text());
    });

    expect(await fetchStatus(page, `${VITE_SUPABASE_URL}/rest/v1/anything?select=*`)).toBe(501);
    // The browser did log its network-status line (so the exemption is what keeps this green,
    // not the line's absence), and the guard did not record it.
    await expect.poll(() => network.length).toBeGreaterThan(0);
    expect(network[0]).toContain("501");
    expect(guard.errors()).toEqual([]);
  });

  test("T-0425 AC3 consoleGuard.allow exempts a matching console.error", async ({
    page,
    consoleGuard,
  }) => {
    consoleGuard.allow(/t0425-allowed/);
    await page.goto("/welcome");
    await page.evaluate(() => console.error("t0425-allowed"));
    await expect.poll(() => consoleGuard.errors().length).toBe(1);
  });

  test("T-0425 AC3 errors() lists a planted console.error exactly once", async ({
    page,
    context,
    consoleGuard,
  }) => {
    await page.goto("/welcome");
    const guard = installConsoleGuard(context);
    consoleGuard.allow(/t0425-once/);
    await page.evaluate(() => console.error("t0425-once"));
    await expect.poll(() => guard.errors().length).toBe(1);
    // Settle, then check nothing arrived twice (e.g. a page attached by both pages() and "page").
    await page.waitForTimeout(100);
    expect(guard.errors().filter((line) => line.includes("t0425-once"))).toHaveLength(1);
  });

  // AC3 carry-over: serial, so the second test runs after the first in the same worker. The
  // first allows the line; the second's guard must record it and fail assertClean on it.
  test.describe.serial("T-0425 AC3 an allow does not carry over to the next test", () => {
    test("T-0425 AC3 first test: allowed", async ({ page, context, consoleGuard }) => {
      await page.goto("/welcome");
      const guard = installConsoleGuard(context);
      guard.allow(/t0425-carry/);
      consoleGuard.allow(/t0425-carry/);
      await page.evaluate(() => console.error("t0425-carry"));
      await expect.poll(() => guard.errors().length).toBe(1);
      expect(() => guard.assertClean()).not.toThrow();
    });

    test("T-0425 AC3 second test: the same line is recorded and fails", async ({
      page,
      context,
      consoleGuard,
    }) => {
      await page.goto("/welcome");
      const guard = installConsoleGuard(context);
      await page.evaluate(() => console.error("t0425-carry"));
      await expect.poll(() => guard.errors().length).toBe(1);
      expect(() => guard.assertClean()).toThrow("t0425-carry");
      // The auto guard is fresh too: it recorded the line with no allow inherited.
      expect(() => consoleGuard.assertClean()).toThrow("t0425-carry");
      consoleGuard.allow(/t0425-carry/);
    });
  });

  test("T-0425 AC2 a pageerror is never exempt, even with the network-status prefix", async ({
    page,
    context,
    consoleGuard,
  }) => {
    await page.goto("/welcome");
    const guard = installConsoleGuard(context);
    consoleGuard.allow(/t0425-prefixed/);
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("Failed to load resource: t0425-prefixed");
      });
    });
    await expect
      .poll(() => guard.errors())
      .toEqual(["pageerror: Failed to load resource: t0425-prefixed"]);
  });
});

// T-0436 (D-0155 §4): a hit on the mocks' 501 catch-all is reported, unless the test allows it.
// Like AC-6, the tests drive `installSupabaseGuard` on their own context. The auto guard listens on
// the same context, so each planted hit is also acknowledged on it (`supabaseGuard.allowBackstop`).
const ANYTHING = `${VITE_SUPABASE_URL}/rest/v1/anything?select=*`;

async function post(page: import("@playwright/test").Page, url: string): Promise<number> {
  return page.evaluate(async (target) => (await fetch(target, { method: "POST" })).status, url);
}

test.describe("T-0436 backstop hits", () => {
  test("T-0436 AC1 a REST backstop hit is reported", async ({ page, context, supabaseGuard }) => {
    // T-0436: planted on purpose.
    supabaseGuard.allowBackstop(/\/rest\/v1\/anything/);
    await page.goto("/welcome");
    const guard = installSupabaseGuard(context);
    await mockSupabaseRest(page);

    expect(await fetchStatus(page, ANYTHING)).toBe(501);
    expect(guard.backstopHits()).toEqual([`GET ${ANYTHING}`]);
    expect(guard.unclaimed()).toEqual([]);
    expect(() => guard.assertClean()).toThrow(BACKSTOP_MESSAGE);
    expect(() => guard.assertClean()).toThrow(ANYTHING);
  });

  test("T-0436 AC2 an auth backstop hit is reported, and so is a non-PKCE /token grant", async ({
    page,
    context,
    supabaseGuard,
  }) => {
    // T-0436: planted on purpose.
    supabaseGuard.allowBackstop(/\/auth\/v1\//);
    await page.goto("/welcome");
    const guard = installSupabaseGuard(context);
    await mockSupabaseAuth(page);
    const logout = `${VITE_SUPABASE_URL}/auth/v1/logout`;
    expect(await post(page, logout)).toBe(501);
    expect(guard.backstopHits()).toEqual([`POST ${logout}`]);

    await mockSupabaseEmailAuth(page);
    const token = `${VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`;
    expect(await post(page, token)).toBe(501);
    expect(guard.backstopHits()).toEqual([`POST ${logout}`, `POST ${token}`]);
    expect(guard.unclaimed()).toEqual([]);
  });

  test("T-0436 AC3 a real mock is not a hit", async ({ page, context }) => {
    await page.goto("/welcome");
    const guard = installSupabaseGuard(context);
    await mockSupabaseRest(page);
    await page.route(`${VITE_SUPABASE_URL}/rest/v1/served*`, (route) =>
      route.fulfill({ status: 200, json: [] }),
    );
    await mockProfilePresent(page);

    expect(await fetchStatus(page, `${VITE_SUPABASE_URL}/rest/v1/served?select=*`)).toBe(200);
    expect(await fetchStatus(page, `${VITE_SUPABASE_URL}/rest/v1/profiles?select=*`)).toBe(200);
    expect(guard.backstopHits()).toEqual([]);
    expect(() => guard.assertClean()).not.toThrow();
  });

  test("T-0436 AC4 allowBackstop exempts only what matches, and keeps listing the hit", async ({
    page,
    context,
    supabaseGuard,
  }) => {
    // T-0436: planted on purpose.
    supabaseGuard.allowBackstop(/\/rest\/v1\/(anything|other)/);
    await page.goto("/welcome");
    const guard = installSupabaseGuard(context);
    await mockSupabaseRest(page);
    guard.allowBackstop(/\/rest\/v1\/anything/);

    await fetchStatus(page, ANYTHING);
    expect(guard.backstopHits()).toEqual([`GET ${ANYTHING}`]);
    expect(() => guard.assertClean()).not.toThrow();

    const other = `${VITE_SUPABASE_URL}/rest/v1/other?select=*`;
    await fetchStatus(page, other);
    expect(() => guard.assertClean()).toThrow(other);
    expect(() => guard.assertClean()).not.toThrow(ANYTHING + "\n");
    let message = "";
    try {
      guard.assertClean();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain("anything");
  });

  // An allow never carries over: the first test allows the hit, the second makes the same hit with
  // no allow and must fail at teardown.
  test("T-0436 AC4 an allow, first test: allowed, passes", async ({ page, supabaseGuard }) => {
    // T-0436: planted on purpose.
    supabaseGuard.allowBackstop(/\/rest\/v1\/anything/);
    await page.goto("/welcome");
    await mockSupabaseRest(page);
    await fetchStatus(page, ANYTHING);
  });

  test("T-0436 AC4 an allow, second test: the same hit with no allow fails", async ({ page }) => {
    test.fail();
    await page.goto("/welcome");
    await mockSupabaseRest(page);
    await fetchStatus(page, ANYTHING);
  });

  test("T-0436 AC4 allowBackstop rejects g and y flags, accepts i", ({ supabaseGuard }) => {
    expect(() => supabaseGuard.allowBackstop(/x/g)).toThrow(/global or sticky/);
    expect(() => supabaseGuard.allowBackstop(/x/y)).toThrow(/global or sticky/);
    expect(() => supabaseGuard.allowBackstop(/x/i)).not.toThrow();
  });

  test("T-0436 AC5 the auto fixture fails a test that hits the backstop", async ({ page }) => {
    test.fail();
    await page.goto("/welcome");
    await mockSupabaseRest(page);
    await fetchStatus(page, ANYTHING);
  });

  test("T-0436 AC5 forgetPlantedLeaks also clears the backstop list", async ({
    page,
    supabaseGuard,
  }) => {
    await page.goto("/welcome");
    await mockSupabaseRest(page);
    await fetchStatus(page, ANYTHING);
    await expect.poll(() => supabaseGuard.backstopHits().length).toBe(1);
    supabaseGuard.forgetPlantedLeaks();
    expect(supabaseGuard.backstopHits()).toEqual([]);
  });

  test("T-0436 AC7 the comment rule covers allowBackstop", () => {
    const F = "x.spec.ts";
    const call = "supabaseGuard.allowBackstop(/x/);";
    expect(allowCommentViolations(F, `// T-0436 wanted\n${call}`)).toEqual([]);
    expect(allowCommentViolations(F, call)).toEqual([`${F}:1`]);
    expect(allowCommentViolations(F, `// no ticket\n${call}`)).toEqual([`${F}:2`]);
  });
});

// T-0484 (D-0175 §3): the `goOffline` fixture's own tests. `page.evaluate(() => fetch(...))`
// drives every write directly from page context — a probe no product change can take away,
// unlike T-0906's original proof, which relied on AutoSync's mount flush as the write attempt
// (see offline.ts's header comment and T-0484's "Why the self-test forces its own write").
test.describe("T-0484 goOffline fixture", () => {
  const EMPTY_FIXTURES = {
    sets: [],
    exercises: [],
    exerciseAreas: [],
    areaTargets: [],
    profile: {
      goal: "build_muscle",
      level: "beginner",
      equipment: [],
      rhythm_min: 3,
      rhythm_max: 4,
      priority_areas: [],
      onboarded_at: "2026-09-01T00:00:00.000Z",
      plan_changed_at: "2026-09-01T00:00:00.000Z",
    },
  };

  async function postJson(
    page: import("@playwright/test").Page,
    url: string,
  ): Promise<{ ok: boolean; status: number; threwTypeError: boolean }> {
    return page.evaluate(async (target) => {
      try {
        const res = await fetch(target, { method: "POST", body: "{}" });
        return { ok: res.ok, status: res.status, threwTypeError: false };
      } catch (error) {
        return { ok: false, status: 0, threwTypeError: error instanceof TypeError };
      }
    }, url);
  }

  async function patchJson(
    page: import("@playwright/test").Page,
    url: string,
  ): Promise<{ threwTypeError: boolean }> {
    return page.evaluate(async (target) => {
      try {
        await fetch(target, { method: "PATCH", body: "{}" });
        return { threwTypeError: false };
      } catch (error) {
        return { threwTypeError: error instanceof TypeError };
      }
    }, url);
  }

  test("AC-1 writes abort, reads pass, navigator.onLine is false", async ({ page, context }) => {
    await mockSupabaseAuth(page);
    await mockSupabaseRest(page);
    await mockSupabaseData(page, EMPTY_FIXTURES);
    await mockProfilePresent(page);
    await page.goto("/");
    // T-0429: wait for the service worker before going offline, or Chromium logs its own
    // "An unknown error occurred when fetching the script." when the SW's own fetch fails mid
    // registration (the same race `fixture-guard.spec.ts`'s other `setOffline` test avoids).
    await page.evaluate(() => navigator.serviceWorker.ready);

    const gate = await goOffline(page, context);

    const sessionSets = await postJson(page, `${VITE_SUPABASE_URL}/rest/v1/session_sets`);
    expect(sessionSets.threwTypeError).toBe(true);
    expect(gate.writesAbortedOffline()).toBe(1);
    expect(gate.writesFulfilledOffline()).toBe(0);

    const sessionPatch = await patchJson(page, `${VITE_SUPABASE_URL}/rest/v1/sessions?id=eq.x`);
    expect(sessionPatch.threwTypeError).toBe(true);
    expect(gate.writesAbortedOffline()).toBe(2);
    expect(gate.writesFulfilledOffline()).toBe(0);

    const checkin = await postJson(page, `${VITE_SUPABASE_URL}/rest/v1/plan_checkins`);
    expect(checkin.threwTypeError).toBe(true);
    expect(gate.writesAbortedOffline()).toBe(3);
    expect(gate.writesFulfilledOffline()).toBe(0);

    const read = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return { status: res.status, body: (await res.json()) as unknown };
    }, `${VITE_SUPABASE_URL}/rest/v1/exercises`);
    expect(read.status).toBe(200);
    expect(read.body).toEqual(EMPTY_FIXTURES.exercises);

    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  });

  test("AC-2 a spec route registered after goOffline shadows the gate", async ({
    page,
    context,
  }) => {
    await mockSupabaseAuth(page);
    await mockSupabaseRest(page);
    await mockSupabaseData(page, EMPTY_FIXTURES);
    await mockProfilePresent(page);
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);

    const gate = await goOffline(page, context);

    // Registered *after* goOffline: the most-recently-registered handler runs first, so this
    // shadows the gate exactly as the doc comment warns.
    await page.route(`${VITE_SUPABASE_URL}/rest/v1/session_sets*`, (route) =>
      route.fulfill({ status: 201, json: {} }),
    );

    const result = await postJson(page, `${VITE_SUPABASE_URL}/rest/v1/session_sets`);
    expect(result.threwTypeError).toBe(false);
    expect(result.status).toBe(201);
    // `requestfinished` fires asynchronously after the response already resolved in page context
    // (the `fetch` above), so the counter can lag the assertion by a tick.
    await expect.poll(() => gate.writesFulfilledOffline()).toBe(1);
  });

  test("AC-3 goOnline disarms then goes online; counters frozen, the same POST now resolves", async ({
    page,
    context,
  }) => {
    await mockSupabaseAuth(page);
    await mockSupabaseRest(page);
    await mockSupabaseData(page, EMPTY_FIXTURES);
    await mockProfilePresent(page);
    // Registered *after* mockSupabaseData (T-0489, D-0176): mockSupabaseData's own
    // session_sets* route is GET-only and aborts any other method by default. This test
    // deliberately drives a real post-goOnline write, so — like uf-09-offline.spec.ts's
    // recordWrites and uf-08-setup.spec.ts's recordSessions — it registers its own
    // method-aware route, which wins because Playwright runs the most-recently-registered
    // matching handler first.
    await page.route(`${VITE_SUPABASE_URL}/rest/v1/session_sets*`, (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ status: 200, json: [] });
      }
      return route.fulfill({ status: 200, json: {} });
    });
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);

    const gate = await goOffline(page, context);
    const url = `${VITE_SUPABASE_URL}/rest/v1/session_sets`;
    await postJson(page, url);
    expect(gate.writesAbortedOffline()).toBe(1);
    expect(gate.writesFulfilledOffline()).toBe(0);

    await gate.goOnline();
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);

    const result = await postJson(page, url);
    expect(result.threwTypeError).toBe(false);
    expect(result.status).toBe(200);
    // Nothing counted after disarm: still the pre-goOnline counts.
    expect(gate.writesAbortedOffline()).toBe(1);
    expect(gate.writesFulfilledOffline()).toBe(0);
  });
});

// T-0430: unit tests for the source rules and the allow flag check. Pure functions and a local
// guard, so none of these depend on what the real spec files currently contain.
test.describe("T-0430 source rules and allow flags", () => {
  const F = "planted.spec.ts";

  test("T-0430 AC1 ownConsoleListeners reports console and pageerror listeners", () => {
    expect(ownConsoleListeners(F, 'page.on("console", f);')).toEqual([`${F}:1`]);
    expect(ownConsoleListeners(F, "x;\npage.on('pageerror', f);")).toEqual([`${F}:2`]);
    expect(ownConsoleListeners(F, 'second.on( "console", f);')).toEqual([`${F}:1`]);
  });

  test("T-0430 AC1 ownConsoleListeners ignores comments and other events", () => {
    expect(ownConsoleListeners(F, '// page.on("console")')).toEqual([]);
    expect(ownConsoleListeners(F, '  // page.on("pageerror", f)')).toEqual([]);
    expect(ownConsoleListeners(F, '/* page.on("console", f) */')).toEqual([]);
    expect(ownConsoleListeners(F, '/*\n page.on("console", f);\n*/\nx;')).toEqual([]);
    expect(ownConsoleListeners(F, 'page.on("request", f);')).toEqual([]);
    // A `//` inside a string is not a comment: the listener after it is still code.
    expect(ownConsoleListeners(F, 'go("http://x"); page.on("console", f);')).toEqual([`${F}:1`]);
    // Line numbers count lines inside a block comment.
    expect(ownConsoleListeners(F, '/*\n\n*/\npage.on("console", f);')).toEqual([`${F}:4`]);
  });

  const call = "consoleGuard.allow(/x/);";
  test("T-0430 AC3 allowCommentViolations: a T-NNNN in the block above passes", () => {
    expect(allowCommentViolations(F, `// T-0429 SW registration\n${call}`)).toEqual([]);
    expect(allowCommentViolations(F, `// T-0429 follow-up\n// more text\n${call}`)).toEqual([]);
    expect(
      allowCommentViolations(F, "    // T-0429\n    consoleGuard.allow(\n      /x/,\n    );"),
    ).toEqual([]);
  });

  test("T-0430 AC3 allowCommentViolations: code, a gap or no ticket is reported", () => {
    const literal = `const ticket = "T-0429";\n${call}`;
    expect(allowCommentViolations(F, literal)).toEqual([`${F}:2`]);
    // The T-0425 inline check (ticket text anywhere on the line above) accepted this.
    expect(/T-\d{4}/.test(literal.split("\n")[0]!)).toBe(true);
    expect(allowCommentViolations(F, `// T-0429\n\n${call}`)).toEqual([`${F}:3`]);
    expect(allowCommentViolations(F, `// see the ticket\n${call}`)).toEqual([`${F}:2`]);
    expect(allowCommentViolations(F, call)).toEqual([`${F}:1`]);
  });

  test("T-0430 AC4 allow rejects a global or sticky pattern", ({ context }) => {
    const guard = installConsoleGuard(context);
    for (const pattern of [/x/g, /x/y, /x/gi]) {
      expect(() => guard.allow(pattern), String(pattern)).toThrow(Error);
      expect(() => guard.allow(pattern), String(pattern)).toThrow("consoleGuard.allow");
      expect(() => guard.allow(pattern), String(pattern)).toThrow("global or sticky");
    }
  });

  test("T-0430 AC4 allow accepts the other flags", ({ context }) => {
    const guard = installConsoleGuard(context);
    for (const pattern of [/x/, /x/i, /x/m, /x/s, /x/u]) {
      expect(() => guard.allow(pattern), String(pattern)).not.toThrow();
    }
  });

  test("T-0430 AC4 an allowed /i pattern exempts two identical lines", async ({
    page,
    context,
    consoleGuard,
  }) => {
    await page.goto("/welcome");
    const guard = installConsoleGuard(context);
    guard.allow(/t0430-flag/i);
    consoleGuard.allow(/t0430-flag/i);
    await page.evaluate(() => {
      console.error("t0430-flag");
      console.error("t0430-flag");
    });
    await expect.poll(() => guard.errors().length).toBe(2);
    expect(() => guard.assertClean()).not.toThrow();
  });
});

// Source assertions. These are cheap and they close the hole where a later edit silently opts a
// spec out of the guard or quietly buys time with a raised timeout — the two ways this fix could
// be undone without anyone noticing.
test.describe("source assertions", () => {
  // T-0425: `__dirname` rather than `test.info().file`, because AC5's spec list is built at
  // collection time, before `test.info()` exists. Playwright transpiles these specs to CJS (the
  // repo has no `"type": "module"`), so `__dirname` is this directory whatever the working
  // directory of the run.
  const read = (name: string) => readFileSync(join(__dirname, name), "utf8");

  // AC-5 (T-0904), widened by T-0425 AC5: every spec that imports the fixture takes `test` from
  // it, so both auto guards run on every one of its tests.
  const specs = listSpecs(__dirname);

  // T-0356 (D-0090): one test per `tests/e2e/*.spec.ts`, from a glob, so a new spec that imports
  // `test` from `@playwright/test` (or skips the guarded import) is reported without an edit here.
  for (const spec of specs) {
    test(`T-0356 AC1 ${spec} imports test/expect from guarded-test.js`, () => {
      expect(unguardedReason(read(spec))).toBeNull();
    });
  }

  test("T-0356 AC5 no spec in tests/e2e opts out of the guard", () => {
    const bad = unguardedSpecs(__dirname);
    expect(bad.map((entry) => `${entry.file}: ${entry.reason}`)).toEqual([]);
    expect(specs.length).toBeGreaterThan(3);
  });

  test("T-0356 AC2 listSpecs lists *.spec.ts directly in the directory, sorted, no recursion", () => {
    const dir = mkdtempSync(join(tmpdir(), "wl-guard-"));
    try {
      writeFileSync(join(dir, "b.spec.ts"), "");
      writeFileSync(join(dir, "a.spec.ts"), "");
      writeFileSync(join(dir, "d.ts"), "");
      mkdirSync(join(dir, "fixtures"));
      writeFileSync(join(dir, "fixtures", "c.spec.ts"), "");
      expect(listSpecs(dir)).toEqual(["a.spec.ts", "b.spec.ts"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("T-0356 AC3 unguardedSpecs flags a scratch spec that imports test from @playwright/test", () => {
    const dir = mkdtempSync(join(tmpdir(), "wl-guard-"));
    try {
      const good = 'import { expect, test } from "./fixtures/guarded-test.js";\n';
      writeFileSync(join(dir, "a.spec.ts"), good);
      writeFileSync(join(dir, "b.spec.ts"), 'import { expect, test } from "@playwright/test";\n');
      const flagged = unguardedSpecs(dir);
      expect(flagged).toHaveLength(1);
      expect(flagged[0]!.file).toBe("b.spec.ts");
      expect(flagged[0]!.reason).not.toBe("");
      writeFileSync(
        join(dir, "b.spec.ts"),
        'import { test } from "./fixtures/guarded-test.js";\nimport { expect, test } from "@playwright/test";\n',
      );
      expect(unguardedSpecs(dir).map((entry) => entry.file)).toEqual(["b.spec.ts"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("T-0356 AC4 unguardedReason allows the guarded forms and rejects the bypasses", () => {
    const a = 'import { expect, test } from "./fixtures/guarded-test.js";\n';
    expect(unguardedReason(a)).toBeNull();
    expect(unguardedReason(a + 'import { type Page } from "@playwright/test";')).toBeNull();
    expect(unguardedReason(a + 'import type { Page, Route } from "@playwright/test";')).toBeNull();
    expect(unguardedReason(a + 'import AxeBuilder from "@axe-core/playwright";')).toBeNull();
    expect(unguardedReason('import { expect } from "@playwright/test";')).not.toBeNull();
    expect(unguardedReason(a + 'import { test as base } from "@playwright/test";')).not.toBeNull();
    expect(
      unguardedReason(a + 'import {\n  expect,\n  test,\n} from "@playwright/test";'),
    ).not.toBeNull();
    expect(unguardedReason(a + 'import * as pw from "@playwright/test";')).not.toBeNull();
    // A commented-out bypass is not a bypass.
    expect(unguardedReason(a + '// import { test } from "@playwright/test";')).toBeNull();
  });

  // T-0430 AC3 tightens this: the T-NNNN must sit in the `//` comment block directly above the
  // call (any line of it), not merely somewhere in the code line above.
  test("T-0425 AC5 every consoleGuard.allow( outside this file names a T-NNNN in the comment block above", () => {
    const missing = specs
      .filter((name) => name !== "fixture-guard.spec.ts")
      .flatMap((spec) => allowCommentViolations(spec, read(spec)));
    expect(missing).toEqual([]);
  });

  test("T-0436 AC7 every supabaseGuard.allowBackstop( outside this file names a T-NNNN above", () => {
    const missing = specs
      .filter((name) => name !== "fixture-guard.spec.ts")
      .flatMap((spec) => allowCommentViolations(spec, read(spec)));
    expect(missing).toEqual([]);
  });

  // T-0430 AC1: the `consoleGuard` auto fixture already fails a guarded test on a console error
  // or page error, so a guarded spec carrying its own listener is a duplicate that drifts. This
  // file is the one exception: it tests the guard, and T-0425 AC3 needs to see the raw lines.
  test("T-0430 AC1 no guarded spec registers its own console or pageerror listener", () => {
    const found = specs
      .filter((name) => name !== "fixture-guard.spec.ts")
      .flatMap((spec) => ownConsoleListeners(spec, read(spec)));
    expect(found).toEqual([]);
  });

  // T-0430 AC2: the uf-08 helper is gone, not just unused.
  test("T-0430 AC2 uf-08-setup.spec.ts has no consoleErrors helper", () => {
    expect(read("uf-08-setup.spec.ts").includes("consoleErrors")).toBe(false);
  });

  // T-0429 AC3 replaces T-0430 AC5 (which pinned the allow's T-0429 comment): the SW allow is
  // gone, the test takes no `consoleGuard`, and no spec allows the registration error any more.
  test("T-0429 AC3 the setOffline test has no consoleGuard, and no spec allows the SW error", () => {
    const lines = read("fixture-guard.spec.ts").split("\n");
    const title = lines.findIndex((line) =>
      line.includes('test("setOffline does not suspend interception'),
    );
    expect(title).toBeGreaterThan(-1);
    const end = lines.findIndex((line, i) => i > title && /^  \}\);$/.test(line));
    expect(end).toBeGreaterThan(title);
    const body = lines.slice(title, end + 1).join("\n");
    expect(body).not.toContain("consoleGuard");
    // Split so this file doesn't carry the very string it checks for.
    const swError = ["Failed to register", "a ServiceWorker"].join(" ");
    const files = (readdirSync(__dirname, { recursive: true }) as string[]).filter((name) =>
      name.endsWith(".ts"),
    );
    expect(files.filter((name) => read(name).includes(swError))).toEqual([]);
  });

  // AC-9: the fix must be a real fix, not a bigger timeout. If a future edit needs more time,
  // that is the signal the cause is unfixed.
  test("auth.spec.ts raises no timeout", () => {
    // Comments are stripped first: this file *discusses* the 5 s expect timeout at length, and a
    // naive substring search would match that prose instead of code. What must not appear is a
    // `timeout:` option, `setTimeout`/`test.setTimeout`, or `test.slow()`.
    const code = read("auth.spec.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/\btimeout\s*:/);
    expect(code).not.toContain("setTimeout");
    expect(code).not.toContain(".slow(");
  });
});
