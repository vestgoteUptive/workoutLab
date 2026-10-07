// T-0552 AC9: a new build is picked up, kept WAITING while a workout runs, and applied (worker
// activated, page reloaded once) at the next safe moment. Supabase is mocked as in uf-09-ready.
// Playwright cannot intercept the service worker script request in Chromium (measured: route()
// never fires for /sw.js), so the new build is published by registering the same worker under
// another script URL: the browser installs it as a new worker. The "check on load and resume"
// half is AC1/AC2 (unit tests).
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  FAKE_USER_ID,
  injectSession,
  mockProfilePresent,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import { exerciseAreas, exercises, profile } from "./fixtures/uf-04-library-data.js";

const AREAS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
];
const AREA_TARGETS = AREAS.map((area) => ({
  area_id: area,
  sets_per_14d: 16,
  source: "default",
  updated_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
}));
const profileRow = { ...profile, user_id: FAKE_USER_ID };
const SESSION_URL = /\/session\/([0-9a-f-]{36})$/;

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets: [],
    exercises,
    exerciseAreas,
    areaTargets: AREA_TARGETS,
    profile: profileRow,
  });
  await mockProfilePresent(page, profileRow);
  await page.goto("/");
  await injectSession(page);
});

/** Loads `path` under an active, controlling worker, then marks this page load. */
async function controlled(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.evaluate(() => {
    (window as unknown as { __wlBoot?: number }).__wlBoot = 1;
  });
}

/** Registers the "new build" and resolves once it is installed (waiting or already active). */
async function publishNewBuild(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register("/sw.js?t0552=2", { scope: "/" });
    await new Promise<void>((resolve) => {
      const isNew = (w: ServiceWorker | null): boolean => !!w?.scriptURL.endsWith("?t0552=2");
      const done = (): void => {
        if (isNew(reg.waiting) || isNew(reg.active)) resolve();
      };
      reg.addEventListener("updatefound", () =>
        reg.installing?.addEventListener("statechange", done),
      );
      done();
    });
  });
}

const workers = (page: Page) =>
  page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return { waiting: reg?.waiting?.scriptURL ?? null, active: reg?.active?.scriptURL ?? "" };
  });
const boot = (page: Page) =>
  page.evaluate(() => (window as unknown as { __wlBoot?: number }).__wlBoot ?? 0);
const resume = (page: Page) =>
  page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

function navigateInApp(page: Page, path: string): Promise<void> {
  return page.evaluate((p) => {
    history.pushState({}, "", p);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

async function startWorkout(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Start workout" }).click();
  await page.getByRole("button", { name: "30 minutes" }).click();
  await page.getByRole("button", { name: "Suggest my workout" }).click();
  await page.getByRole("button", { name: "Looks good" }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(SESSION_URL);
}

test.describe("T-0552 PWA applies new builds", () => {
  test("UF-04 AC9 on a safe path a resume applies the new build with one reload", async ({
    page,
  }) => {
    await controlled(page, "/plan");
    await publishNewBuild(page);
    await resume(page);
    await expect.poll(() => boot(page).catch(() => 1), { timeout: 15_000 }).toBe(0);
  });

  test("UF-09.1 AC9 in a running session the new build stays waiting and nothing reloads; the next safe route applies it", async ({
    page,
  }) => {
    await controlled(page, "/");
    await startWorkout(page);
    await page.evaluate(() => {
      (window as unknown as { __wlBoot?: number }).__wlBoot = 1;
    });
    const sessionPath = new URL(page.url()).pathname;

    await publishNewBuild(page);
    await resume(page);
    // Observable, not timed: the new worker is installed and still waiting, the old one active.
    const w = await workers(page);
    expect(w.waiting).toMatch(/t0552=2$/);
    expect(w.active).not.toMatch(/t0552=2$/);
    expect(await boot(page)).toBe(1);
    expect(new URL(page.url()).pathname).toBe(sessionPath);
    await resume(page);
    expect((await workers(page)).waiting).toMatch(/t0552=2$/);

    await navigateInApp(page, "/library");
    await expect.poll(() => boot(page).catch(() => 1), { timeout: 15_000 }).toBe(0);
  });
});
