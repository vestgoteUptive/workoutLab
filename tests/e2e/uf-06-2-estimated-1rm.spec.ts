// T-0965 (UF-06.2, D-0254..D-0258, D-0266): the estimated 1RM card, chart and table on Exercise
// history, in a real browser. One test per acceptance criterion (AC1..AC9); the builder's unit and
// component tests (T-0963) cover the maths. Supabase is mocked (`fixtures/supabase-mock.ts`), the
// `test` comes from `guarded-test` so an unclaimed request or a console error fails the test.
//
// Dates are built from the browser's local calendar (noon of today - N), because the screen
// groups by local date. Window (D-0266): today - 55 .. today, so a session 55 days old is plotted
// and one 56 days old is not (the ticket's AC5 wording said 56 is plotted; D-0266 is newer).
import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { goOffline } from "./fixtures/offline.js";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  FAKE_USER_ID,
  injectSession,
  mockProfilePresent,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
  VITE_SUPABASE_URL,
  type OfflineFixtures,
} from "./fixtures/supabase-mock.js";
import {
  exerciseAreas as libAreas,
  exercisesLoaded as libExercises,
  profile as libProfile,
} from "./fixtures/uf-04-library-data.js";
import { settledBox } from "./helpers/settled-box.js";

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
];

function exerciseRow(
  id: string,
  name: string,
  opts: { externalLoad: boolean; timed?: boolean },
): Record<string, unknown> {
  return {
    id,
    name,
    type: "compound",
    level: "beginner",
    equipment: [],
    instructions: [],
    mistakes: [],
    cue: null,
    timed: opts.timed ?? false,
    source: "test",
    license: "test",
    attribution: null,
    source_url: null,
    kind: "exercise",
    increment_kg: 2.5,
    default_duration_s: opts.timed ? 30 : null,
    external_load: opts.externalLoad,
  };
}

/** A timestamp on the local calendar day `daysAgo` days back (today's is a minute ago, so it can
 *  never be in the future, and `daysAgo` > 0 sits at local noon, far from a day boundary). */
function stamp(daysAgo: number, minuteOffset = 0): string {
  const d = new Date();
  if (daysAgo === 0) return new Date(d.getTime() - 60_000 + minuteOffset * 1000).toISOString();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, minuteOffset, 0, 0);
  return d.toISOString();
}

interface SetOpts {
  exerciseId?: string;
  reps?: number | null;
  weightKg?: number | null;
  durationS?: number | null;
  sessionId?: string;
  minute?: number;
}

function setRow(clientId: string, daysAgo: number, o: SetOpts = {}) {
  const at = stamp(daysAgo, o.minute ?? 0);
  return {
    client_id: clientId,
    session_id: o.sessionId ?? `S-${daysAgo}`,
    exercise_id: o.exerciseId ?? "back-squat",
    is_warmup: false,
    completed_at: at,
    edited_at: at,
    deleted_at: null,
    reps: o.reps === undefined ? 8 : o.reps,
    weight_kg: o.weightKg === undefined ? 100 : o.weightKg,
    duration_s: o.durationS ?? null,
  };
}

function fixtures(sets: unknown[]): OfflineFixtures {
  return {
    sets,
    exercises: [
      exerciseRow("back-squat", "Back squat", { externalLoad: true }),
      exerciseRow("push-up", "Push-up", { externalLoad: false }),
      exerciseRow("plank", "Plank", { externalLoad: false, timed: true }),
    ],
    exerciseAreas: [
      { exercise_id: "back-squat", area_id: "quads", weight: 1 },
      { exercise_id: "back-squat", area_id: "glutes", weight: 1 },
      { exercise_id: "push-up", area_id: "chest", weight: 1 },
      { exercise_id: "plank", area_id: "core", weight: 1 },
    ],
    areaTargets: AREAS.map((area) => ({
      area_id: area,
      sets_per_14d: 12,
      source: "default",
      updated_at: "2026-09-01T00:00:00.000Z",
    })),
    profile: {
      goal: "build_muscle",
      level: "beginner",
      equipment: [],
      rhythm_min: 3,
      rhythm_max: 4,
      priority_areas: [],
      onboarded_at: "2026-09-01T00:00:00.000Z",
      plan_changed_at: "2026-09-01T00:00:00.000Z",
    },
  };
}

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
});

