// T-0573 UF-08.5 e2e (AC10), moved to the areas-first flow by T-1019 (D-0274, D-0286): open the Add
// exercise sheet from UF-08.6 (the area detail; UF-08.2 has no list and no Add exercise), add one,
// see it tagged "Added by you", and a time chip keeps it. Axe on the sheet with an empty and a
// non-empty query. The "Doesn't fit" line, the sheet's own "Start with this" and the re-suggest
// around an Add are retired (D-0274 section 5); "Start with this" is a UF-08.6 row button now.
// Same seed as uf-08-excluded.spec.ts.
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

/** UF-08.1 at 30 min -> Suggest -> UF-08.2 -> frees time (Chest and Quads out) -> UF-08.6 of Back. */
async function toDetail(
  page: Page,
  extra: { sets?: unknown[]; excludedExercises?: unknown[]; favoriteExercises?: unknown[] } = {},
): Promise<void> {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets: extra.sets ?? [],
    ...(extra.excludedExercises ? { excludedExercises: extra.excludedExercises } : {}),
    ...(extra.favoriteExercises ? { favoriteExercises: extra.favoriteExercises } : {}),
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
  // The plan fills the 30 minutes; take Chest and Quads out (UF-08.2 minus until Remove, then
  // Remove) so an Add fits. Back stays.
  for (const area of ["chest", "quads"]) {
    const minus = page.locator(`[data-area="${area}"] [data-part="minus"]`);
    while ((await minus.getAttribute("aria-label"))!.startsWith("One set less"))
      await minus.click();
    await minus.click();
    await expect(page.locator(`[data-part="area-row"][data-area="${area}"]`)).toHaveCount(0);
  }
  await page.locator('[data-area="back"] [data-part="area-open"]').click();
  await expect(page.locator('[data-screen-id="UF-08.6"]')).toBeVisible();
}

const rowsOf = (page: Page) => page.locator('[data-part="detail-row"]');

test("Add exercise: open, axe, add, Added by you, a time chip keeps it", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await toDetail(page);
  const before = await rowsOf(page).count();

  await page.getByRole("button", { name: "Add exercise" }).click();
  const sheet = page.locator('[data-screen-id="UF-08.5"]');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Search exercises")).toBeFocused();
  expect(await sheet.getByRole("heading", { name: "Today's areas" }).count()).toBe(1);

  const emptyQuery = await new AxeBuilder({ page }).include('[data-screen-id="UF-08.5"]').analyze();
  expect(
    emptyQuery.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("uf085.png") });

  await sheet.getByLabel("Search exercises").fill("pulldown");
  const withQuery = await new AxeBuilder({ page }).include('[data-screen-id="UF-08.5"]').analyze();
  expect(
    withQuery.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
  ).toEqual([]);

  const add = sheet.getByRole("button", { name: /^Add / }).first();
  const label = (await add.getAttribute("aria-label"))!;
  const name = label.replace(/^Add /, "").replace(/,.*$/, "");
  await add.click();
  await expect(sheet).toHaveCount(0);
  const row = rowsOf(page).filter({ hasText: name });
  await expect(row).toContainText("Added by you");
  await expect(page.getByRole("status").filter({ hasText: `${name} added.` })).toHaveCount(1);
  expect(await rowsOf(page).count()).toBe(before + 1);

  // A time chip rebuilds the plan and keeps the Add (T-0996 AC8): it is in the area at 45 min.
  await page.getByRole("link", { name: "Back" }).click();
  await page.getByRole("button", { name: "45 minutes" }).click();
  await expect(page.locator('[data-part="status"]')).toContainText("Plan rebuilt for 45 min");
  await page.locator('[data-area="back"] [data-part="area-open"]').click();
  await expect(rowsOf(page).filter({ hasText: name })).toContainText("Added by you");
});

