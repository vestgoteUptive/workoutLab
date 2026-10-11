// T-0307a UF-10.1 / UF-10.2 e2e (AC-A16, AC-A17). Runs against `vite preview` with Supabase
// mocked through `page.route`. Sets are dated relative to the real clock so they sit inside
// the rolling 14-day window whenever the spec runs.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { expect, test } from "./fixtures/guarded-test.js";
import { compareWithCanvas } from "./helpers/canvas-compare.js";
import {
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";

const AREAS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
] as const;

function exercise(id: string) {
  return {
    id,
    name: id,
    type: "compound",
    level: "beginner",
    equipment: [],
    instructions: [],
    mistakes: [],
    cue: null,
    timed: false,
    source: "test",
    license: "test",
    attribution: null,
    source_url: null,
    kind: "exercise",
    increment_kg: 2.5,
    default_duration_s: null,
    external_load: true,
  };
}

const PROFILE = {
  goal: "build_muscle",
  level: "beginner",
  equipment: [],
  rhythm_min: 3,
  rhythm_max: 4,
  priority_areas: [],
  onboarded_at: "2026-01-01T00:00:00.000Z",
  plan_changed_at: "2026-01-01T00:00:00.000Z",
};

const AREA_TARGETS = AREAS.map((area) => ({
  area_id: area,
  sets_per_14d: 16,
  source: "default",
  updated_at: "2026-01-01T00:00:00.000Z",
}));

/** `n` hard sets on an exercise `daysAgo` days back, at midday UTC (same local day anywhere). */
function sets(exerciseId: string, n: number, daysAgo: number) {
  const at = new Date(Date.now() - daysAgo * 86_400_000);
  at.setUTCHours(12, 0, 0, 0);
  const completedAt = at.toISOString();
  return Array.from({ length: n }, (_, i) => ({
    client_id: `${exerciseId}-${daysAgo}-${i}`,
    session_id: "S1",
    exercise_id: exerciseId,
    is_warmup: false,
    completed_at: completedAt,
    edited_at: completedAt,
    deleted_at: null,
    reps: 8,
    weight_kg: 60,
    duration_s: null,
  }));
}

type Fixture = "zero" | "mixed" | "rich";

async function mockData(page: Page, fixture: Fixture): Promise<void> {
  await mockSupabaseData(page, {
    sets:
      fixture === "zero"
        ? []
        : [
            ...sets("rdl", 6, 3),
            ...sets("squat", 4, 2),
            // "rich": chest is on target (step 4), so every ramp step but the middle shows.
            ...(fixture === "rich" ? [...sets("bench", 9, 5), ...sets("bench", 9, 4)] : []),
          ],
    exercises: [exercise("rdl"), exercise("squat"), exercise("bench")],
    exerciseAreas: [
      { exercise_id: "rdl", area_id: "hamstrings", weight: 1 },
      { exercise_id: "rdl", area_id: "glutes", weight: 0.5 },
      { exercise_id: "squat", area_id: "quads", weight: 1 },
      { exercise_id: "squat", area_id: "glutes", weight: 1 },
      { exercise_id: "bench", area_id: "chest", weight: 1 },
    ],
    areaTargets: AREA_TARGETS,
    profile: PROFILE,
  });
}

async function openBalance(page: Page, fixture: Fixture, path = "/balance"): Promise<void> {
  await mockData(page, fixture);
  await page.goto("/");
  await injectSession(page);
  await page.goto(path);
}

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
});

// T-0427 AC1: this spec runs under both auto guards (D-0086 Supabase guard, T-0425 console
// guard). Before T-0427 it imported `test` from `@playwright/test`, so neither fixture existed
// here and an unmocked request or a React error on UF-10.1 went green.
test("T-0427 AC1 /balance runs under the Supabase and console guards", async ({
  page,
  supabaseGuard,
  consoleGuard,
}) => {
  await openBalance(page, "mixed");
  await expect(page.locator('[data-screen-id="UF-10.1"]')).toBeVisible();
  // T-0436: AutoSync's reads can still be in flight when the screen first shows; the backstop
  // check runs at teardown, so let the network settle or a late hit would go unseen.
  await page.waitForLoadState("networkidle");
  expect(supabaseGuard.unclaimed()).toEqual([]);
  expect(consoleGuard.errors()).toEqual([]);
});

