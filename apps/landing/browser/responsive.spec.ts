import { expect, test } from "@playwright/test";

// AC19: no horizontal scroll at 320px, and the hero + CTA stay within the
// first viewport height at both 390x844 and 1440x900.
test.describe("responsive", () => {
  test("/ has no horizontal scroll at 320x640", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(320);
  });

  test("/privacy/ has no horizontal scroll at 320x640", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/privacy/");
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(320);
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ] as const) {
    test(`h1 and CTA end within the first viewport height at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      const h1Box = await page.locator("h1").boundingBox();
      const ctaBox = await page.locator('[data-cta="primary"]').boundingBox();
      expect(h1Box).not.toBeNull();
      expect(ctaBox).not.toBeNull();
      expect(h1Box!.y + h1Box!.height).toBeLessThanOrEqual(viewport.height);
      expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(viewport.height);
    });
  }
});