// T-0574 AC8: an Excluded row and a recovering row (6 hard leg-curl sets 24 h ago), then Remove of
// an added item, in a real browser.
test("Add exercise: Excluded and recovering rows disabled with their reason; remove an added item", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const at = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const sets = Array.from({ length: 6 }, (_, i) => ({
    client_id: `t0574-${i}`,
    session_id: "T0574-S1",
    exercise_id: "leg-curl",
    is_warmup: false,
    completed_at: at,
    edited_at: at,
    deleted_at: null,
    reps: 10,
    weight_kg: 30,
    duration_s: null,
  }));
  await toDetail(page, {
    sets,
    excludedExercises: [{ exercise_id: "dead-bug", created_at: new Date().toISOString() }],
  });
  await page.getByRole("button", { name: "Add exercise" }).click();
  const sheet = page.locator('[data-screen-id="UF-08.5"]');
  await sheet.getByLabel("Search exercises").fill("dead bug");
  const dead = sheet.locator('[data-part="pick-row"]').filter({ hasText: "Dead bug" });
  await expect(dead).toContainText("Excluded. Include it again in Plan \u203A Excluded exercises.");
  await expect(dead.getByRole("button", { name: "Add Dead bug" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await sheet.getByLabel("Search exercises").fill("leg curl");
  const curl = sheet.locator('[data-part="pick-row"]').filter({ hasText: "Leg curl" });
  await expect(curl).toContainText("Hamstrings is recovering");
  await expect(curl.getByRole("button", { name: "Add Leg curl" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  await sheet.getByLabel("Search exercises").fill("lat pulldown");
  await sheet.getByRole("button", { name: "Add Lat pulldown" }).click();
  await expect(sheet).toHaveCount(0);
  const row = rowsOf(page).filter({ hasText: "Lat pulldown" });
  await expect(row).toContainText("Added by you");
  await row.getByRole("button", { name: "Remove Lat pulldown" }).click();
  await expect(row).toHaveCount(0);
  await expect(page.locator('[data-part="removed-line"]')).toContainText("Lat pulldown");
});

// T-0575 AC7 (UF-08.6): "Start with this" is a row button now (the sheet's own is retired, D-0274
// section 5): it makes a compound the Main lift, in a browser.
test("Start with this: a UF-08.6 row becomes the Main lift", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await toDetail(page);
  await page.getByRole("button", { name: "Add exercise" }).click();
  const sheet = page.locator('[data-screen-id="UF-08.5"]');
  await sheet.getByLabel("Search exercises").fill("barbell row");
  await sheet.getByRole("button", { name: "Add Barbell row" }).click();
  await expect(sheet).toHaveCount(0);
  const row = rowsOf(page).filter({ hasText: "Barbell row" });
  await expect(row).not.toHaveAttribute("data-main", "true");
  await row.getByRole("button", { name: "Start with Barbell row" }).click();
  await expect(row).toHaveAttribute("data-main", "true");
  await expect(page.locator('[data-part="status"]')).toHaveText(
    "Barbell row is the main lift now.",
  );
  await expect(page.locator('[data-main="true"]')).toHaveCount(1);
  await expect(row.getByRole("button", { name: "Start with Barbell row" })).toHaveCount(0);
});

// T-0577 UF-08.5 AC7: the stored favorites come first, tagged, and are not repeated under Today's areas.
test("Add exercise: Favorites first, tagged, not repeated under Today's areas", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const at = new Date().toISOString();
  await toDetail(page, {
    favoriteExercises: [
      { exercise_id: "lateral-raise", created_at: at },
      { exercise_id: "back-squat", created_at: at },
    ],
  });
  await page.getByRole("button", { name: "Add exercise" }).click();
  const sheet = page.locator('[data-screen-id="UF-08.5"]');
  await expect(sheet.getByRole("heading", { name: "Favorites" })).toBeVisible();
  const heads = sheet.getByRole("heading", { level: 2 });
  await expect(heads.nth(1)).toHaveText("Favorites");
  await expect(heads.nth(2)).toHaveText("Today's areas");
  const favNames = sheet.locator("section").first().locator(".wl-uf08__pick-name");
  await expect(favNames).toHaveText(["Back squatFavorite", "Lateral raiseFavorite"]);
  await expect(sheet.getByRole("button", { name: /^Add Back squat/ })).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("uf085-fav.png") });
});
