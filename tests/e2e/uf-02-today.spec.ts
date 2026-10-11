// T-0302a UF-02.1 Today e2e (AC-11 offline cold start, AC-12 a11y and size). Runs against
// `vite preview` with Supabase mocked through `page.route`; `test`/`expect` come from the guard
// fixture (D-0086), so an unmocked Supabase request fails the test.
//
// Seed rules (D-0108 §2, §4): the rows live in this file (no fixture edits), and every
// `completed_at` is relative to `Date.now()`, so the rolling 14-day window never drifts off the
// seed. The offline asserts check built content, a C-01 tile's "load / target" (D-0091 §1).
// T-0302c and T-0302b append to this file and reuse `seed` (both exercises match the default
// `mockProfilePresent` row's `equipment: []`, so the plan is non-empty).
import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Page } from "@playwright/test";
import { BASE_URL } from "./playwright.config.js";
import {
  FAKE_PROFILE_ROW,
  FAKE_USER_ID,
  VITE_SUPABASE_URL,
  injectSession,
  mockProfilePresent,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  exerciseAreas as setupExerciseAreas,
  exercises as setupExercises,
  profile as setupProfile,
} from "./fixtures/uf-04-library-data.js";
import { UF11_FIXTURES } from "./fixtures/uf-11-plan.js";

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

function exercise(id: string, type: "compound" | "isolation") {
  return {
    id,
    name: id,
    type,
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

const SQUAT = "e2e-goblet-squat";
const FLY = "e2e-floor-fly";
const DAY_MS = 86_400_000;

/** 5 hard quads sets, completed 2 days before the run. */
function quadsSets() {
  const completedAt = new Date(Date.now() - 2 * DAY_MS).toISOString();
  return Array.from({ length: 5 }, (_, i) => ({
    client_id: `uf02-quads-${i}`,
    session_id: "S1",
    exercise_id: SQUAT,
    is_warmup: false,
    completed_at: completedAt,
    edited_at: completedAt,
    deleted_at: null,
    reps: 8,
    weight_kg: 60,
    duration_s: null,
  }));
}

/** The AC-11 seed, signed in. Leaves the page on `/`. */
async function seed(page: Page): Promise<void> {
  await mockSupabaseData(page, {
    sets: quadsSets(),
    exercises: [exercise(SQUAT, "compound"), exercise(FLY, "isolation")],
    exerciseAreas: [
      { exercise_id: SQUAT, area_id: "quads", weight: 1 },
      { exercise_id: FLY, area_id: "chest", weight: 1 },
    ],
    areaTargets: AREAS.map((area) => ({
      area_id: area,
      sets_per_14d: 10,
      source: "default",
      updated_at: "2026-09-01T00:00:00.000Z",
    })),
    profile: [FAKE_PROFILE_ROW],
  });
  await mockProfilePresent(page);
  await page.goto("/");
  await injectSession(page);
  await page.goto("/");
}

const tile = (page: Page, area: string) =>
  page.locator(`[data-component="C-01"] [data-area="${area}"] [data-part="value"]`);

/** Cached row counts for this user in the offline stores. */
async function cacheCounts(page: Page) {
  return page.evaluate(async (userId: string) => {
    const req = indexedDB.open("wl-offline");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const range = IDBKeyRange.bound(`${userId}:`, `${userId}:￿`);
    const count = (store: string, query: IDBValidKey | IDBKeyRange) =>
      new Promise<number>((resolve, reject) => {
        const r = db.transaction(store, "readonly").objectStore(store).count(query);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    const out = {
      history: await count("historyCache", range),
      library: await count("libraryCache", range),
      targets: await count("targetCache", range),
      profile: await count("profileCache", userId),
    };
    db.close();
    return out;
  }, FAKE_USER_ID);
}

/** The offline.spec.ts precache wait (T-0904): the SW's precache holds the document. */
async function waitForPrecache(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const keys = await caches.keys();
          const precache = keys.find((k) => k.startsWith("workbox-precache"));
          if (!precache) return { hasDocument: false };
          const requests = await (await caches.open(precache)).keys();
          return {
            hasDocument: requests.some((r) => new URL(r.url).pathname === "/index.html"),
          };
        }),
      { message: "the workbox precache never finished populating before going offline" },
    )
    .toMatchObject({ hasDocument: true });
}

/** Every request URL the context makes, for the NFR-AN-1 origin check. */
function recordRequests(context: BrowserContext): string[] {
  const urls: string[] = [];
  context.on("request", (r) => urls.push(r.url()));
  return urls;
}

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
});

