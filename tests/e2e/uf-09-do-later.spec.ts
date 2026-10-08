// T-0579 UF-09.9 "Do {name} later" e2e (D-0205 §9 §11): a 45-minute plan offline, bench-press
// done, Pause on UF-09.6 for the second item, "Do … later" -> UF-09.6 for the next item with the
// status line; reload keeps it; back online the session upsert carries the new order (AC5).
// Helpers are this spec's own copies (D-0168 §1).
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
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

interface SessionWrite {
  id: string;
  plan?: { items: { exerciseId: string }[] };
}

/** Records `sessions` writes; answers a network error while `online` is false (see uf-09-offline). */
async function recordSessionWrites(page: Page, gate: { online: boolean }) {
  const writes: SessionWrite[] = [];
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/sessions*`, async (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ status: 200, json: [] });
    if (!gate.online) return route.abort("internetdisconnected");
    const b = request.postDataJSON() as SessionWrite | SessionWrite[];
    writes.push(...(Array.isArray(b) ? b : [b]));
    return route.fulfill({ status: 201, json: [] });
  });
  return writes;
}

test.beforeEach(async ({ page }) => {
  await mockAll(page);
});

test.describe("T-0579 UF-09.9 Do later, offline and reload (AC5)", () => {
  test("offline tap, reload keeps the new order, online upsert carries it", async ({
    page,
    context,
  }) => {
    const gate = { online: false };
    const writes = await recordSessionWrites(page, gate);
    await openHome(page);
    await precacheSettled(page);
    await context.setOffline(true);
    const id = await startFromReady(page, "45 minutes");

    // Bench press (4 sets), then UF-09.6 for the second item.
    await page.getByRole("button", { name: "Skip warm-up" }).click();
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: "Done set" }).click();
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.locator('[data-screen-id="UF-09.5"]')).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: "Skip rest" }).click();
    }
    await expect(page.locator('[data-screen-id="UF-09.6"]')).toBeVisible();
    const second = (await page.locator("h1").first().textContent()) ?? "";

    await page.getByRole("button", { name: "Pause workout" }).click();
    await expect(page.locator('[data-screen-id="UF-09.9"]')).toBeVisible();
    await page.getByRole("button", { name: `Do ${second} later` }).click();
    await expect(page.locator('[data-screen-id="UF-09.6"]')).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "moved to later." })).toHaveText(
      `${second} moved to later.`,
    );
    const third = (await page.locator("h1").first().textContent()) ?? "";
    expect(third).not.toBe(second);
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
    expect(writes).toEqual([]);

    // Reload while offline: focus mode resumes on the new current item.
    await page.reload();
    await expect(page.locator('[data-screen-id="UF-09.6"]')).toBeVisible();
    await expect(page.locator("h1").first()).toHaveText(third);

    gate.online = true;
    await context.setOffline(false);
    await expect
      .poll(() => writes.filter((w) => w.id === id && w.plan).length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    const last = writes.filter((w) => w.id === id && w.plan).at(-1)!;
    const order = last.plan!.items.map((i) => i.exerciseId);
    expect(order.indexOf("inverted-row")).toBeGreaterThan(order.indexOf("bench-press") + 1);
    expect(order[0]).toBe("bench-press");
    expect(order[1]).not.toBe("inverted-row");
  });
});
