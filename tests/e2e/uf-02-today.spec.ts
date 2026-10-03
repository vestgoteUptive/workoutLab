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
    await expect(page.locator('[data-component="C-01"] [data-area]')).toHaveCount(9);
    for (const area of AREAS) {
      await expect(page.locator(`[data-component="C-01"] [data-area="${area}"]`)).toBeVisible();
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
    title: await page.locator('[data-part="card-title"]').innerText(),
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
