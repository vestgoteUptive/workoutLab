// T-0594 (D-0210 §4, D-0211): the Cobalt tab bar, SessionProgress and the drain. Expected colours
// are read from tokens.json, never typed. The drain and SessionProgress have no screen yet, so
// they are proven on fixtures injected into the real app (their CSS ships with the tab bar sheet).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  injectSession,
  mockProfilePresent,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseEmptyReads,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import {
  exerciseAreas,
  exerciseVariants,
  exercises,
  profile,
} from "./fixtures/uf-04-library-data.js";

type Colours = Record<string, string>;
const tokens = JSON.parse(
  readFileSync(resolve(__dirname, "../../packages/design-tokens/src/tokens.json"), "utf8"),
) as { color: Record<string, Colours> };
const plan = tokens.color.plan!;
const lift = tokens.color.lift!;
const rest = tokens.color.rest!;

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

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseEmptyReads(page);
  await mockProfilePresent(page);
});

async function openApp(page: Page, path: string): Promise<void> {
  await mockSupabaseData(page, {
    sets: [],
    exercises,
    exerciseAreas,
    exerciseVariants,
    areaTargets: [],
    profile,
  });
  await page.goto("/");
  await injectSession(page);
  await page.goto(path);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
}

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

test.describe("AC1 tab bar look", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("plan background and line, active white and underlined, inactive muted, text only, 44 px", async ({
    page,
  }) => {
    await openApp(page, "/");
    const nav = "nav.wl-tab-bar";
    expect(await page.locator(nav).getAttribute("data-wl-state")).toBe("plan");
    const [bg, topColour, topWidth] = await css(page, nav, [
      "background-color",
      "border-top-color",
      "border-top-width",
    ]);
    expect(bg).toBe(rgb(plan.bg!));
    expect(topColour).toBe(rgb(plan.line!));
    expect(topWidth).toBe("1px");

    const active = page.locator('.wl-tab-bar__link[aria-current="page"]');
    await expect(active).toHaveCount(1);
    const [aColour, aDeco, aWeight, aSize] = await active.evaluate((el) => {
      const cs = getComputedStyle(el);
      return [cs.color, cs.textDecorationLine, cs.fontWeight, cs.fontSize];
    });
    expect(aColour).toBe(rgb(plan.ink!));
    expect(aDeco).toBe("underline");
    expect(aWeight).toBe("600");
    expect(aSize).toBe("14px");
    // Contrast in each state (T-0592 review): active ink and inactive ink-muted on plan.bg.
    expect(contrast(plan.ink!, plan.bg!)).toBeGreaterThanOrEqual(8.6);
    expect(Math.round(contrast(plan["ink-muted"]!, plan.bg!) * 10) / 10).toBeGreaterThanOrEqual(
      5.9,
    );

    const inactive = page.locator('.wl-tab-bar__link:not([aria-current="page"])');
    await expect(inactive).toHaveCount(3);
    for (const link of await inactive.all()) {
      const [c, deco] = await link.evaluate((el) => {
        const cs = getComputedStyle(el);
        return [cs.color, cs.textDecorationLine];
      });
      expect(c).toBe(rgb(plan["ink-muted"]!));
      expect(deco).toBe("none");
    }

    for (const link of await page.locator(".wl-tab-bar__link").all()) {
      expect(await link.locator("svg").count()).toBe(0);
      const box = (await link.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("hover and focus keep each tab legible (no colour change off the plan pair)", async ({
    page,
  }) => {
    await openApp(page, "/");
    const link = page.locator('.wl-tab-bar__link:not([aria-current="page"])').first();
    await link.hover();
    expect((await css(page, ".wl-tab-bar__link:hover", ["color"]))[0]).toBe(
      rgb(plan["ink-muted"]!),
    );
    await page.locator('.wl-tab-bar__link[aria-current="page"]').hover();
    expect((await css(page, ".wl-tab-bar__link:hover", ["color"]))[0]).toBe(rgb(plan.ink!));
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? getComputedStyle(el).outlineColor : "";
    });
    expect(focused).not.toBe("");
  });

  test("the bar is the height of its spacer", async ({ page }) => {
    await openApp(page, "/");
    const [bar, spacer] = await page.evaluate(() => [
      document.querySelector("nav.wl-tab-bar")!.getBoundingClientRect().height,
      document.querySelector(".wl-tab-bar__spacer")!.getBoundingClientRect().height,
    ]);
    expect(bar).toBe(spacer);
  });
});

const PROGRESS = (counter = "Exercise 3 of 12") => `
  <div data-wl-state="lift" id="host" style="padding:16px;inline-size:100%;box-sizing:border-box">
    <div class="wl-session-progress" id="sp">
      <button type="button" class="wl-session-progress__pause" id="pause" aria-label="Pause"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"></svg></button>
      <div class="wl-session-progress__segments" aria-hidden="true">
        <span class="wl-session-progress__segment wl-session-progress__segment--done" id="on"></span>
        <span class="wl-session-progress__segment" id="off"></span></div>
      <span class="wl-session-progress__counter" id="counter">${counter}</span>
    </div></div>`;

test.describe("AC3 SessionProgress layout", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("at 320 px the counter is one line and the pause is 44 px round", async ({ page }) => {
    await openApp(page, "/");
    await inject(page, PROGRESS());
    const m = await page.evaluate(() => {
      const c = document.getElementById("counter")!;
      const cs = getComputedStyle(c);
      const probe = document.createElement("span");
      probe.textContent = "x";
      probe.style.cssText = `font:${cs.font};white-space:nowrap;position:absolute`;
      document.body.appendChild(probe);
      const line = probe.getBoundingClientRect().height;
      probe.remove();
      const r = c.getBoundingClientRect();
      const p = document.getElementById("pause")!.getBoundingClientRect();
      return {
        h: r.height,
        line,
        w: p.width,
        ph: p.height,
        doc: document.documentElement.scrollWidth,
      };
    });
    expect(m.h).toBeCloseTo(m.line, 0);
    expect([m.w, m.ph]).toEqual([44, 44]);
    expect(m.doc).toBeLessThanOrEqual(320);
  });

  test("segment colours and legible counter in the lift state", async ({ page }) => {
    await openApp(page, "/");
    await inject(page, PROGRESS());
    expect((await css(page, "#on", ["background-color"]))[0]).toBe(rgb(lift.ink!));
    expect((await css(page, "#off", ["background-color"]))[0]).toBe(rgb(lift["progress-off"]!));
    expect((await css(page, "#counter", ["color"]))[0]).toBe(rgb(lift.ink!));
    const [pauseColour, pauseWidth] = await css(page, "#pause", [
      "border-top-color",
      "border-top-width",
    ]);
    expect(pauseColour).toBe(rgb(lift.ink!));
    // CSS says 1.5px; Chromium snaps a border to whole device pixels (1px at DPR 1).
    expect(["1px", "1.5px"]).toContain(pauseWidth);
    expect(contrast(lift.ink!, lift.bg!)).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe("AC5 drain motion and paint", () => {
  test.use({ viewport: { width: 200, height: 200 } });
  const DRAIN = (pct: number, extra = "") =>
    `<div id="d" class="wl-drain ${extra}" style="--wl-drain:${pct}%;position:fixed;inset:0;z-index:50"></div>`;

  for (const [reduced, want] of [
    [false, "1s"],
    [true, "0s"],
  ] as const) {
    test(`transition-duration is ${want} (reduced motion: ${reduced})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      await openApp(page, "/");
      await inject(page, DRAIN(50));
      expect((await css(page, "#d", ["transition-duration"]))[0]).toBe(want);
    });
  }

  async function pixels(page: Page): Promise<[string, string]> {
    // The property transitions; reduced motion makes the value land at once.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const png = await page.screenshot();
    return page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const cv = document.createElement("canvas");
      cv.width = img.width;
      cv.height = img.height;
      const g = cv.getContext("2d")!;
      g.drawImage(img, 0, 0);
      const px = (y: number) => {
        const d = g.getImageData(Math.floor(img.width / 2), y, 1, 1).data;
        return `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
      };
      return [px(0), px(img.height - 1)] as [string, string];
    }, png.toString("base64"));
  }

  const cases = [
    { pct: 100, top: lift.bg!, bottom: lift.bg! },
    { pct: 0, top: rest.bg!, bottom: rest.bg! },
    { pct: 50, top: rest.bg!, bottom: lift.bg! },
  ];
  for (const c of cases) {
    test(`at ${c.pct}% the top and bottom pixels paint`, async ({ page }) => {
      await openApp(page, "/");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await inject(page, DRAIN(c.pct));
      const [top, bottom] = await pixels(page);
      expect(top).toBe(rgb(c.top));
      expect(bottom).toBe(rgb(c.bottom));
    });
  }

  test("the deep variant paints lift.bg-deep above lift.bg", async ({ page }) => {
    await openApp(page, "/");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await inject(page, DRAIN(50, "wl-drain--deep"));
    const [top, bottom] = await pixels(page);
    expect(top).toBe(rgb(lift.bg!));
    expect(bottom).toBe(rgb(lift["bg-deep"]!));
  });
});
