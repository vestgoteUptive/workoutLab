// T-0683b UF-11.3: /plan/edit?from=favorites returns to /plan/favorites (focus on the UF-11.6
// title) on Save and Cancel; every other `from` returns to /plan (no open redirect).
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import { UF11_FIXTURES } from "./fixtures/uf-11-plan.js";

async function open(page: Page, path: string): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, UF11_FIXTURES);
  await page.goto("/");
  await injectSession(page);
  await page.goto(path);
  await expect(page.getByRole("radiogroup", { name: "Level" })).toBeVisible();
}

const path = (page: Page): string => new URL(page.url()).pathname;
const title = (page: Page) => page.getByRole("heading", { level: 1, name: "Favorite exercises" });

test("T-0683b Cancel from=favorites lands on /plan/favorites with focus on the title", async ({
  page,
}) => {
  await open(page, "/plan/edit?from=favorites");
  await page.getByRole("link", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/favorites$/);
  await expect(title(page)).toBeFocused();
});

test("T-0683b Save from=favorites lands on /plan/favorites with focus on the title", async ({
  page,
}) => {
  await open(page, "/plan/edit?from=favorites");
  await page
    .getByRole("radiogroup", { name: "Level" })
    .getByRole("radio", { name: "Advanced" })
    .check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/favorites$/);
  await expect(title(page)).toBeFocused();
});

for (const from of [
  "//evil.example",
  "https://x",
  "/plan/favorites",
  "favorites%2F..",
  "Favorites",
  "account&from=favorites",
]) {
  test(`T-0683b Cancel from=${from} stays on-site at /plan`, async ({ page }) => {
    await open(page, `/plan/edit?from=${from}`);
    await page.getByRole("link", { name: "Cancel", exact: true }).click();
    await expect(page).toHaveURL(/\/plan$/);
    expect(new URL(page.url()).origin).toBe(new URL("/", page.url()).origin);
    expect(path(page)).toBe("/plan");
  });
}

test("T-0683b offline: Save is disabled and Cancel still returns to favorites", async ({
  page,
}) => {
  await open(page, "/plan/edit?from=favorites");
  await page.context().setOffline(true);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.getByRole("link", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/favorites$/);
  await expect(title(page)).toBeFocused();
});
