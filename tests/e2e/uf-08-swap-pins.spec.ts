// T-0935 AC10 (UF-08.2, UF-08.3, UF-08.5; D-0235): a swap on UF-08.3 survives a later Add on
// UF-08.5 and a Shuffle. Before D-0235 the Add's re-suggest put the swapped-out exercise back.
// Same seed as uf-08-add.spec.ts: at 30 min the plan is Bench press (main), Inverted row, Leg
// extension, and UF-08.3 offers Dumbbell row (db-row) for Inverted row.
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

test("Swap then Add keeps the swap-in; the swapped-out exercise stays out", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await toSuggested(page);
  const row = (id: string) => page.locator(`[data-part="item-row"][data-id="${id}"]`);
  await expect(row("inverted-row")).toHaveCount(1);

  // UF-08.3: Inverted row → Dumbbell row.
  await page.getByRole("button", { name: "Swap Inverted row" }).click();
  const sheet = page.getByRole("dialog");
  const pick = sheet.getByRole("radiogroup", { name: "Replacement" }).locator('[data-id="db-row"]');
  await pick.getByRole("radio").check();
  await sheet.getByRole("button", { name: /^Use / }).click();
  await expect(page.locator('[data-screen-id="UF-05.1"]')).toHaveCount(0);
  await expect(row("db-row")).toHaveCount(1);
  await expect(row("inverted-row")).toHaveCount(0);

  // UF-08.5: add Lateral raise. The plan is re-suggested around both.
  await page.getByRole("button", { name: "Add exercise" }).click();
  const add = page.locator('[data-screen-id="UF-08.5"]');
  await add.getByLabel("Search exercises").fill("lateral raise");
  await add.getByRole("button", { name: "Add Lateral raise" }).click();
  await expect(add).toHaveCount(0);
  await expect(row("lateral-raise")).toContainText("Added by you");
  await expect(row("db-row")).toHaveCount(1);
  await expect(row("db-row")).not.toContainText("Added by you");
  await expect(row("inverted-row")).toHaveCount(0);

  // Shuffle never touches the swap either.
  await page.getByRole("button", { name: "Shuffle" }).click();
  await expect(row("db-row")).toHaveCount(1);
  await expect(row("lateral-raise")).toHaveCount(1);
  await expect(row("inverted-row")).toHaveCount(0);
  await expect(page.locator('[data-part="removed-line"]')).not.toContainText("Inverted row");
});
