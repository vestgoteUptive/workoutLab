// T-0301d AC-7 (principle 5, NFR-A11Y-1, -2, -6): the 3-activation onboarding path, signed out,
// at 360 × 640, against `vite preview` with Supabase mocked through `page.route`. `test` comes
// from `fixtures/guarded-test.js` (D-0086), so an unmocked Supabase request fails the test.
// T-0301c appends its UF-01.5 account cases to this file (D-0071 §10).
//
// The keyboard run is in a real browser on purpose: the jsdom key driver in
// `apps/web/src/features/UF-01/__tests__/keyboard.ts` can't see CSS, and the radios here are
// visually hidden (`.wl-uf01__radio`), so only a real browser proves they are reachable and that
// focus is visible.
import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { mockSupabaseAuth, mockSupabaseRest } from "./fixtures/supabase-mock.js";
import { expect, test } from "./fixtures/guarded-test.js";

const SCREEN = (id: string) => `[data-screen-id="${id}"]`;

test.use({ viewport: { width: 360, height: 640 } });

test.beforeEach(async ({ page }) => {
  await mockSupabaseRest(page);
  await mockSupabaseAuth(page);
});

interface Record {
  timingMs: unknown;
  planShown: unknown;
  rhythmMin: number;
  rhythmMax: number;
  goal: string;
  level: string;
  equipmentProfile: string;
}

async function record(page: Page): Promise<Record> {
  const raw = await page.evaluate(() => window.localStorage.getItem("wl-onboarding"));
  expect(raw).not.toBeNull();
  return JSON.parse(raw!) as Record;
}

async function expectPlan(page: Page): Promise<void> {
  const root = page.locator(SCREEN("UF-01.4"));
  await expect(root).toBeVisible();
  await expect(root.locator("[data-area]")).toHaveCount(9);
}

/** Presses Tab until `target` has focus (at most 30 times). */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let i = 0; i < 30; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("tabTo: target never received focus");
}

/** The focused control, or the label that draws its ring, shows a visible outline. */
async function expectVisibleFocus(target: Locator): Promise<void> {
  const ring = await target.evaluate((el) => {
    const drawn = el.closest("label") ?? el;
    const style = getComputedStyle(drawn);
    return {
      focusVisible: el.matches(":focus-visible"),
      style: style.outlineStyle,
      width: parseFloat(style.outlineWidth),
    };
  });
  expect(ring.focusVisible).toBe(true);
  expect(ring.style).not.toBe("none");
  expect(ring.width).toBeGreaterThan(0);
}

async function expectAxeClean(page: Page, id: string): Promise<void> {
  const results = await new AxeBuilder({ page }).include(SCREEN(id)).analyze();
  const serious = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(serious, id).toEqual([]);
}

/** NFR-A11Y-2: every button and link on the screen is at least 44 × 44 px. */
async function expectTargetSizes(page: Page, id: string): Promise<number> {
  const controls = page.locator(`${SCREEN(id)} a, ${SCREEN(id)} button`);
  const count = await controls.count();
  expect(count, id).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const control = controls.nth(i);
    const box = await control.boundingBox();
    const name = (await control.getAttribute("aria-label")) ?? (await control.textContent());
    expect(box, `${id} ${name}`).not.toBeNull();
    expect(box!.width, `${id} ${name} width`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `${id} ${name} height`).toBeGreaterThanOrEqual(44);
  }
  return count;
}

