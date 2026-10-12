// T-0589 (D-0208 §2, D-0210, D-0211 §2-§3): the data-wl-state scopes in main.css. No screen sets
// a state yet, so every rule is proven on fixtures injected into the real app. Expected values
// are read from tokens.json, never typed.
// T-0624 (D-0210 §6): every screen root now carries a state and :root resolves to plan, so AC3
// below is inverted (logged) and AC6 walks every route.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
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

const tokens = JSON.parse(
  readFileSync(resolve(__dirname, "../../packages/design-tokens/src/tokens.json"), "utf8"),
) as { color: Record<string, Record<string, string> & string> };
const group = (name: string) => tokens.color[name] as unknown as Record<string, string>;

function rgb(hex: string): string {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgb(${n(1)}, ${n(3)}, ${n(5)})`;
}

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await page.goto("/welcome");
  await expect(page.locator("h1").first()).toBeVisible();
});

/** Replaces the injected fixture host and returns computed values of its first child. */
async function inject(page: Page, html: string): Promise<void> {
  await page.evaluate((h) => {
    document.getElementById("wl-fixture")?.remove();
    const host = document.createElement("div");
    host.id = "wl-fixture";
    host.innerHTML = h;
    document.body.appendChild(host);
  }, html);
}

async function style(page: Page, selector: string, props: string[]): Promise<string[]> {
  return page.evaluate(
    ([sel, ps]) => {
      const cs = getComputedStyle(document.querySelector(sel as string)!);
      return (ps as string[]).map((p) => cs.getPropertyValue(p));
    },
    [selector, props],
  );
}

test.describe("AC2 state mapping (390 x 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  const cases = [
    { state: "plan", font: '"Familjen Grotesk"' },
    { state: "lift", font: '"Bricolage Grotesque"' },
    { state: "rest", font: '"Bricolage Grotesque"' },
  ];
  for (const { state, font } of cases) {
    test(`${state} root paints its bg, ink and font`, async ({ page }) => {
      await inject(page, `<div id="x" data-screen-id="X" data-wl-state="${state}">hi</div>`);
      const [bg, ink, family] = await style(page, "#x", [
        "background-color",
        "color",
        "font-family",
      ]);
      expect(bg).toBe(rgb(group(state).bg!));
      expect(ink).toBe(rgb(group(state).ink!));
      expect(family.startsWith(font)).toBe(true);
    });
  }
  test(".wl-paper paints paper bg and ink", async ({ page }) => {
    await inject(page, `<div id="x" class="wl-paper">hi</div>`);
    const [bg, ink] = await style(page, "#x", ["background-color", "color"]);
    expect(bg).toBe(rgb(group("paper").bg!));
    expect(ink).toBe(rgb(group("paper").ink!));
  });
});

test.describe("AC3 no state resolves to plan (390 x 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  // /welcome is a plan screen: drop its state root so only the fixture is on the page.
  const dropScreen = (page: Page) =>
    page.evaluate(() => document.querySelectorAll("[data-screen-id]").forEach((e) => e.remove()));
  test("--wl-bg resolves to plan.bg outside any state", async ({ page }) => {
    await dropScreen(page);
    await inject(page, `<div id="x"><h1>hi</h1></div>`);
    await page.waitForTimeout(300); // the 200 ms release cross-fade
    const [bg, ink, bodyBg, family] = await page.evaluate(() => {
      const cs = getComputedStyle(document.getElementById("x")!);
      return [
        cs.getPropertyValue("--wl-bg").trim(),
        cs.getPropertyValue("--wl-ink").trim(),
        getComputedStyle(document.body).backgroundColor,
        getComputedStyle(document.querySelector("#x h1")!).fontFamily,
      ];
    });
    expect([bg, ink]).toEqual([group("plan").bg, group("plan").ink]);
    expect(bodyBg).toBe(rgb(group("plan").bg!));
    expect(family.startsWith('"Familjen Grotesk"')).toBe(true);
  });

  test("html follows a mounted screen root's state, and is released again", async ({ page }) => {
    await dropScreen(page);
    await inject(page, `<div data-screen-id="X" data-wl-state="lift">hi</div>`);
    await page.waitForTimeout(300);
    const bg = () =>
      page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    expect(await bg()).toBe(rgb(group("lift").bg!));
    await page.evaluate(() => document.getElementById("wl-fixture")!.remove());
    await page.waitForTimeout(300);
    expect(await bg()).toBe("rgba(0, 0, 0, 0)"); // released: html paints nothing again
  });
});

test.describe("AC4 gutter", () => {
  const page390 = `<div data-wl-state="plan"><div id="p" class="wl-page">a</div></div>
    <div data-wl-state="lift"><div id="l" class="wl-page">a</div></div>
    <div><div id="n" class="wl-page">a</div></div>`;
  test("390 px: plan 28, lift 26, no state is plan (28)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await inject(page, page390);
    expect((await style(page, "#p", ["padding-left"]))[0]).toBe("28px");
    expect((await style(page, "#l", ["padding-left"]))[0]).toBe("26px");
    expect((await style(page, "#n", ["padding-left"]))[0]).toBe("28px");
  });
  test("340 px: every state is 20", async ({ page }) => {
    await page.setViewportSize({ width: 340, height: 700 });
    await inject(page, page390);
    for (const id of ["#p", "#l", "#n"]) {
      expect((await style(page, id, ["padding-left"]))[0], id).toBe("20px");
    }
  });
});

test.describe("AC5 cross-fade", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  const fixture = `<div id="x" data-screen-id="X" data-wl-state="plan">hi</div>`;
  test("200 ms ease-out on a state root", async ({ page }) => {
    await inject(page, fixture);
    const [t] = await style(page, "#x", ["transition"]);
    expect(t).toContain("background-color");
    expect(t).toContain("0.2s");
    expect(t).toContain("ease-out");
  });
  test("none under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await inject(page, fixture);
    const [d] = await style(page, "#x", ["transition-duration"]);
    expect(d).toBe("0s");
  });
});

test.describe("AC8 full stop", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("h1.wl-title--stop draws a '.' that stays out of the name", async ({ page }) => {
    await inject(
      page,
      `<div data-screen-id="X" data-wl-state="plan"><h1 class="wl-title--stop">Progress</h1></div>`,
    );
    const [content] = await page.evaluate(() => [
      getComputedStyle(document.querySelector("#wl-fixture h1")!, "::after").content,
    ]);
    expect(content).toContain('"."');
    await expect(page.getByRole("heading", { name: "Progress", exact: true })).toBeVisible();
  });
});

// T-0624 AC2: every route root carries a state. One walk, so a screen that loses its attribute
// shows up here and not only in its own flow spec.
test.describe("AC6 every route root carries data-wl-state (390 x 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  const profileRow = { ...profile, user_id: FAKE_USER_ID };

  async function expectStates(page: Page, path: string): Promise<void> {
    await page.goto(path);
    await expect(page.locator("[data-screen-id]").first()).toBeVisible();
    // Every screen-id element on the page (the root and any nested screen) has a state.
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              [...document.querySelectorAll("[data-screen-id]")].filter(
                (e) => !/^(plan|lift|rest)$/.test(e.getAttribute("data-wl-state") ?? ""),
              ).length,
          ),
        { message: path },
      )
      .toBe(0);
  }

  test("signed out: /welcome, its steps and /account", async ({ page }) => {
    for (const p of [
      "/welcome",
      "/welcome/goal",
      "/welcome/level",
      "/welcome/schedule",
      "/welcome/save",
      "/account",
    ]) {
      await expectStates(page, p);
    }
  });

  test.describe("signed in", () => {
    test.beforeEach(async ({ page }) => {
      await mockSupabaseData(page, {
        sets: [],
        exercises,
        exerciseAreas,
        areaTargets: [
          "chest",
          "back",
          "shoulders",
          "arms",
          "core",
          "glutes",
          "quads",
          "hamstrings",
          "calves",
        ].map((area_id) => ({
          area_id,
          sets_per_14d: 16,
          source: "default",
          updated_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        })),
        profile: profileRow,
      });
      await mockProfilePresent(page, profileRow);
      await page.goto("/");
      await injectSession(page);
    });

    test("tab and plan routes", async ({ page }) => {
      for (const p of [
        "/",
        "/?view=preview",
        "/library",
        "/library/back-squat",
        "/library/back-squat/compare/romanian-deadlift",
        "/progress",
        "/progress/back-squat",
        "/balance",
        "/balance/chest",
        "/plan",
        "/plan/edit",
        "/plan/account",
        "/plan/excluded",
        "/plan/favorites",
        "/plan/routines/new",
        "/session/setup",
      ]) {
        await expectStates(page, p);
      }
    });

    test("a seeded session: UF-09.3, rest, List view and the summary", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("link", { name: "Start workout" }).click();
      await page.getByRole("button", { name: "30 minutes" }).click();
      await page.getByRole("button", { name: "Suggest my workout" }).click();
      await page.getByRole("button", { name: "Looks good" }).click();
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await expect(page).toHaveURL(/\/session\/[0-9a-f-]{36}$/);
      const id = /\/session\/([0-9a-f-]{36})$/.exec(page.url())![1]!;
      const states = () =>
        page.evaluate(() =>
          [...document.querySelectorAll("[data-screen-id]")].map(
            (e) => `${e.getAttribute("data-screen-id")}:${e.getAttribute("data-wl-state")}`,
          ),
        );
      await page.getByRole("button", { name: "Skip warm-up" }).click();
      await expect(page.locator('[data-screen-id="UF-09.3"]')).toBeVisible();
      expect(await states()).toEqual(["UF-09.3:lift"]);
      await page.getByRole("button", { name: "Done" }).click();
      await expect(page.locator('[data-screen-id="UF-09.5"]')).toBeVisible({ timeout: 10_000 });
      expect(await states()).toEqual(["UF-09.5:rest"]);
      await page.getByRole("button", { name: "Skip rest" }).click();
      await expect(page.locator('[data-screen-id="UF-09.3"]')).toBeVisible();
      await page.getByRole("button", { name: "Pause workout" }).click();
      await page.getByRole("button", { name: "List view" }).click();
      // The lazy seam's loading placeholder carries UF-03.1 without a state for a moment
      // (UF-09/seams.tsx, follow-up); the loaded view is what this walk checks.
      await expect(page.locator('[data-screen-id="UF-03.1"]')).toHaveAttribute(
        "data-wl-state",
        "lift",
      );
      expect(await states()).toEqual(["UF-03.1:lift"]);
      await expectStates(page, `/session/${id}/summary`);
    });
  });
});
