// T-0686b e2e cross-flow for the editable training level (D-0230, D-0231, D-0232, D-0233;
// spec docs/specs/editable-level.md AC10, AC11, AC12, AC14, AC15). Viewport 390 x 844.
//   AC1/AC7  UF-08.5 "Above your level. Change it in Plan > Edit plan." is text only, online/offline.
//   AC2      a level saved on UF-11.3 reaches UF-08 offline.
//   AC3      a running workout is untouched by a level change.
//   AC4      UF-01.3 shows the "change this later" line on the 3-activation path.
//   AC5      no level content on UF-09.1, .5, .9 or UF-05.1.
//   AC6      Node-side source scan of UF-09 / UF-05 for level strings.
// Helpers are this spec's own copies (D-0168 §1).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  FAKE_USER_ID,
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseEmptyReads,
  mockSupabaseRest,
  VITE_SUPABASE_URL,
} from "./fixtures/supabase-mock.js";
import { exerciseAreas, exercises, profile } from "./fixtures/uf-04-library-data.js";

test.use({ viewport: { width: 390, height: 844 } });

const AREA_TARGETS = [
  ["chest", 20],
  ["back", 20],
  ["shoulders", 16],
  ["arms", 12],
  ["core", 12],
  ["glutes", 20],
  ["quads", 20],
  ["hamstrings", 16],
  ["calves", 12],
].map(([area, sets]) => ({
  area_id: area,
  sets_per_14d: sets,
  source: "default",
  updated_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
}));

const SESSION_URL = /\/session\/([0-9a-f-]{36})$/;
const LINE = "Above your level. Change it in Plan › Edit plan.";

/** The spec-local stateful `profiles` row: GET serves it, PATCH merges the body into it. */
interface ProfileState {
  row: Record<string, unknown>;
  patches: Record<string, unknown>[];
}

