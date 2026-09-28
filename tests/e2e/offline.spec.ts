// T-0300c offline e2e (AC-C20). Supabase is always mocked through `page.route`
// (`fixtures/supabase-mock.ts`): this spec never hits the network or a real Supabase project.
// The 501 catch-alls (`mockSupabaseAuth`, `mockSupabaseRest`) are registered first in
// `beforeEach`, so they end up as Playwright's last-matched backstop for anything the specific
// routes below don't claim.
import { expect, test } from "@playwright/test";
import {
  FAKE_USER_ID,
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";

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
    const sets = Array.from({ length: 5 }, (_, i) =>
      set(`c-${i}`, `2026-09-2${i}T10:00:00.000Z`),
    );

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

    page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
    page.on("pageerror", (err) => console.log("PAGE ERROR:", err));
    page.on("requestfailed", (req) => console.log("REQ FAILED:", req.url(), req.failure()?.errorText));
    page.on("response", (res) => {
      if (res.url().includes("session_sets_live")) {
        console.log("RESPONSE:", res.url(), res.status());
      }
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