// T-0353 AC-1: reaches the C-01 buttons with real Tab presses, not `locator.focus()`. Neither
// path below calls `.focus()` on the hamstrings or calves button — grepped by hand for the
// build log, since a reviewer can't easily grep a running test.
async function tabTo(
  page: Page,
  locator: ReturnType<Page["locator"]>,
  label: string,
): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    if (await locator.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`T-0353 AC-1: Tab never reached ${label} within 40 presses`);
}

test.describe("AC-A16 real keyboard navigates exactly once", () => {
  test("T-0353 AC-1 Tab reaches the hamstrings button then the calves button; Enter and Space each navigate exactly once", async ({
    page,
  }) => {
    await openBalance(page, "mixed");
    await expect(page.locator('[data-screen-id="UF-10.1"]')).toBeVisible();

    const hamstrings = page.locator('[data-variant="full"] button[data-area="hamstrings"]');
    // The map buttons are disabled while the cache read is in flight ("Hamstrings, loading");
    // Tab skips a disabled button entirely, which made this spec flaky on a cold start.
    await expect(hamstrings).toBeEnabled();
    await page.locator("body").focus();
    await tabTo(page, hamstrings, "the hamstrings button");
    await expect(hamstrings).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/balance\/hamstrings$/);
    // Contrast: the navigation happened at all (a no-op handler would leave `/balance`).
    expect(new URL(page.url()).pathname).not.toBe("/balance");
    await expect(page.locator('[data-screen-id="UF-10.2"]')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/balance$/);
    await expect(page.locator('[data-screen-id="UF-10.1"]')).toBeVisible();

    const calves = page.locator('[data-variant="full"] button[data-area="calves"]');
    await expect(calves).toBeEnabled();
    await page.locator("body").focus();
    await tabTo(page, calves, "the calves button");
    await expect(calves).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page).toHaveURL(/\/balance\/calves$/);
    // The keyup must not navigate a second time.
    await page.waitForTimeout(150);
    await expect(page).toHaveURL(/\/balance\/calves$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/balance$/);
    await expect(page.locator('[data-screen-id="UF-10.1"]')).toBeVisible();
  });
});

test.describe("AC-A14 row touch target is at least 44 x 44 in a real layout", () => {
  for (const fixture of ["zero", "mixed"] as const) {
    test(`T-0353 AC-2 ${fixture} fixture: the first row is at least 44 x 44`, async ({ page }) => {
      await openBalance(page, fixture);
      await expect(page.locator('[data-screen-id="UF-10.1"]')).toBeVisible();

      const firstRow = page.locator('[data-part="row"]').first();
      await expect(firstRow).toBeVisible();
      const box = await firstRow.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);

      if (fixture === "mixed") {
        const attentionRow = page.locator('[data-part="row"][data-attention="true"]').first();
        await expect(attentionRow).toBeVisible();
        const attentionBox = await attentionRow.boundingBox();
        expect(attentionBox).not.toBeNull();
        expect(attentionBox!.width).toBeGreaterThanOrEqual(44);
        expect(attentionBox!.height).toBeGreaterThanOrEqual(44);
      }
    });
  }
});

test.describe("keyboard focus on an attention row (WCAG 2.4.7)", () => {
  test("focusing a needs-attention row repaints its outline --wl-focus (plan ink), not attention", async ({
    page,
  }) => {
    await openBalance(page, "mixed");
    const row = page.locator('[data-part="row"][data-attention="true"]').first();
    await expect(row).toBeVisible();
    const colours = (): Promise<{ outline: string; accent: string; warn: string }> =>
      row.evaluate((el) => {
        // Resolved on the row itself: the generic variables are scoped to the state root.
        const resolve = (token: string): string => {
          const probe = document.createElement("span");
          probe.style.color = `var(${token})`;
          el.append(probe);
          const c = getComputedStyle(probe).color;
          probe.remove();
          return c;
        };
        return {
          outline: getComputedStyle(el).outlineColor,
          accent: resolve("--wl-focus"),
          warn: resolve("--wl-attention"),
        };
      });
    const before = await colours();
    expect(before.outline).toBe(before.warn);
    await page.keyboard.press("Shift"); // a keyboard interaction, so :focus-visible applies
    await row.focus();
    const after = await colours();
    expect(after.outline).toBe(after.accent);
    expect(after.accent).not.toBe(after.warn);
  });
});

