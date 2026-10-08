// T-0568 UF-04.2 Favorite toggle and UF-04.1 tag (D-0202 §8, §9): AC1 and AC3 in a real browser,
// axe on UF-04.2 with the toggle pressed and unpressed at 320 and 390 px. Supabase is mocked;
// the two list routes are stateful so the refresh on mount sees each write.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
  VITE_SUPABASE_URL,
} from "./fixtures/supabase-mock.js";
import {
  exerciseAreas,
  exerciseVariants,
  exercises,
  profile,
} from "./fixtures/uf-04-library-data.js";

type Row = { exercise_id: string; created_at: string };
const at = "2026-10-08T10:00:00.000Z";

async function open(page: Page, path: string, excluded: string[] = []): Promise<void> {
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
  const favs: Row[] = [];
  const excl: Row[] = excluded.map((exercise_id) => ({ exercise_id, created_at: at }));
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/favorite_exercises*`, async (route) => {
    const method = route.request().method();
    if (method === "POST") {
      const body = route.request().postDataJSON() as { exercise_id: string };
      const row = { exercise_id: body.exercise_id, created_at: at };
      favs.push(row);
      const i = excl.findIndex((r) => r.exercise_id === body.exercise_id);
      if (i >= 0) excl.splice(i, 1);
      await route.fulfill({ status: 201, json: [row] });
    } else if (method === "DELETE") {
      favs.length = 0;
      await route.fulfill({ status: 204, body: "" });
    } else {
      await route.fulfill({ status: 200, json: favs });
    }
  });
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/excluded_exercises*`, (route) =>
    route.fulfill({ status: 200, json: excl }),
  );
  await page.goto("/");
  await injectSession(page);
  await page.goto(path);
}

const serious = (v: { impact?: string | null }) =>
  v.impact === "serious" || v.impact === "critical";

test("AC1: favorite from UF-04.2 shows the tag on UF-04.1", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "/library/back-squat");
  const toggle = page.getByRole("button", { name: "Favorite Back squat" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const axe = await new AxeBuilder({ page }).include('[data-screen-id="UF-04.2"]').analyze();
  expect(axe.violations.filter(serious)).toEqual([]);
  await page.goto("/library");
  await expect(
    page.locator("li", { hasText: "Back squat" }).locator('[data-field="favorite"]'),
  ).toHaveText("Favorite");
});

test("AC3: favoriting an excluded exercise moves it with one status line", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "/library/back-squat", ["back-squat"]);
  await expect(page.getByText("Not suggested")).toBeVisible();
  await page.getByRole("button", { name: "Favorite Back squat" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Back squat is a favorite and will be suggested again.",
  );
  await expect(page.getByRole("button", { name: /^Don't suggest this/ })).toBeVisible();
  await expect(page.getByText("Not suggested")).toHaveCount(0);
});

for (const width of [320, 390]) {
  test(`axe on UF-04.2 unpressed and pressed at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page, "/library/back-squat");
    const toggle = page.getByRole("button", { name: "Favorite Back squat" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    const a = await new AxeBuilder({ page }).include('[data-screen-id="UF-04.2"]').analyze();
    expect(a.violations.filter(serious)).toEqual([]);
    const ex = page.getByRole("button", { name: /^Don't suggest this/ });
    const [t, e] = [await toggle.boundingBox(), await ex.boundingBox()];
    expect(t && e && (width === 390 ? Math.abs(t.y - e.y) < 8 : e.y > t.y + t.height)).toBe(true);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const b = await new AxeBuilder({ page }).include('[data-screen-id="UF-04.2"]').analyze();
    expect(b.violations.filter(serious)).toEqual([]);
  });
}
