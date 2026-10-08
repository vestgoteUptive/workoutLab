// T-0573 UF-08.5 e2e (AC10): open the Add exercise sheet from UF-08.2, add one, see it tagged
// "Added by you", and watch a shorter time keep it or list it under "Doesn't fit". Axe on the
// sheet with an empty and a non-empty query. Same seed as uf-08-excluded.spec.ts.
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

test("Add exercise: open, axe, add, Added by you, a shorter time keeps or lists it", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await toSuggested(page);
  const names = page.locator('[data-part="item-row"] [data-part="row-name"]');
  const before = await names.count();

  await page.getByRole("button", { name: "Add exercise" }).click();
  const sheet = page.locator('[data-screen-id="UF-08.5"]');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Search exercises")).toBeFocused();
  expect(await sheet.getByRole("heading", { name: "Today's areas" }).count()).toBe(1);

  const emptyQuery = await new AxeBuilder({ page }).include('[data-screen-id="UF-08.5"]').analyze();
  expect(
    emptyQuery.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
  ).toEqual([]);
  await testInfo.attach("uf085", {
    path: await (async () => {
      const file = testInfo.outputPath("uf085.png");
      await page.screenshot({ path: file });
      return file;
    })(),
    contentType: "image/png",
  });

  await sheet.getByLabel("Search exercises").fill("squat");
  const withQuery = await new AxeBuilder({ page }).include('[data-screen-id="UF-08.5"]').analyze();
  expect(
    withQuery.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
  ).toEqual([]);

  const add = sheet.getByRole("button", { name: /^Add / }).first();
  const label = (await add.getAttribute("aria-label"))!;
  const name = label.replace(/^Add /, "").replace(/,.*$/, "");
  await add.click();
  await expect(sheet).toHaveCount(0);
  const row = page.locator('[data-part="item-row"]').filter({ hasText: name });
  await expect(row).toContainText("Added by you");
  await expect(page.getByRole("status").filter({ hasText: `${name} added.` })).toHaveCount(1);
  expect(await names.count()).toBeGreaterThanOrEqual(before);

  // 20 minutes: the add stays in the plan or is listed under Doesn't fit; 30 brings it back.
  await page.getByRole("button", { name: "20 minutes" }).click();
  const inPlan = (await row.count()) > 0;
  const line = page.locator('[data-part="doesnt-fit"]');
  if (inPlan) await expect(line).toHaveCount(0);
  else await expect(line).toContainText(`Doesn't fit in 20 min: ${name}.`);
  await page.getByRole("button", { name: "30 minutes" }).click();
  await expect(row).toContainText("Added by you");
  await expect(line).toHaveCount(0);
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
  await toSuggested(page, {
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

  await sheet.getByLabel("Search exercises").fill("back squat");
  await sheet.getByRole("button", { name: "Add Back squat" }).click();
  await expect(sheet).toHaveCount(0);
  const row = page.locator('[data-part="item-row"]').filter({ hasText: "Back squat" });
  await expect(row).toContainText("Added by you");
  await row.getByRole("button", { name: "Remove Back squat" }).click();
  await expect(row).toHaveCount(0);
  await expect(page.locator('[data-part="removed-line"]')).toContainText("Back squat");
});
