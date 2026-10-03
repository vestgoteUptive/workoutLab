// T-0468 UF-09 e2e from UF-08.4 Start — a 10-set offline workout that survives a closed page and
// flushes in order (NFR-OFF-2, parent AC-D8), and two offline devices make two sessions, never a
// merge (NFR-SYNC-4, parent AC-D9). Split out of T-0304h's spec per D-0168 §1, in its own file so
// it never edits that one. Runs against `vite preview`; `test`/`expect` come from the guarded
// fixture (D-0086), with its own `installSupabaseGuard(context)` for the AC-2 second context
// (the `test`/`expect` import already auto-installs one on the first context, D-0086 §…: see
// `fixtures/guarded-test.ts`'s `supabaseGuard` auto fixture).
//
// Every row starts where a real workout starts: `/` → Start workout → UF-08.1 → a budget chip →
// Suggest → UF-08.2 → Looks good → UF-08.4 → Start. AC-1 uses "45 minutes": at zero history, with
// this spec's library/profile fixtures, that plan has 5 items totalling 15 sets (bench-press × 4,
// inverted-row × 3, back-squat × 3, calf-raise × 3, leg-curl × 2 — recorded here as the build log
// also states), none of them timed, so 10 sets crosses two item boundaries (UF-09.6 "I'm ready"
// shown twice) with 5 left over. AC-2 uses the default "30 minutes" chip (1 set is enough there).
//
// AC-2's second context (`contextB`/`pageB`) is not the test's own `context`, so the guarded-test
// fixture's auto `consoleGuard` — installed only on the fixture's own `context` — never sees it
// (found by QA: a deliberate `console.error` on `pageB` still let AC-2 pass). AC-2 installs its own
// `installConsoleGuard(contextB)` and asserts it clean at teardown, the same pattern its own
// `installSupabaseGuard(contextB)` line already uses one line below.
import type { Page } from "@playwright/test";
import {
  expect,
  installConsoleGuard,
  installSupabaseGuard,
  test,
  type ConsoleGuard,
  type SupabaseGuard,
} from "./fixtures/guarded-test.js";
import {
  injectSession,
  mockProfilePresent,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
  VITE_SUPABASE_URL,
} from "./fixtures/supabase-mock.js";
import { exerciseAreas, exercises, profile } from "./fixtures/uf-04-library-data.js";

const F_TARGETS: Record<string, number> = {
  chest: 20,
  back: 20,
  shoulders: 16,
  arms: 12,
  core: 12,
  glutes: 20,
  quads: 20,
  hamstrings: 16,
  calves: 12,
};
const AREA_TARGETS = Object.entries(F_TARGETS).map(([area, sets]) => ({
  area_id: area,
  sets_per_14d: sets,
  source: "default",
  updated_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
}));

const SESSION_URL = /\/session\/([0-9a-f-]{36})$/;

/** Registers the mocks a fresh `page` needs: auth, the REST 501 backstop, the fixture data (zero
 *  history, the l1+ library) and a present profile. Every test — both AC-1's one page and each of
 *  AC-2's two contexts — calls this once per page before `startFromReady`. */
async function mockAll(page: Page): Promise<void> {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets: [],
    exercises,
    exerciseAreas,
    areaTargets: AREA_TARGETS,
    profile,
  });
  await mockProfilePresent(page, { ...profile, user_id: "e2e-fake-user-0001" });
}

/** Signs in and loads `/session/setup` (UF-08.1), online, with a hard navigation (`page.goto`,
 *  not a click) — the same warm-up `uf-08-setup.spec.ts`'s own offline row does (`openSetup`,
 *  then a `page.goto("/session/setup")` reload once offline). Split out of `startFromReady` so a
 *  test can run `precacheSettled` and go offline in between.
 *
 *  Measured: a dynamic `import()` of a lazy route's JS/CSS *while offline* can fail ("Unable to
 *  preload CSS for …") even once the workbox precache holds that asset, and even once the same
 *  route was already visited online earlier in the same page — Chromium's programmatically-
 *  inserted `<link>` for a code-split chunk's CSS (every `React.lazy` mount re-inserts one, not
 *  only the first) doesn't reliably resolve through the service worker the way a plain
 *  navigation's own `<link rel="stylesheet">` does. So `startFromReady` below reloads this same
 *  URL once offline (never a fresh SPA transition into it) before walking forward; nothing in
 *  this spec clicks "Start workout" from `/`. */
