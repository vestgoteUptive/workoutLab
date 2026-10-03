// T-0304h UF-09 end to end from UF-08.4 Start (NFR-TIME-2, NFR-A11Y-1/2/6, principle 1). Runs
// against `vite preview`; `test`/`expect` come from the guarded fixture (D-0086), with no own
// console listeners (T-0436). Every Supabase request is claimed by a real mock. The 10-set
// offline workout and two devices are T-0468 (D-0168 §1), in their own spec file.
//
// Every row starts where a real workout starts: `/` → Start workout → UF-08.1 (30 min chip) →
// Suggest → UF-08.2 → Looks good → UF-08.4 → Start. The sets use the real 5 s auto-save.
import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
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
});

/** `/` → Start workout → UF-08.1 → chip → Suggest → UF-08.2 → Looks good → UF-08.4 → Start. */
async function startFromReady(page: Page, budgetChip = "30 minutes"): Promise<string> {
  await page.goto("/");
  await injectSession(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Start workout" }).click();
  await expect(page.locator('[data-screen-id="UF-08.1"]')).toBeVisible();
  await page.getByRole("button", { name: budgetChip }).click();
  await page.getByRole("button", { name: "Suggest my workout" }).click();
  await expect(page.locator('[data-screen-id="UF-08.2"]')).toBeVisible();
  await page.getByRole("button", { name: "Looks good" }).click();
  await expect(page.locator('[data-screen-id="UF-08.4"]')).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(SESSION_URL);
  return SESSION_URL.exec(page.url())![1]!;
}

/** AC-3: one `[data-screen-id]`, and no navigation landmark on `/session/<id>`. */
async function expectOneScreen(page: Page, screenId?: string): Promise<void> {
  await expect(page.locator("[data-screen-id]")).toHaveCount(1);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  if (screenId) await expect(page.locator(`[data-screen-id="${screenId}"]`)).toBeVisible();
}

async function precacheSettled(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const keys = await caches.keys();
          const precache = keys.find((k) => k.startsWith("workbox-precache"));
          if (!precache) return false;
          const requests = await (await caches.open(precache)).keys();
          return requests.some((r) => new URL(r.url).pathname === "/index.html");
        }),
      { message: "the workbox precache never finished populating before going offline" },
    )
    .toBe(true);
}

async function expectAxeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious).toEqual([]);
}

/** Every visible button on the screen is ≥ 44 × 44 px. */
async function expectTargets(page: Page): Promise<void> {
  const buttons = page.locator("[data-screen-id] button:visible");
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const box = await buttons.nth(i).boundingBox();
    expect(box, `button ${i}`).not.toBeNull();
    expect(box!.width, `button ${i} width`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `button ${i} height`).toBeGreaterThanOrEqual(44);
  }
}

/** "m:ss" → seconds. */
function clockS(text: string | null): number {
  const m = /(\d+):(\d{2})/.exec(text ?? "");
  expect(m, `a clock in ${JSON.stringify(text)}`).not.toBeNull();
  return Number(m![1]) * 60 + Number(m![2]);
}

/** Skip warm-up (when shown) and Done set; the real 5 s auto-save then gives UF-09.5. */
async function toRest(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Skip warm-up" }).click();
  await expect(page.locator('[data-screen-id="UF-09.3"]')).toBeVisible();
  await page.getByRole("button", { name: "Done set" }).click();
  await expect(page.locator('[data-screen-id="UF-09.4"]')).toBeVisible();
  await expect(page.locator('[data-screen-id="UF-09.5"]')).toBeVisible({ timeout: 10_000 });
}

