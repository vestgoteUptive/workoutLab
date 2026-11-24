// T-0991 UF-09.5, UF-09.3, UF-09.6 e2e: the rest screen's "Next" block names what is next
// (docs/specs/rest-next-exercise.md, D-0273): the exercise name, the cue of a new exercise and the
// per-side word of a flagged one, at 320 px, at 200 % zoom and offline, in a real browser.
//
// Built like uf-09-one-side.spec.ts: sessions are seeded straight into the app's IndexedDB with a
// fixed plan, Supabase is mocked through `page.route`, `dumbbell-row` (arm) is the flagged row and
// `barbell-row` the unflagged control. The shared library fixture predates the flag, so this spec
// seeds its own rows on top of it (`library`). Every size is read through `settledBox`.
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import { goOffline } from "./fixtures/offline.js";
import {
  FAKE_USER_ID,
  injectSession,
  mockProfilePresent,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
  VITE_SUPABASE_URL,
} from "./fixtures/supabase-mock.js";
import { exerciseAreas, exercisesLoaded, profile } from "./fixtures/uf-04-library-data.js";
import { settledBox } from "./helpers/settled-box.js";

type Row = Record<string, unknown>;

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
const AREA_TARGETS = AREAS.map((area) => ({
  user_id: FAKE_USER_ID,
  area_id: area,
  sets_per_14d: 16,
  source: "default",
  updated_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
}));
const START_DEFICITS = Object.fromEntries(AREAS.map((a) => [a, 1]));
const profileRow = { ...profile, user_id: FAKE_USER_ID };

/** A 45-character cue, the longest the library has (spec: "at most 45 characters"). */
const CUE = "Lead with the elbows, stop at shoulder height";
/** The longest library name (29 characters). */
const LONG_NAME = "Standing calf raise (machine)";

// ---- The library: the shared fixture plus the flagged `dumbbell-row` ----

function dumbbellRow(name: string): Row {
  return {
    id: "dumbbell-row",
    name,
    type: "compound",
    level: "beginner",
    equipment: ["dumbbell", "bench"],
    instructions: ["Brace a hand on the bench", "Row to your hip", "Switch arms and repeat"],
    mistakes: [],
    cue: CUE,
    source: "workoutlab",
    license: "LicenseRef-workoutLab",
    attribution: null,
    source_url: null,
    kind: "exercise",
    timed: false,
    increment_kg: null,
    default_duration_s: null,
    external_load: true,
    unilateral: "arm",
  };
}

function library(name = "Dumbbell row"): Row[] {
  // The shared fixture already has a `db-row` named "Dumbbell row"; drop it so the flagged row
  // is the only one.
  return [...exercisesLoaded.filter((e) => e.id !== "db-row"), dumbbellRow(name)];
}
const exerciseAreasAll: Row[] = [
  ...exerciseAreas,
  { exercise_id: "dumbbell-row", area_id: "back", weight: 1 },
  { exercise_id: "dumbbell-row", area_id: "arms", weight: 0.5 },
];

// ---- Plans ----

function item(exerciseId: string, sets: number, prefill: Row = {}): Row {
  return {
    exerciseId,
    isMain: false,
    sets,
    repsMin: 8,
    repsMax: 12,
    durationS: null,
    costS: 420,
    backoff: null,
    prefill: { weightKg: 12, reps: 10, durationS: null, kind: "add_rep", ...prefill },
    reasons: [],
  };
}
const planOf = (...items: Row[]): object => ({
  version: 1,
  mainLiftId: null,
  warmup: [],
  items,
  startDeficits: START_DEFICITS,
});
/** AC1: barbell-row (3 sets) then dumbbell-row. */
const PLAN_AB = planOf(item("barbell-row", 3), item("dumbbell-row", 3));
/** One set of barbell-row, so the first rest is already the new-exercise rest. */
const PLAN_A1B = planOf(item("barbell-row", 1), item("dumbbell-row", 3));
const PLAN_DB = planOf(item("dumbbell-row", 3));
const PLAN_BARBELL = planOf(item("barbell-row", 3));