async function openHome(page: Page): Promise<void> {
  await page.goto("/");
  await injectSession(page);
  await page.goto("/session/setup");
  await expect(page.locator('[data-screen-id="UF-08.1"]')).toBeVisible();
}

/** Reloads `/session/setup` (already loaded once online by `openHome`) — offline-safe, see that
 *  function's comment — then: UF-08.1 → `budgetChip` → Suggest → UF-08.2 → Looks good → UF-08.4 →
 *  Start. Returns the `/session/<id>` id. T-0304h has its own copy in its own spec (D-0168 §1):
 *  no shared file, so the two specs can land in either order. */
async function startFromReady(page: Page, budgetChip = "30 minutes"): Promise<string> {
  await page.goto("/session/setup");
  await expect(page.locator('[data-screen-id="UF-08.1"]')).toBeVisible();
  await page.getByRole("button", { name: budgetChip }).click();
  await page.getByRole("button", { name: "Suggest my workout" }).click();
  await expect(page.locator('[data-screen-id="UF-08.2"]')).toBeVisible();
  await page.getByRole("button", { name: "Looks good" }).click();
  await expect(page.locator('[data-screen-id="UF-08.4"]')).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(SESSION_URL);
  return SESSION_URL.exec(page.url())![1]!;
}

/** AC-3: one `[data-screen-id]`, and no navigation landmark, on `/session/<id>`. */
async function expectOneScreen(page: Page): Promise<void> {
  await expect(page.locator("[data-screen-id]")).toHaveCount(1);
  await expect(page.getByRole("navigation")).toHaveCount(0);
}

/** Waits for the service worker's precache to *settle* before going offline (T-0904, D-0091 §1):
 *  `navigator.serviceWorker.ready` resolves on activation, well before workbox has finished
 *  `addAll`-ing every entry (measured in `offline.spec.ts`), and this spec's flow needs more than
 *  the navigation fallback — the lazy UF-08/UF-09 chunks the "Start workout" click imports must
 *  be in the precache too (`vite.config.ts`'s `globPatterns` lists every `.js`/`.css` asset), or
 *  the dynamic `import()` has nothing to resolve from while offline. So this polls for the entry
 *  count to stop growing, not just for `/index.html` to appear. */
async function precacheSettled(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  const countAndHasDocument = () =>
    page.evaluate(async () => {
      const keys = await caches.keys();
      const precache = keys.find((k) => k.startsWith("workbox-precache"));
      if (!precache) return { entries: 0, hasDocument: false };
      const requests = await (await caches.open(precache)).keys();
      return {
        entries: requests.length,
        hasDocument: requests.some((r) => new URL(r.url).pathname === "/index.html"),
      };
    });
  let previous = -1;
  await expect
    .poll(
      async () => {
        const counts = await countAndHasDocument();
        const stable = counts.entries > 0 && counts.entries === previous;
        previous = counts.entries;
        return stable && counts.hasDocument;
      },
      { message: "the workbox precache never finished populating before going offline" },
    )
    .toBe(true);
}

/** The total planned sets in the stored `wl-offline.sessions` row's plan (so the test reads the
 *  plan the app actually built, rather than hard-coding the engine's count). */
async function storedPlanSetCount(page: Page, id: string): Promise<number> {
  return page.evaluate(async (key: string) => {
    const req = indexedDB.open("wl-offline");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const entry = await new Promise<{ row: { plan: { items: { sets: number }[] } } } | undefined>(
      (resolve, reject) => {
        const get = db.transaction("sessions", "readonly").objectStore("sessions").get(key);
        get.onsuccess = () => resolve(get.result as never);
        get.onerror = () => reject(get.error);
      },
    );
    db.close();
    if (!entry) return 0;
    return entry.row.plan.items.reduce((sum, i) => sum + i.sets, 0);
  }, id);
}

interface StoredSet {
  clientId: string;
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  isWarmup: boolean;
}

