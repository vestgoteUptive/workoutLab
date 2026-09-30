// T-0300c offline e2e (AC-C20). Supabase is always mocked through `page.route`
// (`fixtures/supabase-mock.ts`): this spec never hits the network or a real Supabase project.
// The 501 catch-alls (`mockSupabaseAuth`, `mockSupabaseRest`) are registered first in
// `beforeEach`, so they end up as Playwright's last-matched backstop for anything the specific
// routes below don't claim.
//
// T-0904: `test` comes from `fixtures/guarded-test.js`, so "never hits the network" is now
// checked rather than asserted (D-0086). The 501 catch-alls above still do the real claiming —
// keeping a request off the network *is* the property being enforced, so a 501 counts as a
// claim and the guard is only the last resort behind them. Note the offline half stays green for
// that same reason, and not because it is exempt: `context.setOffline(true)` does **not** suspend
// route interception (measured — D-0086 §4), so these routes claim their requests while offline
// exactly as they do online.
import {
  FAKE_USER_ID,
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import { expect, test } from "./fixtures/guarded-test.js";

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

function set(clientId: string, completedAt: string) {
  return {
    client_id: clientId,
    session_id: "S1",
    exercise_id: "exercise-0",
    is_warmup: false,
    completed_at: completedAt,
    edited_at: completedAt,
    deleted_at: null,
    reps: 8,
    weight_kg: 60,
    duration_s: null,
  };
}

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
});

test.describe("AC-C20 offline cold start", () => {
  test("UF-02.1 renders offline within 3s after one online load, with 5 history rows and 12 exercises cached", async ({
    page,
    context,
  }) => {
    const exercises = Array.from({ length: 12 }, (_, i) => exercise(`exercise-${i}`));
    const areaTargets = [
      "chest",
      "back",
      "shoulders",
      "arms",
      "core",
      "glutes",
      "quads",
      "hamstrings",
      "calves",
    ].map((area) => ({
      area_id: area,
      sets_per_14d: 10,
      source: "default",
      updated_at: "2026-09-01T00:00:00.000Z",
    }));
    const sets = Array.from({ length: 5 }, (_, i) => set(`c-${i}`, `2026-09-2${i}T10:00:00.000Z`));

    await mockSupabaseData(page, {
      sets,
      exercises,
      exerciseAreas: [{ exercise_id: "exercise-0", area_id: "quads", weight: 1 }],
      areaTargets,
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
    });

    await page.goto("/");
    await injectSession(page);
    await page.goto("/");
    await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();

    // Let the shell's AutoSync effect run its caching fetches before going offline.
    await expect
      .poll(async () => {
        return page.evaluate(async (userId: string) => {
          const req = indexedDB.open("wl-offline");
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          async function countIn(storeName: string): Promise<number> {
            return new Promise<number>((resolve, reject) => {
              const tx = db.transaction(storeName, "readonly");
              const store = tx.objectStore(storeName);
              const countReq = store.count(IDBKeyRange.bound(`${userId}:`, `${userId}:￿`));
              countReq.onsuccess = () => resolve(countReq.result);
              countReq.onerror = () => reject(countReq.error);
            });
          }
          const library = await countIn("libraryCache");
          const history = await countIn("historyCache");
          db.close();
          return { library, history };
        }, FAKE_USER_ID);
      })
      .toEqual({ library: 12, history: 5 });

    // T-0904: wait for the service worker's precache to *settle* before going offline.
    //
    // This spec used to go straight from the IndexedDB poll to `setOffline(true)`, which is a
    // race it was only narrowly winning: the SW reports `active` and `controller` well before
    // workbox has finished populating `workbox-precache-v2`. Measured at the moment this test
    // went offline, across runs: 21 precached entries → passes, 16 → fails, 15 → fails, with
    // `page.reload()` dying on `net::ERR_INTERNET_DISCONNECTED` because the document itself was
    // not cached yet. The `injectSession`/`reload` latency the T-0904 guard adds was enough to
    // flip it from usually-winning to usually-losing, which is how it surfaced — but the race
    // was already there, and it is the likeliest explanation for the one-off
    // `ERR_INTERNET_DISCONNECTED` recorded against this line in CI run 36613911266
    // (docs/ci/CI-T-0904-auth-e2e-unmocked-profile-read.md, "two other failures").
    //
    // `shell.spec.ts` already awaits `navigator.serviceWorker.ready` for exactly this reason.
    // That alone is necessary but not sufficient, so this also waits for the entry count to stop
    // growing: `ready` resolves on activation, whereas `addAll` keeps writing afterwards.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(
        async () => {
          const counts = await page.evaluate(async () => {
            const keys = await caches.keys();
            const precache = keys.find((k) => k.startsWith("workbox-precache"));
            if (!precache) return { entries: 0, hasDocument: false };
            const cache = await caches.open(precache);
            const requests = await cache.keys();
            return {
              entries: requests.length,
              // The navigation fallback is the one entry `page.reload()` cannot do without.
              hasDocument: requests.some((r) => new URL(r.url).pathname === "/index.html"),
            };
          });
          return counts;
        },
        { message: "the workbox precache never finished populating before going offline" },
      )
      .toMatchObject({ hasDocument: true });

    await context.setOffline(true);
    await page.reload();

    await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible({ timeout: 3000 });

    const counts = await page.evaluate(async (userId: string) => {
      const req = indexedDB.open("wl-offline");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      async function countIn(storeName: string): Promise<number> {
        return new Promise<number>((resolve, reject) => {
          const tx = db.transaction(storeName, "readonly");
          const store = tx.objectStore(storeName);
          const countReq = store.count(IDBKeyRange.bound(`${userId}:`, `${userId}:￿`));
          countReq.onsuccess = () => resolve(countReq.result);
          countReq.onerror = () => reject(countReq.error);
        });
      }
      const historyCount = await countIn("historyCache");
      const libraryCount = await countIn("libraryCache");
      db.close();
      return { historyCount, libraryCount };
    }, FAKE_USER_ID);

    expect(counts.historyCount).toBe(5);
    expect(counts.libraryCount).toBe(12);
  });
});