async function open(page: Page, sets: unknown[], path = "/progress/back-squat") {
  await mockSupabaseData(page, fixtures(sets));
  await page.goto("/welcome");
  await injectSession(page);
  await page.goto(path);
}

const card = (page: Page) => page.locator("dl.wl-progress__cards div", { hasText: "Est. 1RM" });
const chart = (page: Page) => page.getByTestId("e1rm-chart");
const dots = (page: Page) => page.locator('[data-part="dot"]');
const delta = (page: Page) => page.locator(".wl-e1rm__delta");
const toggle = (page: Page) => page.getByRole("button", { name: /Show as table|Hide table/ });

async function dotXs(page: Page): Promise<number[]> {
  return dots(page).evaluateAll((els) =>
    els.map((g) => Number(g.querySelector("circle")!.getAttribute("cx"))),
  );
}

async function expectNoEstimate(page: Page) {
  await expect(card(page)).toHaveCount(0);
  await expect(chart(page)).toHaveCount(0);
  await expect(page.getByText("Est. 1RM")).toHaveCount(0);
  await expect(page.getByText(/about \d+ kg/)).toHaveCount(0);
}

test.describe("T-0965 UF-06.2 estimated 1RM", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("AC1 zero history: only the empty line, no card, chart or estimate message", async ({
    page,
  }) => {
    await open(page, []);
    await expect(page.getByRole("heading", { level: 1, name: "Back squat" })).toBeVisible();
    await expect(page.getByText("No sets in the last 8 weeks")).toBeVisible();
    await expectNoEstimate(page);
    await expect(page.getByText(/No estimate yet|weighted lifts|One session so far/)).toHaveCount(
      0,
    );
    await expect(toggle(page)).toHaveCount(0);
  });

  test("AC2 one session of 100 x 8: about 127 kg, one dot, no line, one-session note, no delta", async ({
    page,
  }) => {
    await open(page, [setRow("c1", 4)]);
    await expect(card(page)).toBeVisible();
    await expect(card(page).locator("dt")).toHaveText("Est. 1RM");
    await expect(card(page).locator("dd")).toHaveText("about 127 kg");
    await expect(chart(page)).toBeVisible();
    await expect(dots(page)).toHaveCount(1);
    await expect(page.locator('[data-part="line"]')).toHaveCount(0);
    await expect(page.getByText("One session so far. Log it again to see a trend.")).toBeVisible();
    await expect(delta(page)).toHaveCount(0);
    await expect(chart(page)).toHaveAttribute("aria-label", /^Estimated one-rep max, 1 session, /);
  });

  test("AC3 returning after 10 days off: last value, worded delta, x spacing proportional to days", async ({
    page,
  }) => {
    // Sessions at -30, -10 and today: a 20-day then a 10-day gap (the ticket text lists -40/-20/0,
    // which gives two equal 20-day gaps; the stated intent, "20-day spacing about twice the
    // 10-day one" after "a 10-day gap", needs these days).
    await open(page, [
      setRow("a", 30, { weightKg: 100, reps: 8 }), // 126.7 -> 127
      setRow("b", 10, { weightKg: 105, reps: 8 }), // 133
      setRow("c", 0, { weightKg: 95, reps: 8 }), // 120.3 -> 120
    ]);
    await expect(card(page).locator("dd")).toHaveText("about 120 kg");
    // 120 - 127 = -7: "Down 7 kg since <first date>".
    await expect(delta(page)).toHaveText(/^Down 7 kg since \S+ \S+$/);
    await expect(dots(page)).toHaveCount(3);
    await expect(page.locator('[data-part="line"]')).toHaveCount(1);
    const [x0, x1, x2] = await dotXs(page);
    const longGap = x1! - x0!;
    const shortGap = x2! - x1!;
    expect(Math.abs(longGap - 2 * shortGap)).toBeLessThanOrEqual(2);
    expect(shortGap).toBeGreaterThan(10);
  });

  test("AC3b delta reads Up when the last session is higher", async ({ page }) => {
    await open(page, [
      setRow("a", 30, { weightKg: 90, reps: 8 }), // 114
      setRow("b", 0, { weightKg: 100, reps: 8 }), // 127
    ]);
    await expect(delta(page)).toHaveText(/^Up 13 kg since /);
    await expect(card(page).locator("dd")).toHaveText("about 127 kg");
  });

  test("AC4 offline: same card, delta and chart after a reload; a queued better set counts", async ({
    page,
    context,
  }) => {
    await open(page, [
      setRow("a", 30, { weightKg: 100, reps: 8 }),
      setRow("b", 10, { weightKg: 105, reps: 8 }),
      setRow("c", 0, { weightKg: 95, reps: 8 }),
    ]);
    // Online baseline.
    await expect(card(page).locator("dd")).toHaveText("about 120 kg");
    await expect(delta(page)).toHaveText(/^Down 7 kg since /);
    await expect(dots(page)).toHaveCount(3);
    const baseline = {
      card: await card(page).locator("dd").innerText(),
      delta: await delta(page).innerText(),
      label: await chart(page).getAttribute("aria-label"),
      xs: await dotXs(page),
    };
    // The cache is warm once the history rows are in it; then the shell is precached.
    await expect
      .poll(() =>
        page.evaluate(async (userId: string) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open("wl-offline");
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          const n = await new Promise<number>((resolve, reject) => {
            const c = db
              .transaction("historyCache", "readonly")
              .objectStore("historyCache")
              .count(IDBKeyRange.bound(`${userId}:`, `${userId}:￿`));
            c.onsuccess = () => resolve(c.result);
            c.onerror = () => reject(c.error);
          });
          db.close();
          return n;
        }, FAKE_USER_ID),
      )
      .toBe(3);
    await page.evaluate(() => navigator.serviceWorker.ready);
    let previous = -1;
    await expect
      .poll(
        async () => {
          const counts = await page.evaluate(async () => {
            const key = (await caches.keys()).find((k) => k.startsWith("workbox-precache"));
            if (!key) return { entries: 0, hasDocument: false };
            const requests = await (await caches.open(key)).keys();
            return {
              entries: requests.length,
              hasDocument: requests.some((r) => new URL(r.url).pathname === "/index.html"),
            };
          });
          const stable = counts.entries > 0 && counts.entries === previous;
          previous = counts.entries;
          return stable && counts.hasDocument;
        },
        { message: "the workbox precache never finished populating before going offline" },
      )
      .toBe(true);

    await goOffline(page, context);
    await page.reload();
    await expect(page.getByText(/^Offline/)).toBeVisible();
    await expect(card(page).locator("dd")).toHaveText(baseline.card);
    await expect(delta(page)).toHaveText(baseline.delta);
    await expect(chart(page)).toHaveAttribute("aria-label", baseline.label!);
    expect(await dotXs(page)).toEqual(baseline.xs);

    // Queue sets offline into today's session: 110 x 5 (128.3) beats 95 x 8 (120.3); 60 x 10 does not.
    const at = stamp(0);
    await page.evaluate(
      async ({ userId, completedAt }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open("wl-offline");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const queued = (clientId: string, weightKg: number, reps: number) => ({
          key: `${userId}:${clientId}`,
          userId,
          clientId,
          sessionId: "S-0",
          exerciseId: "back-squat",
          setIndex: 9,
          kind: "reps",
          reps,
          weightKg,
          durationS: null,
          rir: null,
          isWarmup: false,
          backoff: false,
          completedAt,
          editedAt: completedAt,
          deletedAt: null,
          status: "queued",
        });
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("sets", "readwrite");
          const store = tx.objectStore("sets");
          store.put(queued("q-best", 110, 5));
          store.put(queued("q-light", 60, 10));
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      },
      { userId: FAKE_USER_ID, completedAt: at },
    );
    await page.reload();
    await expect(page.getByText(/^Offline/)).toBeVisible();
    await expect(card(page).locator("dd")).toHaveText("about 128 kg");
    // 128 - 127 = +1 now; still three dots (the queued sets joined today's session).
    await expect(delta(page)).toHaveText(/^Up 1 kg since /);
    await expect(dots(page)).toHaveCount(3);
  });

  test("AC5 window: a session 56 days old is not plotted, 55 days old is", async ({ page }) => {
    await open(page, [setRow("old", 56), setRow("new", 3, { weightKg: 90 })]);
    await expect(card(page).locator("dd")).toHaveText("about 114 kg");
    await expect(dots(page)).toHaveCount(1);
    await expect(page.getByText("One session so far. Log it again to see a trend.")).toBeVisible();
  });

  test("AC5b a session exactly 55 days old is plotted", async ({ page }) => {
    await open(page, [setRow("old", 55), setRow("new", 3, { weightKg: 90 })]);
    await expect(dots(page)).toHaveCount(2);
    await expect(delta(page)).toBeVisible();
  });

  test("AC6 only 60 x 15: the no-estimate line and no card; plank and push-up say weighted lifts only", async ({
    page,
  }) => {
    await open(page, [
      setRow("a", 3, { weightKg: 60, reps: 15 }),
      setRow("p1", 3, { exerciseId: "push-up", weightKg: null, reps: 20 }),
      setRow("p2", 3, { exerciseId: "plank", weightKg: null, reps: null, durationS: 60 }),
    ]);
    await expect(
      page.getByText("No estimate yet. Estimates need a weighted set of 1–10 reps."),
    ).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    await expect(chart(page)).toHaveCount(0);

    for (const slug of ["push-up", "plank"]) {
      await page.goto(`/progress/${slug}`);
      await expect(page.getByText("Estimated 1RM is for weighted lifts.")).toBeVisible();
      await expect(card(page)).toHaveCount(0);
      await expect(chart(page)).toHaveCount(0);
      await expect(page.getByText(/No estimate yet/)).toHaveCount(0);
    }
  });

  test("AC7 table toggle by keyboard: aria-expanded, captioned table oldest first, chart stays, focus stays", async ({
    page,
  }) => {
    await open(page, [
      setRow("a", 20, { weightKg: 100, reps: 8 }),
      setRow("b", 9, { weightKg: 105, reps: 5 }),
      setRow("c", 2, { weightKg: 110, reps: 3 }),
    ]);
    const btn = toggle(page);
    await expect(btn).toHaveText("Show as table");
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("table")).toHaveCount(0);

    for (let i = 0; i < 30 && !(await isFocused(btn)); i += 1) await page.keyboard.press("Tab");
    await expect(btn).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(btn).toHaveAttribute("aria-expanded", "true");
    await expect(btn).toHaveText("Hide table");
    await expect(btn).toBeFocused();
    const table = page.getByRole("table", { name: "Estimated 1RM per session" });
    await expect(table).toBeVisible();
    await expect(table.locator("caption")).toHaveText("Estimated 1RM per session");
    const rows = table.locator("tbody tr");
    await expect(rows).toHaveCount(3);
    // Oldest first: 127, 122 (105 x 5 = 122.5), 121 (110 x 3 = 121).
    await expect(rows.nth(0).locator("td").nth(1)).toHaveText("about 127 kg");
    await expect(rows.nth(1).locator("td").nth(1)).toHaveText("about 123 kg");
    await expect(rows.nth(2).locator("td").nth(1)).toHaveText("about 121 kg");
    await expect(rows.nth(0).locator("td").nth(0)).toHaveText("100 kg × 8");
    await expect(chart(page)).toBeVisible();
    await expect(dots(page)).toHaveCount(3);

    await page.keyboard.press("Space");
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await expect(btn).toHaveText("Show as table");
    await expect(btn).toBeFocused();
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  test("AC8 axe finds no violation (chart and table open), the toggle is >= 44 px, nothing overflows", async ({
    page,
  }) => {
    await open(page, [
      setRow("a", 20, { weightKg: 100, reps: 8 }),
      setRow("b", 9, { weightKg: 105, reps: 5 }),
    ]);
    await expect(chart(page)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await toggle(page).click();
    await expect(page.getByRole("table")).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    const box = await settledBox(toggle(page));
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("AC8b at 320 px nothing overflows horizontally", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page, [
      setRow("a", 20, { weightKg: 100, reps: 8 }),
      setRow("b", 9, { weightKg: 105, reps: 5 }),
    ]);
    await expect(chart(page)).toBeVisible();
    await toggle(page).click();
    await expect(page.getByRole("table")).toBeVisible();
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.documentElement.clientWidth,
      svg: document.querySelector("svg[data-testid='e1rm-chart']")!.getBoundingClientRect().right,
      vw: document.documentElement.clientWidth,
    }));
    expect(overflow.doc).toBeLessThanOrEqual(0);
    expect(overflow.body).toBeLessThanOrEqual(0);
    expect(overflow.svg).toBeLessThanOrEqual(overflow.vw);
  });
});

