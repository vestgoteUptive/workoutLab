import { expect, test } from "@playwright/test";

// AC20: reduced motion means no running animations, and the page (h1, CTA)
// renders and works with JS disabled entirely.
test("no animations run under prefers-reduced-motion: reduce", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const animationCount = await page.evaluate(() => document.getAnimations().length);
  expect(animationCount).toBe(0);
});

test.describe("javascript disabled", () => {
  test.use({ javaScriptEnabled: false });

  test("h1 and CTA render, and the CTA has the production app href", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
    const cta = page.locator('[data-cta="primary"]');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "https://app.workout.vestgote.com/");
  });
});
