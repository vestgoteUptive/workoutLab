// T-0956 UF-04.2 "Weight step" happy path in a real browser (D-0251, D-0259): pick 1.25 kg, see the
// status and "Use default", reset, then change it offline (applies at once, queued, no
// "Connect to change" text). QA wires this file into tests/e2e. Supabase is mocked; the
// `exercise_settings` route is stateful so the flush on reconnect is observable.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "../../../../../../tests/e2e/fixtures/guarded-test.js";
import {
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
  VITE_SUPABASE_URL,
} from "../../../../../../tests/e2e/fixtures/supabase-mock.js";
import {
  exerciseAreas,
  exerciseVariants,
  exercisesLoaded,
  profile,
} from "../../../../../../tests/e2e/fixtures/uf-04-library-data.js";

type Write = { method: string; url: string; body: unknown };

async function open(page: Page, writes: Write[]): Promise<void> {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets: [],
    // The library step is 2.5 kg for every loaded exercise.
    exercises: exercisesLoaded.map((e) => (e.external_load ? { ...e, increment_kg: 2.5 } : e)),
    exerciseAreas,
    exerciseVariants,
    areaTargets: [],
    profile,
  });
  // Registered after mockSupabaseData: the later route wins.
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/exercise_settings*`, async (route) => {
    const request = route.request();
    const method = request.method();
    if (method === "GET") return route.fulfill({ status: 200, json: [] });
    const raw = request.postData();
    writes.push({ method, url: request.url(), body: raw === null ? null : JSON.parse(raw) });
    if (method === "DELETE") return route.fulfill({ status: 204, body: "" });
    const row = { ...(JSON.parse(raw ?? "{}") as object), updated_at: new Date().toISOString() };
    return route.fulfill({ status: 201, json: [row] });
  });
  await page.goto("/");
  await injectSession(page);
  await page.goto("/library/back-squat");
}

const serious = (v: { impact?: string | null }) =>
  v.impact === "serious" || v.impact === "critical";

test("happy path: set 1.25 kg, reset to the default, and change it offline", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes: Write[] = [];
  await open(page, writes);
  const row = page.locator('[data-field="weight-step"]');
  await expect(row.locator("[data-field=weight-step-value]")).toContainText(
    "Weight step: 2.5 kg (default)",
  );
  await expect(row.getByRole("radio", { name: "2.5 kg", exact: true })).toBeChecked();
  await expect(row.getByRole("button", { name: /Use default/ })).toHaveCount(0);

  await row.getByRole("radio", { name: "1.25 kg", exact: true }).click();
  await expect(row.getByRole("status")).toHaveText("Weight step set to 1.25 kg.");
  await expect(row.locator("[data-field=weight-step-value]")).toContainText("1.25 kg (yours)");
  await expect.poll(() => writes.length).toBe(1);

  const axe = await new AxeBuilder({ page }).include('[data-screen-id="UF-04.2"]').analyze();
  expect(axe.violations.filter(serious)).toEqual([]);
  for (const chip of await row.getByRole("radio").all()) {
    expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }

  await row.getByRole("button", { name: /Use default/ }).click();
  await expect(row.getByRole("status")).toHaveText("Weight step back to the default, 2.5 kg.");
  await expect(row.getByRole("radio", { name: "2.5 kg", exact: true })).toBeFocused();

  await context.setOffline(true);
  await row.getByRole("radio", { name: "5 kg", exact: true }).click();
  await expect(row.getByRole("status")).toHaveText("Weight step set to 5 kg.");
  await expect(row).not.toContainText("Connect to change");
  await expect(row.locator("[aria-disabled]")).toHaveCount(0);
});

test("timed and bodyweight exercises have no Weight step row", async ({ page }) => {
  await open(page, []);
  await page.goto("/library/push-up");
  await expect(page.getByRole("heading", { level: 1, name: "Push-up" })).toBeVisible();
  await expect(page.locator('[data-field="weight-step"]')).toHaveCount(0);
});
