// T-1005 UF-11.4 "Learning from your edits" e2e: the toggle and Forget over a mocked account,
// offline state, and axe plus 44 px targets at 320 and 390 px.
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
import { ACCOUNT_FIXTURES, ACCOUNT_PROFILE } from "./fixtures/uf-11-account.js";

const TOGGLE = "Suggest preferences from my swaps and removals";
const bodies: unknown[] = [];
let deletes = 0;
let learnOn = true;

async function open(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 844 });
  await mockSupabaseData(page, ACCOUNT_FIXTURES);
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/edit_signals*`, (route) => {
    if (route.request().method() === "DELETE") deletes += 1;
    return route.fulfill({ status: 200, json: [] });
  });
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/profiles*`, (route) => {
    if (route.request().method() !== "PATCH") {
      if (route.request().method() !== "GET") return route.fallback();
      // The account keeps the flag, so a profile read after a write shows it.
      const row = { ...ACCOUNT_PROFILE, learn_from_edits: learnOn, learn_reset_at: null };
      const asObject = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
      return route.fulfill({ status: 200, json: asObject ? row : [row] });
    }
    const body = route.request().postDataJSON() as { learn_from_edits?: boolean };
    if (body.learn_from_edits !== undefined) learnOn = body.learn_from_edits;
    bodies.push(body);
    return route.fulfill({ status: 200, json: { learn_reset_at: "2026-11-24T10:00:00.000Z" } });
  });
  await page.goto("/");
  await injectSession(page);
  await page.goto("/plan/account");
  await expect(page.getByRole("heading", { name: "Learning from your edits" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  bodies.length = 0;
  deletes = 0;
  learnOn = true;
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
});

test("T-1005 toggle off and on, then Forget: changed-field-only writes and status lines", async ({
  page,
}) => {
  await open(page, 390);
  const toggle = page.getByRole("checkbox", { name: TOGGLE });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(page.getByRole("status").filter({ hasText: "Learning is off." })).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(page.getByRole("status").filter({ hasText: "Learning is on." })).toBeVisible();
  await page.getByRole("button", { name: "Forget what was counted" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Counts cleared." })).toBeVisible();
  expect(bodies).toEqual([
    { learn_from_edits: false },
    { learn_from_edits: true },
    expect.objectContaining({ learn_reset_at: expect.any(String) }),
  ]);
  expect(Object.keys(bodies[2] as object)).toEqual(["learn_reset_at"]);
  expect(deletes).toBeGreaterThanOrEqual(2);
});

test("T-1005 offline: both controls are aria-disabled with the caption", async ({
  page,
  context,
}) => {
  await open(page, 390);
  await context.setOffline(true);
  await expect(page.getByRole("checkbox", { name: TOGGLE })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(page.getByRole("button", { name: "Forget what was counted" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(page.getByText("Connect to change this")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole("checkbox", { name: TOGGLE })).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

for (const width of [320, 390]) {
  test(`T-1005 AC6 axe and 44 px targets at ${width} px`, async ({ page }) => {
    await open(page, width);
    const result = await new AxeBuilder({ page }).include('[data-screen-id="UF-11.4"]').analyze();
    expect(result.violations).toEqual([]);
    const card = page.locator("section", {
      has: page.getByRole("heading", { name: "Learning from your edits" }),
    });
    for (const target of [
      card.getByRole("checkbox", { name: TOGGLE }).locator("xpath=ancestor::label"),
      card.getByRole("button", { name: "Forget what was counted" }),
    ]) {
      const box = (await target.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}
