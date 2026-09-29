// T-0306a UF-04 Library e2e (AC-17): a11y, touch targets and the keyboard happy path, on the
// preview build with an injected session and mocked Supabase.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
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

async function openLibrary(page: Page, path: string): Promise<void> {
  await page.goto(path);
}

const SCREENS = [
  ["/library", "UF-04.1"],
  ["/library/back-squat", "UF-04.2"],
  ["/library/back-squat/compare/leg-extension", "UF-04.3"],
] as const;

test.describe("AC-17 accessibility", () => {
  for (const [path, id] of SCREENS) {
    test(`${path} has 0 serious or critical axe violations`, async ({ page }) => {
      await openLibrary(page, path);
      await expect(page.locator(`[data-screen-id="${id}"] h1`)).toBeVisible();
      if (id === "UF-04.1") await expect(page.locator('[data-field="name"]').first()).toBeVisible();
      if (id === "UF-04.2")
        await expect(page.getByText("Sit down between your heels")).toBeVisible();
      if (id === "UF-04.3")
        await expect(page.getByRole("columnheader", { name: "Leg extension" })).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(serious).toEqual([]);
    });
  }

  test("every chip and list row is at least 44 x 44 CSS px", async ({ page }) => {
    await openLibrary(page, "/library");
    await expect(page.locator('[data-field="name"]')).toHaveCount(24);
    const targets = page.locator(".wl-uf04__chip, .wl-uf04__list li");
    const count = await targets.count();
    expect(count).toBe(11 + 24);
    for (let i = 0; i < count; i += 1) {
      const box = await targets.nth(i).boundingBox();
      expect(box, `target ${i}`).not.toBeNull();
      expect(box!.width, `target ${i} width`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `target ${i} height`).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("AC-17 keyboard happy path", () => {
  test("Tab to Hamstrings, Space filters to 2 rows, Tab to Leg curl, Enter opens it", async ({
    page,
  }) => {
    await openLibrary(page, "/library");
    await expect(page.locator('[data-field="name"]')).toHaveCount(24);
    const chip = page.getByRole("button", { name: "Hamstrings" });
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press("Tab");
      if (await chip.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(chip).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.locator('[data-field="name"]')).toHaveCount(2);
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    const leg = page.getByRole("link", { name: /^Leg curl/ });
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press("Tab");
      if (await leg.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(leg).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/library\/leg-curl$/);
    await expect(page.getByRole("heading", { level: 1, name: "Leg curl" })).toBeVisible();
  });
});