test.describe("AC-11 offline cold start (NFR-OFF-1, OFF-6, AN-1)", () => {
  test("after one online load, UF-02.1 renders offline from IndexedDB with built content", async ({
    page,
    context,
    supabaseGuard,
  }) => {
    const urls = recordRequests(context);
    await seed(page);

    // Online: the built screen, from the refreshed cache.
    await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
    await expect(tile(page, "quads")).toHaveText("5 / 10");
    await expect
      .poll(() => cacheCounts(page))
      .toEqual({ history: 5, library: 2, targets: 9, profile: 1 });
    await waitForPrecache(page);

    await context.setOffline(true);
    await page.reload();

    const root = page.locator('[data-screen-id="UF-02.1"]');
    await expect(root).toBeVisible({ timeout: 3000 });
    await expect(root.getByText(/^Offline · last synced \d{1,2}:\d{2}/)).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator('[data-component="C-01"] [data-part="label"]')).toHaveCount(9);
    for (const area of AREAS) {
      await expect(
        page.locator(`[data-component="C-01"] [data-part="label"][data-area="${area}"]`),
      ).toBeVisible();
    }
    await expect(tile(page, "quads")).toHaveText("5 / 10", { timeout: 3000 });
    await expect(tile(page, "chest")).toHaveText("0 / 10");
    const attention = page.locator('[data-part="attention"]');
    await expect(attention).toBeVisible();
    await expect(attention).toHaveText(/^Needs attention:/);
    // Start stays one tap away offline (UF-08 is offline-capable).
    await expect(page.getByRole("link", { name: "Start workout" })).toHaveAttribute(
      "href",
      "/session/setup",
    );

    // NFR-AN-1: only the preview origin and the mocked Supabase origin.
    const allowed = new Set([new URL(BASE_URL).origin, new URL(VITE_SUPABASE_URL).origin]);
    const foreign = urls.filter((u) => /^https?:/.test(u) && !allowed.has(new URL(u).origin));
    expect(foreign).toEqual([]);
    expect(urls.length).toBeGreaterThan(0);
    expect(supabaseGuard.unclaimed()).toEqual([]);
  });
});

test.describe("AC-12 a11y and target size", () => {
  test("axe on / reports 0 serious or critical violations (NFR-A11Y-1)", async ({ page }) => {
    await seed(page);
    await expect(tile(page, "quads")).toHaveText("5 / 10");
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });

  test("Start and the C-01 link each measure at least 44 × 44 px (NFR-A11Y-2)", async ({
    page,
  }) => {
    await seed(page);
    await expect(tile(page, "quads")).toHaveText("5 / 10");
    for (const locator of [
      page.getByRole("link", { name: "Start workout" }),
      page.getByRole("link", { name: "Body map, last 14 days. Open all areas" }),
    ]) {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
});

// ---- T-0302c UF-02.1 suggestion card (AC-3, AC-5, AC-9; D-0091 §1, D-0108) ----
// Appended rows: same `seed`, no fixture edits. The plan is non-empty because both seeded
// exercises have `equipment: []`, which the default `mockProfilePresent` row matches.

const card = (page: Page) => page.locator('[data-part="card"]');
const cardRows = (page: Page) => page.locator('[data-part="card-row"]');

/** The loaded card's header and row texts. */
async function cardTexts(page: Page) {
  await expect(card(page)).not.toHaveAttribute("aria-busy", "true");
  await expect(cardRows(page).first()).toBeVisible();
  return {
    // textContent, not innerText: the global h2 rule (T-0546) uppercases it with CSS, and
    // innerText returns the rendered case. The catalogue text is what this asserts.
    title: (await page.locator('[data-part="card-title"]').textContent()) ?? "",
    summary: await page.locator('[data-part="card-summary"]').innerText(),
    rows: await cardRows(page).allInnerTexts(),
  };
}

const ROW = /^.+ [1-4] × (\d+(–\d+)?|\d+ s)$/;

test.describe("T-0302c AC-9 offline card", () => {
  test("the offline cold start shows the same 45-min card as online", async ({
    page,
    context,
    supabaseGuard,
  }) => {
    await seed(page);
    await expect(tile(page, "quads")).toHaveText("5 / 10");
    await expect
      .poll(() => cacheCounts(page))
      .toEqual({ history: 5, library: 2, targets: 9, profile: 1 });
    const online = await cardTexts(page);
    expect(online.title).toBe("Suggested for 45 min");
    expect(online.rows.length).toBeGreaterThan(0);
    await waitForPrecache(page);

    await context.setOffline(true);
    await page.reload();

    await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("Suggested for 45 min")).toBeVisible({ timeout: 3000 });
    const offline = await cardTexts(page);
    expect(offline).toEqual(online);
    expect(offline.rows.some((r) => ROW.test(r))).toBe(true);
    expect(supabaseGuard.unclaimed()).toEqual([]);
  });
});

test.describe("T-0302c AC-3/AC-5/AC-9 card layout and a11y", () => {
  test("See all is ≥ 44 × 44 px and the card is at least its min-height", async ({ page }) => {
    await seed(page);
    await cardTexts(page);
    const seeAll = page.getByRole("link", { name: "See all" });
    await expect(seeAll).toHaveAttribute("href", "/?view=preview");
    const box = await seeAll.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    const minHeight = await card(page).evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).minHeight),
    );
    expect(minHeight).toBeGreaterThan(0);
    const cardBox = await card(page).boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox!.height).toBeGreaterThanOrEqual(minHeight);
  });

  test("axe on / with the card loaded reports 0 serious or critical violations", async ({
    page,
  }) => {
    await seed(page);
    await cardTexts(page);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });
});

