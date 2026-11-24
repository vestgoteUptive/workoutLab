// T-0935 AC10 (UF-08.3, UF-08.5; D-0235), moved to the areas-first flow by T-1019 (D-0274): a swap
// made from UF-08.6 survives a later Add on UF-08.5 and a time-chip rebuild (the one re-suggest left
// now that Shuffle is retired). Before D-0235 the re-suggest put the swapped-out exercise back.
// Same seed as uf-08-add.spec.ts: at 30 min the plan is Chest, Back and Quads with Inverted row as
// the Back exercise, and UF-08.3 offers Dumbbell row (db-row) for it.
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

async function toSuggested(page: Page): Promise<void> {
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
  await page.goto("/");
  await injectSession(page);
  await page.goto("/session/setup");
  await page.getByRole("button", { name: "30 minutes" }).click();
  await expect(page.locator('[data-part="fit-line"]')).toHaveText(/^Fits:/);
  await page.getByRole("button", { name: "Suggest my workout" }).click();
  await expect(page.locator('[data-screen-id="UF-08.2"]')).toBeVisible();
}

test("Swap then Add keeps the swap-in; a time-chip rebuild keeps it and the swapped-out stays out", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await toSuggested(page);
  const row = (id: string) => page.locator(`[data-part="detail-row"][data-id="${id}"]`);
  const openBack = async (): Promise<void> => {
    await page.locator('[data-area="back"] [data-part="area-open"]').click();
    await expect(page.locator('[data-screen-id="UF-08.6"]')).toBeVisible();
  };
  // Free time for the Add: the plan fills the 30 minutes, so take Chest and Quads out (UF-08.2 −
  // until the control reads Remove, then Remove).
  for (const area of ["chest", "quads"]) {
    const minus = page.locator(`[data-area="${area}"] [data-part="minus"]`);
    while ((await minus.getAttribute("aria-label"))!.startsWith("One set less"))
      await minus.click();
    await minus.click();
    await expect(page.locator(`[data-part="area-row"][data-area="${area}"]`)).toHaveCount(0);
  }
  await openBack();
  await expect(row("inverted-row")).toHaveCount(1);

  // UF-08.3: Inverted row → Dumbbell row.
  await page.getByRole("button", { name: "Swap Inverted row" }).click();
  const sheet = page.getByRole("dialog");
  const pick = sheet.getByRole("radiogroup", { name: "Replacement" }).locator('[data-id="db-row"]');
  await pick.getByRole("radio").check();
  await sheet.getByRole("button", { name: /^Use / }).click();
  await expect(page.locator('[data-screen-id="UF-05.1"]')).toHaveCount(0);
  await expect(page.locator('[data-screen-id="UF-08.6"]')).toBeVisible();
  await expect(row("db-row")).toHaveCount(1);
  await expect(row("inverted-row")).toHaveCount(0);

  // UF-08.5 from UF-08.6: add Lateral raise. The swap stays.
  await page.getByRole("button", { name: "Add exercise" }).click();
  const add = page.locator('[data-screen-id="UF-08.5"]');
  await add.getByLabel("Search exercises").fill("lateral raise");
  await add.getByRole("button", { name: "Add Lateral raise" }).click();
  await expect(add).toHaveCount(0);
  await expect(row("db-row")).toHaveCount(1);
  await expect(row("inverted-row")).toHaveCount(0);

  // A time chip rebuilds the plan from the pins: the swap-in is still the Back exercise.
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page.locator('[data-screen-id="UF-08.2"]')).toBeVisible();
  await page.getByRole("button", { name: "45 minutes" }).click();
  await expect(page.locator('[data-part="status"]')).toContainText("Plan rebuilt for 45 min");
  await openBack();
  await expect(row("db-row")).toHaveCount(1);
  await expect(row("inverted-row")).toHaveCount(0);
});
