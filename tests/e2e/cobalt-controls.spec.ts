// T-0592 (D-0208, D-0210 §3, D-0211): the shared Cobalt controls in main.css. No screen uses a
// state yet, so every rule is proven on fixtures injected into the real app; AC1 loads the two
// real unmigrated screens. Expected values are read from tokens.json, never typed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import { UF11_FIXTURES } from "./fixtures/uf-11-plan.js";
import { ACCOUNT_FIXTURES } from "./fixtures/uf-11-account.js";

type Colours = Record<string, string>;
const tokens = JSON.parse(
  readFileSync(resolve(__dirname, "../../packages/design-tokens/src/tokens.json"), "utf8"),
) as { color: Record<string, Colours & string> & Record<string, string> };
const group = (name: string) => tokens.color[name] as unknown as Colours;
const plan = group("plan");
const lift = group("lift");
const paper = group("paper");
const flat = tokens.color as unknown as Record<string, string>;

function rgb(hex: string): string {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgb(${n(1)}, ${n(3)}, ${n(5)})`;
}
function luminance(hex: string): number {
  const ch = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
const TRANSPARENT = "rgba(0, 0, 0, 0)";

const TICK = `<svg class="wl-chip__tick wl-option__tick" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

async function inject(page: Page, html: string): Promise<void> {
  await page.evaluate((h) => {
    document.getElementById("wl-fixture")?.remove();
    const host = document.createElement("div");
    host.id = "wl-fixture";
    host.innerHTML = h;
    document.body.appendChild(host);
  }, html);
}

async function css(page: Page, selector: string, props: string[]): Promise<string[]> {
  return page.evaluate(
    ([sel, ps]) => {
      const cs = getComputedStyle(document.querySelector(sel as string)!);
      return (ps as string[]).map((p) => cs.getPropertyValue(p));
    },
    [selector, props],
  );
}

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
});

test.describe("AC1 unchanged outside a state", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function open(page: Page, path: string, fixtures: object): Promise<void> {
    await mockSupabaseData(page, fixtures);
    await page.goto("/");
    await injectSession(page);
    await page.goto(path);
  }

  test("/plan: the primary button is accent, 14px, DM Sans", async ({ page }) => {
    await open(page, "/plan", UF11_FIXTURES);
    const button = page.locator(".wl-button--primary").first();
    await expect(button).toBeVisible();
    const [bg, radius, family] = await css(page, ".wl-button--primary", [
      "background-color",
      "border-radius",
      "font-family",
    ]);
    expect(bg).toBe(rgb(flat.accent!));
    expect(radius).toBe("14px");
    expect(family.startsWith('"DM Sans"')).toBe(true);
  });

  test("/plan/account: the secondary button keeps 14px and DM Sans", async ({ page }) => {
    await open(page, "/plan/account", ACCOUNT_FIXTURES);
    await expect(page.locator(".wl-button--secondary").first()).toBeVisible();
    const [bg, radius, family] = await css(page, ".wl-button--secondary", [
      "background-color",
      "border-radius",
      "font-family",
    ]);
    expect(bg).toBe(rgb(flat["surface-2"]!));
    expect(radius).toBe("14px");
    expect(family.startsWith('"DM Sans"')).toBe(true);
  });

  test("outside a state the new look is absent on a bare fixture", async ({ page }) => {
    await page.goto("/welcome");
    await inject(
      page,
      `<button id="p" class="wl-button--primary">Go</button>
       <label id="o" class="wl-option"><input type="radio" checked />A</label>
       <button id="c" class="wl-chip" aria-pressed="true">Quads</button>`,
    );
    const [radius] = await css(page, "#p", ["border-radius"]);
    expect(radius).toBe("14px");
    // No selected fill (plan white) and no cobalt block: the legacy look is untouched.
    expect((await css(page, "#c", ["background-color"]))[0]).not.toBe(rgb(plan.selected!));
    expect((await css(page, "#o", ["background-color"]))[0]).toBe(TRANSPARENT);
    expect((await css(page, "#o", ["margin-left"]))[0]).toBe("0px");
  });
});