// ---- Page helpers ----

const screen = (page: Page, id: string) => page.locator(`[data-screen-id="${id}"]`);
const rest = (page: Page) => screen(page, "UF-09.5");

async function mockAll(page: Page, lib: Row[] = library(), sets: unknown[] = []): Promise<void> {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets,
    exercises: lib,
    exerciseAreas: exerciseAreasAll,
    areaTargets: AREA_TARGETS,
    profile: profileRow,
  });
  await mockProfilePresent(page, profileRow);
}

async function cachedCount(page: Page, store: string): Promise<number> {
  return page.evaluate(
    async ({ userId, store }) => {
      const req = indexedDB.open("wl-offline");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const n = await new Promise<number>((resolve, reject) => {
        const c = db
          .transaction(store, "readonly")
          .objectStore(store)
          .count(IDBKeyRange.bound(`${userId}:`, `${userId}:￿`));
        c.onsuccess = () => resolve(c.result);
        c.onerror = () => reject(c.error);
      });
      db.close();
      return n;
    },
    { userId: FAKE_USER_ID, store },
  );
}

/** Signs in and waits until the library and the exercise details are cached. */
async function signInAndCache(page: Page): Promise<void> {
  await page.goto("/");
  await injectSession(page);
  await page.goto("/");
  await expect(screen(page, "UF-02.1")).toBeVisible();
  await expect.poll(() => cachedCount(page, "libraryCache")).toBeGreaterThan(0);
  await expect.poll(() => cachedCount(page, "exerciseDetails")).toBeGreaterThan(0);
}

async function seedSessionRow(page: Page, id: string, planBody: object): Promise<void> {
  await page.evaluate(
    async ({ id, userId, planBody }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("wl-offline");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("sessions", "readwrite");
        tx.objectStore("sessions").put({
          id,
          userId,
          row: {
            id,
            started_at: new Date().toISOString(),
            time_budget_min: 45,
            energy: "normal",
            warmup_in_budget: true,
            ended_at: null,
            plan: planBody,
          },
          finished: false,
          pending: false,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { id, userId: FAKE_USER_ID, planBody },
  );
}

async function openSeeded(page: Page, planBody: object): Promise<string> {
  const id = randomUUID();
  await seedSessionRow(page, id, planBody);
  await page.goto(`/session/${id}`);
  await expect(screen(page, "UF-09.3")).toBeVisible({ timeout: 15_000 });
  return id;
}

/** UF-09.3 Done, UF-09.4 Save: the rest (UF-09.5) follows. */
async function saveSet(page: Page): Promise<void> {
  await expect(screen(page, "UF-09.3")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  const confirm = screen(page, "UF-09.4");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: /^Save/ }).click();
  await expect(rest(page)).toBeVisible({ timeout: 10_000 });
}

async function skipRest(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Skip rest" }).click();
  await expect(rest(page)).toHaveCount(0);
}

/** The Next block's parts as the user reads them. */
const caption = (page: Page) => rest(page).locator(".wl-uf09__next-title");
const nameOf = (page: Page) => rest(page).locator(".wl-uf09__next-name");
const cueOf = (page: Page) => rest(page).locator(".wl-uf09__next-cue");
const loadOf = (page: Page) => rest(page).locator(".wl-uf09__next-load");

/** The load line's visible text: the hero lines when there are some, else the whole line. */
async function loadText(page: Page): Promise<string> {
  return loadOf(page).evaluate((p) => {
    const heroes = [...p.querySelectorAll(".wl-uf09__hero")];
    const parts =
      heroes.length > 0
        ? heroes.map((h) => h.textContent ?? "")
        : [...p.childNodes]
            .filter((n) => !(n instanceof HTMLElement && n.classList.contains("wl-uf09__sr")))
            .map((n) => n.textContent ?? "");
    return parts
      .join(" ")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  });
}

/** Console errors and uncaught page errors; offline resource failures are not app errors. */
function watchErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/Failed to load resource|net::ERR/i.test(m.text())) return;
    errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return () => errors.slice();
}

