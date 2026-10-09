// T-0589 (D-0208 §2, D-0210, D-0211 §2-§3): the data-wl-state scopes in main.css. No screen sets
// a state yet, so every rule is proven on fixtures injected into the real app. Expected values
// are read from tokens.json, never typed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import { mockSupabaseAuth, mockSupabaseRest } from "./fixtures/supabase-mock.js";

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

test.describe("AC3 no state keeps Chalk & Iron (390 x 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("--wl-bg resolves to the legacy bg and the page is unchanged", async ({ page }) => {
    await inject(page, `<div id="x">hi</div>`);
    const [bg, ink] = await page.evaluate(() => {
      const cs = getComputedStyle(document.getElementById("x")!);
      return [cs.getPropertyValue("--wl-bg").trim(), cs.getPropertyValue("--wl-ink").trim()];
    });
    expect([bg, ink]).toEqual([tokens.color.bg, tokens.color.text]);
    const [html, h1] = await page.evaluate(() => [
      getComputedStyle(document.documentElement).backgroundColor,
      getComputedStyle(document.querySelector("h1")!).fontFamily,
    ]);
    expect(html).toBe("rgba(0, 0, 0, 0)");
    expect(h1.startsWith('"Big Shoulders Display"')).toBe(true);
  });

  test("html follows a mounted screen root's state, and is released again", async ({ page }) => {
    await inject(page, `<div data-screen-id="X" data-wl-state="lift">hi</div>`);
    await page.waitForTimeout(300);
    const bg = () =>
      page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    expect(await bg()).toBe(rgb(group("lift").bg!));
    await page.evaluate(() => document.getElementById("wl-fixture")!.remove());
    await page.waitForTimeout(300);
    expect(await bg()).toBe("rgba(0, 0, 0, 0)");
  });
});

test.describe("AC4 gutter", () => {
  const page390 = `<div data-wl-state="plan"><div id="p" class="wl-page">a</div></div>
    <div data-wl-state="lift"><div id="l" class="wl-page">a</div></div>
    <div><div id="n" class="wl-page">a</div></div>`;
  test("390 px: plan 28, lift 26, no state 20", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await inject(page, page390);
    expect((await style(page, "#p", ["padding-left"]))[0]).toBe("28px");
    expect((await style(page, "#l", ["padding-left"]))[0]).toBe("26px");
    expect((await style(page, "#n", ["padding-left"]))[0]).toBe("20px");
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