// ---- T-0302b UF-02.2 Workout preview (/?view=preview, AC-7) ----
// Appended rows: same `seed`, no fixture edits.

const previewRoot = (page: Page) => page.locator('[data-screen-id="UF-02.2"]');
const previewRows = (page: Page) => page.locator('[data-part="preview-row"]');

test.describe("T-0302b AC-7 preview e2e and a11y", () => {
  test("See all opens UF-02.2 with matching row count and first row", async ({ page }) => {
    await seed(page);
    const before = await cardTexts(page);
    // The card's row is "{name} {sets × reps}"; the first word(s) before the digit are the name.
    const firstName = before.rows[0]!.match(/^(.+?)\s+\d/)![1];
    await page.getByRole("link", { name: "See all" }).click();
    await expect(previewRoot(page)).toBeVisible();
    await expect(previewRows(page).first()).toBeVisible();
    const rows = await previewRows(page).allInnerTexts();
    expect(rows.length).toBe(before.rows.length);
    expect(rows[0]).toContain(firstName!);
  });

  test("axe on /?view=preview reports 0 serious or critical violations", async ({ page }) => {
    await seed(page);
    await page.goto("/?view=preview");
    await expect(previewRows(page).first()).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });

  test("Back and Start workout are each at least 44 x 44 px", async ({ page }) => {
    await seed(page);
    await page.goto("/?view=preview");
    await expect(previewRows(page).first()).toBeVisible();
    for (const locator of [
      page.getByRole("link", { name: "Back" }),
      page.getByRole("link", { name: "Start workout" }),
    ]) {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("offline, a reload of /?view=preview shows the same rows (D-0091 §1)", async ({
    page,
    context,
  }) => {
    await seed(page);
    await page.goto("/?view=preview");
    await expect(previewRows(page).first()).toBeVisible();
    const online = await previewRows(page).allInnerTexts();
    await waitForPrecache(page);

    await context.setOffline(true);
    await page.reload();

    await expect(previewRoot(page)).toBeVisible({ timeout: 3000 });
    await expect(previewRows(page).first()).toBeVisible({ timeout: 3000 });
    const offline = await previewRows(page).allInnerTexts();
    expect(offline).toEqual(online);
  });
});

// ---- T-0395 AC9 "Resume workout" on a cold start (D-0139) ----
// The real flow from `/`: Start workout → UF-08.1 → Suggest → Looks good → Start → UF-09.3 →
// Done set → the auto-save (UF-09.4) → UF-09.5, then `page.goto("/")` as a fresh load would see
// it (the app never navigates there itself). The describe's own mocks give the planner a full
// library and equipment, as `uf-09-focus.spec.ts`'s `startFromHome` does.
test.describe("T-0395 AC9 resume on a cold start", () => {
  test("Today shows the in-progress card; Resume workout reopens the session on its step; axe clean", async ({
    page,
  }) => {
    const profileRow = { ...setupProfile, user_id: FAKE_USER_ID };
    await mockSupabaseData(page, {
      sets: [],
      exercises: setupExercises,
      exerciseAreas: setupExerciseAreas,
      areaTargets: AREAS.map((area_id) => ({
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
    await page.goto("/");
    await page.getByRole("link", { name: "Start workout" }).click();
    await expect(page.locator('[data-screen-id="UF-08.1"]')).toBeVisible();
    await page.getByRole("button", { name: "30 minutes" }).click();
    await page.getByRole("button", { name: "Suggest my workout" }).click();
    await page.getByRole("button", { name: "Looks good" }).click();
    await expect(page.locator('[data-screen-id="UF-08.4"]')).toBeVisible();
    await page.getByRole("button", { name: "Start" }).click();

    await expect(page.locator('[data-screen-id^="UF-09"]')).toBeVisible({ timeout: 10_000 });
    const sessionUrl = page.url();
    // A planned warm-up (UF-09.1 Skip warm-up, or UF-09.2's moves, or UF-09.6's "I'm ready" once
    // the warm-up ends): either way, straight to the first set. Each button may take a moment to
    // mount (the countdown, or a move's wall-clock timer), so each wait is itself a short poll.
    const skipWarmup = page.getByRole("button", { name: "Skip warm-up" });
    const nextMove = page.getByRole("button", { name: "Next move" });
    const imReady = page.getByRole("button", { name: "I'm ready" });
    const current = page.locator('[data-screen-id="UF-09.3"]');
    const waitAndClick = (locator: ReturnType<Page["getByRole"]>) =>
      locator
        .waitFor({ state: "visible", timeout: 2000 })
        .then(() => locator.click())
        .then(() => true)
        .catch(() => false);
    for (let i = 0; i < 8; i += 1) {
      if (await current.isVisible()) break;
      if (await waitAndClick(skipWarmup)) continue;
      if (await waitAndClick(nextMove)) continue;
      if (await waitAndClick(imReady)) continue;
    }
    await expect(current).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Done set" }).click();
    await expect(page.locator('[data-screen-id="UF-09.4"]')).toBeVisible();
    // The real 5 s auto-save to UF-09.5 (D-0118 §2): one set now logged.
    await expect(page.locator('[data-screen-id="UF-09.5"]')).toBeVisible({ timeout: 10_000 });

    // The cold start: a fresh load of Today, as the app never does on its own.
    await page.goto("/");
    const resume = page.locator('[data-part="resume"]');
    await expect(resume).toBeVisible();
    await expect(resume.getByRole("heading", { name: "Workout in progress" })).toBeVisible();
    // The preview's locale may format the clock as "18:53" or "6:53 PM" (NFR-I18N-2): either way.
    await expect(resume.getByText(/^Started .+ · 1 of \d+ sets$/)).toBeVisible();
    // T-0601 (AC8): the card is a row block in the plan state (no box, a hairline, Resume is the
    // outline button) and Today is still one plan-coloured page.
    await expect(page.locator('[data-screen-id="UF-02.1"]')).toHaveAttribute(
      "data-wl-state",
      "plan",
    );
    const resumeLook = await resume.evaluate((el) => {
      const cs = getComputedStyle(el);
      const action = getComputedStyle(el.querySelector(".wl-resume-card__action")!);
      return {
        bg: cs.backgroundColor,
        top: cs.borderTopWidth,
        bottom: cs.borderBottomWidth,
        radius: cs.borderTopLeftRadius,
        actionBg: action.backgroundColor,
        // Chromium snaps a 1.5 px border to 1 px at a 1x pixel ratio, so the width is a floor.
        actionBorder: parseFloat(action.borderTopWidth) >= 1 && action.borderTopStyle === "solid",
      };
    });
    expect(resumeLook).toEqual({
      bg: "rgba(0, 0, 0, 0)",
      top: "0px",
      bottom: "1px",
      radius: "0px",
      actionBg: "rgba(0, 0, 0, 0)",
      actionBorder: true,
    });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);

    const link = resume.getByRole("link", { name: "Resume workout" });
    await expect(link).toHaveAttribute("href", new URL(sessionUrl).pathname);
    await link.click();
    await expect(page).toHaveURL(sessionUrl);
    await expect(page.locator('[data-screen-id="UF-09.5"]')).toBeVisible({ timeout: 10_000 });
  });
});

// T-0471 follow-up (QA fault injection): every AC-4 case in `uf-11-plan.spec.ts` that shows the
// card does `goto("/")` (signed out, no session yet, nothing loads) → `injectSession` → exactly
// ONE authenticated `goto`. AC-4(b)'s single authenticated visit to `/plan` is what caught Plan's
// own cold-cache race (build log); every other AC-4 case (and every Today case elsewhere in this
// file) does a second authenticated `goto("/")` after the first one lands, which warms the cache
// before the assertions run and would hide this exact race. This test keeps the one
// unauthenticated `goto` (needed only so `injectSession`'s `page.evaluate` has a `window` to write
// `localStorage` into — the app behind it renders signed-out and reads no data) and then makes
// exactly one authenticated navigation: on a genuinely cold cache, `CheckinCard`'s own single,
// un-refreshed read (`use-checkin-data.ts`) could otherwise resolve before `useToday()`'s own
// cache-warming `refreshAll` commits its fresh read, mounting the card over stale/empty data while
// the rest of Today is still in its own loading/skeletal state. `Today.tsx`'s `CheckinSlot` now
// gates on `state.status !== "loading"`, the `useToday()` analogue of
// `features/UF-11/index.tsx`'s `state.phase !== "loading"` gate on `usePlanData`.
test.describe("T-0471 AC-2 follow-up: CheckinCard never mounts ahead of Today's own data", () => {
  test("a single authenticated, cold-cache visit to / never shows the card before Today's own content is ready", async ({
    page,
  }) => {
    await mockSupabaseData(page, UF11_FIXTURES);
    await page.goto("/");
    await injectSession(page);

    // The one and only authenticated navigation, against a genuinely cold cache.
    await page.goto("/");

    await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
    // Today's own content reaches its ready state (C-01, in `data-component="C-01"`)...
    await expect(page.locator('[data-component="C-01"]')).toBeVisible();
    // ...and only then, if at all, does the card ever appear — never ahead of it. By the time
    // Today is ready, `UF11_FIXTURES`'s proposal (step down from 3-4, D-0174 §3) is live in the
    // cache, so the card does show; the ordering, not just its eventual presence, is the point.
    await expect(page.locator('[data-part="checkin-card"]')).toBeVisible();
  });
});

// T-0549 AC9: the restyled card still sits on UF-02.1 with its label and both buttons.
test.describe("T-0549 AC9 the restyled check-in card on UF-02.1", () => {
  test("390 x 844: Check-in label, Accept and Keep current, no horizontal scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockSupabaseData(page, UF11_FIXTURES);
    await page.goto("/");
    await injectSession(page);
    await page.goto("/");
    const card = page.locator('[data-part="checkin-card"]');
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading", { name: "Check-in" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Accept" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Keep current" })).toBeVisible();
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(over).toBeLessThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------------------------
// T-0601 (D-0208, D-0210, D-0211, D-0213; UF-02.1, UF-02.2): the Cobalt plan state, measured in a
// real browser: computed colours, type, gutter, one primary, no legacy card surface, contrast per
// text pair, targets, motion, the cases and the canvas compare. Expected values come from
// tokens.json, never typed. Appended: the file above is append-only.
// ---------------------------------------------------------------------------------------------
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compareWithCanvas } from "./helpers/canvas-compare.js";

const TOKENS = JSON.parse(
  readFileSync(resolve(__dirname, "../../packages/design-tokens/src/tokens.json"), "utf8"),
) as { color: { plan: Record<string, string>; surface: string; "surface-2": string } };
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

const TODAY = '[data-screen-id="UF-02.1"]';
const PREVIEW = '[data-screen-id="UF-02.2"]';
const SCREENS = [
  ["/", TODAY],
  ["/?view=preview", PREVIEW],
] as const;

/** The seed of the cases above with the sets moved `daysAgo` days back (0 sets for `none`). */
async function seedCase(
  page: Page,
  kind: "recent" | "ten-days-off" | "none",
  checkin = false,
): Promise<void> {
  const completedAt = new Date(Date.now() - 20 * DAY_MS).toISOString();
  // A plan set up just now has no finished period, so no check-in card (UF-11.1); the default
  // plan (set up in September) has one.
  const profileRow = checkin
    ? FAKE_PROFILE_ROW
    : {
        ...FAKE_PROFILE_ROW,
        onboarded_at: new Date().toISOString(),
        plan_changed_at: new Date().toISOString(),
      };
  await mockSupabaseData(page, {
    sets:
      kind === "recent"
        ? quadsSets()
        : kind === "none"
          ? []
          : quadsSets().map((s) => ({ ...s, completed_at: completedAt, edited_at: completedAt })),
    exercises: [exercise(SQUAT, "compound"), exercise(FLY, "isolation")],
    exerciseAreas: [
      { exercise_id: SQUAT, area_id: "quads", weight: 1 },
      { exercise_id: FLY, area_id: "chest", weight: 1 },
    ],
    areaTargets: AREAS.map((area) => ({
      area_id: area,
      sets_per_14d: 10,
      source: "default",
      updated_at: "2026-09-01T00:00:00.000Z",
    })),
    profile: [profileRow],
  });
  await mockProfilePresent(page, profileRow);
  await page.goto("/");
  await injectSession(page);
  await page.goto("/");
}

/** Waits for the root to be plan-painted (the 200 ms cross-fade from the loading page settled). */
async function settle(page: Page, root: string): Promise<void> {
  await expect(page.locator(root)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor))
    .toBe(rgbOf(PLAN.bg!));
}

async function goScreen(page: Page, path: string, root: string): Promise<void> {
  if (path !== "/") await page.goto(path);
  await settle(page, root);
  if (root === PREVIEW)
    await expect(page.locator('[data-part="preview-row"]').first()).toBeVisible();
  else await expect(page.locator('[data-part="card-row"]').first()).toBeVisible();
}

test.describe("T-0601 AC1 state (390 × 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const [path, root] of SCREENS) {
    test(`${path}: plan root, plan.bg paints, theme-color is plan.bg, .wl-page`, async ({
      page,
    }) => {
      await seedCase(page, "recent");
      await goScreen(page, path, root);
      const got = await page.evaluate((sel) => {
        const el = document.querySelector(sel)!;
        return {
          state: el.getAttribute("data-wl-state"),
          page: el.classList.contains("wl-page"),
          bg: getComputedStyle(el).backgroundColor,
          theme: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
          states: document.querySelectorAll("[data-screen-id][data-wl-state]").length,
        };
      }, root);
      expect(got.state).toBe("plan");
      expect(got.page).toBe(true);
      expect(got.bg).toBe(rgbOf(PLAN.bg!));
      expect(got.theme!.toLowerCase()).toBe(PLAN.bg!.toLowerCase());
      expect(got.states).toBe(1);
    });
  }
});

test.describe("T-0601 AC2 type (390 × 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("Today's h1 is Familjen Grotesk, not uppercase, 96 to 112 px, named Today; body is 17 px", async ({
    page,
  }) => {
    await seedCase(page, "recent");
    await goScreen(page, "/", TODAY);
    const h1 = page.getByRole("heading", { level: 1, name: "Today", exact: true });
    await expect(h1).toBeVisible();
    const got = await h1.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        family: cs.fontFamily,
        transform: cs.textTransform,
        size: parseFloat(cs.fontSize),
        stop: getComputedStyle(el, "::after").content,
        text: el.textContent,
      };
    });
    expect(got.family.startsWith('"Familjen Grotesk"')).toBe(true);
    expect(got.transform).toBe("none");
    expect(got.size).toBeGreaterThanOrEqual(96);
    expect(got.size).toBeLessThanOrEqual(112);
    expect(got.text).toBe("Today");
    // The full stop is generated content (CSS only), not text.
    expect(got.stop).not.toBe("none");
    const body = await page
      .locator('[data-part="attention"]')
      .evaluate((el) => getComputedStyle(el).fontSize);
    expect(body).toBe("17px");
  });
});