test.describe("controls inside a state (390 x 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test.describe("AC2 plan buttons", () => {
    test("plan primary and secondary", async ({ page }) => {
      await inject(
        page,
        `<div data-wl-state="plan"><div class="wl-page" style="min-height:600px">
         <button id="sec" class="wl-button--secondary">Delete</button>
         <button id="pri" class="wl-button--primary"><span>Start</span></button>
       </div></div>`,
      );
      const [bg, color, radius, size, weight, family] = await css(page, "#pri", [
        "background-color",
        "color",
        "border-radius",
        "font-size",
        "font-weight",
        "font-family",
      ]);
      expect(bg).toBe(rgb(plan.action!));
      expect(color).toBe(rgb(plan["on-action"]!));
      expect(contrast(plan.action!, plan["on-action"]!)).toBeGreaterThan(8.5);
      expect(parseFloat(radius)).toBeGreaterThanOrEqual(999);
      expect(size).toBe("22px");
      expect(weight).toBe("700");
      expect(family.startsWith('"Familjen Grotesk"')).toBe(true);
      const [w, bs, bc, sbg, sw] = await css(page, "#sec", [
        "border-top-width",
        "border-top-style",
        "border-top-color",
        "background-color",
        "font-weight",
      ]);
      // Chrome snaps a 1.5px border to whole CSS px in computed style; main-css.test.ts pins the
      // authored 1.5px. Here: a solid ink border at least 1px wide on a transparent fill.
      expect(parseFloat(w!)).toBeGreaterThanOrEqual(1);
      expect([bs, bc, sbg, sw]).toEqual(["solid", rgb(plan.ink!), TRANSPARENT, "600"]);
      // The primary is the last child of the page: pinned to the bottom with margin-top auto.
      expect(parseFloat((await css(page, "#pri", ["margin-top"]))[0]!)).toBeGreaterThan(100);
    });
  });

  test("AC2 lift session button", async ({ page }) => {
    await inject(
      page,
      `<div data-wl-state="lift"><button id="s" class="wl-button--session">Done</button>
       <button id="o" class="wl-button--session-outline">Next</button></div>`,
    );
    const [bg, color, radius, minH, size, weight] = await css(page, "#s", [
      "background-color",
      "color",
      "border-radius",
      "min-height",
      "font-size",
      "font-weight",
    ]);
    expect(bg).toBe(rgb(lift.action!));
    expect(color).toBe(rgb(lift["on-action"]!));
    expect(contrast(lift.action!, lift["on-action"]!)).toBeGreaterThan(6);
    expect([radius, minH, size, weight]).toEqual(["22px", "64px", "24px", "800"]);
    const [obg, ocolor] = await css(page, "#o", ["background-color", "color"]);
    expect([obg, ocolor]).toEqual([TRANSPARENT, rgb(lift.ink!)]);
  });

  const options = `<div data-wl-state="plan"><div class="wl-page" role="radiogroup" aria-label="Goal">
    ${["Strength", "Hypertrophy", "Fitness"]
      .map(
        (n, i) =>
          `<label class="wl-option" id="o${i}"><input type="radio" name="g" value="${n}" ${
            i === 1 ? "checked" : ""
          } /><span>${n}</span>${TICK}</label>`,
      )
      .join("")}
  </div></div>`;

  test("AC3 selected option row, checked and unchecked, arrow keys", async ({ page }) => {
    await inject(page, options);
    for (const n of ["Strength", "Hypertrophy", "Fitness"]) {
      await expect(page.getByRole("radio", { name: n })).toHaveCount(1);
    }
    const [bg, radius, ink] = await css(page, "#o1", [
      "background-color",
      "border-radius",
      "color",
    ]);
    expect([bg, radius, ink]).toEqual([rgb(plan.selected!), "16px", rgb(plan["on-selected"]!)]);
    expect(contrast(plan.selected!, plan["on-selected"]!)).toBeGreaterThan(8.5);
    expect((await css(page, "#o0", ["background-color"]))[0]).toBe(TRANSPARENT);
    expect((await css(page, "#o2", ["background-color"]))[0]).toBe(TRANSPARENT);
    // The block bleeds 18 px past the gutter.
    const edges = await page.evaluate(() => {
      const pageEl = document.querySelector("#wl-fixture .wl-page")!;
      const gutter =
        pageEl.getBoundingClientRect().left + parseFloat(getComputedStyle(pageEl).paddingLeft);
      return [gutter, document.getElementById("o1")!.getBoundingClientRect().left];
    });
    expect(edges[0]! - edges[1]!).toBe(18);
    // Native arrow keys move the checked radio, and the block follows it.
    await page.getByRole("radio", { name: "Hypertrophy" }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: "Fitness" })).toBeChecked();
    expect((await css(page, "#o2", ["background-color"]))[0]).toBe(rgb(plan.selected!));
    expect((await css(page, "#o1", ["background-color"]))[0]).toBe(TRANSPARENT);
  });

  test("AC4 chip: name, tick, background and hit box", async ({ page }) => {
    await inject(
      page,
      `<div data-wl-state="plan">
        <button id="on" class="wl-chip" aria-pressed="true"><span>Quads</span>${TICK}</button>
        <button id="off" class="wl-chip" aria-pressed="false"><span>Glutes</span>${TICK}</button>
        <label id="cb" class="wl-chip"><input type="checkbox" /><span>Calves</span>${TICK}</label>
      </div>`,
    );
    await expect(page.getByRole("button", { name: "Quads", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Glutes", exact: true })).toBeVisible();
    expect(await page.locator("#on svg").getAttribute("aria-hidden")).toBe("true");
    expect(await css(page, "#on", ["background-color", "color"])).toEqual([
      rgb(plan.selected!),
      rgb(plan["on-selected"]!),
    ]);
    expect((await css(page, "#off", ["background-color"]))[0]).toBe(TRANSPARENT);
    expect((await css(page, "#on svg", ["display"]))[0]).not.toBe("none");
    expect((await css(page, "#off svg", ["display"]))[0]).toBe("none");
    for (const id of ["#on", "#off", "#cb"]) {
      const box = (await page.locator(id).boundingBox())!;
      expect(box.width, id).toBeGreaterThanOrEqual(44);
      expect(box.height, id).toBeGreaterThanOrEqual(44);
    }
    // The native-checkbox form: unchecked, then checked.
    expect((await css(page, "#cb", ["background-color"]))[0]).toBe(TRANSPARENT);
    await page.getByRole("checkbox", { name: "Calves" }).check({ force: true });
    expect((await css(page, "#cb", ["background-color"]))[0]).toBe(rgb(plan.selected!));
    expect((await css(page, "#cb svg", ["display"]))[0]).not.toBe("none");
  });

  test("AC5 segmented control, radio and aria-pressed forms", async ({ page }) => {
    await inject(
      page,
      `<div data-wl-state="plan">
        <div id="seg" class="wl-segmented" role="radiogroup" aria-label="Unit">
          <label id="kg"><input type="radio" name="u" checked /><span>kg</span></label>
          <label id="lb"><input type="radio" name="u" /><span>lb</span></label>
        </div>
        <div id="seg2" class="wl-segmented">
          <button id="b1" aria-pressed="true">Week</button>
          <button id="b2" aria-pressed="false">Month</button>
        </div></div>`,
    );
    await expect(page.getByRole("radio", { name: "kg" })).toBeChecked();
    expect(await css(page, "#kg", ["background-color", "color"])).toEqual([
      rgb(plan.selected!),
      rgb(plan["on-selected"]!),
    ]);
    expect(contrast(plan.selected!, plan["on-selected"]!)).toBeGreaterThan(8.5);
    expect((await css(page, "#lb", ["background-color"]))[0]).toBe(TRANSPARENT);
    expect(
      await css(page, "#seg", ["border-top-width", "border-top-style", "border-top-color"]),
    ).toEqual(["1px", "solid", rgb(plan.line!)]);
    expect((await css(page, "#b1", ["background-color"]))[0]).toBe(rgb(plan.selected!));
    expect((await css(page, "#b2", ["background-color"]))[0]).toBe(TRANSPARENT);
    await page.getByRole("radio", { name: "lb" }).check({ force: true });
    expect((await css(page, "#lb", ["background-color"]))[0]).toBe(rgb(plan.selected!));
  });

  test("AC6 keyboard focus: 2px ink outline at a 2px offset, paper.ink inside .wl-paper", async ({
    page,
  }) => {
    await inject(
      page,
      `<div data-wl-state="plan"><button id="start">start</button>
        <button id="pri" class="wl-button--primary">Primary</button>
        <button id="sec" class="wl-button--secondary">Secondary</button>
        <button id="txt" class="wl-button--text">Text</button>
        <button id="ses" class="wl-button--session">Session</button>
        <a id="row" class="wl-row" href="#r">Row</a>
        <label id="opt" class="wl-option"><input type="radio" name="g" /><span>Option</span></label>
        <div class="wl-segmented"><label id="seg"><input type="radio" name="s" /><span>kg</span></label></div>
        <button id="chip" class="wl-chip" aria-pressed="false"><span>Quads</span></button>
        <div class="wl-paper">
          <button id="ppri" class="wl-button--primary">Accept</button>
          <button id="pchip" class="wl-chip" aria-pressed="false"><span>Glutes</span></button>
        </div>
      </div>`,
    );
    await page.locator("#start").focus();
    const order: [string, string, string][] = [
      ["#pri", "#pri", plan.ink!],
      ["#sec", "#sec", plan.ink!],
      ["#txt", "#txt", plan.ink!],
      ["#ses", "#ses", plan.ink!],
      ["#row", "#row", plan.ink!],
      ["input[type=radio][name=g]", "#opt", plan.ink!],
      ["input[type=radio][name=s]", "#seg", plan.ink!],
      ["#chip", "#chip", plan.ink!],
      ["#ppri", "#ppri", paper.ink!],
      ["#pchip", "#pchip", paper.ink!],
    ];
    for (const [focused, outlined, colour] of order) {
      await page.keyboard.press("Tab");
      await expect(page.locator(focused)).toBeFocused();
      expect(
        await css(page, outlined, [
          "outline-width",
          "outline-style",
          "outline-color",
          "outline-offset",
        ]),
        outlined,
      ).toEqual(["2px", "solid", rgb(colour), "2px"]);
    }
  });

  test("AC7 no cards under a state, the surface fill outside it", async ({ page }) => {
    await inject(
      page,
      `<div data-wl-state="plan"><div id="in" class="wl-card">Inside</div></div>
       <div id="out" class="wl-card">Outside</div>`,
    );
    expect(
      await css(page, "#in", [
        "background-color",
        "border-top-width",
        "border-radius",
        "padding-top",
      ]),
    ).toEqual([TRANSPARENT, "0px", "0px", "0px"]);
    expect(await css(page, "#out", ["background-color", "border-radius"])).toEqual([
      rgb(flat.surface!),
      "16px",
    ]);
  });

  const optionWithCaption = (scope: string) =>
    `${scope}<div class="wl-page">
      <label class="wl-option" id="on"><input type="radio" name="c" checked /><span>Strength<br /><span class="wl-type-label" id="oncap">Heavy</span></span>${TICK}</label>
      <label class="wl-option" id="off"><input type="radio" name="c" /><span>Fitness<br /><span class="wl-type-label" id="offcap">Light</span></span>${TICK}</label>
    </div></div>`;

  test("review 1: captions in a checked option are legible, in plan and in paper", async ({
    page,
  }) => {
    await inject(page, optionWithCaption('<div data-wl-state="plan">'));
    expect((await css(page, "#oncap", ["color"]))[0]).toBe(rgb(plan["on-selected"]!));
    expect(contrast(plan.selected!, plan["on-selected"]!)).toBeGreaterThan(8.5);
    await inject(page, optionWithCaption('<div data-wl-state="plan"><div class="wl-paper">'));
    // The paper block: selected is paper.action, text paper.on-action (white on cobalt).
    expect((await css(page, "#oncap", ["color"]))[0]).toBe(rgb(paper["on-action"]!));
    expect((await css(page, "#on", ["background-color"]))[0]).toBe(rgb(paper.action!));
    expect(contrast(paper.action!, paper["on-action"]!)).toBeGreaterThan(8.5);
  });

  test("review 1: an option's caption is ink, not ink-muted, on the hover fill", async ({
    page,
  }) => {
    await inject(page, optionWithCaption('<div data-wl-state="plan">'));
    await page.locator("#off").hover();
    expect((await css(page, "#off", ["background-color"]))[0]).toBe(rgb(plan.raise!));
    expect((await css(page, "#offcap", ["color"]))[0]).toBe(rgb(plan.ink!));
    expect(contrast(plan.raise!, plan.ink!)).toBeGreaterThan(6);
  });

  test("review 4: the option tick shows when checked and hides when not", async ({ page }) => {
    await inject(page, optionWithCaption('<div data-wl-state="plan">'));
    await expect(page.locator("#on svg")).toBeVisible();
    await expect(page.locator("#off svg")).toBeHidden();
    await page.getByRole("radio", { name: /Fitness/ }).check({ force: true });
    await expect(page.locator("#off svg")).toBeVisible();
    await expect(page.locator("#on svg")).toBeHidden();
  });

  test("review 4: a card after a card gets a 1px line divider, the first has none", async ({
    page,
  }) => {
    await inject(
      page,
      `<div data-wl-state="plan"><div id="c1" class="wl-card">One</div><div id="c2" class="wl-card">Two</div></div>`,
    );
    expect(await css(page, "#c1", ["border-top-width"])).toEqual(["0px"]);
    expect(
      await css(page, "#c2", ["border-top-width", "border-top-style", "border-top-color"]),
    ).toEqual(["1px", "solid", rgb(plan.line!)]);
  });

  test("review 2: a disabled session or primary button is the outline form in rest", async ({
    page,
  }) => {
    const rest = group("rest");
    await inject(
      page,
      `<div data-wl-state="rest"><button id="s" class="wl-button--session" aria-disabled="true">Skip</button>
        <button id="p" class="wl-button--primary" aria-disabled="true">Next</button></div>`,
    );
    for (const id of ["#s", "#p"]) {
      const [bg, color, bs, bc] = await css(page, id, [
        "background-color",
        "color",
        "border-top-style",
        "border-top-color",
      ]);
      expect([bg, color, bs, bc], id).toEqual([
        TRANSPARENT,
        rgb(rest.ink!),
        "solid",
        rgb(rest.ink!),
      ]);
    }
    expect(contrast(rest.bg!, rest.ink!)).toBeGreaterThan(4.5);
  });

  test("review 3: a disabled and pressed chip stays legible", async ({ page }) => {
    await inject(
      page,
      `<div data-wl-state="plan">
        <button id="a" class="wl-chip" aria-pressed="true" aria-disabled="true"><span class="wl-type-label" id="acap">Quads</span>${TICK}</button>
        <button id="b" class="wl-chip" aria-pressed="false" aria-disabled="true">Glutes</button></div>`,
    );
    expect(await css(page, "#a", ["color", "background-color"])).toEqual([
      rgb(plan["on-selected"]!),
      rgb(plan.selected!),
    ]);
    expect((await css(page, "#acap", ["color"]))[0]).toBe(rgb(plan["on-selected"]!));
    expect((await css(page, "#b", ["color"]))[0]).toBe(rgb(plan["ink-muted"]!));
  });

  for (const reduced of [false, true]) {
    test(`AC9 no transition on the controls (reduced motion: ${reduced})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      await inject(
        page,
        `<div data-wl-state="plan"><button id="a" class="wl-button--primary">A</button>
          <button id="b" class="wl-button--secondary">B</button>
          <button id="c" class="wl-button--text">C</button>
          <button id="d" class="wl-chip">D</button>
          <label id="e" class="wl-option"><input type="radio" />E</label>
          <div id="f" class="wl-segmented"><button>F</button></div>
          <a id="g" class="wl-row" href="#g">G</a></div>`,
      );
      for (const id of ["#a", "#b", "#c", "#d", "#e", "#f", "#g"]) {
        expect((await css(page, id, ["transition-duration"]))[0], id).toBe("0s");
      }
    });
  }
});