/** Every `wl-offline.sets` row for `sessionId`. */
async function storedSets(page: Page, sessionId: string): Promise<StoredSet[]> {
  return page.evaluate(async (sid: string) => {
    const req = indexedDB.open("wl-offline");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<
      {
        clientId: string;
        sessionId: string;
        exerciseId: string;
        setIndex: number;
        isWarmup: boolean;
      }[]
    >((resolve, reject) => {
      const index = db.transaction("sets", "readonly").objectStore("sets").index("sessionId");
      const getAll = index.getAll(sid);
      getAll.onsuccess = () => resolve(getAll.result as never);
      getAll.onerror = () => reject(getAll.error);
    });
    db.close();
    return rows;
  }, sessionId);
}

interface SessionWrite {
  id: string;
  time_budget_min: number;
}

interface SetWrite {
  client_id: string;
  session_id: string;
}

/** A test-controlled stand-in for real network reachability. `context.setOffline(true)` does
 *  **not** stop a mocked `page.route` handler from fulfilling (measured, see `offline.spec.ts`'s
 *  header comment and D-0086 §4): the mock would otherwise "send" a write while genuinely
 *  offline, which is exactly wrong for a spec whose point is a request that must not go out
 *  until reconnect — in particular, `AutoSync`'s mount-time `handle.flushNow()` runs
 *  unconditionally (`apps/web/src/lib/offline/AutoSync.tsx`), with no `navigator.onLine` guard, so
 *  a freshly-mounted page (the "close and reopen" row's second page) would otherwise flush the
 *  whole queue through the mock before the test ever calls `setOffline(false)`. `recordWrites`
 *  below answers a write with a network error while `online` is false, so the recorded writes
 *  only ever reflect what a real device would actually have sent. */
interface NetworkGate {
  online: boolean;
}

function networkGate(): NetworkGate {
  return { online: false };
}

/** Records every `sessions` and `session_sets` write on `page`, registered after
 *  `mockSupabaseData` so it wins (the T-0303d AC-10 pattern: Playwright runs the most-recently-
 *  registered matching route first). A read answers `[]`, exactly as `mockSupabaseData` does, so
 *  this is purely additive instrumentation. `order` is a single arrival-ordered log of which kind
 *  landed when, so a caller can assert "no set write before the session write" without comparing
 *  two independent arrays' timings. A write is only "sent" (recorded and fulfilled) while
 *  `gate.online` is true; otherwise the route aborts, so the app's own retry/backoff is what
 *  decides when it tries again — exactly the real contract while offline. */
async function recordWrites(
  page: Page,
  gate: NetworkGate,
): Promise<{
  sessions: () => SessionWrite[][];
  sets: () => SetWrite[][];
  order: () => Array<"session" | "set">;
}> {
  const sessionWrites: SessionWrite[][] = [];
  const setWrites: SetWrite[][] = [];
  const order: Array<"session" | "set"> = [];
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/sessions*`, async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, json: [] });
      return;
    }
    if (!gate.online) {
      await route.abort("internetdisconnected");
      return;
    }
    const body = request.postDataJSON() as SessionWrite | SessionWrite[];
    sessionWrites.push(Array.isArray(body) ? body : [body]);
    order.push("session");
    await route.fulfill({ status: 201, json: [] });
  });
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/session_sets*`, async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, json: [] });
      return;
    }
    if (!gate.online) {
      await route.abort("internetdisconnected");
      return;
    }
    const body = request.postDataJSON() as SetWrite | SetWrite[];
    setWrites.push(Array.isArray(body) ? body : [body]);
    order.push("set");
    await route.fulfill({ status: 201, json: [] });
  });
  return {
    sessions: () => sessionWrites,
    sets: () => setWrites,
    order: () => [...order],
  };
}

/** Skips the warm-up (UF-09.1), then logs sets through Done set and either Save or — for the
 *  `autosaveAt` index (0-based among the sets logged by this call) — the real 5 s auto-save
 *  (D-0120 §9), skipping the rest after every set but the last. Handles the UF-09.6 "I'm ready"
 *  screen whenever the machine shows it (every item after the first, D-0111 "next"). Returns once
 *  `count` sets have been logged, leaving the UI on whatever screen comes next (UF-09.3, UF-09.6
 *  or a rest the caller didn't ask to skip past). */