test.describe("UF-01 onboarding, AC-7 (principle 5)", () => {
  test("3 activations from /welcome render the plan in < 5 s; timingMs and planShown are set", async ({
    page,
  }) => {
    const t0 = Date.now();
    await page.goto("/welcome");
    await page.getByRole("link", { name: "Get started" }).click();
    await expect(page.locator(SCREEN("UF-01.2"))).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator(SCREEN("UF-01.3"))).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expectPlan(page);
    const wall = Date.now() - t0;

    expect(wall).toBeLessThan(5_000);
    const stored = await record(page);
    expect(Number.isInteger(stored.timingMs)).toBe(true);
    expect(stored.timingMs as number).toBeGreaterThanOrEqual(0);
    expect(stored.timingMs as number).toBeLessThanOrEqual(wall + 50);
    expect(stored.planShown).toBe(true);
    expect(stored).toMatchObject({
      goal: "build_muscle",
      level: "beginner",
      equipmentProfile: "full-gym",
      rhythmMin: 3,
      rhythmMax: 4,
    });

    // The plan is R4-E1 from the engine, in the fixed area order.
    const rows = await page
      .locator(`${SCREEN("UF-01.4")} [data-area]`)
      .evaluateAll((els) =>
        els.map((el) => [
          (el as HTMLElement).dataset.area,
          el.querySelector('[data-field="sets"]')!.textContent,
        ]),
      );
    expect(rows).toEqual([
      ["chest", "20"],
      ["back", "20"],
      ["shoulders", "16"],
      ["arms", "12"],
      ["core", "12"],
      ["glutes", "20"],
      ["quads", "20"],
      ["hamstrings", "16"],
      ["calves", "12"],
    ]);
    await expect(page.locator(`${SCREEN("UF-01.4")} [data-field="rhythm"]`)).toHaveText(
      "3–4 per week · 6–8 per 14 days",
    );

    // Signed out, the hand-off is the account screen (D-0064 §8).
    await page.getByRole("link", { name: "Save my plan" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.locator(SCREEN("UF-01.5"))).toBeVisible();
  });

  test("keyboard only (Tab, Arrow, Enter, Space) reaches the same state, with visible focus", async ({
    page,
  }) => {
    const t0 = Date.now();
    await page.goto("/welcome");
    await expect(page.locator(SCREEN("UF-01.1"))).toBeVisible();

    const getStarted = page.getByRole("link", { name: "Get started" });
    await tabTo(page, getStarted);
    await expectVisibleFocus(getStarted);
    await page.keyboard.press("Enter");
    await expect(page.locator(SCREEN("UF-01.2"))).toBeVisible();

    // The visually hidden radios: only the checked one is in the Tab order; Arrow moves and checks.
    const buildMuscle = page.getByRole("radio", { name: "Build muscle" });
    await tabTo(page, buildMuscle);
    await expectVisibleFocus(buildMuscle);
    await page.keyboard.press("ArrowDown");
    const getStronger = page.getByRole("radio", { name: "Get stronger" });
    await expect(getStronger).toBeFocused();
    await expect(getStronger).toBeChecked();
    await expectVisibleFocus(getStronger);
    const goalContinue = page.getByRole("button", { name: "Continue" });
    await tabTo(page, goalContinue);
    await expectVisibleFocus(goalContinue);
    await page.keyboard.press("Enter");
    await expect(page.locator(SCREEN("UF-01.3"))).toBeVisible();

    const beginner = page.getByRole("radio", { name: "Beginner" });
    await tabTo(page, beginner);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "Advanced" })).toBeChecked();
    await page.keyboard.press("Tab");
    const fullGym = page.getByRole("radio", { name: "Full gym" });
    await expect(fullGym).toBeFocused();
    await expectVisibleFocus(fullGym);
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("radio", { name: "Dumbbells" })).toBeChecked();
    const levelContinue = page.getByRole("button", { name: "Continue" });
    await tabTo(page, levelContinue);
    await page.keyboard.press("Space");
    await expectPlan(page);
    const wall = Date.now() - t0;

    // DOM order: Back, min −, min +, max −, max +, Save my plan.
    const minDown = page.getByRole("button", { name: "One fewer session per week, minimum" });
    await tabTo(page, minDown);
    await expectVisibleFocus(minDown);
    await page.keyboard.press("Space");
    const maxUp = page.getByRole("button", { name: "One more session per week, maximum" });
    await tabTo(page, maxUp);
    await expectVisibleFocus(maxUp);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await expect(
      page.locator(`${SCREEN("UF-01.4")} [data-area="back"] [data-field="sets"]`),
    ).toHaveText(
      // deriveTargets(2–6): S = 16, back = 20 × 16 × 4 / 56 → 23.
      "23",
    );

    const stored = await record(page);
    expect(stored).toMatchObject({
      goal: "get_stronger",
      level: "advanced",
      equipmentProfile: "dumbbells",
      rhythmMin: 2,
      rhythmMax: 6,
      planShown: true,
    });
    expect(Number.isInteger(stored.timingMs)).toBe(true);
    expect(stored.timingMs as number).toBeGreaterThanOrEqual(0);
    expect(stored.timingMs as number).toBeLessThanOrEqual(wall + 50);

    const save = page.getByRole("link", { name: "Save my plan" });
    await tabTo(page, save);
    await expectVisibleFocus(save);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/account$/);
  });

  test("axe: 0 serious or critical on UF-01.1–.4; every button and link is ≥ 44 × 44", async ({
    page,
  }) => {
    await page.goto("/welcome");
    await expect(page.locator(SCREEN("UF-01.1"))).toBeVisible();
    await expectAxeClean(page, "UF-01.1");
    await expectTargetSizes(page, "UF-01.1");

    await page.getByRole("link", { name: "Get started" }).click();
    await expect(page.locator(SCREEN("UF-01.2"))).toBeVisible();
    await expectAxeClean(page, "UF-01.2");
    await expectTargetSizes(page, "UF-01.2");

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator(SCREEN("UF-01.3"))).toBeVisible();
    await expectAxeClean(page, "UF-01.3");
    await expectTargetSizes(page, "UF-01.3");

    await page.getByRole("button", { name: "Continue" }).click();
    await expectPlan(page);
    await expectAxeClean(page, "UF-01.4");
    // Back, the four stepper buttons and Save my plan.
    expect(await expectTargetSizes(page, "UF-01.4")).toBe(6);

    // A disabled stepper button is still measured: step min down to 1.
    const minDown = page.getByRole("button", { name: "One fewer session per week, minimum" });
    await minDown.click();
    await minDown.click();
    await expect(minDown).toHaveAttribute("aria-disabled", "true");
    await expectAxeClean(page, "UF-01.4");
    await expectTargetSizes(page, "UF-01.4");
  });
});

