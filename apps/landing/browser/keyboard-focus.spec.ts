import { expect, test } from "@playwright/test";

// AC18: Tab reaches the CTA in at most 2 presses (a skip link may come
// first), and the focused CTA has a visible >= 2px outline.
test("Tab focuses the CTA within 2 presses, with a visible focus ring", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");

  let cta = page.locator('[data-cta="primary"]:focus');
  if ((await cta.count()) === 0) {
    await page.keyboard.press("Tab");
    cta = page.locator('[data-cta="primary"]:focus');
  }
  await expect(cta).toHaveCount(1);

  const outline = await cta.evaluate((el) => {
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);
});