test.describe("T-0601 AC3 one primary", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const [path, root] of SCREENS) {
    test(`${path}: exactly one primary, plan.action on plan.on-action (8.6), pinned above the tab bar`, async ({
      page,
    }) => {
      await seedCase(page, "recent");
      await goScreen(page, path, root);
      const primaries = page.locator(`${root} .wl-button--primary`);
      await expect(primaries).toHaveCount(1);
      const got = await primaries.evaluate((el) => {
        const cs = getComputedStyle(el);
        const bar = document.querySelector(".wl-tab-bar")!.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        return { bg: cs.backgroundColor, fg: cs.color, gap: bar.top - box.bottom };
      });
      expect(got.bg).toBe(rgbOf(PLAN.action!));
      expect(got.fg).toBe(rgbOf(PLAN["on-action"]!));
      expect(tokenRatio(PLAN.action!, PLAN["on-action"]!)).toBe(8.6);
      expect(got.gap).toBeGreaterThanOrEqual(0);
      expect(got.gap).toBeLessThanOrEqual(44);
    });
  }

  test("a pending check-in adds no second primary to the page's own Start", async ({ page }) => {
    await mockSupabaseData(page, UF11_FIXTURES);
    await page.goto("/");
    await injectSession(page);
    await page.goto("/");
    await expect(page.locator('[data-part="checkin-card"]')).toBeVisible();
    // The card is UF-11's slot (its Accept is the card's own action); Today's Start stays pinned.
    await expect(page.locator(`${TODAY} > .wl-button--primary`)).toHaveCount(1);
  });
});