// ---------------------------------------------------------------------------------------------
// T-0301c AC-14: UF-01.5 Account and `/welcome/save` (D-0064 §8, D-0100). Appended (D-0071 §10).
// Supabase stays mocked: the routes below are registered in each test body, on top of the
// `beforeEach` 501 backstops, so the most recently registered handler answers first.
// ---------------------------------------------------------------------------------------------
// ES imports are hoisted, so this import is in effect at the top of the module; it sits here
// because the file above is append-only.
import {
  GOOD_CODE,
  VITE_SUPABASE_URL,
  injectSession,
  mockProfileMissing,
  mockProfilePresent,
  mockSupabaseEmailAuth,
} from "./fixtures/supabase-mock.js";

interface Write {
  table: string;
  body: unknown;
  /** The page URL when the write was sent. */
  at: string;
}

/** Records every `POST` to `/rest/v1/<table>`, in request order. */
function recordWrites(page: Page): Write[] {
  const writes: Write[] = [];
  page.on("request", (req) => {
    const m = /\/rest\/v1\/([a-z_]+)/.exec(req.url());
    if (req.method() === "POST" && m) {
      writes.push({ table: m[1]!, body: req.postDataJSON(), at: page.url() });
    }
  });
  return writes;
}

/** `profiles` answers `[]` until a `profiles` POST, then `[row]`; `area_targets` takes POSTs. */
async function mockNewUserRest(page: Page): Promise<void> {
  let row: Record<string, unknown> | null = null;
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/area_targets*`, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 201, body: "" })
      : route.fulfill({ status: 200, json: [] }),
  );
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/profiles*`, (route) => {
    if (route.request().method() === "POST") {
      row = {
        user_id: "11111111-1111-4111-8111-111111111111",
        ...(route.request().postDataJSON() as Record<string, unknown>),
        onboarded_at: "2026-10-02T00:00:00.000Z",
        plan_changed_at: "2026-10-02T00:00:00.000Z",
      };
      return route.fulfill({ status: 201, body: "" });
    }
    return route.fulfill({ status: 200, json: row ? [row] : [] });
  });
}

