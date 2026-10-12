// T-0548 UF-11.2 rework part 1 (D-0203 §3, spec UF-11.2.md AC7/AC8): layout on /plan at 390,
// 360, 320 and 1024 px, 44 px targets, and the Balance link. Supabase is mocked as in
// uf-11-plan.spec.ts.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import { PROFILE, UF11_FIXTURES } from "./fixtures/uf-11-plan.js";
import { compareWithCanvas } from "./helpers/canvas-compare.js";

const TILES = 'ul[aria-label="Targets, hard sets per 14 days"] li';

async function open(page: Page, width: number, height: number, path = "/plan"): Promise<void> {
  await page.setViewportSize({ width, height });
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, UF11_FIXTURES);
  await page.goto("/");
  await injectSession(page);
  await page.goto(path);
  await expect(page.locator(path === "/plan" ? TILES : "h1").first()).toBeVisible();
}

const overflowX = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function tops(page: Page): Promise<number[]> {
  return page
    .locator(TILES)
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
}

// T-0612 (D-0208, D-0211): /plan is a plan-state screen, so its title is the state page title
// (Familjen Grotesk 700, 56 px, no uppercase), the gutter is 28 px and the section titles are
// row titles, not uppercase labels.
test("390 x 844: state title, 28 px gutter, section labels and body size", async ({ page }) => {
  await open(page, 390, 844);
  const h1 = await page.locator('[data-screen-id="UF-11.2"] h1').evaluate((el) => {
    const c = getComputedStyle(el);
    return { f: c.fontFamily, w: c.fontWeight, t: c.textTransform, s: parseFloat(c.fontSize) };
  });
  expect(h1.f.startsWith('"Familjen Grotesk"')).toBe(true);
  expect(h1.w).toBe("700");
  expect(h1.t).toBe("none");
  expect(h1.s).toBe(56);
  const pad = await page
    .locator('[data-screen-id="UF-11.2"]')
    .evaluate((el) => [getComputedStyle(el).paddingLeft, getComputedStyle(el).paddingRight]);
  expect(pad).toEqual(["28px", "28px"]);
  for (const name of ["Your plan", "Targets"]) {
    const label = await page.getByRole("heading", { name, exact: true }).evaluate((el) => ({
      s: getComputedStyle(el).fontSize,
      t: getComputedStyle(el).textTransform,
    }));
    expect(label).toEqual({ s: "14px", t: "none" });
  }
  expect(
    await page
      .locator("dd")
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe("17px");
});

// T-0612 AC1: the G-2 gutter pin moves from 20 px to 28 px at 390 deliberately (D-0211 §3); below
// 360 px it stays 20 px. Both roots.
for (const [path, id] of [
  ["/plan", "UF-11.2"],
  ["/plan/edit", "UF-11.3"],
] as const) {
  for (const [width, gutter] of [
    [390, "28px"],
    [340, "20px"],
  ] as const) {
    test(`${path} at ${width} px: data-wl-state=plan and padding-left ${gutter}`, async ({
      page,
    }) => {
      await open(page, width, 844, path);
      const root = page.locator(`[data-screen-id="${id}"]`);
      await expect(root).toHaveAttribute("data-wl-state", "plan");
      expect(await root.evaluate((el) => getComputedStyle(el).paddingLeft)).toBe(gutter);
    });
  }
}

test("360 x 740: nothing overflows and three tiles share a row", async ({ page }) => {
  await open(page, 360, 740);
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
  const right = await page
    .locator('[data-screen-id="UF-11.2"] :is(h1, p, a, li, dd, dt)')
    .evaluateAll((els) => Math.max(...els.map((el) => el.getBoundingClientRect().right)));
  expect(right).toBeLessThanOrEqual(332);
  const t = await tops(page);
  expect(t[0]).toBe(t[1]);
  expect(t[1]).toBe(t[2]);
  expect(t[3]).toBeGreaterThan(t[2]!);
});

test("320 x 640: two tile columns and no horizontal scroll", async ({ page }) => {
  await open(page, 320, 640);
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
  const t = await tops(page);
  expect(t[0]).toBe(t[1]);
  expect(t[2]).toBeGreaterThan(t[1]!);
  const h1 = page.locator('[data-screen-id="UF-11.2"] h1');
  expect(await h1.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test("1024 x 768: the root is at most 640 px and centred", async ({ page }) => {
  await open(page, 1024, 768);
  const box = (await page.locator('[data-screen-id="UF-11.2"]').boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(640);
  expect(Math.abs(box.x - (1024 - box.x - box.width))).toBeLessThanOrEqual(1);
});

test("200% text zoom at 390 px: type doubles and nothing overflows", async ({ page }) => {
  await open(page, 390, 844);
  const before = await page
    .locator("dd")
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  await page.addStyleTag({ content: "html { font-size: 32px }" });
  const after = await page
    .locator("dd")
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(after).toBe(before * 2);
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
});

test("/plan/edit at 360 x 740: 28 px gutter and no overflow", async ({ page }) => {
  await open(page, 360, 740, "/plan/edit");
  const pad = await page
    .locator('[data-screen-id="UF-11.3"]')
    .evaluate((el) => [getComputedStyle(el).paddingLeft, getComputedStyle(el).paddingRight]);
  expect(pad).toEqual(["28px", "28px"]);
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
});

test("every interactive element on /plan is at least 44 px tall", async ({ page }) => {
  await open(page, 390, 844);
  const heights = await page
    .locator('[data-screen-id="UF-11.2"] :is(a, button)')
    .evaluateAll((els) => els.map((el) => [el.textContent, el.getBoundingClientRect().height]));
  expect(heights.length).toBeGreaterThan(3);
  expect(heights.filter(([, h]) => (h as number) < 44)).toEqual([]);
});

test("See this period in Balance opens UF-10.1", async ({ page }) => {
  await open(page, 390, 844);
  await page.getByRole("link", { name: "See this period in Balance" }).click();
  await expect(page).toHaveURL(/\/balance$/);
  await expect(page.locator('[data-screen-id="UF-10.1"]')).toBeVisible();
});

test("screenshot of /plan at 390 px", async ({ page }, testInfo) => {
  await open(page, 390, 844);
  // Review artefact only: written to Playwright's per-test output dir, never a machine path.
  await page.screenshot({ path: testInfo.outputPath("plan-390.png"), fullPage: true });
});

// T-0549 AC7: with a pending check-in and routines, every link and button is at least 44 px tall,
// and exactly one element carries the primary class (Accept).
test("390 x 844: pending check-in and routines, every target is 44 px and Edit plan is the one primary (Accept is the paper action)", async ({
  page,
}) => {
  await open(page, 390, 844);
  await expect(page.getByRole("button", { name: "Accept" })).toBeVisible();
  await expect(page.locator('[data-screen-id="UF-11.2"] h2')).toHaveText([
    "Check-in",
    "Your plan",
    "Targets",
    "Check-ins",
    "Routines",
  ]);
  await expect(page.locator('[data-screen-id="UF-11.2"] .wl-button--primary')).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Edit plan" })).toHaveClass(/wl-button--primary/);
  await expect(page.getByRole("button", { name: "Accept" })).not.toHaveClass(/wl-button--primary/);
  const heights = await page
    .locator('[data-screen-id="UF-11.2"] :is(a, button, [role="button"])')
    .evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => r.height),
    );
  expect(heights.length).toBeGreaterThan(6);
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
});

// ---------------------------------------------------------------------------------------------
// T-0612 (D-0208, D-0210, D-0211, D-0213; UF-11.1, UF-11.2, UF-11.3): the Cobalt plan state,
// measured in a real browser. Expected values come from tokens.json, never typed.
// ---------------------------------------------------------------------------------------------
const TOKENS = JSON.parse(
  readFileSync(resolve(__dirname, "../../packages/design-tokens/src/tokens.json"), "utf8"),
) as { color: { plan: Record<string, string>; paper: Record<string, string> } };
const PLAN = TOKENS.color.plan;
const PAPER = TOKENS.color.paper;
const CARD = '[data-part="checkin-card"]';

function rgbOf(hex: string): string {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgb(${n(1)}, ${n(3)}, ${n(5)})`;
}
const lum = (hex: string): number => {
  const ch = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
};
/** WCAG ratio of two token colours, at one decimal. */
function tokenRatio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.round(((hi! + 0.05) / (lo! + 0.05)) * 10) / 10;
}

/** Fixture F with a priority area (Chest) and, when `pending` is false, a plan set up just now so
 *  no check-in is due (UF-11.1 shows nothing then). */
function cobaltFixtures(pending: boolean) {
  return {
    ...UF11_FIXTURES,
    profile: {
      ...PROFILE,
      priority_areas: ["chest"],
      ...(pending
        ? {}
        : { onboarded_at: new Date().toISOString(), plan_changed_at: new Date().toISOString() }),
    },
  };
}

async function openCobalt(
  page: Page,
  width: number,
  path: "/plan" | "/plan/edit",
  pending = true,
): Promise<void> {
  await page.setViewportSize({ width, height: 844 });
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, cobaltFixtures(pending));
  await page.goto("/");
  await injectSession(page);
  await page.goto(path);
  await expect(page.locator("h1")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor))
    .toBe(rgbOf(PLAN.bg!));
  if (path === "/plan") await expect(page.locator(TILES).first()).toBeVisible();
  if (pending && path === "/plan") await expect(page.locator(CARD)).toBeVisible();
}

test.describe("T-0612 AC2 target tiles (390 x 844)", () => {
  test("tiles are plan.raise with an ink-on-raise label and an ink number; only a priority tile has the outline and the word", async ({
    page,
  }) => {
    await openCobalt(page, 390, "/plan");
    const tiles = page.locator(TILES);
    await expect(tiles).toHaveCount(9);
    const info = await tiles.evaluateAll((els) =>
      els.map((el) => {
        const area = el.querySelector(".wl-plan__tile-area")!;
        const num = el.querySelector(".wl-type-stat")!;
        const cs = getComputedStyle(el);
        return {
          text: el.textContent,
          bg: cs.backgroundColor,
          shadow: cs.boxShadow,
          radius: cs.borderTopLeftRadius,
          label: getComputedStyle(area).color,
          number: getComputedStyle(num).color,
        };
      }),
    );
    for (const t of info) {
      expect(t.bg).toBe(rgbOf(PLAN.raise!));
      expect(t.label).toBe(rgbOf(PLAN["ink-on-raise"]!));
      expect(t.number).toBe(rgbOf(PLAN.ink!));
      expect(t.radius).not.toBe("0px");
    }
    expect(tokenRatio(PLAN["ink-on-raise"]!, PLAN.raise!)).toBeGreaterThanOrEqual(4.9);
    expect(tokenRatio(PLAN.ink!, PLAN.raise!)).toBe(6.2);
    const chest = info.find((t) => t.text!.startsWith("Chest"))!;
    const back = info.find((t) => t.text!.startsWith("Back"))!;
    expect(chest.text).toContain("Priority");
    expect(chest.shadow).toContain(rgbOf(PLAN.ink!));
    expect(chest.shadow).toContain("inset");
    expect(back.text).not.toContain("Priority");
    expect(back.shadow).toBe("none");
  });
});

test.describe("T-0612 AC3 the check-in paper panel (390 x 844)", () => {
  test("pending: paper panel full-bleed after the header, paper ink, Accept on the paper action", async ({
    page,
  }) => {
    await openCobalt(page, 390, "/plan");
    const card = page.locator(CARD);
    await expect(card).toHaveClass(/wl-paper/);
    const got = await card.evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const h1 = document.querySelector("h1")!;
      const accept = [...el.querySelectorAll("button")].find((b) => b.textContent === "Accept")!;
      const a = getComputedStyle(accept);
      return {
        bg: cs.backgroundColor,
        ink: cs.color,
        left: r.left,
        right: r.right,
        header: h1.parentElement!.nextElementSibling === el,
        acceptBg: a.backgroundColor,
        acceptInk: a.color,
        acceptClass: accept.className,
        keepClass: [...el.querySelectorAll("button")].find((b) => b.textContent === "Keep current")!
          .className,
      };
    });
    expect(got.bg).toBe(rgbOf(PAPER.bg!));
    expect(got.ink).toBe(rgbOf(PAPER.ink!));
    expect(got.left).toBe(0);
    expect(got.right).toBe(390);
    expect(got.header).toBe(true);
    expect(got.acceptBg).toBe(rgbOf(PAPER.action!));
    expect(got.acceptInk).toBe(rgbOf(PAPER["on-action"]!));
    expect(got.acceptClass).not.toContain("wl-button--primary");
    expect(got.keepClass).toContain("wl-button--secondary");
    expect(tokenRatio(PAPER.ink!, PAPER.bg!)).toBe(12.9);
    expect(tokenRatio(PAPER["on-action"]!, PAPER.action!)).toBe(8.6);
  });

  test("no pending check-in: no paper panel", async ({ page }) => {
    await openCobalt(page, 390, "/plan", false);
    await expect(page.locator(CARD)).toHaveCount(0);
    await expect(page.locator(".wl-paper")).toHaveCount(0);
  });

  test("keyboard focus on Accept and Keep current shows a 2 px ring in the paper ink", async ({
    page,
  }) => {
    await openCobalt(page, 390, "/plan");
    for (const name of ["Accept", "Keep current"]) {
      const b = page.locator(CARD).getByRole("button", { name });
      await b.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      const o = await b.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { w: cs.outlineWidth, c: cs.outlineColor, s: cs.outlineStyle };
      });
      expect(o, name).toEqual({ w: "2px", c: rgbOf(PAPER.ink!), s: "solid" });
    }
  });
});

test.describe("T-0612 AC4 the links (390 x 844)", () => {
  test("the four links keep their order and none is a primary; Edit plan is the one primary", async ({
    page,
  }) => {
    await openCobalt(page, 390, "/plan");
    const root = page.locator('[data-screen-id="UF-11.2"]');
    const links = [
      "Account and sign out",
      "Favorite exercises",
      "Excluded exercises",
      "See this period in Balance",
    ];
    const tops: number[] = [];
    for (const name of links) {
      const l = root.getByRole("link", { name: new RegExp(`^${name}`) });
      await expect(l).not.toHaveClass(/wl-button--primary/);
      tops.push((await l.boundingBox())!.y);
    }
    // Favorites above Excluded above Balance; the account pill is in the header, above them all.
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    await expect(root.locator(".wl-button--primary")).toHaveCount(1);
    await expect(root.getByRole("link", { name: "Edit plan" })).toHaveClass(/wl-button--primary/);
  });
});

test.describe("T-0612 AC5 contrast, targets, type, motion", () => {
  for (const [path, pending] of [
    ["/plan", true],
    ["/plan", false],
    ["/plan/edit", true],
  ] as const) {
    test(`axe colour-contrast has 0 violations on ${path} ${pending ? "with" : "without"} a pending check-in`, async ({
      page,
    }) => {
      await openCobalt(page, 390, path, pending);
      await page.waitForTimeout(300);
      const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(results.violations.map((v) => v.nodes.map((n) => n.target.join(" ")))).toEqual([]);
    });
  }

  test("every text pair on /plan (with the card) is at least 4.5:1", async ({ page }) => {
    await openCobalt(page, 390, "/plan");
    const pairs = await page.evaluate(() => {
      const parse = (c: string): number[] => (c.match(/[\d.]+/g) ?? []).map(Number);
      const bgOf = (el: Element): number[] => {
        for (let n: Element | null = el; n; n = n.parentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (c.length === 3 || (c.length === 4 && c[3]! > 0)) return c.slice(0, 3);
        }
        return parse(getComputedStyle(document.documentElement).backgroundColor).slice(0, 3);
      };
      const out: { text: string; fg: number[]; bg: number[] }[] = [];
      for (const el of document.querySelector("[data-screen-id]")!.querySelectorAll("*")) {
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        if (el.closest(".wl-plan__sr")) continue;
        out.push({
          text: el.textContent!.trim().slice(0, 30),
          fg: parse(cs.color).slice(0, 3),
          bg: bgOf(el),
        });
      }
      return out;
    });
    const L = (c: number[]) => {
      const f = (v: number) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!);
    };
    expect(pairs.length).toBeGreaterThan(20);
    for (const p of pairs) {
      const [hi, lo] = [L(p.fg), L(p.bg)].sort((x, y) => y - x);
      expect((hi! + 0.05) / (lo! + 0.05), `${p.text} ${p.fg} on ${p.bg}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  for (const path of ["/plan", "/plan/edit"] as const) {
    test(`${path}: every link, button, tile and row is at least 44 x 44`, async ({ page }) => {
      await openCobalt(page, 390, path);
      const boxes = await page
        .locator(`[data-screen-id] :is(a, button, label.wl-option, ${TILES})`)
        .evaluateAll((els) =>
          els
            .map((el) => ({ n: el.textContent, r: el.getBoundingClientRect() }))
            .filter((x) => x.r.width > 0 && x.r.height > 0)
            .map((x) => ({ n: x.n, w: x.r.width, h: x.r.height })),
        );
      expect(boxes.length).toBeGreaterThan(5);
      for (const b of boxes) {
        expect(b.w, `${b.n} w`).toBeGreaterThanOrEqual(44);
        expect(b.h, `${b.n} h`).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test("no px font size and no motion beyond the root cross-fade; instant under reduced motion", async ({
    page,
  }) => {
    await openCobalt(page, 390, "/plan");
    const css = readFileSync(
      resolve(__dirname, "../../apps/web/src/features/UF-11/plan.css"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css.slice(0, css.indexOf(".wl-plan__linkbtn"))).not.toMatch(/font-size:\s*[\d.]+px/);
    const moving = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll("body *")) {
        // The state root (its cross-fade) and the shell's tab bar are not this screen's motion.
        if (el.matches("[data-screen-id], nav.wl-tab-bar")) continue;
        const cs = getComputedStyle(el);
        const d = cs.transitionDuration.split(",").map((x) => parseFloat(x));
        if (
          d.some((x) => x > 0) ||
          (cs.animationName !== "none" && parseFloat(cs.animationDuration) > 0)
        )
          out.push(`${el.tagName.toLowerCase()}.${el.className}`);
      }
      return out;
    });
    expect(moving).toEqual([]);
    const root = (p: Page) =>
      p.evaluate(() => {
        const cs = getComputedStyle(document.querySelector("[data-screen-id]")!);
        return cs.transitionDuration;
      });
    expect(await root(page)).toBe("0.2s");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await root(page)).toBe("0s");
  });
});

test.describe("T-0612 UF-11.3 Edit plan (390 x 844)", () => {
  test("goal options are native radios; Save is the one primary, aria-disabled until a change", async ({
    page,
  }) => {
    await openCobalt(page, 390, "/plan/edit");
    const root = page.locator('[data-screen-id="UF-11.3"]');
    await expect(root.locator("label.wl-option input[type=radio]")).toHaveCount(3);
    await expect(root.locator(".wl-segmented button")).toHaveCount(4);
    // The title's full stop is drawn in CSS (the h1 stays bare for the shell's route test).
    expect(
      await root.locator("h1").evaluate((el) => getComputedStyle(el, "::after").content),
    ).toContain(".");
    const save = root.getByRole("button", { name: "Save" });
    await expect(save).toHaveClass(/wl-button--primary/);
    await expect(save).toHaveAttribute("aria-disabled", "true");
    await expect(root.locator(".wl-button--primary")).toHaveCount(1);
    await root.getByRole("radio", { name: "Get stronger" }).check({ force: true });
    await expect(save).toHaveAttribute("aria-disabled", "false");
    // The checked option is a selected block (plan.selected) with the on-colour.
    const sel = await root.locator("label.wl-option:has(input:checked)").evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      c: getComputedStyle(el).color,
    }));
    expect(sel).toEqual({ bg: rgbOf(PLAN.selected!), c: rgbOf(PLAN["on-selected"]!) });
  });
});

