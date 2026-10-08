// T-0571 UF-08.2 e2e (AC8): a favorite ranks first and carries the "Favorite" tag (AC2), and a
// re-suggest with the network gone still uses the cached favorites (AC4, D-0091 §1: the seeded
// cache, the built content asserted). Same seed as uf-08-add.spec.ts.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import { goOffline } from "./fixtures/offline.js";
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

async function toSetup(page: Page): Promise<void> {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets: [],
    favoriteExercises: [{ exercise_id: "db-bench-press", created_at: new Date().toISOString() }],
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

const rows = (page: Page) => page.locator('[data-part="item-row"]');

test("a favorite is the main lift with the Favorite tag; offline Shuffle keeps it", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await toSetup(page);
  const first = rows(page).first();
  await expect(first).toHaveAttribute("data-id", "db-bench-press");
  await expect(first).toHaveAttribute("data-main", "true");
  await expect(first).toContainText("Favorite");
  await expect(rows(page).filter({ hasText: "Favorite" })).toHaveCount(1);

  await goOffline(page, context);
  await page.getByRole("button", { name: "Shuffle" }).click();
  await expect(rows(page).first()).toHaveAttribute("data-id", "db-bench-press");
  await expect(rows(page).first()).toContainText("Favorite");
});
