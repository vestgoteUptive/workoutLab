// T-0558 UF-04.2 figure card e2e (D-0207 §3; spec body-map-silhouette AC-10, AC-11, AC-13).
// Same mocked-Supabase setup as uf-04-library.spec.ts.
import AxeBuilder from "@axe-core/playwright";
import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
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

async function open(page: Page): Promise<void> {
  await page.goto("/library/back-squat");
  await expect(page.getByText("Sit down between your heels")).toBeVisible();
  await expect(page.locator("svg.wl-fig").first()).toBeVisible();
}

const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).analyze()).violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );

test("AC-6 axe is clean online and offline, and the figure stays", async ({ page, context }) => {
  await open(page);
  expect(await serious(page)).toEqual([]);
  await context.setOffline(true);
  await expect(page.locator("svg.wl-fig")).toHaveCount(1);
  expect(await serious(page)).toEqual([]);
});

for (const [width, name] of [
  [320, "uf04-320.png"],
  [390, "uf04-390.png"],
] as const) {
  test(`AC-7 layout holds at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page);
    const boxes = await page
      .locator(".wl-uf04__figure-card svg.wl-fig, .wl-uf04__legend, .wl-uf04__pill")
      .evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      );
    expect(boxes.length).toBeGreaterThan(5);
    for (let i = 0; i < boxes.length; i += 1) {
      const a = boxes[i]!;
      expect(a.x, `box ${i} left`).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w, `box ${i} right`).toBeLessThanOrEqual(width);
      for (let j = i + 1; j < boxes.length; j += 1) {
        const b = boxes[j]!;
        const apart =
          a.x + a.w <= b.x + 0.5 ||
          b.x + b.w <= a.x + 0.5 ||
          a.y + a.h <= b.y + 0.5 ||
          b.y + b.h <= a.y + 0.5;
        expect(apart, `boxes ${i} and ${j} overlap`).toBe(true);
      }
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(name), fullPage: true });
  });
}

test("AC-7 layout holds at 200 % root font size", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const card = await page.locator(".wl-uf04__figure-card").boundingBox();
  for (const pill of await page.locator(".wl-uf04__pill").all()) {
    const b = (await pill.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(card!.x + card!.width + 0.5);
  }
});

test.describe("AC-8 forced colours", () => {
  test.use({ forcedColors: "active" });
  test("primary regions are filled and the list text is visible", async ({ page }) => {
    await open(page);
    const fill = await page
      .locator('svg.wl-fig [data-area="quads"].wl-fig__region--primary')
      .first()
      .evaluate((el) => getComputedStyle(el).fill);
    expect(fill).not.toBe("none");
    expect(fill).not.toMatch(/transparent|rgba\(0, 0, 0, 0\)/);
    await expect(page.getByRole("list", { name: "Primary areas" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Secondary areas" })).toBeVisible();
    await expect(page.getByText("Primary", { exact: true })).toBeVisible();
  });
});

// T-0615 AC3: inside a plan state a primary region is plan.ink and a secondary region is filled
// with the instance hatch (plan.ink stripes on plan.raise). The state is set on <html> after load.
test.describe("T-0615 AC3 plan primary and secondary (UF-04.2)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("primary is plan.ink, hatch is ink on raise; no state keeps lime", async ({
    page,
  }, testInfo) => {
    await open(page);
    const resolved = (v: string) =>
      page.evaluate((val) => {
        const d = document.createElement("div");
        d.style.color = val;
        document.body.append(d);
        const c = getComputedStyle(d).color;
        d.remove();
        return c;
      }, v);
    const fillOf = (sel: string) =>
      page
        .locator(sel)
        .first()
        .evaluate((el) => getComputedStyle(el).fill);

    const primary = 'svg.wl-fig [data-area="quads"].wl-fig__region--primary';
    expect(await fillOf(primary)).toBe(await resolved("var(--wl-color-accent)"));

    await page.evaluate(() => {
      document.documentElement.setAttribute("data-wl-state", "plan");
      document.body.style.background = "var(--wl-bg)";
    });
    expect(await fillOf(primary)).toBe(await resolved("var(--wl-color-plan-ink)"));
    const secondary = page.locator("svg.wl-fig .wl-fig__region--secondary").first();
    expect(await secondary.evaluate((el) => getComputedStyle(el).fill)).toMatch(/^url\(/);
    expect(await fillOf("svg.wl-fig .wl-fig__hatch-stripe")).toBe(
      await resolved("var(--wl-color-plan-ink)"),
    );
    expect(await fillOf("svg.wl-fig .wl-fig__hatch-ground")).toBe(
      await resolved("var(--wl-color-plan-raise)"),
    );
    await page
      .locator("svg.wl-fig")
      .first()
      .screenshot({ path: testInfo.outputPath("uf04-plan.png") });
  });
});
