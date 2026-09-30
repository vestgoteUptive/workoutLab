// T-0300a shell e2e (AC-A5, AC-A7, AC-A10, AC-A13). Runs against `vite preview` with the
// service worker for real.
//
// T-0904 corrects the stale claim that used to stand here ("no Supabase calls happen in this
// ticket's routes, so nothing needs `page.route` mocking"). It has been false since T-0301a:
// every test below that calls `injectSession` also triggers the profile gate's
// `GET /rest/v1/profiles` and `lib/offline`'s AutoSync selects. They kept passing only because
// `unknown` doesn't redirect on `/` — the same leak that made `auth.spec.ts` red, surviving here
// by luck. `test` now comes from `fixtures/guarded-test.js`, which fails on any unclaimed
// Supabase request (D-0086), and the signed-in tests state their profile state.
import AxeBuilder from "@axe-core/playwright";
import { BASE_URL, VITE_SUPABASE_URL } from "./playwright.config.js";
import {
  injectSession,
  mockProfilePresent,
  mockSupabaseAuth,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import { expect, test } from "./fixtures/guarded-test.js";

const TAB_ROUTES = ["/", "/library", "/progress", "/plan"] as const;
const AXE_ROUTES = ["/welcome", "/", "/library", "/progress", "/balance", "/plan"] as const;

test.beforeEach(async ({ page }) => {
  // The two 501 catch-alls are registered first so they end up matched *last*, as the final
  // backstop (Playwright runs the most-recently-registered matching handler first): the shell
  // calls `getSession`/`onAuthStateChange` through the real SDK and AutoSync fires a batch of
  // selects, and any call a test doesn't expect must fail loudly rather than reach the network.
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  // Registered after the catch-all so it wins for `profiles*`. Every signed-in test here wants
  // `present`: these are the signed-in shell routes, and a `missing` profile would send them to
  // `/welcome/save` (D-0064 §9) instead of rendering the tab bar the assertions look for. The
  // one signed-out test (AC-A5, and AC-A13's `/welcome`) never triggers the read at all.
  await mockProfilePresent(page);
});

test.describe("AC-A5 offline shell", () => {
  test("[data-screen-id=UF-01.1] renders offline within 3s after one online visit", async ({
    page,
    context,
  }) => {
    await page.goto("/welcome");
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.reload();

    await expect(page.locator('[data-screen-id="UF-01.1"]')).toBeVisible({ timeout: 3000 });
  });
});

test.describe("AC-A7 tab bar (e2e, 360x640)", () => {
  test.use({ viewport: { width: 360, height: 640 } });

  // `/` is a `protected` route (T-0300b, AC-B5): the tab bar only renders signed in, so
  // these two specs inject a session first.
  test("every tab hit area is >= 44x44px", async ({ page }) => {
    await page.goto("/");
    await injectSession(page);
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    const links = await nav.getByRole("link").all();
    expect(links.length).toBe(4);
    for (const link of links) {
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("Tab reaches the four links in order and Enter navigates", async ({ page }) => {
    await page.goto("/");
    await injectSession(page);
    await page.goto("/");
    const labels = ["Today", "Library", "Progress", "Plan"];
    for (const label of labels) {
      await page.keyboard.press("Tab");
      await expect(page.locator(":focus")).toHaveText(label);
    }
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/plan$/);
  });
});

test.describe("AC-A10 CSP origins (e2e)", () => {
  test("every request while walking the tabs stays on preview or Supabase origin", async ({
    page,
  }) => {
    await page.goto("/");
    await injectSession(page);

    const seen: string[] = [];
    page.on("request", (req) => seen.push(req.url()));

    for (const route of TAB_ROUTES) {
      await page.goto(route);
    }

    const allowed = new Set([new URL(BASE_URL).origin, VITE_SUPABASE_URL]);
    for (const url of seen) {
      const origin = new URL(url).origin;
      expect(allowed.has(origin), url).toBe(true);
    }
  });
});

test.describe("AC-A13 axe", () => {
  for (const route of AXE_ROUTES) {
    test(`${route} has 0 serious/critical violations`, async ({ page }) => {
      if (route !== "/welcome") {
        await page.goto("/");
        await injectSession(page);
      }
      await page.goto(route);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(serious).toEqual([]);
    });
  }
});

// T-0318 AC-6: each Phase 3 sub-route is its own lazy chunk, precached with the shell, so a
// cold *offline* load of one renders its screen. Appended to this spec as new tests only
// (the ticket's "Paths you may change"); nothing above is changed.
test.describe("AC-6 the Phase 3 sub-route chunks are precached (offline)", () => {
  // `/session/:sessionId/summary` uses the `session` guard (D-0071 §2), so a stored session
  // is enough; the stub itself makes no Supabase call. The 501 REST backstop is registered so
  // the shell's AutoSync fetches fail loudly rather than reaching the network.
  //
  // T-0904: this runs *after* the outer `beforeEach`, so re-registering the catch-all here puts
  // it ahead of that block's `mockProfilePresent` for `profiles*` too, and these tests resolve
  // the gate as `unknown` rather than `present`. That is deliberate and harmless — the routes
  // under test are `session`-guarded, not `protected`, so the profile gate doesn't redirect them
  // (D-0073 §2) — and the request is still claimed by the 501, so the guard stays green. Stated
  // rather than left implicit, because the shadowing is the non-obvious part.
  test.beforeEach(async ({ page }) => {
    await mockSupabaseRest(page);
  });

  test("[data-screen-id=UF-03.3] renders offline after one online load of /session/S1/summary", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await injectSession(page);

    await page.goto("/session/S1/summary");
    await expect(page.locator('[data-screen-id="UF-03.3"]')).toBeVisible();
    // The chunk has to be in the precache *before* going offline, or the reload below would
    // pass only because the browser had it in its own HTTP cache.
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.reload();

    await expect(page.locator('[data-screen-id="UF-03.3"]')).toBeVisible({ timeout: 3000 });
  });

  // A cold offline load: the service worker is warmed on a *different* route, so the summary
  // chunk can only come from the precache manifest, never from having been fetched before.
  test("[data-screen-id=UF-03.3] renders on a cold offline navigation warmed from /", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await injectSession(page);
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.goto("/session/S1/summary");

    await expect(page.locator('[data-screen-id="UF-03.3"]')).toBeVisible({ timeout: 3000 });
  });

  const OTHER_SUB_ROUTES = [
    ["/library/back-squat/compare/leg-press", "UF-04.3"],
    ["/progress/back-squat", "UF-06.2"],
    ["/plan/edit", "UF-11.3"],
    ["/plan/routines/new", "UF-07.1"],
    ["/plan/routines/R1", "UF-07.1"],
  ] as const;

  for (const [path, screenId] of OTHER_SUB_ROUTES) {
    test(`${path} renders ${screenId} offline after warming the shell`, async ({
      page,
      context,
    }) => {
      await page.goto("/");
      await injectSession(page);
      await page.goto("/");
      await page.evaluate(() => navigator.serviceWorker.ready);

      await context.setOffline(true);
      await page.goto(path);

      await expect(page.locator(`[data-screen-id="${screenId}"]`)).toBeVisible({ timeout: 3000 });
    });
  }
});