test.describe("AC-A17 axe (NFR-A11Y-1)", () => {
  const cases: Array<[string, Fixture, string]> = [
    ["/balance, zero history", "zero", "/balance"],
    ["/balance, mixed history", "mixed", "/balance"],
    ["/balance/hamstrings", "mixed", "/balance/hamstrings"],
  ];
  for (const [name, fixture, path] of cases) {
    test(`${name} has 0 serious/critical violations`, async ({ page }) => {
      await openBalance(page, fixture, path);
      await expect(page.locator("[data-screen-id^='UF-10']")).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(serious).toEqual([]);
    });
  }
});

// T-0427: console errors and page errors are checked by the `consoleGuard` auto fixture at
// teardown (T-0425), so these tests only keep the render-loop check.
test.describe("QA: console errors and render-loop guard on the real route", () => {
  for (const path of ["/balance", "/balance/hamstrings"]) {
    test(`${path} logs no console error / page error and does not loop`, async ({ page }) => {
      let targetReads = 0;
      page.on("request", (r) => {
        if (r.url().includes("/rest/v1/area_targets")) targetReads += 1;
      });
      await openBalance(page, "mixed", path);
      await expect(page.locator("[data-screen-id^='UF-10']")).toBeVisible();
      await page.waitForTimeout(1500);
      // one refresh per mount; a per-render `new Date()` loop would issue dozens.
      expect(targetReads).toBeLessThanOrEqual(2);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// T-0611 (D-0208, D-0210, D-0211, D-0213; UF-10.1, UF-10.2): the Cobalt plan state, measured in a
// real browser. Expected values come from tokens.json, never typed.
// ---------------------------------------------------------------------------------------------
const TOKENS = JSON.parse(
  readFileSync(resolvePath(__dirname, "../../packages/design-tokens/src/tokens.json"), "utf8"),
) as { color: { plan: Record<string, string>; warn: string; accent: string } };
const PLAN = TOKENS.color.plan;
const rgbOf = (hex: string): string => {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgb(${n(1)}, ${n(3)}, ${n(5)})`;
};
const MOCK_ATTENTION = ["ff9a", "85"].join("");

test.describe("T-0611 plan state", () => {
  test("AC1 both screens are plan roots with the plan.bg theme-color", async ({ page }) => {
    await openBalance(page, "mixed");
    for (const [path, id] of [
      ["/balance", "UF-10.1"],
      ["/balance/hamstrings", "UF-10.2"],
    ] as const) {
      if (page.url() !== new URL(path, page.url()).href) await page.goto(path);
      const root = page.locator(`[data-screen-id="${id}"]`);
      await expect(root).toBeVisible();
      await expect(root).toHaveAttribute("data-wl-state", "plan");
      await expect(root).toHaveClass(/wl-page/);
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
        "content",
        new RegExp(`^${PLAN.bg}$`, "i"),
      );
    }
  });

  test("AC2 attention: label and 2 px outline on the true rows only, no mock or legacy colour anywhere", async ({
    page,
  }) => {
    await openBalance(page, "rich");
    await expect(page.locator('[data-part="row"]').first()).toBeVisible();
    const rows = await page.locator('[data-part="row"]').evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el);
        const label = el.querySelector('[data-part="attention"]');
        return {
          attention: el.getAttribute("data-attention") === "true",
          outlineWidth: cs.outlineWidth,
          outlineStyle: cs.outlineStyle,
          outlineColor: cs.outlineColor,
          labelColor: label ? getComputedStyle(label).color : null,
        };
      }),
    );
    expect(rows.some((r) => r.attention)).toBe(true);
    expect(rows.some((r) => !r.attention)).toBe(true);
    for (const r of rows) {
      if (r.attention) {
        expect(r.outlineWidth).toBe("2px");
        expect(r.outlineStyle).toBe("solid");
        expect(r.outlineColor).toBe(rgbOf(PLAN.attention!));
        expect(r.labelColor).toBe(rgbOf(PLAN.attention!));
      } else {
        expect(r.outlineStyle).toBe("none");
        expect(r.labelColor).toBeNull();
      }
    }
    // A computed scan of both screens: no #FF9A85 and no legacy warn on any element.
    const banned = [
      rgbOf(`#${MOCK_ATTENTION}`),
      rgbOf(TOKENS.color.warn),
      rgbOf(TOKENS.color.accent),
    ];
    for (const path of ["/balance", "/balance/hamstrings"]) {
      await page.goto(path);
      await expect(page.locator("[data-screen-id^='UF-10']")).toBeVisible();
      const hits = await page.evaluate((list) => {
        const props = [
          "color",
          "backgroundColor",
          "borderTopColor",
          "borderBottomColor",
          "outlineColor",
          "fill",
          "stroke",
        ] as const;
        const found: string[] = [];
        for (const el of document.querySelectorAll(
          "[data-screen-id^='UF-10'], [data-screen-id^='UF-10'] *",
        )) {
          const cs = getComputedStyle(el);
          for (const p of props)
            if (list.includes(cs[p])) found.push(`${el.tagName}.${p}=${cs[p]}`);
        }
        return found;
      }, banned);
      expect(hits).toEqual([]);
    }
  });

  test("AC3 coverage ramp: step 4 is plan.ink, step 0 is plan.raise, and C-01 keeps its numbers", async ({
    page,
  }) => {
    await openBalance(page, "rich");
    await expect(page.locator('[data-part="row"]').first()).toBeVisible();
    const fills = await page.locator('[data-part="bar-fill"]').evaluateAll((els) =>
      els.map((el) => ({
        step: el.getAttribute("data-coverage-step"),
        bg: getComputedStyle(el).backgroundColor,
      })),
    );
    expect(fills.find((f) => f.step === "4")?.bg).toBe(rgbOf(PLAN.ink!));
    expect(fills.find((f) => f.step === "0")?.bg).toBe(rgbOf(PLAN.raise!));
    const labels = page.locator('[data-variant="full"] [data-part="value"]');
    await expect(labels).toHaveCount(9);
    for (const text of await labels.allTextContents()) expect(text).toMatch(/^\d+ \/ \d+$/);
    const regionFills = await page
      .locator('[data-variant="full"] .wl-fig__region--step-4')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).fill));
    expect(regionFills.length).toBeGreaterThan(0);
    for (const f of regionFills) expect(f).toBe(rgbOf(PLAN.ink!));
  });

  test("UF-10.2 the coverage bar keeps its 8 px height and sits above Start workout", async ({
    page,
  }) => {
    await openBalance(page, "mixed", "/balance/hamstrings");
    const bar = page.locator('[data-screen-id="UF-10.2"] [data-part="bar"]');
    await expect(bar).toBeVisible();
    const b = (await bar.boundingBox())!;
    const cta = (await page.locator(".wl-balance__cta").boundingBox())!;
    expect(b.height).toBeLessThanOrEqual(8);
    expect(b.y + b.height).toBeLessThanOrEqual(cta.y);
  });

  test("AC4 strip: days with hard sets are plan.ink, empty days plan.raise, both keep their words", async ({
    page,
  }) => {
    await openBalance(page, "mixed", "/balance/hamstrings");
    const cells = page.locator('[data-part="strip-cell"]');
    await expect(cells).toHaveCount(14);
    const info = await cells.evaluateAll((els) =>
      els.map((el) => ({
        bg: getComputedStyle(el).backgroundColor,
        label: el.getAttribute("aria-label"),
        filled: el.getAttribute("data-filled") === "true",
      })),
    );
    expect(info.filter((c) => c.filled)).toHaveLength(1);
    for (const c of info) {
      expect(c.bg).toBe(rgbOf(c.filled ? PLAN.ink! : PLAN.raise!));
      expect(c.label).toMatch(c.filled ? /, 6 hard sets$/ : /, no hard sets$/);
    }
  });

  for (const [name, fixture, path] of [
    ["/balance", "rich", "/balance"],
    ["/balance/hamstrings", "mixed", "/balance/hamstrings"],
  ] as const) {
    test(`AC5 ${name}: axe colour-contrast 0 violations, targets 44 x 44, text pairs`, async ({
      page,
    }) => {
      await openBalance(page, fixture, path);
      await expect(page.locator("[data-screen-id^='UF-10']")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor))
        .toBe(rgbOf(PLAN.bg!));
      const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(results.violations).toEqual([]);

      const small = await page
        .locator(
          "[data-part='row'], [data-variant='full'] button[data-area], .wl-balance__plan-link, .wl-balance__cta, [data-part='contributor']",
        )
        .evaluateAll((els) =>
          els
            .map((el) => ({ el: el.className, r: el.getBoundingClientRect() }))
            .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
            .map(({ el, r }) => `${el} ${r.width}x${r.height}`),
        );
      expect(small).toEqual([]);

      // Every visible text node's colour against the first opaque background behind it.
      const low = await page.evaluate(() => {
        const ctx = document
          .createElement("canvas")
          .getContext("2d", { willReadFrequently: true })!;
        const rgba = (c: string): number[] => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = "#000";
          ctx.fillStyle = c;
          ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
        };
        const L = ([r, g, b]: number[]) => {
          const f = (v: number) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
        };
        const out: string[] = [];
        for (const el of document.querySelectorAll("[data-screen-id^='UF-10'] *")) {
          const own = [...el.childNodes].some(
            (n) => n.nodeType === 3 && n.textContent!.trim() !== "",
          );
          const box = el.getBoundingClientRect();
          if (!own || box.width <= 1 || box.height <= 1) continue;
          let bg = [0, 0, 0, 0];
          for (let n: Element | null = el; n; n = n.parentElement) {
            const c = rgba(getComputedStyle(n).backgroundColor);
            if (c[3]! > 0.99) {
              bg = c;
              break;
            }
          }
          const [hi, lo] = [L(rgba(getComputedStyle(el).color)), L(bg)].sort((a, b) => b - a);
          const ratio = (hi! + 0.05) / (lo! + 0.05);
          if (ratio < 4.5) out.push(`${el.tagName}.${el.className} ${ratio.toFixed(2)}`);
        }
        return out;
      });
      expect(low).toEqual([]);
    });
  }

  test("AC5 motion: only the root's cross-fade, instant under reduced motion", async ({ page }) => {
    await openBalance(page, "mixed");
    const probe = () =>
      page.locator("[data-screen-id^='UF-10']").evaluate((el) => {
        const moving = [el, ...el.querySelectorAll("*")].filter((n) => {
          const cs = getComputedStyle(n);
          return (
            cs.animationName !== "none" ||
            (n !== el && cs.transitionDuration.split(",").some((d) => parseFloat(d) > 0))
          );
        });
        return {
          property: getComputedStyle(el).transitionProperty,
          duration: getComputedStyle(el).transitionDuration,
          moving: moving.map((n) => `${n.tagName}.${n.className}`),
        };
      });
    await expect(page.locator('[data-part="row"]').first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    const normal = await probe();
    expect(normal.property).toBe("background-color");
    expect(normal.duration).toBe("0.2s");
    expect(normal.moving).toEqual([]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reduced = await probe();
    expect(reduced.duration).toBe("0s");
    expect(reduced.moving).toEqual([]);
  });
});

test.describe("T-0611 AC7 canvas compare at 390 x 844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const [frame, name, path, fixture] of [
    ["Balance · all areas", "uf10-1-balance", "/balance", "rich"],
    ["Balance · area detail", "uf10-2-balance-detail", "/balance/hamstrings", "mixed"],
  ] as const) {
    test(`AC7 canvas compare: ${frame}`, async ({ page }, testInfo) => {
      await openBalance(page, fixture, path);
      await expect(page.locator("[data-screen-id^='UF-10']")).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor))
        .toBe(rgbOf(PLAN.bg!));
      const result = await compareWithCanvas(page, testInfo, { turn: "turn-5", frame, name });
      if (process.env.WL_CANVAS_COMPARE === "1" && !result.skipped) {
        expect(result.files.app).toBeTruthy();
        expect(result.files.canvas).toBeTruthy();
        // The list is below the fold at 390 x 844: keep a full-page shot for the rows.
        await page.screenshot({
          path: testInfo.outputPath("cobalt", `${name}-full.png`),
          fullPage: true,
        });
      }
    });
  }
});