async function logSets(page: Page, count: number, autosaveAt: number): Promise<void> {
  await page.getByRole("button", { name: "Skip warm-up" }).click();
  for (let i = 0; i < count; i++) {
    // UF-09.6 "Next exercise" between items; not shown before the very first item.
    const next = page.getByRole("button", { name: "I'm ready" });
    if (await next.isVisible().catch(() => false)) {
      await next.click();
    }
    await expect(page.locator('[data-screen-id="UF-09.3"]')).toBeVisible();
    await page.getByRole("button", { name: "Done set" }).click();
    await expect(page.locator('[data-screen-id="UF-09.4"]')).toBeVisible();
    if (i === autosaveAt) {
      // The real auto-save (D-0120 §9): no click, just wait past the 5 s timer.
      await page.waitForTimeout(5500);
    } else {
      await page.getByRole("button", { name: "Save" }).click();
    }
    const last = i === count - 1;
    if (!last) {
      await expect(page.locator('[data-screen-id="UF-09.5"]')).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: "Skip rest" }).click();
    }
  }
}

test.beforeEach(async ({ page }) => {
  await mockAll(page);
});

test.describe("T-0468 AC-1 a 10-set offline workout (NFR-OFF-2)", () => {
  test("T-0468 AC-1 start, 10 sets, a closed page, reopen, then flush on reconnect", async ({
    page,
    context,
  }) => {
    const gate = networkGate();
    const writes = await recordWrites(page, gate);

    await openHome(page);
    await precacheSettled(page);
    await context.setOffline(true);

    const id = await startFromReady(page, "45 minutes");
    const plannedSets = await storedPlanSetCount(page, id);
    expect(plannedSets).toBeGreaterThanOrEqual(11);

    // Ten sets: item 1 (4), item 2 (3), item 3 (3) — two "I'm ready" screens along the way. The
    // 6th set (index 5, item 2's 2nd set) goes through the real 5 s auto-save.
    await logSets(page, 10, 5);
    await expectOneScreen(page);

    const beforeClose = page.locator("[data-screen-id]");
    const screenId = await beforeClose.getAttribute("data-screen-id");
    const heading = await page.locator("h1").first().textContent();

    expect(writes.sessions()).toEqual([]);
    expect(writes.sets()).toEqual([]);

    await page.close();
    const reopened = await context.newPage();
    // A fresh page has none of `page`'s routes (Playwright page routes don't survive a close), so
    // the reopened page needs its own mocks and its own recorder before it goes online below —
    // sharing `gate` (still `online: false`), so its mount-time `AutoSync` flush (unconditional,
    // see `networkGate`'s comment) still gets a network error rather than "sending" early.
    await mockAll(reopened);
    const reopenedWrites = await recordWrites(reopened, gate);
    await reopened.goto(`/session/${id}`);
    await expect(reopened.locator(`[data-screen-id="${screenId}"]`)).toBeVisible();
    await expect(reopened.locator("h1").first()).toHaveText(heading ?? "");
    await expectOneScreen(reopened);

    const sets = await storedSets(reopened, id);
    expect(sets).toHaveLength(10);
    expect(new Set(sets.map((s) => s.clientId)).size).toBe(10);
    expect(sets.every((s) => !s.isWarmup)).toBe(true);
    const order = sets
      .slice()
      .sort((a, b) => a.setIndex - b.setIndex || a.exerciseId.localeCompare(b.exerciseId))
      .map((s) => `${s.exerciseId}#${s.setIndex}`);
    expect(new Set(order).size).toBe(10);

    gate.online = true;
    await context.setOffline(false);

    const t0 = Date.now();
    await expect
      .poll(
        () =>
          reopenedWrites
            .sessions()
            .flat()
            .some((w) => w.id === id),
        {
          timeout: Math.max(1, 10_000 - (Date.now() - t0)),
        },
      )
      .toBe(true);
    await expect
      .poll(() => reopenedWrites.sets().flat().length, {
        timeout: Math.max(1, 10_000 - (Date.now() - t0)),
      })
      .toBe(10);

    // None of this page's own writes ever claimed anything (offline the whole time), so the
    // arrival order recorded on the reopened page is the whole story: the session row's request
    // must have landed before the first `session_sets` request (arrival order == array order).
    const arrival = reopenedWrites.order();
    const firstSessionIndex = arrival.indexOf("session");
    const firstSetIndex = arrival.indexOf("set");
    expect(firstSessionIndex).toBeGreaterThanOrEqual(0);
    expect(firstSetIndex).toBeGreaterThanOrEqual(0);
    expect(firstSessionIndex).toBeLessThan(firstSetIndex);

    const allSetWrites = reopenedWrites.sets().flat();
    expect(allSetWrites).toHaveLength(10);
    expect(allSetWrites.every((w) => w.session_id === id)).toBe(true);
    expect(new Set(allSetWrites.map((w) => w.client_id)).size).toBe(10);

    await expectOneScreen(reopened);
  });
});