async function mockAll(page: Page, level = "beginner"): Promise<ProfileState> {
  const state: ProfileState = {
    row: { ...profile, level, user_id: FAKE_USER_ID },
    patches: [],
  };
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets: [],
    exercises,
    exerciseAreas,
    areaTargets: AREA_TARGETS,
    profile: state.row,
  });
  // Registered after mockSupabaseData, so it wins for `profiles*`.
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/profiles*`, async (route) => {
    const request = route.request();
    if (request.method() === "PATCH") {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.patches.push(body);
      state.row = { ...state.row, ...body };
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ status: 200, json: [state.row] });
  });
  return state;
}

async function openHome(page: Page, path = "/session/setup"): Promise<void> {
  await page.goto("/");
  await injectSession(page);
  await page.goto(path);
}

/** Waits for the workbox precache to stop growing (T-0904, D-0091 §1) before going offline. */
async function precacheSettled(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  let previous = -1;
  await expect
    .poll(
      async () => {
        const counts = await page.evaluate(async () => {
          const keys = await caches.keys();
          const precache = keys.find((k) => k.startsWith("workbox-precache"));
          if (!precache) return { entries: 0, hasDocument: false };
          const requests = await (await caches.open(precache)).keys();
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
}

/** Waits until the offline cache holds the profile with this level. */
async function cachedLevel(page: Page, level: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async (userId: string) => {
          const db = await new Promise<IDBDatabase>((resolveDb, reject) => {
            const req = indexedDB.open("wl-offline");
            req.onsuccess = () => resolveDb(req.result);
            req.onerror = () => reject(req.error);
          });
          const row = await new Promise<{ profile?: { level?: string } } | undefined>(
            (resolveRow, reject) => {
              const get = db.transaction("profileCache", "readonly").objectStore("profileCache");
              const req = get.get(userId);
              req.onsuccess = () => resolveRow(req.result);
              req.onerror = () => reject(req.error);
            },
          );
          db.close();
          return row?.profile?.level ?? null;
        }, FAKE_USER_ID),
      { message: `the offline profile cache never held level ${level}` },
    )
    .toBe(level);
}

/** UF-08.1 -> budget -> Suggest -> UF-08.2. */
async function toSuggested(page: Page, budget = "30 minutes"): Promise<void> {
  await expect(page.locator('[data-screen-id="UF-08.1"]')).toBeVisible();
  await page.getByRole("button", { name: budget }).click();
  await page.getByRole("button", { name: "Suggest my workout" }).click();
  await expect(page.locator('[data-screen-id="UF-08.2"]')).toBeVisible();
}

/** T-1019: UF-08.2 -> Chest and Quads out (the plan fills 30 min, so an Add needs room) -> UF-08.6 of
 *  Back, where "Add exercise" lives now (D-0274). Pull-up is a Back exercise. */
async function toBackDetail(page: Page, budget = "30 minutes"): Promise<void> {
  await toSuggested(page, budget);
  for (const area of ["chest", "quads"]) {
    const minus = page.locator(`[data-area="${area}"] [data-part="minus"]`);
    while ((await minus.getAttribute("aria-label"))!.startsWith("One set less"))
      await minus.click();
    await minus.click();
    await expect(page.locator(`[data-part="area-row"][data-area="${area}"]`)).toHaveCount(0);
  }
  await page.locator('[data-area="back"] [data-part="area-open"]').click();
  await expect(page.locator('[data-screen-id="UF-08.6"]')).toBeVisible();
}

async function startFromSuggested(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Start workout", exact: true }).click();
  await expect(page).toHaveURL(SESSION_URL);
  return SESSION_URL.exec(page.url())![1]!;
}

async function openAddSheet(page: Page, query: string) {
  await page.getByRole("button", { name: "Add exercise" }).click();
  const sheet = page.locator('[data-screen-id="UF-08.5"]');
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Search exercises").fill(query);
  return sheet;
}

async function expectPointerIsTextOnly(page: Page): Promise<void> {
  const items = page.locator('[data-part="detail-row"]');
  const before = await items.count();
  const url = page.url();
  const sheet = await openAddSheet(page, "pull");
  const row = sheet.locator('[data-part="pick-row"]').filter({ hasText: "Pull-up" });
  await expect(row).toContainText(LINE);
  const add = row.getByRole("button", { name: "Add Pull-up" });
  await expect(add).toHaveAttribute("aria-disabled", "true");
  await expect(sheet.locator('a[href*="/plan"]')).toHaveCount(0);

  await row.getByText(LINE).click();
  await add.click({ force: true });
  expect(page.url()).toBe(url);
  await expect(sheet).toBeVisible();
  await expect(row).toContainText(LINE);

  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('[data-screen-id="UF-08.6"]')).toBeVisible();
  expect(page.url()).toBe(url);
  await expect(items).toHaveCount(before);
}

test.describe("T-0686b AC1/AC7 UF-08.5 pointer is text only", () => {
  test("T-0686b AC1: level beginner, online: the line, a disabled Add, no link, the visit stays", async ({
    page,
  }) => {
    await mockAll(page);
    await openHome(page);
    await toBackDetail(page);
    await expectPointerIsTextOnly(page);
  });

  test("T-0686b AC7: the same line and no link with the context offline", async ({
    page,
    context,
  }) => {
    await mockAll(page);
    await openHome(page);
    await precacheSettled(page);
    await context.setOffline(true);
    await page.goto("/session/setup");
    await toBackDetail(page);
    await expectPointerIsTextOnly(page);
  });
});

test.describe("T-0686b AC2 a new level reaches UF-08 offline", () => {
  test("T-0686b AC2: Intermediate saved on /plan/edit, then offline: Pull-up can be added", async ({
    page,
    context,
  }) => {
    const state = await mockAll(page);
    await openHome(page, "/plan/edit");
    await expect(page.locator('[data-screen-id="UF-11.3"]')).toBeVisible();
    const levels = page.getByRole("radiogroup", { name: "Level" });
    await levels.getByRole("radio", { name: "Intermediate" }).check();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/plan$/);
    expect(state.patches).toEqual([{ level: "intermediate" }]);
    await cachedLevel(page, "intermediate");

    await page.goto("/session/setup");
    await precacheSettled(page);
    await context.setOffline(true);
    await page.goto("/session/setup");
    await toBackDetail(page);

    const sheet = await openAddSheet(page, "pull");
    const row = sheet.locator('[data-part="pick-row"]').filter({ hasText: "Pull-up" });
    await expect(row).toBeVisible();
    await expect(row).not.toContainText("Above your level");
    const add = row.getByRole("button", { name: "Add Pull-up" });
    await expect(add).not.toHaveAttribute("aria-disabled", "true");
    await add.click();
    await expect(sheet).toHaveCount(0);
    await expect(
      page.locator('[data-part="detail-row"]').filter({ hasText: "Pull-up" }),
    ).toHaveCount(1);
  });
});

interface SessionWrite {
  id: string;
  plan?: { items: { exerciseId: string }[] };
}

/** Records `sessions` writes and answers a network error, so the queued row stays in IndexedDB. */
async function recordSessionWrites(page: Page): Promise<SessionWrite[]> {
  const writes: SessionWrite[] = [];
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/sessions*`, async (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ status: 200, json: [] });
    const b = request.postDataJSON() as SessionWrite | SessionWrite[];
    writes.push(...(Array.isArray(b) ? b : [b]));
    return route.abort("internetdisconnected");
  });
  return writes;
}

