// T-0593 (D-0208, D-0210 §3, D-0211 §5): the shared Cobalt surfaces in main.css and the component
// CSS: checkbox C-03, toggle, input with the per-state error form, sheet with scrim, paper panel
// and the three notices. No screen uses a state yet, so each rule is proven on a fixture injected
// into the real app. Expected values are read from tokens.json, never typed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import { mockSupabaseAuth, mockSupabaseRest } from "./fixtures/supabase-mock.js";

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

// No screen mounts the checkbox, the excluded-areas notice or the offline line yet, so their real
// stylesheets are not in the /welcome bundle. They are injected from disk, after main.css.
const COMPONENT_CSS = [
  "checkbox/checkbox.css",
  "excluded-areas-notice/excluded-areas-notice.css",
  "offline-status/offline-status.css",
].map((f) => readFileSync(resolve(__dirname, "../../apps/web/src/components", f), "utf8"));

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await page.goto("/welcome");
  await expect(page.locator("h1").first()).toBeVisible();
  for (const content of COMPONENT_CSS) await page.addStyleTag({ content });
});

/** Computed values of a pseudo-element. */
async function pseudo(page: Page, selector: string, pseudoEl: string, props: string[]) {
  return page.evaluate(
    ([sel, pe, ps]) => {
      const cs = getComputedStyle(document.querySelector(sel as string)!, pe as string);
      return (ps as string[]).map((p) => cs.getPropertyValue(p));
    },
    [selector, pseudoEl, props],
  );
}

const checkbox = (id: string, checked = false, extra = "") =>
  `<label class="wl-checkbox" id="${id}" ${extra}><input type="checkbox" class="wl-checkbox__input" ${
    checked ? "checked" : ""
  } /><span class="wl-checkbox__label">Remember me</span></label>`;