/** Real offline: writes are aborted by `goOffline`, and reads are aborted here (registered last,
 *  so it wins), so nothing can refresh the caches behind the test's back. */
async function goReallyOffline(page: Page, context: BrowserContext): Promise<void> {
  await goOffline(page, context);
  await page.route(`${VITE_SUPABASE_URL}/**`, (route) => route.abort("internetdisconnected"));
}

async function waitForPrecache(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const keys = await caches.keys();
        const precache = keys.find((k) => k.startsWith("workbox-precache"));
        if (!precache) return false;
        const requests = await (await caches.open(precache)).keys();
        return requests.some((r) => new URL(r.url).pathname === "/index.html");
      }),
    )
    .toBe(true);
}

/** Opens `planBody` online, goes offline with the focus state cleared, reloads, and (optionally)
 *  deletes the cached detail of `dropDetail` before the reload. */
async function openOffline(
  page: Page,
  context: BrowserContext,
  planBody: object,
  dropDetail?: string,
): Promise<void> {
  await signInAndCache(page);
  const id = await openSeeded(page, planBody);
  await waitForPrecache(page);
  await goReallyOffline(page, context);
  await page.evaluate((key) => window.localStorage.removeItem(key), `wl-focus:${id}`);
  if (dropDetail !== undefined) {
    await page.evaluate(
      async ({ key }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open("wl-offline");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("exerciseDetails", "readwrite");
          tx.objectStore("exerciseDetails").delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      },
      { key: `${FAKE_USER_ID}:${dropDetail}` },
    );
  }
  await page.reload();
  await expect(screen(page, "UF-09.3")).toBeVisible({ timeout: 15_000 });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

// ---------------------------------------------------------------------------------------------
// AC1: same exercise (caption, name, load, no word) and new exercise (name, cue, UF-09.6 agrees).
// ---------------------------------------------------------------------------------------------

test.describe("AC1 the Next block names the exercise (UF-09.5, UF-09.6)", () => {
  test("set 1 of barbell-row: 'Next · set 2 of 3', 'Barbell row', the load, no 'per arm', no cue; the last set: 'Next exercise', 'Dumbbell row', its cue; Skip rest lands on UF-09.6 with the same cue", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await mockAll(page);
    await signInAndCache(page);
    await openSeeded(page, PLAN_AB);

    await saveSet(page);
    await expect(caption(page)).toHaveText("Next · set 2 of 3");
    await expect(nameOf(page)).toHaveText("Barbell row");
    expect(await loadText(page)).toMatch(/^12 kg × 1\d$/);
    await expect(cueOf(page)).toHaveCount(0);
    await expect(rest(page)).not.toContainText(/per (arm|leg|side)/);
    await skipRest(page);

    await saveSet(page);
    await expect(caption(page)).toHaveText("Next · set 3 of 3");
    await expect(nameOf(page)).toHaveText("Barbell row");
    await expect(cueOf(page)).toHaveCount(0);
    await skipRest(page);

    // The last set of barbell-row: the next exercise, its name and its cue; no load line.
    await saveSet(page);
    await expect(caption(page)).toHaveText("Next exercise");
    await expect(nameOf(page)).toHaveText("Dumbbell row");
    await expect(cueOf(page)).toHaveText(CUE);
    await expect(loadOf(page)).toHaveCount(0);
    await expect(rest(page)).not.toContainText("Barbell row");
    await skipRest(page);

    await expect(screen(page, "UF-09.6")).toBeVisible();
    await expect(screen(page, "UF-09.6").locator('[data-field="cue"]')).toHaveText(CUE);
    expect(errors()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// AC2: the per-side word is on every frame of the rest; the unflagged row never has it.
// ---------------------------------------------------------------------------------------------

test.describe("AC2 the per-side word on the rest's first frame", () => {
  test("dumbbell-row set 1 saved: the load line reads '12 kg' over '× 10 per arm', and no recorded state of it lacks 'per arm'", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const states: string[] = [];
      (window as unknown as { __restStates: string[] }).__restStates = states;
      const grab = () => {
        for (const el of document.querySelectorAll(
          '[data-screen-id="UF-09.5"] .wl-uf09__next-load',
        )) {
          const heroes = [...el.querySelectorAll(".wl-uf09__hero")];
          const t = heroes.length > 0 ? heroes.map((h) => h.textContent).join(" ") : el.textContent;
          states.push((t ?? "").replace(/\u00a0/g, " "));
        }
      };
      new MutationObserver(grab).observe(document, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
    });
    await mockAll(page);
    await signInAndCache(page);
    await openSeeded(page, PLAN_DB);
    await saveSet(page);

    expect(await loadText(page)).toBe("12 kg × 10 per arm");
    await expect(loadOf(page).locator(".wl-uf09__sr")).toHaveText(/^12\skg, 10 reps per arm$/);
    const states = await page.evaluate(
      () => (window as unknown as { __restStates: string[] }).__restStates,
    );
    expect(states.length).toBeGreaterThan(0);
    expect(states.filter((t) => !t.includes("per arm"))).toEqual([]);
  });

  test("a hard reload into the rest (informational): what the load line reads straight after", async ({
    page,
  }) => {
    await mockAll(page);
    await signInAndCache(page);
    const id = await openSeeded(page, PLAN_DB);
    await saveSet(page);
    await page.goto(`/session/${id}`);
    await expect(rest(page)).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => loadText(page)).toMatch(/× 10/);
    const after = await loadText(page);
    test.info().annotations.push({ type: "hard-reload-into-rest", description: after });
    console.log(`T-0991 hard reload into the rest reads: "${after}"`);
  });

  test("sibling: barbell-row never shows a word on its rest", async ({ page }) => {
    await mockAll(page);
    await signInAndCache(page);
    await openSeeded(page, PLAN_BARBELL);
    await saveSet(page);
    expect(await loadText(page)).toBe("12 kg × 10");
    await expect(loadOf(page).locator(".wl-uf09__sr")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/per (arm|leg|side)/);
  });
});

// ---------------------------------------------------------------------------------------------
// AC3: 320 px and 200 % zoom: no truncation, no horizontal scroll, Skip rest reachable.
// ---------------------------------------------------------------------------------------------

type Case = "new-exercise" | "same-flagged";

/** Reaches the worst-case rest for `which` with the longest library name. */
async function reachWorstRest(page: Page, which: Case): Promise<void> {
  await mockAll(page, library(LONG_NAME));
  await signInAndCache(page);
  await openSeeded(page, which === "new-exercise" ? PLAN_A1B : PLAN_DB);
  await saveSet(page);
  await expect(nameOf(page)).toHaveText(LONG_NAME);
}

async function zoom200(page: Page): Promise<void> {
  await page.setViewportSize({ width: 160, height: 284 });
  await page.addInitScript(() => {
    const zoom = () => {
      document.documentElement.style.fontSize = "200%";
    };
    if (document.documentElement) zoom();
    else document.addEventListener("DOMContentLoaded", zoom);
  });
}

/** The three checks of AC3, then returns the measured heights. */
async function checkReachable(
  page: Page,
  label: string,
  pageScroll: "page" | "block" = "page",
): Promise<string> {
  const name = nameOf(page);
  const dims = await name.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  expect(dims.sw, `${label}: the name is not truncated`).toBe(dims.cw);
  const cue = cueOf(page);
  if ((await cue.count()) > 0) {
    const c = await cue.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(c.sw, `${label}: the cue is not truncated`).toBe(c.cw);
  }
  const page_ = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    sh: document.documentElement.scrollHeight,
    vh: window.innerHeight,
    y: window.scrollY,
  }));
  if (pageScroll === "page") {
    expect(page_.sw, `${label}: no horizontal scroll`).toBeLessThanOrEqual(page_.cw);
  } else {
    // Only the Next block: nothing in it reaches past the viewport's right edge.
    const past = await rest(page)
      .locator('[data-field="next"], [data-field="next"] *')
      .evaluateAll(
        (els, cw) => els.filter((e) => e.getBoundingClientRect().right > cw + 0.5).length,
        page_.cw,
      );
    expect(past, `${label}: the Next block stays inside the viewport`).toBe(0);
  }

  const nextBox = await settledBox(rest(page).locator('[data-field="next"]'));
  const nameBox = await settledBox(name);
  const skip = page.getByRole("button", { name: "Skip rest" });
  const before = await settledBox(skip);
  await skip.scrollIntoViewIfNeeded();
  const after = await settledBox(skip);
  expect(after, label).not.toBeNull();
  expect(after!.y, `${label}: Skip rest is in the viewport`).toBeGreaterThanOrEqual(0);
  expect(after!.y + after!.height, `${label}: Skip rest is in the viewport`).toBeLessThanOrEqual(
    page_.vh + 0.5,
  );
  const summary =
    `${label}: viewport ${page_.cw}x${page_.vh}, document height ${page_.sh}, ` +
    `name ${Math.round(nameBox?.width ?? 0)}x${Math.round(nameBox?.height ?? 0)}, ` +
    `Next block height ${Math.round(nextBox?.height ?? 0)}, ` +
    `Skip rest top (document) ${Math.round((before?.y ?? 0) + page_.y)} of ${Math.round(skip ? (before?.height ?? 0) : 0)} px tall, ` +
    `scrolls by ${Math.max(0, page_.sh - page_.vh)} px`;
  test.info().annotations.push({ type: "measured", description: summary });
  console.log(`T-0991 ${summary}`);
  await skip.click();
  await expect(rest(page)).toHaveCount(0);
  return summary;
}

