// T-0307b AC-15: UF-06 Progress in the preview build, with a session injected and Supabase
// mocked. axe on both screens, 44 px targets, and the keyboard path into Balance and an
// exercise's history.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import { historyFixtures, zeroHistoryFixtures } from "./fixtures/uf-06-progress-data.js";

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
});

async function open(page: Page, path: string, fixtures: ReturnType<typeof historyFixtures>) {
  await mockSupabaseData(page, fixtures);
  await page.goto("/welcome");
  await injectSession(page);
  await page.goto(path);
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

test.describe("AC-15 UF-06 a11y and keyboard (e2e)", () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test("axe finds no serious violation on /progress with no history", async ({ page }) => {
    await open(page, "/progress", zeroHistoryFixtures());
    await expect(page.getByText("No exercises logged yet")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("axe finds no serious violation on /progress and /progress/back-squat with history", async ({
    page,
  }) => {
    await open(page, "/progress", historyFixtures());
    await expect(page.getByRole("link", { name: /Back squat/ })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await page.getByRole("link", { name: /Back squat/ }).click();
    await expect(page).toHaveURL(/\/progress\/back-squat$/);
    await expect(page.getByRole("heading", { level: 1, name: "Back squat" })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("the Balance card, every Recent exercises row and How to are at least 44 x 44", async ({
    page,
  }) => {
    await open(page, "/progress", historyFixtures());
    const card = page.getByRole("link", { name: "Balance, last 14 days" });
    await expect(card).toBeVisible();
    const rows = page.getByRole("link", { name: /Back squat|Bench press/ });
    await expect(rows).toHaveCount(2);
    for (const link of [card, ...(await rows.all())]) {
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    // UF-06.2's How to link has the same 44 x 44 floor.
    await page.goto("/progress/back-squat");
    const howTo = page.getByRole("link", { name: "How to" });
    await expect(howTo).toBeVisible();
    const howToBox = await howTo.boundingBox();
    expect(howToBox).not.toBeNull();
    expect(howToBox!.width).toBeGreaterThanOrEqual(44);
    expect(howToBox!.height).toBeGreaterThanOrEqual(44);
  });

  test("Tab to the Balance card and Enter opens /balance; Back, then Tab to Back squat and Enter", async ({
    page,
  }) => {
    await open(page, "/progress", historyFixtures());
    await expect(page.getByRole("link", { name: /Back squat/ })).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Balance, last 14 days" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/balance$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/progress$/);
    await expect(page.getByRole("link", { name: /Back squat/ })).toBeVisible();
    // Tab until the Back squat row has focus (Back can leave the focus start point anywhere).
    const row = page.getByRole("link", { name: /Back squat/ });
    for (let i = 0; i < 6 && !(await row.evaluate((el) => el === document.activeElement)); i += 1) {
      await page.keyboard.press("Tab");
    }
    await expect(row).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/progress\/back-squat$/);
  });

  test("focus on today's calendar cell shows the accent ring, not the today outline", async ({
    page,
  }) => {
    await open(page, "/progress", historyFixtures());
    const today = page.locator("td[data-today='true']");
    await expect(today).toBeVisible();
    // Keyboard modality first, so programmatic focus counts as :focus-visible.
    await page.keyboard.press("Tab");
    await today.focus();
    const outlineColor = await today.evaluate((el) => getComputedStyle(el).outlineColor);
    const probe = await page.evaluate(() => {
      const el = document.createElement("i");
      el.style.color = "var(--wl-color-accent)";
      document.body.appendChild(el);
      const c = getComputedStyle(el).color;
      el.remove();
      return c;
    });
    expect(outlineColor).toBe(probe);
  });
});
