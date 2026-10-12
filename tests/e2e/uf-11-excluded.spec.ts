// T-0540 UF-11.2 row -> UF-11.5 -> search -> Exclude -> back -> "· 1" (AC9). Supabase is mocked;
// the excluded_exercises route is stateful so the refresh on mount sees the write.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
  VITE_SUPABASE_URL,
} from "./fixtures/supabase-mock.js";
import { UF11_FIXTURES } from "./fixtures/uf-11-plan.js";

async function open(page: Page, path: string): Promise<void> {
  await mockSupabaseData(page, UF11_FIXTURES);
  const rows: Array<{ exercise_id: string; created_at: string }> = [];
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/excluded_exercises*`, async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { exercise_id: string };
      const row = { exercise_id: body.exercise_id, created_at: "2026-10-08T10:00:00.000Z" };
      rows.push(row);
      await route.fulfill({ status: 201, json: [row] });
    } else {
      await route.fulfill({ status: 200, json: rows });
    }
  });
  await page.goto("/");
  await injectSession(page);
  await page.goto(path);
}

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
});

test("row -> screen -> search -> Exclude -> back shows the new count", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "/plan");
  await expect(page.getByRole("link", { name: "Excluded exercises, none" })).toBeVisible();
  await page.getByRole("link", { name: "Excluded exercises, none" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Excluded exercises" })).toBeVisible();
  await expect(page.getByText("No excluded exercises.")).toBeVisible();

  const axe = await new AxeBuilder({ page }).include('[data-screen-id="UF-11.5"]').analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );

  await page.getByLabel("Search exercises").fill("bench");
  await page.getByRole("button", { name: "Exclude bench" }).click();
  await expect(page.getByRole("button", { name: "Include bench again" })).toBeVisible();
  await page.getByLabel("Search exercises").fill("");
  await expect(page.getByRole("button", { name: "Include bench again" })).toBeVisible();

  const axe2 = await new AxeBuilder({ page }).include('[data-screen-id="UF-11.5"]').analyze();
  expect(axe2.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );
  const shot = testInfo.outputPath("excluded-390.png");
  await page.screenshot({ path: shot, fullPage: true });
  const copy = process.env.WL_EXCLUDED_SHOT;
  if (copy) {
    mkdirSync(dirname(copy), { recursive: true });
    copyFileSync(shot, copy);
  }

  await page.getByRole("link", { name: "Back to Plan" }).click();
  await expect(page.getByRole("link", { name: "Excluded exercises, 1" })).toBeVisible();
});

// T-0613 (D-0208, D-0211; UF-11.5): the Cobalt plan state, measured in a real browser.
test.describe("T-0613 UF-11.5 plan state (390 x 844)", () => {
  test("data-wl-state=plan, 28 px gutter (20 px at 340), axe colour-contrast clean, targets 44 px, and the rows are outline-button rows", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "/plan/excluded");
    await page.getByLabel("Search exercises").fill("bench");
    await page.getByRole("button", { name: "Exclude bench" }).click();
    await page.getByLabel("Search exercises").fill("");
    const root = page.locator('[data-screen-id="UF-11.5"]');
    await expect(root).toHaveAttribute("data-wl-state", "plan");
    await expect(root.locator("li.wl-row").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await root.evaluate((el) => getComputedStyle(el).paddingLeft)).toBe("28px");
    const rowBtn = root.locator("li.wl-row button").first();
    const o = await rowBtn.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { w: cs.borderTopWidth, bg: cs.backgroundColor, radius: cs.borderTopLeftRadius };
    });
    // Chrome snaps the authored 1.5px border to whole CSS px (main-css.test.ts pins the authored value).
    expect(parseFloat(o.w)).toBeGreaterThanOrEqual(1);
    expect(o.bg).toBe("rgba(0, 0, 0, 0)");
    expect(o.radius).not.toBe("0px");
    await page.waitForTimeout(300);
    const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(results.violations.map((v) => v.nodes.map((n) => n.target.join(" ")))).toEqual([]);
    const boxes = await root
      .locator("a, button, input, li.wl-row")
      .evaluateAll((els) =>
        els
          .map((el) => ({ n: el.textContent?.trim() || el.tagName, r: el.getBoundingClientRect() }))
          .filter((x) => x.r.width > 0 && x.r.height > 0),
      );
    expect(boxes.length).toBeGreaterThan(3);
    for (const b of boxes) {
      expect(b.r.width, `${b.n} w`).toBeGreaterThanOrEqual(44);
      expect(b.r.height, `${b.n} h`).toBeGreaterThanOrEqual(44);
    }
    await page.setViewportSize({ width: 340, height: 740 });
    expect(await root.evaluate((el) => getComputedStyle(el).paddingLeft)).toBe("20px");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 390, height: 844 });
    if (process.env.WL_CANVAS_COMPARE === "1") {
      await page.screenshot({
        path: testInfo.outputPath("cobalt", "uf11-5-excluded.png"),
        fullPage: true,
      });
    }
  });
});