async function onboardToAccount(page: Page): Promise<void> {
  await page.goto("/welcome");
  await page.getByRole("link", { name: "Get started" }).click();
  await expect(page.locator(SCREEN("UF-01.2"))).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator(SCREEN("UF-01.3"))).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expectPlan(page);
  await page.getByRole("link", { name: "Save my plan" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function signInWithCode(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Enter code" }).click();
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("6-digit code").fill(GOOD_CODE);
  await page.getByRole("button", { name: "Verify code" }).click();
}

test.describe("UF-01.5 account and /welcome/save, T-0301c AC-14", () => {
  test("(a) new user: code sign-in saves the 9 targets, then the profile, and lands on UF-02.1", async ({
    page,
  }) => {
    await mockSupabaseEmailAuth(page);
    await mockNewUserRest(page);
    const writes = recordWrites(page);

    await onboardToAccount(page);
    await expect(page.locator(SCREEN("UF-01.5")).getByRole("heading", { level: 1 })).toHaveText(
      "Save your plan",
    );
    await signInWithCode(page);

    await expect(page.locator(SCREEN("UF-02.1"))).toBeVisible();
    await expect(page).toHaveURL(/\/$/);

    // Request order: the targets first, then the profile, both sent from /welcome/save.
    expect(writes.map((w) => w.table)).toEqual(["area_targets", "profiles"]);
    expect(writes.every((w) => new URL(w.at).pathname === "/welcome/save")).toBe(true);
    const rows = writes[0]!.body as Array<Record<string, unknown>>;
    expect(rows.map((r) => [r.area_id, r.sets_per_14d, r.source])).toEqual([
      ["chest", 20, "default"],
      ["back", 20, "default"],
      ["shoulders", 16, "default"],
      ["arms", 12, "default"],
      ["core", 12, "default"],
      ["glutes", 20, "default"],
      ["quads", 20, "default"],
      ["hamstrings", 16, "default"],
      ["calves", 12, "default"],
    ]);
    expect(rows.every((r) => !("user_id" in r))).toBe(true);
    expect(writes[1]!.body).toMatchObject({
      goal: "build_muscle",
      level: "beginner",
      rhythm_min: 3,
      rhythm_max: 4,
      priority_areas: [],
    });
    expect(await page.evaluate(() => window.localStorage.getItem("wl-onboarding"))).toBeNull();
  });

  test("(b) returning user: a code sign-in with a profile lands on UF-02.1 with no write", async ({
    page,
  }) => {
    await mockSupabaseEmailAuth(page);
    await mockProfilePresent(page);
    const writes = recordWrites(page);

    await page.goto("/account");
    await expect(page.locator(SCREEN("UF-01.5")).getByRole("heading", { level: 1 })).toHaveText(
      "Sign in",
    );
    await signInWithCode(page);

    await expect(page.locator(SCREEN("UF-02.1"))).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    expect(writes.filter((w) => w.table === "profiles" || w.table === "area_targets")).toEqual([]);
  });

  test("(c) axe and target sizes on UF-01.5 with each heading, and on UF-01.5-save's no-plan state", async ({
    page,
  }) => {
    await page.goto("/account");
    const account = page.locator(SCREEN("UF-01.5"));
    await expect(account.getByRole("heading", { level: 1 })).toHaveText("Sign in");
    await expectAxeClean(page, "UF-01.5");
    // Send link, Enter code, Send link, Continue with Google, Privacy.
    expect(await expectTargetSizes(page, "UF-01.5")).toBe(5);
    await page.getByRole("tab", { name: "Enter code" }).click();
    await expectAxeClean(page, "UF-01.5");
    await expectTargetSizes(page, "UF-01.5");

    await onboardToAccount(page);
    await expect(account.getByRole("heading", { level: 1 })).toHaveText("Save your plan");
    await expectAxeClean(page, "UF-01.5");
    // Back, the two tabs, Send link, Continue with Google, Privacy.
    expect(await expectTargetSizes(page, "UF-01.5")).toBe(6);

    // Signed in with no profile and no plan on this device (D-0045 §5): "Set up your plan".
    await page.evaluate(() => window.localStorage.clear());
    await injectSession(page);
    await mockProfileMissing(page);
    await page.goto("/welcome/save");
    const save = page.locator(SCREEN("UF-01.5-save"));
    await expect(save.getByRole("heading", { level: 1 })).toHaveText("Set up your plan");
    await expectAxeClean(page, "UF-01.5-save");
    await expectTargetSizes(page, "UF-01.5-save");
  });

  test("(c) keyboard only: Tab to the email, type it, Tab to Send link, press Enter", async ({
    page,
  }) => {
    await mockSupabaseEmailAuth(page);
    await page.goto("/account");
    await expect(page.locator(SCREEN("UF-01.5"))).toBeVisible();

    const email = page.getByLabel("Email");
    await tabTo(page, email);
    await page.keyboard.type("ada@example.com");
    const send = page.getByRole("button", { name: "Send link" });
    await tabTo(page, send);
    await expectVisibleFocus(send);
    // T-0399 AC3 guard: a second status region outside the app root (an offline banner, a toast)
    // must not break the UF-01.5 assertion, so the locator is scoped to the screen.
    await page.evaluate(() => {
      const other = document.createElement("p");
      other.setAttribute("role", "status");
      other.textContent = "other";
      document.body.append(other);
    });
    await page.keyboard.press("Enter");
    await expect(page.locator(SCREEN("UF-01.5")).getByRole("status")).toHaveText(
      "Check your email for a link and a 6-digit code.",
    );

    // ArrowRight on the selected tab switches the mode (T-0382: roving tabindex, so Tab only
    // reaches the selected tab).
    const sendTab = page.getByRole("tab", { name: "Send link" });
    await tabTo(page, sendTab);
    await page.keyboard.press("ArrowRight");
    const codeTab = page.getByRole("tab", { name: "Enter code" });
    await expect(codeTab).toBeFocused();
    await expectVisibleFocus(codeTab);
    await expect(page.getByLabel("6-digit code")).toBeVisible();
  });
});
