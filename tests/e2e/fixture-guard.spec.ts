// T-0904: the guard guards itself (D-0086). `fixtures/guarded-test.ts` is the thing that will
// catch the *next* unmocked-Supabase regression, so it needs its own tests — a guard nobody
// tests is a guard that quietly stops working.
//
// AC-6 drives `installSupabaseGuard` directly on the test's own context rather than nesting a
// Playwright run: a nested run would fight this one over the `--strictPort` preview server.
// AC-7 covers the part that cannot be reached that way — that the `auto` fixture actually fails
// a test — with Playwright's `test.fail()` annotation.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, installSupabaseGuard, test, UNCLAIMED_MESSAGE } from "./fixtures/guarded-test.js";
import { mockSupabaseRest, VITE_SUPABASE_URL } from "./fixtures/supabase-mock.js";

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

  test("a request claimed by the 501 backstop is not reported", async ({ page, context }) => {
    await page.goto("/welcome");
    const guard = installSupabaseGuard(context);
    await mockSupabaseRest(page);

    // The backstop keeps it off the network, which is the property being enforced, so a 501 is
    // a claim. This is what keeps `offline.spec.ts` and shell's AC-6 block green under the guard.
    expect(await fetchStatus(page, `${VITE_SUPABASE_URL}/rest/v1/anything?select=*`)).toBe(501);
    expect(guard.unclaimed()).toEqual([]);
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
    await page.goto("/welcome");
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

// Source assertions. These are cheap and they close the hole where a later edit silently opts a
// spec out of the guard or quietly buys time with a raised timeout — the two ways this fix could
// be undone without anyone noticing.
test.describe("source assertions", () => {
  // `test.info().file` is the absolute path of *this* spec, so the sibling specs resolve without
  // `import.meta` (Playwright transpiles these to CJS — the repo has no `"type": "module"`) and
  // without depending on the working directory the run started from.
  const read = (name: string) => readFileSync(join(dirname(test.info().file), name), "utf8");

  // AC-5: every migrated spec is actually guarded.
  for (const spec of ["auth.spec.ts", "shell.spec.ts", "offline.spec.ts"]) {
    test(`${spec} imports test/expect from guarded-test.js, not @playwright/test`, () => {
      const source = read(spec);
      expect(source).toContain('from "./fixtures/guarded-test.js"');
      // A type-only import from `@playwright/test` is fine; importing `test` from it is not,
      // because that silently bypasses the auto fixture.
      const bindings = source.match(/import\s*\{([^}]*)\}\s*from\s*"@playwright\/test"/s);
      if (bindings) {
        expect(bindings[1]).not.toMatch(/\btest\b/);
      }
    });
  }

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
