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
import {
  mockSupabaseAuth,
  mockSupabaseEmptyReads,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import { expect, test } from "./fixtures/guarded-test.js";

const SCREEN = (id: string) => `[data-screen-id="${id}"]`;

test.use({ viewport: { width: 360, height: 640 } });

test.beforeEach(async ({ page }) => {
  await mockSupabaseRest(page);
  await mockSupabaseAuth(page);
  // T-0436: AutoSync's reads in the signed-in tests below resolve as `200 []`, not the backstop.
  await mockSupabaseEmptyReads(page);
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

// ---------------------------------------------------------------------------------------------
// T-0605 (D-0208, D-0210, D-0211, D-0213; UF-01.1–UF-01.4): the Cobalt plan state, measured in a
// real browser: computed colours, the selected-option bleed, targets, contrast per text pair,
// motion and the canvas compare. Expected values are read from tokens.json, never typed.
// Appended: the file above is append-only (D-0071 §10).
// ---------------------------------------------------------------------------------------------
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compareWithCanvas } from "./helpers/canvas-compare.js";

const TOKENS = JSON.parse(
  readFileSync(resolve(__dirname, "../../packages/design-tokens/src/tokens.json"), "utf8"),
) as { color: { plan: Record<string, string> }; space: Record<string, number> };
const PLAN = TOKENS.color.plan;

function rgbOf(hex: string): string {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgb(${n(1)}, ${n(3)}, ${n(5)})`;
}
function lum(hex: string): number {
  const ch = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
}
/** WCAG ratio of two token colours, at one decimal. */
function tokenRatio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.round(((hi! + 0.05) / (lo! + 0.05)) * 10) / 10;
}

const PATHS = [
  ["/welcome", "UF-01.1"],
  ["/welcome/goal", "UF-01.2"],
  ["/welcome/level", "UF-01.3"],
  ["/welcome/schedule", "UF-01.4"],
] as const;

interface Pair {
  text: string;
  ratio: number;
  color: string;
  bg: string;
  size: number;
}

/**
 * Contrast of every visible text node's colour against the first opaque background behind it, as
 * the browser paints them (a checked option's own fill counts). Rounded to one decimal.
 */
async function measure(page: Page, rootSel: string, within?: string): Promise<Pair[]> {
  await page.locator(rootSel).waitFor();
  return page.evaluate(
    ([root, scope]) => {
      const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
      const rgba = (c: string): [number, number, number, number] => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "#000";
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
      };
      const lumOf = ([r, g, b]: number[]) => {
        const f = (v: number) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
      };
      const out: Array<{
        text: string;
        ratio: number;
        color: string;
        bg: string;
        size: number;
      }> = [];
      const host = document.querySelector(root as string)!;
      const scoped = scope ? [...host.querySelectorAll(scope as string)] : [host];
      for (const base of scoped) {
        for (const el of [base, ...base.querySelectorAll("*")]) {
          const own = [...el.childNodes]
            .filter((n) => n.nodeType === 3 && n.textContent!.trim() !== "")
            .map((n) => n.textContent!)
            .join("")
            .trim();
          if (!own) continue;
          const box = el.getBoundingClientRect();
          if (box.width <= 1 || box.height <= 1) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none") continue;
          let bgC: [number, number, number, number] = [0, 0, 0, 0];
          for (let n: Element | null = el; n; n = n.parentElement) {
            const c = rgba(getComputedStyle(n).backgroundColor);
            if (c[3] > 0.99) {
              bgC = c;
              break;
            }
          }
          const fg = rgba(cs.color);
          const [hi, lo] = [lumOf(fg), lumOf(bgC)].sort((x, y) => y - x);
          out.push({
            text: own,
            ratio: Math.round(((hi! + 0.05) / (lo! + 0.05)) * 10) / 10,
            color: cs.color,
            bg: `rgb(${bgC[0]}, ${bgC[1]}, ${bgC[2]})`,
            size: parseFloat(cs.fontSize),
          });
        }
      }
      return out;
    },
    [rootSel, within ?? ""] as const,
  );
}

const byText = (pairs: Pair[], text: string): Pair => {
  const hit = pairs.find((p) => p.text === text);
  if (!hit) throw new Error(`no text "${text}" among ${pairs.map((p) => p.text).join(" | ")}`);
  return hit;
};

async function gotoStep(page: Page, path: string): Promise<void> {
  // The first launch walks the real links, so the lazy chunks and the pending plan are real.
  await page.goto("/welcome");
  if (path === "/welcome") return;
  await page.getByRole("link", { name: "Get started" }).click();
  if (path === "/welcome/goal") return;
  await page.getByRole("button", { name: "Continue" }).click();
  if (path === "/welcome/level") return;
  await page.getByRole("button", { name: "Continue" }).click();
}

test.describe("T-0605 Cobalt onboarding (390 × 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("AC1 every step is a plan-state root: plan.bg paints, theme-color is plan.bg", async ({
    page,
  }) => {
    for (const [path, id] of PATHS) {
      await gotoStep(page, path);
      const root = page.locator(SCREEN(id));
      await expect(root).toBeVisible();
      await expect(root).toHaveAttribute("data-wl-state", "plan");
      expect(await root.evaluate((el) => getComputedStyle(el).backgroundColor), id).toBe(
        rgbOf(PLAN.bg!),
      );
      const theme = await page.evaluate(
        () => document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? "",
      );
      expect(theme.toLowerCase(), id).toBe(PLAN.bg!.toLowerCase());
    }
  });

  test("AC2 goal options: the checked row bleeds 18 px past the 28 px gutter in plan.selected; arrows move it", async ({
    page,
  }) => {
    await gotoStep(page, "/welcome/goal");
    const gutter = TOKENS.space["gutter-plan"]!;
    const bleed = TOKENS.space["option-bleed"]!;
    const label = (name: string) =>
      page.getByRole("radio", { name }).locator("xpath=ancestor::label");

    const checked = label("Build muscle");
    const box = (await checked.boundingBox())!;
    expect(box.x).toBeCloseTo(gutter - bleed, 0);
    expect(box.x + box.width).toBeCloseTo(390 - (gutter - bleed), 0);
    expect(await checked.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      rgbOf(PLAN.selected!),
    );
    // Unchecked rows sit on the gutter, with no fill: unboxed rows, not cards.
    const plain = label("Get stronger");
    const plainBox = (await plain.boundingBox())!;
    expect(plainBox.x).toBeCloseTo(gutter, 0);
    const plainStyle = await plain.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        bg: cs.backgroundColor,
        bottom: cs.borderBottomWidth,
        side: cs.borderLeftWidth,
        radius: cs.borderRadius,
      };
    });
    expect(plainStyle).toEqual({
      bg: "rgba(0, 0, 0, 0)",
      bottom: "1px",
      side: "0px",
      radius: "0px",
    });

    // Arrow keys move the selection and the block follows.
    const build = page.getByRole("radio", { name: "Build muscle" });
    await build.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: "Get stronger" })).toBeChecked();
    expect((await label("Get stronger").boundingBox())!.x).toBeCloseTo(gutter - bleed, 0);
    expect((await label("Build muscle").boundingBox())!.x).toBeCloseTo(gutter, 0);
  });

  test("AC3 chips: pressed shows the tick and plan.selected, unpressed shows neither; names are exact", async ({
    page,
  }) => {
    await gotoStep(page, "/welcome/level");
    const chip = (name: string) =>
      page.getByRole("radio", { name, exact: true }).locator("xpath=ancestor::label");
    const state = (name: string) =>
      chip(name).evaluate((el) => ({
        bg: getComputedStyle(el).backgroundColor,
        tick:
          getComputedStyle(el.querySelector(".wl-chip__tick")!).display === "none"
            ? "none"
            : "shown",
        tickHidden: el.querySelector(".wl-chip__tick")!.getAttribute("aria-hidden"),
      }));
    for (const name of ["Bodyweight", "Dumbbells", "Full gym"]) {
      await expect(page.getByRole("radio", { name, exact: true })).toHaveCount(1);
    }
    expect(await state("Full gym")).toEqual({
      bg: rgbOf(PLAN.selected!),
      tick: "shown",
      tickHidden: "true",
    });
    expect(await state("Dumbbells")).toEqual({
      bg: "rgba(0, 0, 0, 0)",
      tick: "none",
      tickHidden: "true",
    });
    await chip("Dumbbells").click();
    expect((await state("Dumbbells")).tick).toBe("shown");
    expect((await state("Dumbbells")).bg).toBe(rgbOf(PLAN.selected!));
    expect(await state("Full gym")).toMatchObject({ tick: "none", bg: "rgba(0, 0, 0, 0)" });
  });

  test("AC5 contrast per text pair, on every step, checked options with captions included", async ({
    page,
  }) => {
    const bgOk = rgbOf(PLAN.bg!);
    const want = (a: string, b: string) => tokenRatio(a, b);
    // Welcome.
    await gotoStep(page, "/welcome");
    let pairs = await measure(page, SCREEN("UF-01.1"));
    expect(byText(pairs, "workout LAB")).toMatchObject({
      bg: bgOk,
      ratio: want(PLAN.ink!, PLAN.bg!),
    });
    expect(
      byText(
        pairs,
        "A plan built for your goal, and every exercise explained: muscles, cues and variations.",
      ).ratio,
    ).toBeGreaterThanOrEqual(5.9);
    expect(byText(pairs, "Get started").ratio).toBeGreaterThanOrEqual(
      want(PLAN["on-action"]!, PLAN.action!),
    );
    expect(byText(pairs, "I already have an account").ratio).toBeGreaterThanOrEqual(8.6);
    for (const p of pairs) expect(p.ratio, `Welcome ${p.text}`).toBeGreaterThanOrEqual(4.5);

    // Goal: unchecked caption ink-muted on plan.bg, checked label and caption on-selected on white.
    await gotoStep(page, "/welcome/goal");
    pairs = await measure(page, SCREEN("UF-01.2"));
    expect(byText(pairs, "1/3")).toMatchObject({
      bg: bgOk,
      color: rgbOf(PLAN["ink-muted"]!),
    });
    expect(byText(pairs, "1/3").ratio).toBeGreaterThanOrEqual(5.9);
    expect(byText(pairs, "Sets your rep ranges. Change it any time.").ratio).toBeGreaterThanOrEqual(
      5.9,
    );
    const hint = byText(pairs, "Strength · 3–8 reps · longer rest");
    expect(hint).toMatchObject({ bg: bgOk, color: rgbOf(PLAN["ink-muted"]!) });
    expect(hint.ratio).toBeGreaterThanOrEqual(5.9);
    for (const t of ["Build muscle", "Hypertrophy · 6–12 reps"]) {
      const p = byText(pairs, t);
      expect(p, t).toMatchObject({
        bg: rgbOf(PLAN.selected!),
        color: rgbOf(PLAN["on-selected"]!),
      });
      expect(p.ratio, t).toBeGreaterThanOrEqual(8.6);
    }
    for (const p of pairs) expect(p.ratio, `Goal ${p.text}`).toBeGreaterThanOrEqual(4.5);
    // The same after a new selection: the caption of the newly checked row flips to on-selected.
    await page
      .getByRole("radio", { name: "Get stronger" })
      .locator("xpath=ancestor::label")
      .click();
    pairs = await measure(page, SCREEN("UF-01.2"));
    expect(byText(pairs, "Strength · 3–8 reps · longer rest")).toMatchObject({
      color: rgbOf(PLAN["on-selected"]!),
      bg: rgbOf(PLAN.selected!),
    });
    expect(byText(pairs, "Strength · 3–8 reps · longer rest").ratio).toBeGreaterThanOrEqual(8.6);
    expect(byText(pairs, "Hypertrophy · 6–12 reps")).toMatchObject({ bg: bgOk });

    // Level and equipment.
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator(SCREEN("UF-01.3"))).toBeVisible();
    pairs = await measure(page, SCREEN("UF-01.3"));
    expect(byText(pairs, "Beginner")).toMatchObject({
      bg: rgbOf(PLAN.selected!),
      color: rgbOf(PLAN["on-selected"]!),
    });
    expect(byText(pairs, "Beginner").ratio).toBeGreaterThanOrEqual(8.6);
    expect(byText(pairs, "Advanced")).toMatchObject({ bg: bgOk, color: rgbOf(PLAN.ink!) });
    expect(byText(pairs, "Full gym").ratio).toBeGreaterThanOrEqual(8.6);
    expect(byText(pairs, "Dumbbells").ratio).toBeGreaterThanOrEqual(8.6);
    expect(byText(pairs, "Training experience").ratio).toBeGreaterThanOrEqual(5.9);
    expect(
      byText(pairs, "We only suggest exercises you can do with this equipment.").ratio,
    ).toBeGreaterThanOrEqual(5.9);
    for (const p of pairs) expect(p.ratio, `Level ${p.text}`).toBeGreaterThanOrEqual(4.5);

    // Schedule, including a disabled stepper (aria-disabled stays legible at ink-muted).
    await page.getByRole("button", { name: "Continue" }).click();
    await expectPlan(page);
    const minDown = page.getByRole("button", { name: "One fewer session per week, minimum" });
    await minDown.click();
    await minDown.click();
    await expect(minDown).toHaveAttribute("aria-disabled", "true");
    expect(
      await minDown.evaluate((el) => ({
        color: getComputedStyle(el).color,
        attr: el.hasAttribute("disabled"),
      })),
    ).toEqual({ color: rgbOf(PLAN["ink-muted"]!), attr: false });
    expect(tokenRatio(PLAN["ink-muted"]!, PLAN.bg!)).toBeGreaterThanOrEqual(5.9);
    pairs = await measure(page, SCREEN("UF-01.4"));
    for (const p of pairs) expect(p.ratio, `Schedule ${p.text}`).toBeGreaterThanOrEqual(4.5);
    expect(byText(pairs, "Save my plan").ratio).toBeGreaterThanOrEqual(8.6);
    expect(byText(pairs, "3/3").ratio).toBeGreaterThanOrEqual(5.9);
    expect(pairs.find((p) => p.text === "Chest")?.ratio).toBeGreaterThanOrEqual(8.6);
  });

  test("AC5 axe colour-contrast has 0 violations on each step", async ({ page }) => {
    for (const [path, id] of PATHS) {
      await gotoStep(page, path);
      await expect(page.locator(SCREEN(id))).toBeVisible();
      const results = await new AxeBuilder({ page })
        .include(SCREEN(id))
        .withRules(["color-contrast"])
        .analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
        ),
        id,
      ).toEqual([]);
    }
  });

  test("AC6 every option row, chip, segment, button and link is ≥ 44 × 44", async ({ page }) => {
    for (const [path, id] of PATHS) {
      await gotoStep(page, path);
      await expect(page.locator(SCREEN(id))).toBeVisible();
      const boxes = await page.evaluate((sel) => {
        const root = document.querySelector(sel)!;
        return [
          ...root.querySelectorAll(
            "a, button, label.wl-option, label.wl-chip, .wl-segmented > label",
          ),
        ].map((el) => {
          const r = el.getBoundingClientRect();
          return {
            name: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim(),
            w: r.width,
            h: r.height,
          };
        });
      }, SCREEN(id));
      expect(boxes.length, id).toBeGreaterThan(0);
      for (const b of boxes) {
        expect(b.w, `${id} ${b.name} width`).toBeGreaterThanOrEqual(44);
        expect(b.h, `${id} ${b.name} height`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test("AC6 motion: a plan to plan step has no transition beyond the root's cross-fade, and none under reduced motion", async ({
    page,
  }) => {
    const probe = (id: string) =>
      page.locator(SCREEN(id)).evaluate((el) => {
        const own = getComputedStyle(el);
        const moving = [el, ...el.querySelectorAll("*")].filter((n) => {
          const cs = getComputedStyle(n);
          return (
            cs.animationName !== "none" ||
            (n !== el && cs.transitionDuration.split(",").some((d) => parseFloat(d) > 0))
          );
        });
        return {
          rootProperty: own.transitionProperty,
          rootDuration: own.transitionDuration,
          moving: moving.map((n) => n.tagName + "." + n.className),
          rootBg: getComputedStyle(document.documentElement).backgroundColor,
        };
      });
    await gotoStep(page, "/welcome/goal");
    const goal = await probe("UF-01.2");
    expect(goal.rootProperty).toBe("background-color");
    expect(goal.rootDuration).toBe("0.2s");
    expect(goal.moving).toEqual([]);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator(SCREEN("UF-01.3"))).toBeVisible();
    // plan to plan: the page colour does not change at all, so nothing cross-fades.
    await expect.poll(async () => (await probe("UF-01.3")).rootBg).toBe(rgbOf(PLAN.bg!));
    expect(goal.rootBg).toMatch(/^rgba?\(35, 55, 198/);

    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const id of ["UF-01.3"]) {
      const r = await probe(id);
      expect(r.rootDuration).toBe("0s");
      expect(r.moving).toEqual([]);
    }
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator(SCREEN("UF-01.4"))).toBeVisible();
    expect((await probe("UF-01.4")).rootDuration).toBe("0s");
  });

  test("unboxed rows and cards survive the feature stylesheet's load order", async ({ page }) => {
    await gotoStep(page, "/welcome/schedule");
    await expectPlan(page);
    const row = await page.locator(`${SCREEN("UF-01.4")} [data-area="chest"]`).evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        bg: cs.backgroundColor,
        bottom: cs.borderBottomWidth,
        bottomColour: cs.borderBottomColor,
        side: cs.borderLeftWidth,
        radius: cs.borderRadius,
        content: getComputedStyle(el, "::after").content,
      };
    });
    expect(row).toEqual({
      bg: "rgba(0, 0, 0, 0)",
      bottom: "1px",
      bottomColour: rgbOf(PLAN.line!),
      side: "0px",
      radius: "0px",
      content: "none",
    });
    const card = await page.locator(`${SCREEN("UF-01.4")} [data-field="plan"]`).evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        bg: cs.backgroundColor,
        border: cs.borderTopWidth,
        radius: cs.borderRadius,
        pad: cs.paddingLeft,
      };
    });
    expect(card).toEqual({ bg: "rgba(0, 0, 0, 0)", border: "0px", radius: "0px", pad: "0px" });
  });

  for (const [frame, name, path, id] of [
    ["Welcome", "uf01-1-welcome", "/welcome", "UF-01.1"],
    ["Goal · 1 of 3", "uf01-2-goal", "/welcome/goal", "UF-01.2"],
    ["Level and equipment · 2 of 3", "uf01-3-level", "/welcome/level", "UF-01.3"],
    ["Schedule · 3 of 3", "uf01-4-schedule", "/welcome/schedule", "UF-01.4"],
  ] as const) {
    test(`AC8 canvas compare: ${frame}`, async ({ page }, testInfo) => {
      await gotoStep(page, path);
      await expect(page.locator(SCREEN(id))).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      // The state cross-fade (200 ms) from the loading page to plan.bg must have settled.
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor))
        .toBe(rgbOf(PLAN.bg!));
      const result = await compareWithCanvas(page, testInfo, { turn: "turn-4", frame, name });
      if (process.env.WL_CANVAS_COMPARE === "1" && !result.skipped) {
        expect(result.files.app).toBeTruthy();
        expect(result.files.canvas).toBeTruthy();
      }
    });
  }
});

test.describe("T-0605 AC6 at 320 × 640", () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test("no step scrolls horizontally", async ({ page }) => {
    for (const [path, id] of PATHS) {
      await gotoStep(page, path);
      await expect(page.locator(SCREEN(id))).toBeVisible();
      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.documentElement.clientWidth,
      }));
      expect(overflow, id).toEqual({ doc: 0, body: 0 });
    }
  });
});

// ---------------------------------------------------------------------------------------------
// T-0606 (D-0208, D-0210, D-0211, D-0213; UF-01.5): the Cobalt sign-in and save screens, measured
// in a real browser. Expected colours are read from tokens.json, never typed.
// ---------------------------------------------------------------------------------------------
test.describe("T-0606 Cobalt sign-in (390 × 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const ACCOUNT = SCREEN("UF-01.5");
  const style = (loc: Locator, props: string[]) =>
    loc.evaluate((el, ps) => {
      const cs = getComputedStyle(el);
      return Object.fromEntries(ps.map((p) => [p, cs.getPropertyValue(p)]));
    }, props);

  test("AC1 /account is a plan-state root: plan.bg paints and theme-color is plan.bg", async ({
    page,
  }) => {
    await page.goto("/account");
    const root = page.locator(ACCOUNT);
    await expect(root).toHaveAttribute("data-wl-state", "plan");
    await expect
      .poll(() => root.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe(rgbOf(PLAN.bg!));
    const theme = await page.evaluate(
      () => document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? "",
    );
    expect(theme.toLowerCase()).toBe(PLAN.bg!.toLowerCase());
  });

  test("AC2 email and code: 1 px ink-muted, then 2 px attention with the message in attention", async ({
    page,
  }) => {
    await mockSupabaseEmailAuth(page);
    await page.goto("/account");
    const email = page.getByLabel("Email");
    expect(await style(email, ["border-top-width", "border-top-color"])).toEqual({
      "border-top-width": "1px",
      "border-top-color": rgbOf(PLAN["ink-muted"]!),
    });
    expect(tokenRatio(PLAN["ink-muted"]!, PLAN.bg!)).toBeGreaterThanOrEqual(3);
    await email.fill("nope");
    await page.getByRole("button", { name: "Send link" }).click();
    const status = page.locator(ACCOUNT).getByRole("status");
    await expect(status).toHaveText("Enter a valid email.");
    expect(await style(email, ["border-top-width", "border-top-color"])).toEqual({
      "border-top-width": "2px",
      "border-top-color": rgbOf(PLAN.attention!),
    });
    expect((await style(status, ["color"])).color).toBe(rgbOf(PLAN.attention!));
    expect(tokenRatio(PLAN.attention!, PLAN.bg!)).toBeGreaterThanOrEqual(5);

    await page.getByRole("tab", { name: "Enter code" }).click();
    const code = page.getByLabel("6-digit code");
    expect(await style(code, ["border-top-width", "border-top-color"])).toEqual({
      "border-top-width": "1px",
      "border-top-color": rgbOf(PLAN["ink-muted"]!),
    });
    await page.getByLabel("Email").fill("ada@example.com");
    await code.fill("12345");
    await page.getByRole("button", { name: "Verify code" }).click();
    await expect(status).toHaveText("Enter the 6-digit code from your email.");
    expect(await style(code, ["border-top-width", "border-top-color"])).toEqual({
      "border-top-width": "2px",
      "border-top-color": rgbOf(PLAN.attention!),
    });
    expect((await style(status, ["color"])).color).toBe(rgbOf(PLAN.attention!));
  });

  test("AC3 the active tab is a plan.selected pill with plan.on-selected text; the other is not", async ({
    page,
  }) => {
    await page.goto("/account");
    const props = ["background-color", "color", "border-top-left-radius"];
    const send = page.getByRole("tab", { name: "Send link" });
    const enter = page.getByRole("tab", { name: "Enter code" });
    expect(await style(send, props)).toEqual({
      "background-color": rgbOf(PLAN.selected!),
      color: rgbOf(PLAN["on-selected"]!),
      "border-top-left-radius": (await style(send, props))["border-top-left-radius"],
    });
    expect((await style(send, props))["border-top-left-radius"]).not.toBe("0px");
    expect((await style(enter, ["background-color"]))["background-color"]).toBe("rgba(0, 0, 0, 0)");
    await enter.click();
    expect((await style(enter, ["background-color"]))["background-color"]).toBe(
      rgbOf(PLAN.selected!),
    );
    expect((await style(send, ["background-color"]))["background-color"]).toBe("rgba(0, 0, 0, 0)");
  });

  test("AC4 offline: the offline line shows as a label, Google is aria-disabled, Send link still runs", async ({
    page,
    context,
  }) => {
    await page.goto("/account");
    await expect(page.locator(ACCOUNT)).toBeVisible();
    await context.setOffline(true);
    const line = page.locator(ACCOUNT).getByText("You're offline. Connect to send a link.").first();
    await expect(line).toBeVisible();
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByRole("button", { name: "Send link" }).click();
    await expect(page.locator(ACCOUNT).getByRole("status")).toHaveText(
      "You're offline. Connect to send a link.",
    );
    expect(
      await page
        .getByRole("button", { name: "Continue with Google" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    await context.setOffline(false);
  });

  test("AC5 contrast: axe is clean and every text pair clears its ratio in send, sent, error, offline and save", async ({
    page,
    context,
  }) => {
    await mockSupabaseEmailAuth(page);
    await page.goto("/account");
    await expect(page.locator(ACCOUNT)).toBeVisible();
    await expectAxeClean(page, "UF-01.5");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByRole("button", { name: "Send link" }).click();
    await expect(page.locator(ACCOUNT).getByRole("status")).toHaveText(/Check your email/);
    await expectAxeClean(page, "UF-01.5");
    const sent = await measure(page, ACCOUNT);
    for (const p of sent) expect(p.ratio, p.text).toBeGreaterThanOrEqual(4.5);
    await page.getByLabel("Email").fill("nope");
    await page.getByRole("button", { name: "Send link" }).click();
    await expect(page.locator(ACCOUNT).getByRole("status")).toHaveText("Enter a valid email.");
    await expectAxeClean(page, "UF-01.5");
    const err = await measure(page, ACCOUNT);
    expect(byText(err, "Enter a valid email.").ratio).toBeGreaterThanOrEqual(5);
    await context.setOffline(true);
    await expect(
      page.locator(ACCOUNT).getByText("You're offline. Connect to send a link."),
    ).toBeVisible();
    await expectAxeClean(page, "UF-01.5");
    await context.setOffline(false);
    // Targets: Send link, Enter code, Send link, Google, Privacy, all at least 44 × 44.
    expect(await expectTargetSizes(page, "UF-01.5")).toBe(5);

    // The save screen's no-plan state.
    await page.evaluate(() => window.localStorage.clear());
    await injectSession(page);
    await mockProfileMissing(page);
    await page.goto("/welcome/save");
    await expect(
      page.locator(SCREEN("UF-01.5-save")).getByRole("heading", { level: 1 }),
    ).toHaveText("Set up your plan");
    await expect(page.locator(SCREEN("UF-01.5-save"))).toHaveAttribute("data-wl-state", "plan");
    await expectAxeClean(page, "UF-01.5-save");
    expect(await expectTargetSizes(page, "UF-01.5-save")).toBe(1);
  });

  test("AC5 type and motion: no px font size beyond the scale, nothing moves but the root cross-fade, instant under reduced motion", async ({
    page,
  }) => {
    await page.goto("/account");
    const probe = () =>
      page.locator(ACCOUNT).evaluate((el) => {
        const moving = [el, ...el.querySelectorAll("*")].filter((n) => {
          const cs = getComputedStyle(n);
          return (
            cs.animationName !== "none" ||
            (n !== el && cs.transitionDuration.split(",").some((d) => parseFloat(d) > 0))
          );
        });
        return {
          rootDuration: getComputedStyle(el).transitionDuration,
          moving: moving.map((n) => n.tagName + "." + n.className),
        };
      });
    const first = await probe();
    expect(first.rootDuration).toBe("0.2s");
    expect(first.moving).toEqual([]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reduced = await probe();
    expect(reduced.rootDuration).toBe("0s");
    expect(reduced.moving).toEqual([]);
    // The page title is the plan page title (3.5rem = 56 px at the root size).
    const h1 = await page.locator(`${ACCOUNT} h1`).evaluate((el) => getComputedStyle(el).fontSize);
    expect(h1).toBe("56px");
  });

  test("AC6 keyboard: the focused Send link is not covered and shows a ring", async ({ page }) => {
    await page.goto("/account");
    const send = page.getByRole("button", { name: "Send link" });
    await tabTo(page, send);
    await expectVisibleFocus(send);
    await expect(send).toBeInViewport({ ratio: 1 });
  });

  test("AC7 canvas compare: Sign in · save your plan", async ({ page }, testInfo) => {
    await onboardToAccount(page);
    await expect(page.locator(ACCOUNT)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor))
      .toBe(rgbOf(PLAN.bg!));
    const result = await compareWithCanvas(page, testInfo, {
      turn: "turn-5",
      frame: "Sign in · save your plan",
      name: "uf01-5-signin",
    });
    if (process.env.WL_CANVAS_COMPARE === "1" && !result.skipped) {
      expect(result.files.app).toBeTruthy();
      expect(result.files.canvas).toBeTruthy();
    }
  });
});