test.describe("390 x 844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("AC1 checkbox in plan: 22 px box, muted border, transparent, then selected fill and tick", async ({
    page,
  }) => {
    await inject(page, `<div data-wl-state="plan">${checkbox("off")}${checkbox("on", true)}</div>`);
    const box = (await page.locator("#off input").boundingBox())!;
    expect([box.width, box.height]).toEqual([22, 22]);
    const [bw, bs, bc, bg] = await css(page, "#off input", [
      "border-top-width",
      "border-top-style",
      "border-top-color",
      "background-color",
    ]);
    expect(parseFloat(bw!)).toBeGreaterThanOrEqual(1);
    expect([bs, bc, bg]).toEqual(["solid", rgb(plan["ink-muted"]!), TRANSPARENT]);
    expect(contrast(plan.bg!, plan["ink-muted"]!)).toBeGreaterThanOrEqual(3);
    expect(contrast(plan.bg!, plan["ink-muted"]!)).toBeGreaterThan(5.8);
    expect(await css(page, "#on input", ["background-color", "border-top-color"])).toEqual([
      rgb(plan.selected!),
      rgb(plan.selected!),
    ]);
    expect((await pseudo(page, "#on input", "::after", ["border-right-color"]))[0]).toBe(
      rgb(plan["on-selected"]!),
    );
    expect(contrast(plan.selected!, plan["on-selected"]!)).toBeGreaterThan(8.5);
    expect((await page.locator("#off").boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // Hover: the unchecked border goes to ink.
    await page.locator("#off").hover();
    expect((await css(page, "#off input", ["border-top-color"]))[0]).toBe(rgb(plan.ink!));
  });

  test("AC1 checkbox in paper and lift: the same variables, the tick stays legible", async ({
    page,
  }) => {
    await inject(
      page,
      `<div data-wl-state="plan"><div class="wl-paper">${checkbox("p", true)}</div></div>
       <div data-wl-state="lift">${checkbox("l", true)}</div>`,
    );
    expect(await css(page, "#p input", ["background-color"])).toEqual([rgb(paper.action!)]);
    expect((await pseudo(page, "#p input", "::after", ["border-right-color"]))[0]).toBe(
      rgb(paper["on-action"]!),
    );
    expect(contrast(paper.action!, paper["on-action"]!)).toBeGreaterThan(8.5);
    expect(await css(page, "#l input", ["background-color"])).toEqual([rgb(lift.ink!)]);
    expect((await pseudo(page, "#l input", "::after", ["border-right-color"]))[0]).toBe(
      rgb(lift["on-action"]!),
    );
  });

  test("AC1 a disabled checkbox keeps its checked fill, its tick and a >= 3:1 box", async ({
    page,
  }) => {
    await inject(
      page,
      `<div data-wl-state="plan">${checkbox("d", true, "data-disabled")}${checkbox("u", false, "data-disabled")}</div>`,
    );
    expect(await css(page, "#d input", ["background-color"])).toEqual([rgb(plan.selected!)]);
    expect((await pseudo(page, "#d input", "::after", ["border-right-color"]))[0]).toBe(
      rgb(plan["on-selected"]!),
    );
    // Hover must not change a disabled checked box either.
    await page.locator("#d").hover();
    expect(await css(page, "#d input", ["background-color"])).toEqual([rgb(plan.selected!)]);
    expect((await css(page, "#u input", ["border-top-color"]))[0]).toBe(rgb(plan["ink-muted"]!));
    expect(contrast(plan.bg!, plan["ink-muted"]!)).toBeGreaterThanOrEqual(3);
    expect((await css(page, "#u", ["color"]))[0]).toBe(rgb(plan["ink-muted"]!));
  });

  test("AC1 outside a state the box keeps the legacy muted border and accent fill", async ({
    page,
  }) => {
    await inject(page, `${checkbox("lo")}${checkbox("lc", true)}`);
    const box = (await page.locator("#lo input").boundingBox())!;
    expect([box.width, box.height]).toEqual([24, 24]);
    expect((await css(page, "#lo input", ["border-top-color"]))[0]).toBe(rgb(flat["text-muted"]!));
    expect(await css(page, "#lc input", ["background-color"])).toEqual([rgb(flat.accent!)]);
  });

  const toggle = (id: string, checked: boolean) =>
    `<label class="wl-toggle" id="${id}"><span>Reminders ${id}</span><input type="checkbox" role="switch" ${
      checked ? "checked" : ""
    } /></label>`;

  test("AC2 toggle: switch role, Space, knob position and fill differ, 44 px row", async ({
    page,
  }) => {
    await inject(
      page,
      `<div data-wl-state="plan">${toggle("one", false)}${toggle("two", true)}</div>`,
    );
    const sw = page.getByRole("switch", { name: "Reminders one" });
    await expect(sw).not.toBeChecked();
    const switchBox = (await sw.boundingBox())!;
    expect([switchBox.width, switchBox.height]).toEqual([48, 28]);
    expect((await page.locator("#one").boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const state = async (id: string) => ({
      track: (await css(page, `#${id} input`, ["background-color"]))[0],
      outline: (await css(page, `#${id} input`, ["border-top-color"]))[0],
      knob: (await pseudo(page, `#${id} input`, "::after", ["left", "background-color"])).join("|"),
    });
    const off = await state("one");
    const on = await state("two");
    expect(off.track).toBe(TRANSPARENT);
    expect(off.outline).toBe(rgb(plan["ink-muted"]!));
    expect(off.knob.split("|")[1]).toBe(rgb(plan["ink-muted"]!));
    expect(on.track).toBe(rgb(plan.selected!));
    expect(on.knob.split("|")[1]).toBe(rgb(plan["on-selected"]!));
    expect(on.knob.split("|")[0]).not.toBe(off.knob.split("|")[0]);
    expect(parseFloat(on.knob.split("|")[0]!)).toBeGreaterThan(parseFloat(off.knob.split("|")[0]!));
    expect(contrast(plan.selected!, plan["on-selected"]!)).toBeGreaterThan(8.5);
    await sw.focus();
    await page.keyboard.press("Space");
    await expect(sw).toBeChecked();
    expect((await state("one")).track).toBe(rgb(plan.selected!));
    expect((await state("one")).knob).toBe(on.knob);
    await page.keyboard.press("Space");
    await expect(sw).not.toBeChecked();
  });

  test("AC2 toggle in paper uses paper.action and paper.on-action", async ({ page }) => {
    await inject(
      page,
      `<div data-wl-state="plan"><div class="wl-paper">${toggle("p", true)}</div></div>`,
    );
    expect(await css(page, "#p input", ["background-color"])).toEqual([rgb(paper.action!)]);
    expect((await pseudo(page, "#p input", "::after", ["background-color"]))[0]).toBe(
      rgb(paper["on-action"]!),
    );
    expect(contrast(paper.action!, paper["on-action"]!)).toBeGreaterThan(8.5);
  });

  for (const reduced of [false, true]) {
    test(`AC2 toggle has no transition (reduced motion: ${reduced})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      await inject(page, `<div data-wl-state="plan">${toggle("one", true)}</div>`);
      expect((await css(page, "#one", ["transition-duration"]))[0]).toBe("0s");
      expect((await css(page, "#one input", ["transition-duration"]))[0]).toBe("0s");
      expect((await pseudo(page, "#one input", "::after", ["transition-duration"]))[0]).toBe("0s");
    });
  }

  const ERR_ICON = `<svg class="wl-input__error-icon" id="icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="9"/></svg>`;
  const field = (invalid: boolean) =>
    `<input id="in" class="wl-input" aria-label="Email" ${invalid ? 'aria-invalid="true" aria-describedby="err"' : ""} />
     ${invalid ? `<p id="err" class="wl-input__error">${ERR_ICON}<span>Enter a valid email</span></p>` : ""}`;

  test("AC3 plan input: 1px muted when valid, 2px attention with attention text when invalid", async ({
    page,
  }) => {
    await inject(page, `<div data-wl-state="plan">${field(false)}</div>`);
    expect(await css(page, "#in", ["border-top-width", "border-top-color"])).toEqual([
      "1px",
      rgb(plan["ink-muted"]!),
    ]);
    const box = (await page.locator("#in").boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(contrast(plan.bg!, plan["ink-muted"]!)).toBeGreaterThan(5.8);
    await inject(page, `<div data-wl-state="plan">${field(true)}</div>`);
    expect(
      await css(page, "#in", ["border-top-width", "border-top-style", "border-top-color"]),
    ).toEqual(["2px", "solid", rgb(plan.attention!)]);
    expect((await css(page, "#err", ["color"]))[0]).toBe(rgb(plan.attention!));
    expect(contrast(plan.bg!, plan.attention!)).toBeGreaterThanOrEqual(4.5);
    // The icon is a lift and rest cue: in plan the words carry the error.
    expect((await css(page, "#icon", ["display"]))[0]).toBe("none");
    expect((await css(page, "#in", ["border-radius"]))[0]).toBe(`12px`);
  });

  test("AC3 lift input: 2px ink border, an aria-hidden icon, the words in ink", async ({
    page,
  }) => {
    await inject(page, `<div data-wl-state="lift">${field(false)}</div>`);
    expect(await css(page, "#in", ["border-top-width", "border-top-color"])).toEqual([
      "1px",
      rgb(lift.ink!),
    ]);
    await inject(page, `<div data-wl-state="lift">${field(true)}</div>`);
    expect(await css(page, "#in", ["border-top-width", "border-top-color"])).toEqual([
      "2px",
      rgb(lift.ink!),
    ]);
    await expect(page.locator("#icon")).toHaveAttribute("aria-hidden", "true");
    expect((await css(page, "#icon", ["display"]))[0]).not.toBe("none");
    expect((await css(page, "#err", ["color"]))[0]).toBe(rgb(lift.ink!));
    expect(contrast(lift.bg!, lift.ink!)).toBeGreaterThanOrEqual(4.5);
    await page.getByRole("textbox", { name: "Email" }).fill("x");
    await expect(page.getByRole("textbox", { name: "Email" })).toHaveAccessibleDescription(
      "Enter a valid email",
    );
  });

  test("AC3 rest and paper: ink borders; a plan sheet inside lift hides the icon", async ({
    page,
  }) => {
    await inject(page, `<div data-wl-state="rest">${field(true)}</div>`);
    expect((await css(page, "#in", ["border-top-color"]))[0]).toBe(rgb(group("rest").ink!));
    expect((await css(page, "#icon", ["display"]))[0]).not.toBe("none");
    await inject(
      page,
      `<div data-wl-state="plan"><div class="wl-paper">${field(true)}</div></div>`,
    );
    expect(await css(page, "#in", ["border-top-width", "border-top-color"])).toEqual([
      "2px",
      rgb(paper.ink!),
    ]);
    expect((await css(page, "#err", ["color"]))[0]).toBe(rgb(paper.ink!));
    expect((await css(page, "#icon", ["display"]))[0]).toBe("none");
    await inject(
      page,
      `<div data-wl-state="lift"><div data-wl-state="plan" class="wl-sheet">${field(true)}</div></div>`,
    );
    expect((await css(page, "#in", ["border-top-color"]))[0]).toBe(rgb(plan.attention!));
    expect((await css(page, "#icon", ["display"]))[0]).toBe("none");
  });

  test("AC3 a disabled input stays legible", async ({ page }) => {
    await inject(
      page,
      `<div data-wl-state="plan"><input id="in" class="wl-input" aria-disabled="true" aria-label="Email" value="a@b.c" /></div>`,
    );
    expect((await css(page, "#in", ["color"]))[0]).toBe(rgb(plan["ink-muted"]!));
    expect(contrast(plan.bg!, plan["ink-muted"]!)).toBeGreaterThanOrEqual(4.5);
  });

  const sheetHtml = (inner = "") =>
    `<div id="screen" data-wl-state="lift"><p>Behind</p>
      <div class="wl-sheet-scrim" id="scrim"></div>
      <div id="sheet" class="wl-sheet" data-wl-state="plan" role="dialog" aria-modal="true" aria-label="Swap">
        <div class="wl-sheet__grabber" id="grab" aria-hidden="true"></div>${inner}
        <button id="close" class="wl-button--text">Close</button>
      </div></div>`;

  test("AC4 sheet over lift: plan.bg, 28px top radii, plan scrim at 0.45, lift root kept", async ({
    page,
  }) => {
    await inject(page, sheetHtml());
    expect(await css(page, "#sheet", ["background-color", "color"])).toEqual([
      rgb(plan.bg!),
      rgb(plan.ink!),
    ]);
    expect(
      await css(page, "#sheet", [
        "border-top-left-radius",
        "border-top-right-radius",
        "border-bottom-left-radius",
        "border-bottom-right-radius",
      ]),
    ).toEqual(["28px", "28px", "0px", "0px"]);
    expect((await page.locator("#sheet").boundingBox())!.y).toBe(150);
    expect((await css(page, "#sheet", ["transition-duration"]))[0]).toBe("0s");
    await expect(page.locator("#grab")).toHaveAttribute("aria-hidden", "true");
    const grab = (await page.locator("#grab").boundingBox())!;
    expect([grab.width, grab.height]).toEqual([40, 4]);
    expect((await css(page, "#grab", ["background-color"]))[0]).toBe(rgb(plan.line!));
    await expect(page.locator("#screen")).toHaveAttribute("data-wl-state", "lift");
    // The scrim: plan.scrim at alpha 0.45.
    const scrim = (await css(page, "#scrim", ["background-color"]))[0]!;
    const px = await page.evaluate((c) => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 1;
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data);
    }, scrim);
    const want = [1, 3, 5].map((i) => parseInt(plan.scrim!.slice(i, i + 2), 16));
    for (const [i, v] of want.entries()) expect(Math.abs(px[i]! - v)).toBeLessThanOrEqual(4);
    expect(px[3]! / 255).toBeCloseTo(0.45, 1);
    expect(scrim).toMatch(/0\.45\)$/);
  });

  test("AC4 text inside the sheet over lift is plan ink and the Close control is >= 44 px", async ({
    page,
  }) => {
    await inject(page, sheetHtml(`<p class="wl-type-label" id="cap">Caption</p>`));
    expect((await css(page, "#cap", ["color"]))[0]).toBe(rgb(plan["ink-muted"]!));
    expect(contrast(plan.bg!, plan["ink-muted"]!)).toBeGreaterThan(5.8);
    expect((await css(page, "#close", ["color"]))[0]).toBe(rgb(plan.ink!));
    const close = (await page.locator("#close").boundingBox())!;
    expect(close.height).toBeGreaterThanOrEqual(44);
  });

  test("AC5 paper panel spans x 0 to 390 with paper.bg and paper.ink", async ({ page }) => {
    await inject(
      page,
      `<div data-wl-state="plan"><div class="wl-page"><p>Above</p>
        <div class="wl-paper" id="paper"><p id="t">Check-in</p></div></div></div>`,
    );
    const box = (await page.locator("#paper").boundingBox())!;
    expect([box.x, box.x + box.width]).toEqual([0, 390]);
    expect(
      await css(page, "#paper", ["background-color", "color", "border-top-left-radius"]),
    ).toEqual([rgb(paper.bg!), rgb(paper.ink!), "0px"]);
    expect(contrast(paper.bg!, paper.ink!)).toBeGreaterThan(12.8);
    const [pt, pl] = await css(page, "#paper", ["padding-top", "padding-left"]);
    expect(parseFloat(pt!)).toBeGreaterThanOrEqual(18);
    expect(parseFloat(pt!)).toBeLessThanOrEqual(22);
    expect(pl).toBe(`${28}px`);
  });

  const ICON = `<svg class="wl-excluded-notice__icon" id="ic" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>`;

  test("AC6 excluded-areas notice: plan.raise with plan.ink, surface-2 outside a state", async ({
    page,
  }) => {
    await inject(
      page,
      `<div data-wl-state="plan"><p id="n" class="wl-excluded-notice">${ICON}<span>Not suggested: Quads.</span></p></div>`,
    );
    const [bg, color, radius] = await css(page, "#n", [
      "background-color",
      "color",
      "border-top-left-radius",
    ]);
    expect([bg, color, radius]).toEqual([rgb(plan.raise!), rgb(plan.ink!), "12px"]);
    expect(contrast(plan.raise!, plan.ink!)).toBeGreaterThanOrEqual(4.5);
    expect((await css(page, "#ic", ["color"]))[0]).toBe(rgb(plan.ink!));
    await inject(
      page,
      `<p id="n" class="wl-excluded-notice">${ICON}<span>Not suggested: Quads.</span></p>`,
    );
    expect(await css(page, "#n", ["background-color", "color"])).toEqual([
      rgb(flat["surface-2"]!),
      rgb(flat["text-muted"]!),
    ]);
  });

  test("AC6 offline line reads ink in a state, muted outside, in both variants", async ({
    page,
  }) => {
    const markup = `<span id="t" class="wl-offline-status__text">Offline · not synced yet</span>
       <span id="i" role="img" aria-label="Offline" class="wl-offline-status__icon"></span>`;
    await inject(page, `<div data-wl-state="plan">${markup}</div>`);
    expect((await css(page, "#t", ["color"]))[0]).toBe(rgb(plan.ink!));
    expect((await css(page, "#i", ["background-color"]))[0]).toBe(rgb(plan.ink!));
    await inject(page, `<div data-wl-state="lift">${markup}</div>`);
    expect((await css(page, "#t", ["color"]))[0]).toBe(rgb(lift.ink!));
    await inject(page, markup);
    expect((await css(page, "#t", ["color"]))[0]).toBe(rgb(flat["text-muted"]!));
  });

  test("AC6 account-deleted notice: raise and ink in a state, legacy surface outside", async ({
    page,
  }) => {
    const markup = `<div id="n" role="status" class="wl-account-deleted"><p class="wl-account-deleted__text">Deleted</p>
       <button id="b" class="wl-account-deleted__button" style="min-width:44px;min-height:44px">Dismiss</button></div>`;
    await inject(page, `<div data-wl-state="plan">${markup}</div>`);
    expect(await css(page, "#n", ["background-color", "color", "border-top-left-radius"])).toEqual([
      rgb(plan.raise!),
      rgb(plan.ink!),
      "12px",
    ]);
    expect((await css(page, "#b", ["color"]))[0]).toBe(rgb(plan.ink!));
    await inject(page, markup);
    expect(await css(page, "#n", ["background-color", "border-top-left-radius"])).toEqual([
      rgb(flat.surface!),
      "8px",
    ]);
    expect((await css(page, "#b", ["color"]))[0]).toBe(rgb(flat.accent!));
  });
});