async function sessionRow(
  page: Page,
  id: string,
): Promise<{ started_at: string; ended_at: string | null } | null> {
  return page.evaluate(async (key: string) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("wl-offline");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const entry = await new Promise<{ row: never } | undefined>((resolve, reject) => {
      const get = db.transaction("sessions", "readonly").objectStore("sessions").get(key);
      get.onsuccess = () => resolve(get.result as never);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return entry ? (entry.row as never) : null;
  }, id);
}

for (const mode of ["online", "offline"] as const) {
  test.describe(`T-0304h AC-1 reload (NFR-TIME-2), ${mode}`, () => {
    async function reload(page: Page, context: import("@playwright/test").BrowserContext) {
      if (mode === "offline") {
        await precacheSettled(page);
        await context.setOffline(true);
      }
      await page.reload();
    }

    test(`T-0304h AC-1 mid-rest: the rest remaining survives a reload (${mode})`, async ({
      page,
      context,
    }) => {
      await startFromReady(page);
      await toRest(page);
      const rest = page.locator('[data-screen-id="UF-09.5"]');
      const before = clockS(await rest.getByRole("timer").textContent());
      const t0 = Date.now();
      await page.waitForTimeout(3000);
      await reload(page, context);
      const after = page.locator('[data-screen-id="UF-09.5"]');
      await expect(after.getByRole("timer")).toBeVisible({ timeout: 10_000 });
      const remaining = clockS(await after.getByRole("timer").textContent());
      const passed = (Date.now() - t0) / 1000;
      // The wall clock kept running: remaining = before − passed, ±1 s (reload time included).
      expect(Math.abs(remaining - (before - passed))).toBeLessThanOrEqual(1.2);
      expect(remaining).toBeLessThan(before - 2);
      await expectOneScreen(page, "UF-09.5");
    });

    test(`T-0304h AC-1 mid-pause: Elapsed does not grow while paused (${mode})`, async ({
      page,
      context,
    }) => {
      await startFromReady(page);
      await page.getByRole("button", { name: "Pause workout" }).click();
      const paused = page.locator('[data-screen-id="UF-09.9"]');
      await expect(paused.getByRole("button", { name: "Resume" })).toBeVisible();
      const elapsed = paused.locator('[data-field="elapsed"]');
      await expect(elapsed).toHaveText(/^Elapsed \d+:\d{2}$/);
      const before = clockS(await elapsed.textContent());
      await page.waitForTimeout(3000);
      await reload(page, context);
      const after = page.locator('[data-screen-id="UF-09.9"]');
      await expect(after.getByRole("button", { name: "Resume" })).toBeVisible({ timeout: 10_000 });
      const now = clockS(await after.locator('[data-field="elapsed"]').textContent());
      expect(Math.abs(now - before)).toBeLessThanOrEqual(1);
      await expectOneScreen(page, "UF-09.9");
    });
  });
}

test.describe("T-0304h AC-2 keyboard only, focus, targets, axe; AC-3 one screen", () => {
  test("T-0304h AC-2 the walk from UF-08.4 Start to UF-03.3, Tab/Enter/Space only", async ({
    page,
  }) => {
    // Reach UF-08.4 with the pointer; the keyboard-only walk starts at Start (AC-2 step 1).
    await page.goto("/");
    await injectSession(page);
    await page.goto("/");
    await page.getByRole("link", { name: "Start workout" }).click();
    await page.getByRole("button", { name: "30 minutes" }).click();
    await page.getByRole("button", { name: "Suggest my workout" }).click();
    await page.getByRole("button", { name: "Looks good" }).click();
    await expect(page.locator('[data-screen-id="UF-08.4"]')).toBeVisible();

    const tabTo = async (target: Locator, key = "Tab") => {
      for (let i = 0; i < 25; i++) {
        if (await target.evaluate((el) => el === document.activeElement)) return;
        await page.keyboard.press(key);
      }
      await expect(target).toBeFocused();
    };
    const press = async (name: string, key = "Enter") => {
      const button = page.getByRole("button", { name, exact: true });
      await expect(button).toBeFocused();
      await page.keyboard.press(key);
    };

    // 1. Start.
    await tabTo(page.getByRole("button", { name: "Start", exact: true }));
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(SESSION_URL);
    const id = SESSION_URL.exec(page.url())![1]!;

    // 2. UF-09.1 Start now.
    await expectOneScreen(page, "UF-09.1");
    await expect(page.getByRole("button", { name: "Start now" })).toBeFocused();
    await expectTargets(page);
    await expectAxeClean(page);
    await page.keyboard.press("Enter");

    // 3. UF-09.2 Next move until the warm-up ends.
    await expectOneScreen(page, "UF-09.2");
    await expect(page.getByRole("button", { name: "Next move" })).toBeFocused();
    await expectTargets(page);
    await expectAxeClean(page);
    for (let i = 0; i < 12; i++) {
      if ((await page.locator('[data-screen-id="UF-09.2"]').count()) === 0) break;
      await page.keyboard.press("Space");
      await page.waitForTimeout(100);
    }
    await expect(page.locator('[data-screen-id="UF-09.2"]')).toHaveCount(0);

    // 4. UF-09.6 I'm ready (shown when the warm-up hands over to the first exercise).
    await expectOneScreen(page, "UF-09.6");
    await expect(page.getByRole("button", { name: "I'm ready" })).toBeFocused();
    await expectTargets(page);
    await expectAxeClean(page);
    await page.keyboard.press("Enter");

    // 5. UF-09.3 Done set.
    await expectOneScreen(page, "UF-09.3");
    await expect(page.getByRole("button", { name: "Done set" })).toBeFocused();
    await expectTargets(page);
    const done = await page.getByRole("button", { name: "Done set" }).boundingBox();
    expect(done!.height).toBeGreaterThanOrEqual(200);
    await expectAxeClean(page);
    await page.keyboard.press("Space");

    // 6. UF-09.4 Save.
    await expectOneScreen(page, "UF-09.4");
    await expect(page.getByRole("button", { name: "Save" })).toBeFocused();
    await expectTargets(page);
    await expectAxeClean(page);
    await page.keyboard.press("Enter");

    // 7. UF-09.5 Skip rest → UF-09.3.
    await expectOneScreen(page, "UF-09.5");
    await expect(page.getByRole("button", { name: "Skip rest" })).toBeFocused();
    await expectTargets(page);
    await expectAxeClean(page);
    await page.keyboard.press("Enter");
    await expectOneScreen(page, "UF-09.3");

    // 8. Pause → UF-09.9 → Resume → the same step.
    await tabTo(page.getByRole("button", { name: "Pause workout" }));
    await page.keyboard.press("Enter");
    await expectOneScreen(page, "UF-09.9");
    await press("Resume");
    await expectOneScreen(page, "UF-09.3");
    await expect(page.getByRole("button", { name: "Done set" })).toBeFocused();

    // 9. Pause again → End workout → confirm → UF-03.3.
    await tabTo(page.getByRole("button", { name: "Pause workout" }));
    await page.keyboard.press("Enter");
    await expectOneScreen(page, "UF-09.9");
    await expect(page.getByRole("button", { name: "Resume" })).toBeFocused();
    await expectTargets(page);
    await expectAxeClean(page);
    await tabTo(page.getByRole("button", { name: "End workout" }));
    await page.keyboard.press("Enter");
    await expectOneScreen(page, "UF-09.9");
    await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
    await tabTo(page.getByRole("button", { name: "End workout" }), "Shift+Tab");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-screen-id="UF-03.3"]')).toBeVisible({ timeout: 10_000 });

    const row = await sessionRow(page, id);
    expect(row!.ended_at).not.toBeNull();
    expect(row!.started_at).toBeTruthy();
    expect(new Date(row!.ended_at!).getTime()).toBeGreaterThanOrEqual(
      new Date(row!.started_at).getTime(),
    );
  });
});
