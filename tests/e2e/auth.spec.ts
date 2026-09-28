// T-0300b auth e2e (AC-B2, AC-B3, AC-B4, AC-B5). Supabase is always mocked through
// `page.route` (`fixtures/supabase-mock.ts`): this spec never hits the network or the prod
// Supabase project.
import { expect, test } from "@playwright/test";
import {
  GOOD_CODE,
  injectSession,
  mockSupabaseEmailAuth,
  pendingPkceFlowId,
} from "./fixtures/supabase-mock.js";

test.beforeEach(async ({ page }) => {
  await mockSupabaseEmailAuth(page);
});

test.describe("AC-B5 guard", () => {
  test("signed out: /welcome renders without a redirect", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.locator('[data-screen-id="UF-01.1"]')).toBeVisible();
  });

  test("signed out: / redirects to /welcome", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-screen-id="UF-01.1"]')).toBeVisible();
    await expect(page).toHaveURL(/\/welcome$/);
  });

  test("signed in: /welcome redirects to /", async ({ page }) => {
    await page.goto("/welcome");
    await injectSession(page);
    await page.reload();
    await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
  });
});

test.describe("AC-B2/AC-B4 magic link", () => {
  test("send link, then follow the callback link into the signed-in app", async ({ page }) => {
    await page.goto("/account");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByRole("button", { name: "Send link" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Check your email for a link and a 6-digit code.",
    );

    // Simulates clicking the emailed link: same browser, same PKCE verifier in storage.
    const flowId = await pendingPkceFlowId(page);
    await page.goto(`/auth/callback?code=good&sb_flow_id=${flowId}`);

    await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
  });

  test("an expired or already-used link shows the expired message with a way back", async ({
    page,
  }) => {
    await page.goto("/auth/callback?error_code=otp_expired");
    await expect(page.getByText("This link has expired. Send a new one.")).toBeVisible();
    await page.getByRole("link", { name: "Send a new one" }).click();
    await expect(page).toHaveURL(/\/account$/);
  });
});

test.describe("AC-B3 6-digit code", () => {
  test("entering the code signs the user in", async ({ page }) => {
    await page.goto("/account");
    await page.getByRole("tab", { name: "Enter code" }).click();
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("6-digit code").fill(GOOD_CODE);
    await page.getByRole("button", { name: "Verify code" }).click();

    await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
  });
});
