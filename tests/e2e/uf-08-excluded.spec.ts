// T-0538 UF-08.2 e2e (AC9; D-0199 §2): Remove -> Never suggest -> leave -> Start again -> the
// exercise is absent, and the Supabase mock records exactly one upsert to `excluded_exercises`
// with `ignoreDuplicates`. Same seed as uf-08-setup.spec.ts; the excluded route here is stateful
// and registered after `mockSupabaseData`, so it wins over the empty-list default.
import type { Page } from "@playwright/test";
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
import { VITE_SUPABASE_URL } from "./playwright.config.js";

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

interface Recorded {
  method: string;
  url: string;
  prefer: string | undefined;
  body: unknown;
}

test("Remove, Never suggest, leave, Start again: the exercise is gone; one ignore-duplicates upsert", async ({
  page,
}: {
  page: Page;
}) => {
  const stored: Array<{ exercise_id: string; created_at: string }> = [];
  const writes: Recorded[] = [];

  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets: [],
    exercises,
    exerciseAreas,
    areaTargets: AREA_TARGETS,
    profile: profileRow,
  });
  await mockProfilePresent(page, profileRow);
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/excluded_exercises*`, async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, json: stored });
      return;
    }
    writes.push({
      method: request.method(),
      url: request.url(),
      prefer: request.headers()["prefer"],
      body: request.postDataJSON(),
    });
    const body = request.postDataJSON() as { exercise_id: string };
    const row = { exercise_id: body.exercise_id, created_at: new Date().toISOString() };
    stored.push(row);
    await route.fulfill({ status: 201, json: [row] });
  });

  await page.goto("/");
  await injectSession(page);
  await page.goto("/session/setup");
  await page.getByRole("button", { name: "30 minutes" }).click();
  const suggest = page.getByRole("button", { name: "Suggest my workout" });
  await expect(page.locator('[data-part="fit-line"]')).toHaveText(/^Fits:/);
  await suggest.click();

  const names = page.locator('[data-part="item-row"] [data-part="row-name"]');
  await expect(page.locator('[data-screen-id="UF-08.2"]')).toBeVisible();
  await expect(names.first()).toBeVisible();
  const count = await names.count();
  expect(count).toBeGreaterThan(1);
  const removed = (await names.nth(count - 1).textContent())!;

  await page.getByRole("button", { name: `Remove ${removed}` }).click();
  await expect(page.getByRole("status")).toContainText(`${removed} · Never suggest`);
  await page.getByRole("button", { name: `Never suggest ${removed}` }).click();
  await expect(page.getByRole("status")).toContainText(`${removed} won't be suggested · Undo`);
  await expect(
    page.getByRole("button", { name: `Undo, ${removed} won't be suggested` }),
  ).toBeFocused();

  await page.getByRole("link", { name: "Back" }).click();
  await expect(page.locator('[data-part="fit-line"]')).toHaveText(/^Fits:/);
  await suggest.click();
  await expect(page.locator('[data-screen-id="UF-08.2"]')).toBeVisible();
  await expect(names.filter({ hasText: new RegExp(`^${removed}$`) })).toHaveCount(0);

  expect(writes).toHaveLength(1);
  expect(writes[0]!.method).toBe("POST");
  expect(writes[0]!.url).toContain("on_conflict=user_id%2Cexercise_id");
  expect(writes[0]!.prefer).toContain("resolution=ignore-duplicates");
});
