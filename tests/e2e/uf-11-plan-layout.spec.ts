// T-0548 UF-11.2 rework part 1 (D-0203 §3, spec UF-11.2.md AC7/AC8): layout on /plan at 390,
// 360, 320 and 1024 px, 44 px targets, and the Balance link. Supabase is mocked as in
// uf-11-plan.spec.ts.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import { UF11_FIXTURES } from "./fixtures/uf-11-plan.js";

const TILES = 'ul[aria-label="Targets, hard sets per 14 days"] li';

async function open(page: Page, width: number, height: number, path = "/plan"): Promise<void> {
  await page.setViewportSize({ width, height });
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, UF11_FIXTURES);
  await page.goto("/");
  await injectSession(page);
  await page.goto(path);
  await expect(page.locator(path === "/plan" ? TILES : "h1").first()).toBeVisible();
}

const overflowX = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function tops(page: Page): Promise<number[]> {
  return page
    .locator(TILES)
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
}

test("390 x 844: header type, gutter, card labels and body size", async ({ page }) => {
  await open(page, 390, 844);
  const h1 = await page.locator('[data-screen-id="UF-11.2"] h1').evaluate((el) => {
    const c = getComputedStyle(el);
    return { f: c.fontFamily, w: c.fontWeight, t: c.textTransform, s: parseFloat(c.fontSize) };
  });
  expect(h1.f.startsWith('"Big Shoulders Display"')).toBe(true);
  expect(h1.w).toBe("800");
  expect(h1.t).toBe("uppercase");
  expect(h1.s).toBeGreaterThanOrEqual(32);
  expect(h1.s).toBeLessThanOrEqual(40);
  const pad = await page
    .locator('[data-screen-id="UF-11.2"]')
    .evaluate((el) => [getComputedStyle(el).paddingLeft, getComputedStyle(el).paddingRight]);
  expect(pad).toEqual(["20px", "20px"]);
  for (const name of ["Your plan", "Targets"]) {
    const label = await page.getByRole("heading", { name, exact: true }).evaluate((el) => {
      const c = getComputedStyle(el);
      const muted = getComputedStyle(document.documentElement).getPropertyValue(
        "--wl-color-text-muted",
      );
      const probe = document.createElement("i");
      probe.style.color = muted;
      document.body.append(probe);
      const expected = getComputedStyle(probe).color;
      probe.remove();
      return { s: c.fontSize, t: c.textTransform, color: c.color, expected };
    });
    expect(label.s).toBe("12px");
    expect(label.t).toBe("uppercase");
    expect(label.color).toBe(label.expected);
  }
  expect(
    await page
      .locator("dd")
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe("16px");
});

test("360 x 740: nothing overflows and three tiles share a row", async ({ page }) => {
  await open(page, 360, 740);
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
  const right = await page
    .locator('[data-screen-id="UF-11.2"] :is(h1, p, a, li, dd, dt)')
    .evaluateAll((els) => Math.max(...els.map((el) => el.getBoundingClientRect().right)));
  expect(right).toBeLessThanOrEqual(344);
  const t = await tops(page);
  expect(t[0]).toBe(t[1]);
  expect(t[1]).toBe(t[2]);
  expect(t[3]).toBeGreaterThan(t[2]!);
});

test("320 x 640: two tile columns and no horizontal scroll", async ({ page }) => {
  await open(page, 320, 640);
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
  const t = await tops(page);
  expect(t[0]).toBe(t[1]);
  expect(t[2]).toBeGreaterThan(t[1]!);
  const h1 = page.locator('[data-screen-id="UF-11.2"] h1');
  expect(await h1.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test("1024 x 768: the root is at most 640 px and centred", async ({ page }) => {
  await open(page, 1024, 768);
  const box = (await page.locator('[data-screen-id="UF-11.2"]').boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(640);
  expect(Math.abs(box.x - (1024 - box.x - box.width))).toBeLessThanOrEqual(1);
});

test("200% text zoom at 390 px: type doubles and nothing overflows", async ({ page }) => {
  await open(page, 390, 844);
  const before = await page
    .locator("dd")
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  await page.addStyleTag({ content: "html { font-size: 32px }" });
  const after = await page
    .locator("dd")
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(after).toBe(before * 2);
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
});

test("/plan/edit at 360 x 740: 20 px gutter and no overflow", async ({ page }) => {
  await open(page, 360, 740, "/plan/edit");
  const pad = await page
    .locator('[data-screen-id="UF-11.3"]')
    .evaluate((el) => [getComputedStyle(el).paddingLeft, getComputedStyle(el).paddingRight]);
  expect(pad).toEqual(["20px", "20px"]);
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
});

test("every interactive element on /plan is at least 44 px tall", async ({ page }) => {
  await open(page, 390, 844);
  const heights = await page
    .locator('[data-screen-id="UF-11.2"] :is(a, button)')
    .evaluateAll((els) => els.map((el) => [el.textContent, el.getBoundingClientRect().height]));
  expect(heights.length).toBeGreaterThan(3);
  expect(heights.filter(([, h]) => (h as number) < 44)).toEqual([]);
});

test("See this period in Balance opens UF-10.1", async ({ page }) => {
  await open(page, 390, 844);
  await page.getByRole("link", { name: "See this period in Balance" }).click();
  await expect(page).toHaveURL(/\/balance$/);
  await expect(page.locator('[data-screen-id="UF-10.1"]')).toBeVisible();
});

test("screenshot of /plan at 390 px", async ({ page }, testInfo) => {
  await open(page, 390, 844);
  // Review artefact only: written to Playwright's per-test output dir, never a machine path.
  await page.screenshot({ path: testInfo.outputPath("plan-390.png"), fullPage: true });
});

// T-0549 AC7: with a pending check-in and routines, every link and button is at least 44 px tall,
// and exactly one element carries the primary class (Accept).
test("390 x 844: pending check-in and routines, every target is 44 px and Accept is the one primary", async ({
  page,
}) => {
  await open(page, 390, 844);
  await expect(page.getByRole("button", { name: "Accept" })).toBeVisible();
  await expect(page.locator('[data-screen-id="UF-11.2"] h2')).toHaveText([
    "Check-in",
    "Your plan",
    "Targets",
    "Check-ins",
    "Routines",
  ]);
  await expect(page.locator('[data-screen-id="UF-11.2"] .wl-button--primary')).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Edit plan" })).toHaveClass(/wl-button--secondary/);
  const heights = await page
    .locator('[data-screen-id="UF-11.2"] :is(a, button, [role="button"])')
    .evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => r.height),
    );
  expect(heights.length).toBeGreaterThan(6);
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
});
