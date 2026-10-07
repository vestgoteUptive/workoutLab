// T-0552 AC9: a changed /sw.js is picked up on resume; the page reloads once at a safe moment
// (the next route change to /library) and never while on a workout route (/session/setup).
// Supabase is mocked as in the other specs. Playwright cannot intercept the service worker script
// request in Chromium (measured: route() never fires for /sw.js), so the new build is published by
// registering the same worker under another script URL: the browser installs it as a new worker,
// the update module sees it wait, asks it to skip waiting, and marks the update pending once it is
// active. The "check on load and resume" half is AC1/AC2
// (unit tests).
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
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.evaluate(() => {
    (window as unknown as { __wlBoot?: number }).__wlBoot = 1;
  });
}

async function publishNewBuild(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register("/sw.js?t0552=2", { scope: "/" });
    await new Promise<void>((resolve) => {
      const done = (): void => {
        if (reg.active?.scriptURL.endsWith("?t0552=2")) resolve();
      };
      reg.addEventListener("updatefound", () =>
        reg.installing?.addEventListener("statechange", done),
      );
      done();
    });
  });
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
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
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
