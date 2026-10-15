import { expect, test } from "@playwright/test";

// T-0586 AC1: the chromium project's default viewport is 390x844 (D-0046 §9).
// This spec deliberately sets no test.use({ viewport }) and no setViewportSize.
test("default viewport is 390x844", async ({ page }) => {
  await page.goto("/");
  expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
  expect(await page.evaluate(() => window.innerWidth)).toBe(390);
});