test.describe("T-0612 AC7 canvas compare (390 x 844)", () => {
  const run = async (
    page: Page,
    testInfo: Parameters<typeof compareWithCanvas>[1],
    frame: "Plan · full scroll" | "Today · check-in pending",
    name: string,
  ) => {
    const result = await compareWithCanvas(page, testInfo, { turn: "turn-5", frame, name });
    if (process.env.WL_CANVAS_COMPARE === "1" && !result.skipped) {
      expect(result.files.app).toBeTruthy();
      expect(result.files.canvas).toBeTruthy();
      // The scrolled sections, in 844 px slices.
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 844, i = 1; y < total; y += 844, i++) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.screenshot({ path: testInfo.outputPath("cobalt", `${name}-slice-${i}.png`) });
      }
    }
  };

  test("Plan · full scroll (turn-5)", async ({ page }, testInfo) => {
    await openCobalt(page, 390, "/plan");
    await run(page, testInfo, "Plan · full scroll", "uf11-2-plan");
  });

  test("/plan/edit app-only shot", async ({ page }, testInfo) => {
    await openCobalt(page, 390, "/plan/edit");
    if (process.env.WL_CANVAS_COMPARE === "1") {
      await page.screenshot({
        path: testInfo.outputPath("cobalt", "uf11-3-edit-plan.png"),
        fullPage: true,
      });
    }
  });
});
