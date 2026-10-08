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
  const cards = page.locator("section.wl-card");
  const rowIdx = await cards.evaluateAll(
    (els, name) => els.findIndex((e) => e.querySelector(`a[aria-label="${name}"]`)),
    "Favorite exercises, 1",
  );
  await expect(cards.nth(rowIdx + 1).getByRole("link")).toHaveAccessibleName(
    "Excluded exercises, 1",
  );

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
