// T-0300b auth e2e (AC-B2, AC-B3, AC-B4, AC-B5). Supabase is always mocked through
// `page.route` (`fixtures/supabase-mock.ts`): this spec never hits the network or the prod
// Supabase project.
//
// T-0904: that promise is now *enforced*, not merely stated in this comment — `test` comes from
// `fixtures/guarded-test.js`, which fails any test that lets a Supabase request through
// unclaimed (D-0086). It was not enforced before, and the `/rest/v1/profiles` read that
// T-0301a's profile gate added went to the real network from here, turning CI red as a 5 s
// visibility timeout (docs/ci/CI-T-0904-auth-e2e-unmocked-profile-read.md).
//
// Every signed-in path below therefore states its profile state explicitly: `present` from the
// `beforeEach`, or `missing` where a test overrides it.
import {
  GOOD_CODE,
  injectSession,
  mockProfileMissing,
  mockProfilePresent,
  mockSupabaseEmailAuth,
  mockSupabaseEmptyReads,
  mockSupabaseRest,
  pendingPkceFlowId,
} from "./fixtures/supabase-mock.js";
import { expect, test } from "./fixtures/guarded-test.js";

// Registration order is load-bearing. Playwright runs the most-recently-registered matching
// handler first, so the 501 REST catch-all is registered first (to be matched *last*, as the
// backstop) and `mockProfilePresent` last (so it wins for `profiles*`). Reversing the two sends
// the gate's read to the 501 instead, which resolves `unknown` — and `unknown` happens to
// redirect, so the redirect test would keep passing while no longer exercising the `present`
// branch it is named for. AC-2's `waitForResponse` on a 200 is what catches that.
test.beforeEach(async ({ page }) => {
  await mockSupabaseRest(page);
  // T-0436: the signed-in app's AutoSync reads resolve as `200 []` instead of the 501 backstop.
  await mockSupabaseEmptyReads(page);
  await mockSupabaseEmailAuth(page);
  await mockProfilePresent(page);
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
    // AC-2: pin that the redirect comes from the `present` branch, not from the error path. The
    // 501 backstop also resolves the gate (as `unknown`) and also redirects, so without this a
    // dropped `mockProfilePresent` or a reversed registration order would stay green while the
    // test silently stopped covering `present`. Armed before the reload that triggers the read.
    const profileRead = page.waitForResponse((res) => res.url().includes("/rest/v1/profiles"));
    await page.reload();
    await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
    expect((await profileRead).status()).toBe(200);
  });

  // AC-3, the missing twin — T-0301a AC-7 at e2e level (D-0073 §1). Paired with the test above,
  // these two pin *both* branches of `welcomeStandsDown`: a guard that always redirected would
  // fail this one, and one that never redirected would fail that one. It also protects
  // principle 5 — a brand-new signed-in user with no profile row must be able to onboard, so
  // `/welcome` must not bounce them to `/`.
  test("signed in, profile missing: /welcome stays on UF-01.1", async ({ page }) => {
    await page.goto("/welcome");
    await injectSession(page);
    // Registered inside the test body, so it overrides the `beforeEach`'s `present` route: the
    // most-recently-registered matching handler runs first.
    await mockProfileMissing(page);

    const profileRead = page.waitForResponse((res) => res.url().includes("/rest/v1/profiles"));
    await page.reload();

    await expect(page.locator('[data-screen-id="UF-01.1"]')).toBeVisible();
    expect((await profileRead).status()).toBe(200);
    // Asserted only after the read has settled, so this is the *resolved* `missing` decision and
    // not just the pre-resolution stand-down that `resolved: false` would give either way.
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.locator('[data-screen-id="UF-02.1"]')).toHaveCount(0);
  });
});

test.describe("AC-B2/AC-B4 magic link", () => {
  test("send link, then follow the callback link into the signed-in app", async ({ page }) => {
    await page.goto("/account");
    await page.getByLabel("Email").fill("ada@example.com");
    // T-0399 AC3 guard: a second status region outside the app root (an offline banner, a toast)
    // must not break the UF-01.5 assertion, so the locator is scoped to the screen.
    await page.evaluate(() => {
      const other = document.createElement("p");
      other.setAttribute("role", "status");
      other.textContent = "other";
      document.body.append(other);
    });
    await page.getByRole("button", { name: "Send link" }).click();
    await expect(page.locator('[data-screen-id="UF-01.5"]').getByRole("status")).toHaveText(
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