test.describe("AC3 320 px and 200 % zoom", () => {
  for (const which of ["new-exercise", "same-flagged"] as const) {
    test(`320 x 568, ${which}: the long name is not truncated, no horizontal scroll, Skip rest reachable and clickable`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await reachWorstRest(page, which);
      if (which === "new-exercise") await expect(cueOf(page)).toHaveText(CUE);
      else expect(await loadText(page)).toBe("12 kg × 10 per arm");
      await checkReachable(page, `320x568 ${which}`);
    });

    test(`200 % zoom (160 x 284, root font 200 %), ${which}: the Next block is whole and Skip rest is reachable and clickable`, async ({
      page,
    }) => {
      await zoom200(page);
      await reachWorstRest(page, which);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(
        "32px",
      );
      if (which === "new-exercise") await expect(cueOf(page)).toHaveText(CUE);
      else expect(await loadText(page)).toBe("12 kg × 10 per arm");
      await checkReachable(page, `200% ${which}`, "block");
    });

    // KNOWN DEFECT (reported by T-0991, follow-up for the web lane): at a 160 px viewport the
    // rest's timer ("1:30", clamp(5rem, 36vw, ...)) is wider than the page's content box, so the
    // page scrolls sideways (scrollWidth 186 > 160). It is the timer, not the Next block.
    // `test.fail` flips red once that is fixed, so the marker gets removed then.
    test(`browser zoom 200 % (160 x 284, root font 16 px), ${which}: all three checks, page-level`, async ({
      page,
    }) => {
      test.fail();
      await page.setViewportSize({ width: 160, height: 284 });
      await reachWorstRest(page, which);
      await checkReachable(page, `zoom ${which}`);
    });

    // KNOWN DEFECT (reported by T-0991, follow-up for the web lane): with BOTH a 160 px viewport and
    // a 200 % root font, the timer, the pre-existing "-15 s / +15 s" row and Skip rest's arrow
    // overflow the page horizontally (scrollWidth 351 > 160). Not the Next block. `test.fail` flips
    // red once that is fixed, so the marker gets removed then.
    test(`200 % zoom (160 x 284, root font 200 %), ${which}: no horizontal scroll on the page`, async ({
      page,
    }) => {
      test.fail();
      await zoom200(page);
      await reachWorstRest(page, which);
      await checkReachable(page, `200% ${which} page`);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// AC4: offline.
// ---------------------------------------------------------------------------------------------

test.describe("AC4 offline (NFR-OFF-2)", () => {
  test("offline with the cached details: both rests of AC1 show the name, the cue and the word; online shows the same", async ({
    page,
    context,
  }) => {
    const errors = watchErrors(page);
    await mockAll(page);
    await openOffline(page, context, PLAN_AB);

    // Same exercise (the unflagged control): name and load, no word, no cue.
    await saveSet(page);
    await expect(caption(page)).toHaveText("Next · set 2 of 3");
    await expect(nameOf(page)).toHaveText("Barbell row");
    expect(await loadText(page)).toMatch(/^12 kg × 1\d$/);
    await skipRest(page);
    await saveSet(page);
    await skipRest(page);

    // New exercise: the name and the cue, from the cache.
    await saveSet(page);
    await expect(caption(page)).toHaveText("Next exercise");
    await expect(nameOf(page)).toHaveText("Dumbbell row");
    await expect(cueOf(page)).toHaveText(CUE);
    await skipRest(page);
    await expect(screen(page, "UF-09.6").locator('[data-field="cue"]')).toHaveText(CUE);
    expect(errors()).toEqual([]);
  });

  test("offline, the flagged row's rest reads '× 10 per arm' from the cache", async ({
    page,
    context,
  }) => {
    await mockAll(page);
    await openOffline(page, context, PLAN_DB);
    await saveSet(page);
    await expect(nameOf(page)).toHaveText("Dumbbell row");
    await expect.poll(() => loadText(page)).toBe("12 kg × 10 per arm");
  });

  test("a detail missing from the cache: the name shows, there is no cue line and no console error", async ({
    page,
    context,
  }) => {
    const errors = watchErrors(page);
    await mockAll(page);
    await openOffline(page, context, PLAN_A1B, "dumbbell-row");
    await saveSet(page);
    await expect(caption(page)).toHaveText("Next exercise");
    await expect(nameOf(page)).toHaveText("Dumbbell row");
    // Give the cache read time to settle: it must stay empty.
    await page.waitForTimeout(500);
    await expect(cueOf(page)).toHaveCount(0);
    await expect(rest(page).locator('[data-field="next"] > *')).toHaveCount(2);
    expect(errors()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// AC5: zero history, and a return after 10 days off built through UF-08.
// ---------------------------------------------------------------------------------------------

let seq = 0;
function histSet(daysAgo: number, reps: number, kg: number, s = 0) {
  const day = new Date();
  day.setHours(12, 0, 0, 0);
  day.setDate(day.getDate() - daysAgo);
  const at = new Date(day.getTime() + s * 60_000).toISOString();
  return {
    client_id: `t0991-${seq++}`,
    session_id: `T0991-S-${daysAgo}`,
    exercise_id: "dumbbell-row",
    is_warmup: false,
    completed_at: at,
    edited_at: at,
    deleted_at: null,
    reps,
    weight_kg: kg,
    duration_s: null,
  };
}
const rowSets = (daysAgo: number) => [
  histSet(daysAgo, 10, 12, 0),
  histSet(daysAgo, 10, 12, 2),
  histSet(daysAgo, 9, 12, 4),
];

test.describe("AC5 zero history and a return after 10 days off", () => {
  test("zero history: the rest shows the name above 'Set weight'", async ({ page }) => {
    await mockAll(page);
    await signInAndCache(page);
    await openSeeded(
      page,
      planOf(item("barbell-row", 3, { weightKg: null, reps: 10 }), item("dumbbell-row", 3)),
    );
    await saveSet(page);
    await expect(nameOf(page)).toHaveText("Barbell row");
    await expect(rest(page).locator(".wl-uf09__ask")).toHaveText("Set weight");
    const name = await settledBox(nameOf(page));
    const ask = await settledBox(rest(page).locator(".wl-uf09__ask"));
    expect(name).not.toBeNull();
    expect(ask).not.toBeNull();
    expect(name!.y + name!.height).toBeLessThanOrEqual(ask!.y + 0.5);
  });

  test("10 days off, built through UF-08: the rest shows the name and the engine's re-entry load", async ({
    page,
  }) => {
    await mockAll(page, library(), [...rowSets(24), ...rowSets(17), ...rowSets(10)]);
    await signInAndCache(page);
    await page.goto("/session/setup");
    await expect(screen(page, "UF-08.1")).toBeVisible();
    await page.getByRole("button", { name: "30 minutes" }).click();
    await expect(page.locator('[data-part="fit-line"]')).toHaveText(/^Fits:/);
    await page.getByRole("button", { name: "Start empty" }).click();
    await expect(screen(page, "UF-08.2")).toBeVisible();
    await page.getByRole("button", { name: "Add exercise" }).click();
    const sheet = screen(page, "UF-08.5");
    await expect(sheet).toBeVisible();
    await sheet.getByLabel("Search exercises").fill("dumbbell row");
    await sheet
      .getByRole("button", { name: /^Add Dumbbell row/ })
      .first()
      .click();
    await expect(sheet).toHaveCount(0);
    await page.getByRole("button", { name: "Looks good" }).click();
    await expect(screen(page, "UF-08.4")).toBeVisible();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page).toHaveURL(/\/session\/[0-9a-f-]{36}$/);
    await page.getByRole("button", { name: "Skip warm-up" }).click();
    await expect(screen(page, "UF-09.3")).toBeVisible();
    await saveSet(page);
    await expect(nameOf(page)).toHaveText("Dumbbell row");
    // Held at 12 kg after 10 days off (the one-side spec's rule), with the word.
    await expect.poll(() => loadText(page)).toMatch(/^12 kg × \d+ per arm$/);
  });
});

// ---------------------------------------------------------------------------------------------
// AC6: accessibility, targets, hierarchy, no live region.
// ---------------------------------------------------------------------------------------------

test.describe("AC6 accessibility and hierarchy", () => {
  for (const [label, planBody] of [
    ["same exercise, flagged", PLAN_DB],
    ["new exercise", PLAN_A1B],
  ] as const) {
    test(`${label}: axe clean, every button at least 44 px, the timer is the largest text, the Next block has no aria-live`, async ({
      page,
    }) => {
      await mockAll(page);
      await signInAndCache(page);
      await openSeeded(page, planBody);
      await saveSet(page);
      await expect(nameOf(page)).toBeVisible();

      const results = await new AxeBuilder({ page })
        .include('[data-screen-id="UF-09.5"]')
        .analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target)}`),
        "axe",
      ).toEqual([]);
      const colour = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(colour.violations).toEqual([]);

      const buttons = rest(page).getByRole("button");
      const count = await buttons.count();
      // Pause, -15 s, +15 s and Skip rest.
      expect(count).toBe(4);
      for (let i = 0; i < count; i++) {
        const b = buttons.nth(i);
        const box = await settledBox(b);
        const n = (await b.getAttribute("aria-label")) ?? (await b.textContent());
        expect(box, `button ${n}`).not.toBeNull();
        expect(box!.width, `${n} width`).toBeGreaterThanOrEqual(44);
        expect(box!.height, `${n} height`).toBeGreaterThanOrEqual(44);
      }

      // The timer's font is larger than every other text on the screen.
      const sizes = await rest(page).evaluate((root) => {
        const timer = root.querySelector('[role="timer"]');
        const own = (el: Element) =>
          [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
        const others = [...root.querySelectorAll("*")]
          .filter((el) => el !== timer && own(el))
          .map((el) => ({
            cls: el.className,
            px: parseFloat(getComputedStyle(el).fontSize),
          }));
        return { timer: parseFloat(getComputedStyle(timer as Element).fontSize), others };
      });
      expect(sizes.others.length).toBeGreaterThan(0);
      for (const o of sizes.others) {
        expect(sizes.timer, `timer vs ${o.cls}`).toBeGreaterThan(o.px);
      }

      const live = await rest(page)
        .locator('[data-field="next"]')
        .evaluate((el) => ({
          self: el.closest("[aria-live]") !== null || el.hasAttribute("role"),
          inner: el.querySelectorAll("[aria-live], [role]").length,
        }));
      expect(live).toEqual({ self: false, inner: 0 });
    });
  }
});
