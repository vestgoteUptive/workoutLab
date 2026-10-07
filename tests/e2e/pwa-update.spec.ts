// T-0552 AC9: a changed /sw.js is picked up on resume; the page reloads once at a safe moment
// (the next route change to /library) and never while on a workout route (/session/setup).
// Supabase is mocked as in the other specs; /sw.js is served with a trailing comment appended.
import { expect, test } from "./fixtures/guarded-test.js";
import {
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import {
  exerciseAreas,
  exerciseVariants,
  exercises,
  profile,
} from "./fixtures/uf-04-library-data.js";
import type { Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
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
});

async function controlled(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // The first install claims the page; wait until it is controlled, then mark this page load.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.evaluate(() => {
    (window as unknown as { __wlBoot?: number }).__wlBoot = 1;
  });
}

async function publishNewBuild(page: Page): Promise<void> {
  await page.context().route("**/sw.js", async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: `${await res.text()}\n// t0552-new-build` });
  });
  const changed = page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
          once: true,
        });
      }),
  );
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await changed;
}

const boot = (page: Page) =>
  page.evaluate(() => (window as unknown as { __wlBoot?: number }).__wlBoot ?? 0);

function navigateInApp(page: Page, path: string): Promise<void> {
  return page.evaluate((p) => {
    history.pushState({}, "", p);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

test.describe("T-0552 PWA applies new builds", () => {
  test("UF-04 AC9 on a safe path a resume applies the new build with one reload", async ({
    page,
  }) => {
    await controlled(page, "/plan");
    await publishNewBuild(page);
    await expect.poll(() => boot(page).catch(() => -1), { timeout: 15_000 }).toBe(-1);
    await expect.poll(() => boot(page), { timeout: 15_000 }).toBe(0);
  });

  test("UF-09.1 AC9 on a workout route nothing reloads; the next safe route does", async ({
    page,
  }) => {
    await controlled(page, "/session/setup");
    await publishNewBuild(page);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(1500);
    expect(await boot(page)).toBe(1);
    expect(new URL(page.url()).pathname).toBe("/session/setup");
    await navigateInApp(page, "/library");
    await expect.poll(() => boot(page).catch(() => -1), { timeout: 15_000 }).not.toBe(1);
    await expect.poll(() => boot(page), { timeout: 15_000 }).toBe(0);
  });
});