test.describe("T-0468 AC-2 two offline devices make two sessions (NFR-SYNC-4)", () => {
  test("T-0468 AC-2 both offline, each logs a set, both online: two sessions, no merge", async ({
    page: pageA,
    context: contextA,
    browser,
  }) => {
    const guardA = installSupabaseGuard(contextA);
    const gateA = networkGate();
    const writesA = await recordWrites(pageA, gateA);

    const contextB = await browser.newContext();
    const guardB: SupabaseGuard = installSupabaseGuard(contextB);
    const consoleGuardB: ConsoleGuard = installConsoleGuard(contextB);
    const pageB = await contextB.newPage();
    await mockAll(pageB);
    const gateB = networkGate();
    const writesB = await recordWrites(pageB, gateB);

    await openHome(pageA);
    await precacheSettled(pageA);
    await contextA.setOffline(true);
    const idA = await startFromReady(pageA, "30 minutes");
    await logSets(pageA, 1, 0);
    await expectOneScreen(pageA);

    await openHome(pageB);
    await precacheSettled(pageB);
    await contextB.setOffline(true);
    const idB = await startFromReady(pageB, "30 minutes");
    await logSets(pageB, 1, 0);
    await expectOneScreen(pageB);

    expect(idA).not.toBe(idB);
    expect(writesA.sessions()).toEqual([]);
    expect(writesA.sets()).toEqual([]);
    expect(writesB.sessions()).toEqual([]);
    expect(writesB.sets()).toEqual([]);

    gateA.online = true;
    gateB.online = true;
    await contextA.setOffline(false);
    await contextB.setOffline(false);

    await expect
      .poll(
        () =>
          writesA
            .sessions()
            .flat()
            .some((w) => w.id === idA),
        { timeout: 10_000 },
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          writesB
            .sessions()
            .flat()
            .some((w) => w.id === idB),
        { timeout: 10_000 },
      )
      .toBe(true);
    await expect
      .poll(() => writesA.sets().flat().length, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(() => writesB.sets().flat().length, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1);

    const sessionIdsA = writesA
      .sessions()
      .flat()
      .map((w) => w.id);
    const sessionIdsB = writesB
      .sessions()
      .flat()
      .map((w) => w.id);
    const allSessionIds = new Set([...sessionIdsA, ...sessionIdsB]);
    expect(allSessionIds.size).toBe(2);
    expect(allSessionIds.has(idA)).toBe(true);
    expect(allSessionIds.has(idB)).toBe(true);

    const setsA = writesA.sets().flat();
    const setsB = writesB.sets().flat();
    expect(setsA.every((s) => s.session_id === idA)).toBe(true);
    expect(setsB.every((s) => s.session_id === idB)).toBe(true);
    expect(setsA.some((s) => s.session_id === idB)).toBe(false);
    expect(setsB.some((s) => s.session_id === idA)).toBe(false);

    guardA.assertClean();
    guardB.assertClean();
    consoleGuardB.assertClean();

    await pageB.close();
    await contextB.close();
  });
});

test.describe("T-0468 AC-3 one screen at a time", () => {
  test("T-0468 AC-3 every assert point above holds one [data-screen-id] and no navigation", async ({
    page,
    context,
  }) => {
    await openHome(page);
    await precacheSettled(page);
    await context.setOffline(true);
    await startFromReady(page, "45 minutes");
    await expectOneScreen(page);
    await logSets(page, 3, 1);
    await expectOneScreen(page);
  });
});
