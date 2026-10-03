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
  mockSupabaseData,
  mockSupabaseEmptyReads,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import {
  exerciseAreas,
  exerciseVariants,
  exercises,
  profile,
} from "./fixtures/uf-04-library-data.js";
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
  // T-0436: AutoSync's reads resolve as `200 []`, so none of them is a backstop hit.
  await mockSupabaseEmptyReads(page);
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
  //
  // T-0905 (D-0091): rows for *built* screens seed their data and assert the URL holds; the
  // generic loop below is for stubs only. A built screen may correctly redirect on an empty
  // cache (UF-04.3 sends an unknown exercise id to `/library`, D-0079 §3), and a bare
  // `toBeVisible` on the outer `data-screen-id` wrapper then passes or fails on whether the
  // first poll lands before the redirect. So UF-04.3 has its own seeded test plus an
  // empty-cache contrast, and the loop asserts the URL is unchanged after render, which turns
  // the next built screen that redirects into a deterministic failure. The T-0904 note above
  // (the 501 shadowing `profiles*`) still applies to the stub rows. That URL check only
  // narrows the redirect race for the stub rows; it does not close it, so built screens get
  // their own seeded tests that assert content a stub never renders. UF-06.2
  // (`/progress/back-squat`) is now one of them: T-0307b took it out of the loop, seeded it
  // the same way and added the empty-cache contrast (D-0091 §4–§5). UF-07.1 with an id
  // (`/plan/routines/R1`) is another: it redirects an unknown id to `/plan` offline (D-0081 §5),
  // so T-0308a AC-A16 moved that row out of the loop into a seeded test that asserts the
  // routine's name in the editor, plus an empty-cache contrast that lands on `/plan`.
  //
  // T-0436 (D-0155 §4): re-registering the backstop shadows the outer reads, so each one it
  // answered was a backstop hit. They are re-mocked here after it: `200 []` for AutoSync's reads
  // and `present` for the profile gate. That supersedes the `unknown` gate state the T-0904 note
  // above describes; `session`-guarded and stub routes behave the same with `present`.
  test.beforeEach(async ({ page }) => {
    await mockSupabaseRest(page);
    await mockSupabaseEmptyReads(page);
    await mockProfilePresent(page);
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

  const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const OTHER_SUB_ROUTES = [
    ["/plan/edit", "UF-11.3"],
    ["/plan/routines/new", "UF-07.1"],
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
      await expect(page).toHaveURL(new RegExp(`${escapeRegExp(path)}$`));
    });
  }

  // T-0905 AC-1 (D-0091 §1–§2): with the library cached by one online visit, a cold offline
  // deep-link to Compare renders the built UF-04.3 and stays on its URL.
  test("/library/back-squat/compare/leg-press renders UF-04.3 offline with a cached library", async ({
    page,
    context,
  }) => {
    // Registered after this describe's 501 backstop, so it wins for every table it serves
    // (Playwright runs the most-recently-registered matching handler first).
    await mockSupabaseData(page, {
      sets: [],
      exercises,
      exerciseAreas,
      exerciseVariants,
      areaTargets: [],
      profile,
    });
    await page.goto("/");
    await injectSession(page);
    await page.goto("/library");
    await expect(page.locator('[data-field="name"]').first()).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.goto("/library/back-squat/compare/leg-press");

    await expect(page.locator('[data-screen-id="UF-04.3"]')).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole("columnheader", { name: "Leg press" })).toBeVisible();
    await expect(page).toHaveURL(/\/library\/back-squat\/compare\/leg-press$/);
  });

  // T-0307b AC-16 (D-0091 §1, §4): UF-06.2 is built, so it leaves the stub loop. With the
  // library cached by one online visit, a cold offline deep-link renders the real screen. The
  // content assertions are the guard; the URL check after them only confirms it stayed.
  test("/progress/back-squat renders UF-06.2 offline with a cached library", async ({
    page,
    context,
  }) => {
    // Registered after this describe's 501 backstop, so it wins for every table it serves.
    await mockSupabaseData(page, {
      sets: [],
      exercises,
      exerciseAreas,
      exerciseVariants,
      areaTargets: [],
      profile,
    });
    await page.goto("/");
    await injectSession(page);
    await page.goto("/library");
    await expect(page.locator('[data-field="name"]').first()).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.goto("/progress/back-squat");

    await expect(page.locator('[data-screen-id="UF-06.2"]')).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole("heading", { level: 1, name: "Back squat" })).toBeVisible();
    await expect(page.getByRole("link", { name: "How to" })).toHaveAttribute(
      "href",
      "/library/back-squat",
    );
    await expect(page.getByRole("link", { name: "How to" })).toBeVisible();
    await expect(page).toHaveURL(/\/progress\/back-squat$/);
  });

  // T-0307b AC-16 (D-0079 §4): the contrast. With nothing cached, `back-squat` is unknown, so
  // the same offline deep-link redirects to UF-06.1. This pins the redirect instead of racing it.
  test("/progress/back-squat lands on UF-06.1 offline with an empty cache", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await injectSession(page);
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.goto("/progress/back-squat");

    await expect(page).toHaveURL(/\/progress$/);
    await expect(page.locator('[data-screen-id="UF-06.1"]')).toBeVisible({ timeout: 3000 });
  });

  // T-0308a AC-A16 (D-0091 §1, D-0081 §5): UF-07.1 with a routine id is built, so it leaves the
  // stub loop. One online visit seeds routine R1 into the cache, then a cold offline deep-link
  // renders the editor with that routine. The content assertions are the guard; the URL check
  // comes last and only confirms the screen stayed.
  test("/plan/routines/R1 renders UF-07.1 offline with a cached routine", async ({
    page,
    context,
  }) => {
    await mockSupabaseData(page, {
      sets: [],
      exercises,
      exerciseAreas,
      exerciseVariants,
      areaTargets: [],
      profile,
      routines: [{ id: "R1", name: "Lower A", updated_at: "2026-09-20T10:00:00.000Z" }],
      routineItems: [{ routine_id: "R1", position: 0, exercise_id: "back-squat" }],
    });
    await page.goto("/");
    await injectSession(page);
    await page.goto("/plan/routines/R1");
    await expect(page.getByLabel("Name")).toHaveValue("Lower A");
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.goto("/plan/routines/R1");

    await expect(page.locator('[data-screen-id="UF-07.1"]')).toBeVisible({ timeout: 3000 });
    await expect(page.getByLabel("Name")).toHaveValue("Lower A");
    await expect(page.getByText("1. Back squat")).toBeVisible();
    await expect(page.getByText("Connect to save")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
    await expect(page).toHaveURL(/\/plan\/routines\/R1$/);
  });

  // T-0308a AC-A16 (D-0081 §5): the contrast. With nothing cached, `R1` is unknown, so the same
  // offline deep-link redirects to /plan. This pins the redirect instead of racing it.
  test("/plan/routines/R1 lands on /plan offline with an empty cache", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await injectSession(page);
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.goto("/plan/routines/R1");

    await expect(page).toHaveURL(/\/plan$/);
    await expect(page.locator('[data-screen-id="UF-11.2"]')).toBeVisible({ timeout: 3000 });
  });

  // T-0905 AC-2 (D-0091 §3, D-0079 §3): the contrast. With nothing cached, the same offline
  // deep-link redirects to the Library's empty state instead of a blank screen.
  test("/library/back-squat/compare/leg-press lands on UF-04.1 offline with an empty cache", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await injectSession(page);
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.goto("/library/back-squat/compare/leg-press");

    await expect(page).toHaveURL(/\/library$/);
    await expect(page.locator('[data-screen-id="UF-04.1"]')).toBeVisible({ timeout: 3000 });
  });
});
