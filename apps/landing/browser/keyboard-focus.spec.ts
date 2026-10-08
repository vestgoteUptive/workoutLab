import { expect, test } from "@playwright/test";

// AC18 (updated by T-0584: the 1b header now carries an "Open the app" pill before the hero):
// Tab reaches the CTA in at most 3 presses (skip link, header pill, CTA), the skip link
// followed by one Tab lands on the CTA, and the focused CTA has a visible >= 2px outline.
test("skip link then Tab lands on the CTA", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.locator('[data-cta="primary"]:focus')).toHaveCount(1);
});

test("Tab focuses the CTA within 3 presses, with a visible focus ring", async ({ page }) => {
  await page.goto("/");
  let cta = page.locator('[data-cta="primary"]:focus');
  for (let i = 0; i < 3 && (await cta.count()) === 0; i++) {
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