/** The plan item ids of the queued `sessions` row, read back from IndexedDB. */
async function storedPlanIds(page: Page, id: string): Promise<string[] | null> {
  return page.evaluate(async (sessionId: string) => {
    const db = await new Promise<IDBDatabase>((resolveDb, reject) => {
      const req = indexedDB.open("wl-offline");
      req.onsuccess = () => resolveDb(req.result);
      req.onerror = () => reject(req.error);
    });
    const row = await new Promise<{ row?: { plan?: { items?: { exerciseId: string }[] } } }>(
      (resolveRow, reject) => {
        const req = db.transaction("sessions", "readonly").objectStore("sessions").get(sessionId);
        req.onsuccess = () => resolveRow(req.result);
        req.onerror = () => reject(req.error);
      },
    );
    db.close();
    return row?.row?.plan?.items?.map((i) => i.exerciseId) ?? null;
  }, id);
}

async function startWorkout(page: Page): Promise<string> {
  await openHome(page);
  await toSuggested(page);
  const id = await startFromSuggested(page);
  await expect(page.locator('[data-screen-id="UF-09.1"]')).toBeVisible();
  return id;
}

test.describe("T-0686b AC3 a running workout is untouched", () => {
  test("T-0686b AC3: the level changes to advanced, the app reloads, the workout resumes unchanged", async ({
    page,
  }) => {
    const state = await mockAll(page);
    const writes = await recordSessionWrites(page);
    const id = await startWorkout(page);

    const firstItem = page.locator('[data-field="first-item"]');
    const nextBefore = (await firstItem.textContent()) ?? "";
    expect(nextBefore).not.toBe("");
    await expect.poll(() => writes.filter((w) => w.id === id && w.plan).length).toBeGreaterThan(0);
    const recorded = writes.filter((w) => w.id === id && w.plan).at(-1)!.plan!.items;
    const recordedIds = recorded.map((i) => i.exerciseId);
    expect(recordedIds.length).toBeGreaterThan(0);
    expect(recordedIds).not.toContain("pull-up");
    expect(await storedPlanIds(page, id)).toEqual(recordedIds);

    // Another device saves advanced; this device refreshes online.
    state.row = { ...state.row, level: "advanced" };
    await page.reload();
    await cachedLevel(page, "advanced");
    await page.goto(`/session/${id}`);

    await expect(page.locator('[data-screen-id="UF-09.1"]')).toBeVisible();
    await expect(page.locator('[data-field="first-item"]')).toHaveText(nextBefore);
    expect(await storedPlanIds(page, id)).toEqual(recordedIds);
    // UF-09.1 leads with the warm-up, so also walk to the first exercise: it is the recorded one.
    const firstName = (exercises as { id: string; name: string }[]).find(
      (e) => e.id === recordedIds[0],
    )!.name;
    await page.getByRole("button", { name: "Skip warm-up" }).click();
    await expect(page.locator("h1").first()).toHaveText(firstName);
    for (const w of writes.filter((x) => x.id === id && x.plan)) {
      expect(w.plan!.items.map((i) => i.exerciseId)).toEqual(recordedIds);
    }
  });
});

