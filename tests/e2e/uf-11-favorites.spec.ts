// T-0569 UF-11.2 row -> UF-11.6 -> search -> Add (AC9: AC1-AC3 in a real browser, axe, and an
// offline load with cached favorites). Supabase is mocked; the favorite/excluded routes are
// stateful so the refresh on mount sees the write. Exercise names in UF11_FIXTURES are their ids.
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

type Row = { exercise_id: string; created_at: string };
const at = "2026-10-08T10:00:00.000Z";

async function open(
  page: Page,
  path: string,
  seed: { favorites: string[]; excluded: string[] },
): Promise<void> {
  await mockSupabaseData(page, UF11_FIXTURES);
  const favorites: Row[] = seed.favorites.map((id) => ({ exercise_id: id, created_at: at }));
  const excluded: Row[] = seed.excluded.map((id) => ({ exercise_id: id, created_at: at }));
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/favorite_exercises*`, async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { exercise_id: string };
      const row = { exercise_id: body.exercise_id, created_at: at };
      favorites.push(row);
      const i = excluded.findIndex((r) => r.exercise_id === body.exercise_id);
      if (i >= 0) excluded.splice(i, 1);
      await route.fulfill({ status: 201, json: [row] });
    } else {
      await route.fulfill({ status: 200, json: favorites });
    }
  });
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/excluded_exercises*`, (route) =>
    route.fulfill({ status: 200, json: excluded }),
  );
  await page.goto("/");
  await injectSession(page);
  await page.goto(path);
}

async function axeClean(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).include('[data-screen-id="UF-11.6"]').analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );
}

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
});

test("row -> grouped list -> search -> Add on an excluded exercise", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "/plan", { favorites: ["squat"], excluded: ["bench"] });

  const row = page.getByRole("link", { name: "Favorite exercises, 1" });
  await expect(row).toBeVisible();
  // T-0612: the two rows are adjacent links in one group (no longer one card each).
  const links = page.locator(".wl-plan__links > a");
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toHaveAccessibleName("Favorite exercises, 1");
  await expect(links.nth(1)).toHaveAccessibleName("Excluded exercises, 1");

  await row.click();
  await expect(page).toHaveURL(/\/plan\/favorites$/);
  await expect(page.locator('[data-screen-id="UF-11.6"]')).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Quads" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(1);
  await axeClean(page);

  await page.getByLabel("Search exercises").fill("BENCH");
  await expect(page.getByRole("button", { name: "Add bench to favorites" })).toBeVisible();
  await expect(page.getByText("Excluded", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add bench to favorites" }).click();
  await expect(page.getByRole("button", { name: "Remove bench from favorites" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(
    "bench is a favorite and will be suggested again.",
  );
  await expect(page.getByText("Excluded", { exact: true })).toHaveCount(0);
  await axeClean(page);

  const shot = testInfo.outputPath("favorites-390.png");
  await page.getByLabel("Search exercises").fill("");
  await expect(page.getByRole("heading", { level: 2, name: "Chest" })).toBeVisible();
  await page.screenshot({ path: shot, fullPage: true });
  const copy = process.env.WL_FAVORITES_SHOT;
  if (copy) {
    mkdirSync(dirname(copy), { recursive: true });
    copyFileSync(shot, copy);
  }
});

test("axe is clean with no favorites", async ({ page }) => {
  await open(page, "/plan/favorites", { favorites: [], excluded: [] });
  await expect(page.getByText("No favorites yet.")).toBeVisible();
  await axeClean(page);
});

test("offline load of /plan/favorites shows the cached favorites, controls disabled", async ({
  page,
  context,
}) => {
  // Warm the library cache on /plan first (a cold direct load of UF-11.6 reads it before it lands).
  await open(page, "/plan", { favorites: ["squat"], excluded: [] });
  await page.getByRole("link", { name: "Favorite exercises, 1" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Quads" })).toBeVisible();

  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const keys = await caches.keys();
          const precache = keys.find((k) => k.startsWith("workbox-precache"));
          if (!precache) return { hasDocument: false };
          const requests = await (await caches.open(precache)).keys();
          return { hasDocument: requests.some((r) => new URL(r.url).pathname === "/index.html") };
        }),
      { message: "the workbox precache never finished populating before going offline" },
    )
    .toMatchObject({ hasDocument: true });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 2, name: "Quads" })).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByText("squat", { exact: true })).toBeVisible();
  await expect(page.getByText("Connect to change favorites")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove squat from favorites, Quads" }),
  ).toHaveAttribute("aria-disabled", "true");
});

// T-0613 (D-0208, D-0211; UF-11.6): the Cobalt plan state, measured in a real browser.
test.describe("T-0613 UF-11.6 plan state (390 x 844)", () => {
  test("data-wl-state=plan, 28 px gutter (20 px at 340), axe colour-contrast clean, targets 44 px, and the rows are outline-button rows", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "/plan/favorites", { favorites: ["squat"], excluded: ["bench"] });
    const root = page.locator('[data-screen-id="UF-11.6"]');
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
        path: testInfo.outputPath("cobalt", "uf11-6-favorites.png"),
        fullPage: true,
      });
    }
  });
});
