import { expect, test } from "@playwright/test";

// AC17 (NFR-A11Y-2): the CTA and every footer/home link outside prose text
// gets a hit area at least 44x44, and the CTA is at least 52px tall.
test.describe("touch targets at 390x844", () => {
  test("the CTA is at least 44x44, and at least 52px tall", async ({ page }) => {
    await page.goto("/");
    const box = await page.locator('[data-cta="primary"]').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(52);
  });

  test("every footer link is at least 44x44", async ({ page }) => {
    await page.goto("/");
    const links = page.locator("footer a");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await links.nth(i).boundingBox();
      expect(box, `footer link ${i}`).not.toBeNull();
      expect(box!.width, `footer link ${i} width`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `footer link ${i} height`).toBeGreaterThanOrEqual(44);
    }
  });

  test("the /privacy/ home link is at least 44x44", async ({ page }) => {
    await page.goto("/privacy/");
    const box = await page.locator("a.home-link").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