test.describe("T-0686b AC4 UF-01.3 line on the fastest path", () => {
  test("T-0686b AC4: Get started, Continue, Continue: the line shows, Beginner is checked, the plan renders in < 5 s", async ({
    page,
  }) => {
    await mockSupabaseRest(page);
    await mockSupabaseAuth(page);
    await mockSupabaseEmptyReads(page);
    const t0 = Date.now();
    await page.goto("/welcome");
    await page.getByRole("link", { name: "Get started" }).click();
    await expect(page.locator('[data-screen-id="UF-01.2"]')).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    const level = page.locator('[data-screen-id="UF-01.3"]');
    await expect(level).toBeVisible();
    await expect(level.getByText("You can change this later in Plan.")).toBeVisible();
    await expect(level.getByRole("radiogroup", { name: "Training experience" })).toBeVisible();
    await expect(level.getByRole("radio", { name: /^Beginner/ })).toBeChecked();
    await page.getByRole("button", { name: "Continue" }).click();
    const plan = page.locator('[data-screen-id="UF-01.4"]');
    await expect(plan).toBeVisible();
    await expect(plan.locator("[data-area]")).toHaveCount(9);
    expect(Date.now() - t0).toBeLessThan(5_000);
  });
});

async function expectNoLevelContent(page: Page, where: string): Promise<void> {
  const text = (await page.locator("body").innerText()).toLowerCase();
  expect(text, `${where}: "Change level"`).not.toContain("change level");
  expect(text, `${where}: "Change it in Plan"`).not.toContain("change it in plan");
  await expect(page.locator('a[href*="/plan/edit"]'), `${where}: a link to /plan/edit`).toHaveCount(
    0,
  );
}

test.describe("T-0686b AC5 focus mode is clean", () => {
  test("T-0686b AC5: UF-09.1, UF-09.5, UF-09.9 and UF-05.1 carry no level content", async ({
    page,
  }) => {
    await mockAll(page);
    await recordSessionWrites(page);
    await startWorkout(page);
    await expectNoLevelContent(page, "UF-09.1");

    await page.getByRole("button", { name: "Skip warm-up" }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator('[data-screen-id="UF-09.5"]')).toBeVisible({ timeout: 10_000 });
    await expectNoLevelContent(page, "UF-09.5");
    await page.getByRole("button", { name: "Skip rest" }).click();

    await page.getByRole("button", { name: "Pause workout" }).click();
    const paused = page.locator('[data-screen-id="UF-09.9"]');
    await expect(paused).toBeVisible();
    await expectNoLevelContent(page, "UF-09.9");

    await paused.getByRole("button", { name: "Swap" }).click();
    const sheet = page.locator('[data-screen-id="UF-05.1"]');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("radiogroup", { name: "Replacement" })).toBeVisible();
    await expectNoLevelContent(page, "UF-05.1");
  });
});

// AC6: the static half of AC5, a Node-side scan with no page.
const REPO = resolve(__dirname, "../..");
const FORBIDDEN = ["/plan/edit", "Change level", "Change it in Plan"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) ? [path] : [];
  });
}

test.describe("T-0686b AC6 no level pointer in the UF-09 / UF-05 sources", () => {
  test("T-0686b AC6: none of the focus-mode sources names the level strings", () => {
    const files = [
      ...sourceFiles(join(REPO, "apps/web/src/features/UF-09")),
      ...sourceFiles(join(REPO, "apps/web/src/features/UF-05")),
      join(REPO, "apps/web/src/lib/i18n/flows/uf-09.ts"),
      join(REPO, "apps/web/src/lib/i18n/flows/uf-05.ts"),
    ];
    expect(files.length).toBeGreaterThan(20);
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const needle of FORBIDDEN) {
        if (text.includes(needle)) hits.push(`${file.slice(REPO.length + 1)}: ${needle}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
