// T-0303a UF-08.1 e2e (AC-12; D-0086, D-0091 §1, D-0108). Runs against `vite preview` with
// Supabase mocked through `page.route`; `test`/`expect` come from the guarded fixture, so an
// unclaimed Supabase request fails the test at teardown. T-0303b–d append their cases here.
//
// Seed (D-0108 §2, §4): the L1+ library from `fixtures/uf-04-library-data.js` (read-only), its
// `profile` with FULL equipment plus `user_id` (the default `mockProfilePresent` row has
// `equipment: []`, which would give the R7-E6 push-up plan instead), the nine F-targets, and no
// sets. No seed row carries a date, so nothing here can drift out of the 14-day window.
import AxeBuilder from "@axe-core/playwright";
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

const F_TARGETS: Record<string, number> = {
  chest: 20,
  back: 20,
  shoulders: 16,
  arms: 12,
  core: 12,
  glutes: 20,
  quads: 20,
  hamstrings: 16,
  calves: 12,
};

const AREA_TARGETS = Object.entries(F_TARGETS).map(([area, sets]) => ({
  area_id: area,
  sets_per_14d: sets,
  source: "default",
  updated_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
}));

const profileRow = { ...profile, user_id: FAKE_USER_ID };

const FIT_PATTERN = /^Fits: [1-9]\d* exercises?, [1-9]\d* sets? \+ warm-up$/;

const screenUF081 = (page: Page) => page.locator('[data-screen-id="UF-08.1"]');
const fitLine = (page: Page) => page.locator('[data-part="fit-line"]');

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
});

async function openSetup(page: Page): Promise<void> {
  await page.goto("/");
  await injectSession(page);
  await page.goto("/session/setup");
  await expect(screenUF081(page)).toBeVisible();
  await expect(fitLine(page)).toHaveText(FIT_PATTERN);
}

/** Library and target rows cached for this user (the offline.spec.ts pattern). */
async function cachedCounts(page: Page): Promise<{ library: number; targets: number }> {
  return page.evaluate(async (userId: string) => {
    const req = indexedDB.open("wl-offline");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    async function countIn(storeName: string): Promise<number> {
      return new Promise<number>((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const countReq = tx
          .objectStore(storeName)
          .count(IDBKeyRange.bound(`${userId}:`, `${userId}:￿`));
        countReq.onsuccess = () => resolve(countReq.result);
        countReq.onerror = () => reject(countReq.error);
      });
    }
    const library = await countIn("libraryCache");
    const targets = await countIn("targetCache");
    db.close();
    return { library, targets };
  }, FAKE_USER_ID);
}

/** Waits until the workbox precache holds the navigation fallback (offline.spec.ts, T-0904). */
async function precacheSettled(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const keys = await caches.keys();
          const precache = keys.find((k) => k.startsWith("workbox-precache"));
          if (!precache) return { hasDocument: false };
          const requests = await (await caches.open(precache)).keys();
          return {
            hasDocument: requests.some((r) => new URL(r.url).pathname === "/index.html"),
          };
        }),
      { message: "the workbox precache never finished populating before going offline" },
    )
    .toMatchObject({ hasDocument: true });
}

test.describe("AC-12 offline cold start (NFR-OFF-3, D-0108 §5)", () => {
  test("the offline fit line equals the online one, and 15 min gives R7-E2", async ({
    page,
    context,
  }) => {
    await openSetup(page);
    await expect(page.locator('[data-part="minutes"]')).toHaveText("45");
    await expect.poll(() => cachedCounts(page)).toEqual({ library: exercises.length, targets: 9 });
    await precacheSettled(page);
    const online = (await fitLine(page).textContent())!;
    expect(online).toMatch(FIT_PATTERN);

    await context.setOffline(true);
    await page.reload();

    await expect(screenUF081(page)).toBeVisible({ timeout: 3000 });
    await expect(page.getByLabel("Offline")).toBeVisible();
    await expect(fitLine(page)).toHaveText(online);
    expect((await fitLine(page).textContent())!).toMatch(FIT_PATTERN);

    const less = page.getByRole("button", { name: "5 minutes less" });
    for (let i = 0; i < 6; i += 1) await less.click();
    await expect(page.locator('[data-part="minutes"]')).toHaveText("15");
    await expect(fitLine(page)).toHaveText("Fits: 1 exercise, 4 sets + warm-up");
  });
});

test.describe("AC-12 a11y (NFR-A11Y-1/2/6)", () => {
  test("axe reports 0 serious or critical violations on UF-08.1", async ({ page }) => {
    await openSetup(page);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });

  test("the stepper buttons, the 5 chips, Close and Suggest are each ≥ 44 × 44 px", async ({
    page,
  }) => {
    await openSetup(page);
    const targets = [
      page.getByRole("button", { name: "5 minutes less" }),
      page.getByRole("button", { name: "5 minutes more" }),
      ...[20, 30, 45, 60, 90].map((m) => page.getByRole("button", { name: `${m} minutes` })),
      page.getByRole("link", { name: "Close" }),
      page.getByRole("button", { name: "Suggest my workout" }),
    ];
    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box, String(target)).not.toBeNull();
      expect(box!.width, String(target)).toBeGreaterThanOrEqual(44);
      expect(box!.height, String(target)).toBeGreaterThanOrEqual(44);
    }
  });

  test("keyboard only: chip 30 → toggle → Low → Suggest", async ({ page }) => {
    await openSetup(page);
    const isFocused = (name: string, role: "button" | "checkbox" | "radio") =>
      page.getByRole(role, { name }).evaluate((el) => el === document.activeElement);

    async function tabTo(name: string, role: "button" | "checkbox" | "radio"): Promise<void> {
      for (let i = 0; i < 25; i += 1) {
        if (await isFocused(name, role)) return;
        await page.keyboard.press("Tab");
      }
      throw new Error(`Tab never reached ${role} "${name}"`);
    }

    await page.locator("body").focus();
    await tabTo("30 minutes", "button");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-part="minutes"]')).toHaveText("30");

    const toggle = page.getByRole("checkbox", { name: "Warm-up counts in this time (3 min)" });
    await tabTo("Warm-up counts in this time (3 min)", "checkbox");
    await page.keyboard.press("Space");
    await expect(toggle).not.toBeChecked();

    await tabTo("Normal", "radio");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("radio", { name: "Low" })).toBeChecked();
    await expect(page.getByText("Fewer sets, same weights.")).toBeVisible();

    await tabTo("Suggest my workout", "button");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/session\/setup\?step=suggested$/);
    await expect(page.locator('[data-screen-id="UF-08.2"]')).toBeVisible();
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
  });
});
