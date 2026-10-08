// T-0576 UF-08.2 Reorder mode e2e (AC1, AC6, AC8): Reorder, two Move ups, axe in the mode, Done,
// Looks good, Start, and UF-09 runs the reordered workout (Leg extension first). Same seed as
// uf-08-add.spec.ts.
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  FAKE_USER_ID,
  injectSession,
  mockProfilePresent,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import { exerciseAreas, exercises, profile } from "./fixtures/uf-04-library-data.js";

const AREAS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
];
const AREA_TARGETS = AREAS.map((area) => ({
  area_id: area,
  sets_per_14d: 16,
  source: "default",
  updated_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
}));
const profileRow = { ...profile, user_id: FAKE_USER_ID };

async function toSuggested(
  page: Page,
  extra: { sets?: unknown[]; excludedExercises?: unknown[] } = {},
): Promise<void> {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets: extra.sets ?? [],
    ...(extra.excludedExercises ? { excludedExercises: extra.excludedExercises } : {}),
    exercises,
    exerciseAreas,
    areaTargets: AREA_TARGETS,
    profile: profileRow,
  });
  await mockProfilePresent(page, profileRow);
  await page.goto("/");
  await injectSession(page);
  await page.goto("/session/setup");
  await page.getByRole("button", { name: "30 minutes" }).click();
  await expect(page.locator('[data-part="fit-line"]')).toHaveText(/^Fits:/);
  await page.getByRole("button", { name: "Suggest my workout" }).click();
  await expect(page.locator('[data-screen-id="UF-08.2"]')).toBeVisible();
}

test("Reorder: move up twice, axe, Start; UF-09 runs Leg extension first", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await toSuggested(page);
  const names = page.locator('[data-part="item-row"] [data-part="row-name"]');
  await expect(names).toHaveText(["Bench press", "Inverted row", "Leg extension"]);

  await page.getByRole("button", { name: "Reorder" }).click();
  await expect(page.getByRole("button", { name: "Move Bench press down" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Shuffle" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Looks good" })).toHaveCount(0);
  await page.getByRole("button", { name: "Move Leg extension up" }).click();
  await page.getByRole("button", { name: "Move Leg extension up" }).click();
  await expect(names).toHaveText(["Leg extension", "Bench press", "Inverted row"]);
  await expect(page.getByRole("button", { name: "Move Leg extension down" })).toBeFocused();
  await expect(page.locator('[data-part="status"]')).toHaveText("Leg extension moved to 1 of 3.");
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
  ).toEqual([]);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Reorder" })).toBeFocused();

  await page.getByRole("button", { name: "Looks good" }).click();
  await expect(page.locator('[data-screen-id="UF-08.4"]')).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator('[data-screen-id="UF-09.1"]')).toBeVisible();
  await page.getByRole("button", { name: "Skip warm-up" }).click();
  await expect(page.locator("[data-screen-id]")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Leg extension" })).toBeVisible();
});