async function isFocused(loc: Locator): Promise<boolean> {
  return loc.evaluate((el) => el === document.activeElement);
}

// AC9 uses the L1+ library (loaded barbell squat) so the suggested workout is real.
test.describe("T-0965 AC9 scope: no estimate on Today or during a workout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function seed(page: Page) {
    // A record needs an earlier, lower session to beat (rule 15), so Latest PR has a line.
    const sets = [
      setRow("h0", 12, { weightKg: 90, reps: 3 }),
      setRow("h1", 3, { weightKg: 100, reps: 8 }),
    ];
    await mockSupabaseData(page, {
      sets,
      exercises: libExercises,
      exerciseAreas: libAreas,
      exerciseVariants: [],
      areaTargets: AREAS.map((area) => ({
        area_id: area,
        sets_per_14d: 12,
        source: "default",
        updated_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      })),
      profile: libProfile,
    });
    await mockProfilePresent(page, { ...libProfile, user_id: FAKE_USER_ID });
    // Writes (the session row and its sets) succeed; nothing reads them back.
    for (const table of ["sessions", "session_sets"]) {
      await page.route(`${VITE_SUPABASE_URL}/rest/v1/${table}*`, (route) =>
        route.request().method() === "GET"
          ? route.fallback()
          : route.fulfill({ status: 201, json: [] }),
      );
    }
    await page.goto("/welcome");
    await injectSession(page);
  }

  async function expectNoEstimateAnywhere(page: Page) {
    await expect(page.getByText("Est. 1RM")).toHaveCount(0);
    await expect(page.getByText(/about \d+ kg/)).toHaveCount(0);
    await expect(page.getByTestId("e1rm-chart")).toHaveCount(0);
    await expect(page.getByRole("img", { name: /Estimated one-rep max/ })).toHaveCount(0);
  }

  test("Today shows the actual latest set, never the estimate", async ({ page }) => {
    await seed(page);
    await page.goto("/");
    const line = page.locator('[data-part="latest-pr"]');
    await expect(line).toHaveText(/^Latest PR\s+Back squat 100\skg × 8$/);
    await expectNoEstimateAnywhere(page);
  });

  test("UF-08 setup, review, ready and the UF-09 first step never show the estimate", async ({
    page,
  }) => {
    await seed(page);
    await page.goto("/session/setup");
    await expect(page.locator('[data-screen-id="UF-08.1"]')).toBeVisible();
    await expectNoEstimateAnywhere(page);
    await page.getByRole("button", { name: "30 minutes" }).click();
    await page.getByRole("button", { name: "Suggest my workout" }).click();
    await expect(page.locator('[data-screen-id="UF-08.2"]')).toBeVisible();
    await expectNoEstimateAnywhere(page);
    await expectNoEstimateAnywhere(page);
    await page.getByRole("button", { name: "Start workout", exact: true }).click();
    await expect(page).toHaveURL(/\/session\/[0-9a-f-]{36}$/);
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
    await expectNoEstimateAnywhere(page);
    await expect(page.getByRole("link", { name: /history/i })).toHaveCount(0);
  });
});