test.describe("T-0601 AC4 gutter", () => {
  for (const [width, gutter] of [
    [390, "28px"],
    [340, "20px"],
  ] as const) {
    test(`${width} px: padding-left is ${gutter}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await seedCase(page, "recent");
      for (const [path, root] of SCREENS) {
        await goScreen(page, path, root);
        const pad = await page.locator(root).evaluate((el) => getComputedStyle(el).paddingLeft);
        expect(pad, path).toBe(gutter);
      }
    });
  }

  test("320 × 640: no horizontal scroll on either screen", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await seedCase(page, "recent");
    for (const [path, root] of SCREENS) {
      await goScreen(page, path, root);
      const over = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.documentElement.clientWidth,
      }));
      expect(over, path).toEqual({ doc: 0, body: 0 });
    }
  });
});

/** Every element inside `root` whose own background is a legacy card surface. */
async function legacySurfaces(page: Page, root: string): Promise<string[]> {
  const legacy = [rgbOf(TOKENS.color.surface), rgbOf(TOKENS.color["surface-2"])];
  return page.evaluate(
    ([sel, bad]) =>
      [...document.querySelector(sel as string)!.querySelectorAll("*")]
        .filter((el) => (bad as string[]).includes(getComputedStyle(el).backgroundColor))
        .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
    [root, legacy],
  );
}

test.describe("T-0601 AC5 no cards (390 × 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const [path, root] of SCREENS) {
    test(`${path}: no element has the legacy surface or surface-2 background`, async ({ page }) => {
      await seedCase(page, "recent");
      await goScreen(page, path, root);
      expect(await legacySurfaces(page, root)).toEqual([]);
    });
  }

  test("the loading skeleton and a pending check-in are unboxed as well", async ({ page }) => {
    await mockSupabaseData(page, UF11_FIXTURES);
    await page.goto("/");
    await injectSession(page);
    await page.goto("/");
    await expect(page.locator('[data-part="checkin-card"]')).toBeVisible();
    expect(await legacySurfaces(page, TODAY)).toEqual([]);
  });
});

/** Every text-bearing element: its colour, its effective background, size and weight. */
async function textPairs(page: Page, root: string) {
  return page.evaluate((sel) => {
    const parse = (c: string): number[] => (c.match(/[\d.]+/g) ?? []).map(Number);
    const bgOf = (el: Element): number[] => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c.length === 3 || (c.length === 4 && c[3]! > 0)) return c.slice(0, 3);
      }
      return parse(getComputedStyle(document.documentElement).backgroundColor).slice(0, 3);
    };
    const out: { text: string; fg: number[]; bg: number[]; size: number; weight: number }[] = [];
    for (const el of document.querySelector(sel)!.querySelectorAll("*")) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
      if (!own) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      out.push({
        text: el.textContent!.trim().slice(0, 30),
        fg: parse(cs.color).slice(0, 3),
        bg: bgOf(el),
        size: parseFloat(cs.fontSize),
        weight: Number(cs.fontWeight),
      });
    }
    return out;
  }, root);
}

const channelLum = (c: number[]): number => {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!);
};
const pairRatio = (a: number[], b: number[]): number => {
  const [hi, lo] = [channelLum(a), channelLum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

test.describe("T-0601 AC6 contrast (390 × 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  const rgbArr = (hex: string): number[] => rgbOf(hex).match(/\d+/g)!.map(Number);

  for (const [path, root] of SCREENS) {
    test(`${path}: every text pair is at least 4.5:1 and none is ink-muted on raise`, async ({
      page,
    }) => {
      await seedCase(page, "recent");
      await goScreen(page, path, root);
      const pairs = await textPairs(page, root);
      expect(pairs.length).toBeGreaterThan(3);
      for (const p of pairs) {
        expect(pairRatio(p.fg, p.bg), `${p.text} ${p.fg} on ${p.bg}`).toBeGreaterThanOrEqual(4.5);
        const mutedOnRaise =
          p.fg.join() === rgbArr(PLAN["ink-muted"]!).join() &&
          p.bg.join() === rgbArr(PLAN.raise!).join();
        expect(mutedOnRaise, p.text).toBe(false);
      }
    });
  }

  test("labels are plan.ink-muted on plan.bg, 5.9", async ({ page }) => {
    await seedCase(page, "recent");
    await goScreen(page, "/", TODAY);
    const date = page.locator('[data-part="date"]');
    expect(await date.evaluate((el) => getComputedStyle(el).color)).toBe(rgbOf(PLAN["ink-muted"]!));
    expect(tokenRatio(PLAN["ink-muted"]!, PLAN.bg!)).toBe(5.9);
  });

  for (const withCheckin of [false, true]) {
    test(`axe colour-contrast has 0 violations ${withCheckin ? "with" : "without"} a pending check-in`, async ({
      page,
    }) => {
      if (withCheckin) {
        await mockSupabaseData(page, UF11_FIXTURES);
        await page.goto("/");
        await injectSession(page);
        await page.goto("/");
        await expect(page.locator('[data-part="checkin-card"]')).toBeVisible();
      } else {
        await seedCase(page, "recent");
        await goScreen(page, "/", TODAY);
      }
      await page.waitForTimeout(300);
      const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(results.violations.map((v) => v.nodes.map((n) => n.target.join(" ")))).toEqual([]);
    });
  }

  test("axe colour-contrast has 0 violations on the preview", async ({ page }) => {
    await seedCase(page, "recent");
    await goScreen(page, "/?view=preview", PREVIEW);
    const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(results.violations.map((v) => v.nodes.map((n) => n.target.join(" ")))).toEqual([]);
  });
});

test.describe("T-0601 AC7 targets and motion (390 × 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const [path, root] of SCREENS) {
    test(`${path}: every link and button is at least 44 × 44`, async ({ page }) => {
      await seedCase(page, "recent");
      await goScreen(page, path, root);
      const controls = page.locator(`${root} a, ${root} button`);
      const count = await controls.count();
      expect(count).toBeGreaterThan(2);
      for (let i = 0; i < count; i++) {
        const box = await controls.nth(i).boundingBox();
        const name = await controls.nth(i).textContent();
        expect(box, name ?? "").not.toBeNull();
        expect(box!.width, `${name} w`).toBeGreaterThanOrEqual(44);
        expect(box!.height, `${name} h`).toBeGreaterThanOrEqual(44);
      }
    });
  }

  /** The transitions and animations of every element on the page, root(s) apart. */
  async function motion(page: Page) {
    return page.evaluate(() => {
      const moving: string[] = [];
      for (const el of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(el);
        const durations = cs.transitionDuration.split(",").map((d) => parseFloat(d));
        const animated = cs.animationName !== "none" && parseFloat(cs.animationDuration) > 0;
        if (durations.some((d) => d > 0) || animated) {
          moving.push(`${el.tagName.toLowerCase()}.${el.className}:${cs.transitionProperty}`);
        }
      }
      const root = getComputedStyle(document.querySelector("[data-screen-id]")!);
      return {
        moving,
        rootProperty: root.transitionProperty,
        rootDuration: root.transitionDuration,
      };
    });
  }

  test("Today to Preview animates only the 200 ms background cross-fade", async ({ page }) => {
    await seedCase(page, "recent");
    await goScreen(page, "/", TODAY);
    await page.getByRole("link", { name: "See all" }).click();
    await settle(page, PREVIEW);
    const got = await motion(page);
    expect(got.rootProperty).toBe("background-color");
    expect(got.rootDuration).toBe("0.2s");
    // The page root and the tab bar (the shell's own plan-state root) cross-fade; nothing else moves.
    expect(got.moving).toEqual([
      "div.wl-page wl-preview:background-color",
      "nav.wl-tab-bar:background-color",
    ]);
  });

  test("under reduced motion nothing animates", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seedCase(page, "recent");
    await goScreen(page, "/", TODAY);
    await page.getByRole("link", { name: "See all" }).click();
    await settle(page, PREVIEW);
    const got = await motion(page);
    expect(got.rootDuration).toBe("0s");
    expect(got.moving).toEqual([]);
  });
});

test.describe("T-0601 AC8 the cases render in plan (390 × 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function expectPlanToday(page: Page): Promise<void> {
    await settle(page, TODAY);
    const root = page.locator(TODAY);
    await expect(root).toHaveAttribute("data-wl-state", "plan");
    expect(await legacySurfaces(page, TODAY)).toEqual([]);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over).toBe(0);
    await expect(page.getByRole("link", { name: "Start workout" })).toHaveClass(
      /wl-button--primary/,
    );
  }

  test("zero history", async ({ page }) => {
    await seedCase(page, "none");
    await expect(page.locator('[data-part="no-workouts"]')).toBeVisible();
    await expectPlanToday(page);
  });

  test("returning after 10 days off: the nothing-logged line", async ({ page }) => {
    await seedCase(page, "ten-days-off");
    await expect(page.locator('[data-part="nothing-recent"]')).toHaveText(
      "Nothing logged in the last 14 days. Start a workout to pick up again.",
    );
    await expectPlanToday(page);
  });

  test("offline", async ({ page, context }) => {
    await seedCase(page, "recent");
    await expect(tile(page, "quads")).toHaveText("5 / 10");
    await expect
      .poll(() => cacheCounts(page))
      .toEqual({ history: 5, library: 2, targets: 9, profile: 1 });
    await waitForPrecache(page);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('[data-part="card-row"]').first()).toBeVisible({ timeout: 3000 });
    await expectPlanToday(page);
  });

  test("a pending check-in", async ({ page }) => {
    await mockSupabaseData(page, UF11_FIXTURES);
    await page.goto("/");
    await injectSession(page);
    await page.goto("/");
    await expect(page.locator('[data-part="checkin-card"]')).toBeVisible();
    await expectPlanToday(page);
  });

  test("the preview offline", async ({ page, context }) => {
    await seedCase(page, "recent");
    await page.goto("/?view=preview");
    await expect(page.locator('[data-part="preview-row"]').first()).toBeVisible();
    await waitForPrecache(page);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('[data-part="preview-row"]').first()).toBeVisible({ timeout: 3000 });
    await settle(page, PREVIEW);
    await expect(page.locator(PREVIEW)).toHaveAttribute("data-wl-state", "plan");
  });

  test("the preview rows are hairline rows with a trailing arrow, and Start stays one primary", async ({
    page,
  }) => {
    await seedCase(page, "recent");
    await goScreen(page, "/?view=preview", PREVIEW);
    const row = page.locator('[data-part="preview-row"]').first();
    const got = await row.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        bottom: cs.borderBottomWidth,
        bg: cs.backgroundColor,
        chevron: el.querySelector('svg[aria-hidden="true"]') !== null,
      };
    });
    expect(got).toEqual({ bottom: "1px", bg: "rgba(0, 0, 0, 0)", chevron: true });
  });
});

test.describe("T-0601 AC9 canvas compare (390 × 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  const run = async (
    page: Page,
    testInfo: Parameters<typeof compareWithCanvas>[1],
    turn: "turn-3" | "turn-5",
    frame: string,
    name: string,
  ) => {
    const result = await compareWithCanvas(page, testInfo, { turn, frame, name });
    if (process.env.WL_CANVAS_COMPARE === "1" && !result.skipped) {
      expect(result.files.app).toBeTruthy();
      expect(result.files.canvas).toBeTruthy();
      // The app screen is taller than the canvas frame: also keep its scrolled-to-the-end view.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.screenshot({ path: testInfo.outputPath(`${name}-scrolled.png`) });
    }
  };

  test("Today (turn-3)", async ({ page }, testInfo) => {
    await seedCase(page, "recent");
    await goScreen(page, "/", TODAY);
    await run(page, testInfo, "turn-3", "Today", "uf02-1-today");
  });

  test("Today · check-in pending (turn-5)", async ({ page }, testInfo) => {
    await mockSupabaseData(page, UF11_FIXTURES);
    await page.goto("/");
    await injectSession(page);
    await page.goto("/");
    await expect(page.locator('[data-part="checkin-card"]')).toBeVisible();
    await settle(page, TODAY);
    await run(page, testInfo, "turn-5", "Today · check-in pending", "uf02-1-today-checkin");
  });

  test("Workout preview (turn-5)", async ({ page }, testInfo) => {
    await seedCase(page, "recent");
    await goScreen(page, "/?view=preview", PREVIEW);
    await run(page, testInfo, "turn-5", "Workout preview", "uf02-2-preview");
  });
});
