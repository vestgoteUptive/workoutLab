// T-0304a UF-09 Focus mode e2e (AC-13, AC-7 touch target). Runs against `vite preview` with
// Supabase mocked through `page.route`; T-0304b–e append their rows to this file.
//
// `test`/`expect` come from `fixtures/guarded-test.js` (D-0086): a Supabase request no route
// claims fails the test at teardown. The UF-09 host itself makes no network call (D-0111 §11);
// the requests here are the shell's (AutoSync, the profile gate on `/`), claimed by the mocks.
//
// The "built" row seeds one `sessions` row straight into the app's own IndexedDB, in the
// `QueuedSession` shape `upsertSession` writes (`lib/offline/db.ts`), after the app has opened
// the database. It uses `pending: false`, so AutoSync has nothing to flush.
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  FAKE_USER_ID,
  injectSession,
  mockProfilePresent,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";

const NOT_ON_DEVICE = "This workout isn't on this device";

const PROFILE = {
  goal: "build_muscle",
  level: "beginner",
  equipment: [],
  rhythm_min: 3,
  rhythm_max: 4,
  priority_areas: [],
  onboarded_at: "2026-09-01T00:00:00.000Z",
  plan_changed_at: "2026-09-01T00:00:00.000Z",
};

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets: [],
    exercises: [],
    exerciseAreas: [],
    areaTargets: [],
    profile: PROFILE,
  });
  await mockProfilePresent(page);
  await page.goto("/");
  await injectSession(page);
});

async function expectNotOnDevice(page: Page, timeout?: number): Promise<void> {
  const host = page.locator('[data-screen-id="UF-09"]');
  await expect(host.getByRole("heading", { level: 1, name: NOT_ON_DEVICE })).toBeVisible({
    timeout,
  });
  await expect(host.getByRole("link")).toHaveAttribute("href", "/");
  await expect(page.locator("[data-screen-id]")).toHaveCount(1);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
}

/** Waits for the service worker's precache to settle (the offline.spec.ts T-0904 pattern). */
async function precacheSettled(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const keys = await caches.keys();
          const precache = keys.find((k) => k.startsWith("workbox-precache"));
          if (!precache) return false;
          const requests = await (await caches.open(precache)).keys();
          return requests.some((r) => new URL(r.url).pathname === "/index.html");
        }),
      { message: "the workbox precache never finished populating before going offline" },
    )
    .toBe(true);
}

test.describe("AC-13 not on this device", () => {
  test("online: /session/<random uuid> shows the built not-on-device state and a link to /", async ({
    page,
  }) => {
    await page.goto(`/session/${randomUUID()}`);
    await expectNotOnDevice(page);
  });

  test("offline: after the precache settles, a reload shows the same text within 3 s", async ({
    page,
    context,
  }) => {
    const url = `/session/${randomUUID()}`;
    await page.goto(url);
    await expectNotOnDevice(page);
    await precacheSettled(page);
    await context.setOffline(true);
    await page.reload();
    await expectNotOnDevice(page, 3000);
  });

  test("axe reports 0 serious or critical violations", async ({ page }) => {
    await page.goto(`/session/${randomUUID()}`);
    await expectNotOnDevice(page);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });
});

const PLAN = {
  version: 1,
  mainLiftId: "bench-press",
  warmup: [{ exerciseId: "wu-arm-circle", durationS: 40 }],
  items: [
    {
      exerciseId: "bench-press",
      isMain: true,
      sets: 4,
      repsMin: 6,
      repsMax: 8,
      durationS: null,
      costS: 720,
      backoff: null,
      prefill: { weightKg: 80, reps: 6, durationS: null, kind: "add_rep" },
      reasons: [],
    },
  ],
  startDeficits: {
    chest: 1,
    back: 1,
    shoulders: 1,
    arms: 1,
    core: 1,
    glutes: 1,
    quads: 1,
    hamstrings: 1,
    calves: 1,
  },
};

/** Puts one `sessions` row into the app's `wl-offline` database (opened by the app first). */
async function seedSessionRow(page: Page, id: string): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await indexedDB.databases()).some((d) => d.name === "wl-offline" && (d.version ?? 0) > 0),
      ),
    )
    .toBe(true);
  await page.evaluate(
    async ({ id, userId, plan }) => {
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
            plan,
          },
          finished: false,
          pending: false,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { id, userId: FAKE_USER_ID, plan: PLAN },
  );
}

test.describe("AC-7 the chrome on a seeded session", () => {
  test("UF-09.1: one screen id, Pause workout is at least 44 x 44, no navigation, axe clean", async ({
    page,
  }) => {
    // TR-0036: in the built app `parseSessionPlan` can't compile its Ajv schema, because the CSP
    // has no 'unsafe-eval' (`script-src 'self'`), so every row reads as an invalid plan and the
    // host shows "not on this device". Marked as an expected failure so the bug stays visible:
    // once TR-0036 is fixed this row turns red, and the marker must be removed.
    test.fail(true, "TR-0036: parseSessionPlan (Ajv runtime compile) is blocked by the CSP");
    await page.goto("/");
    await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
    const id = randomUUID();
    await seedSessionRow(page, id);
    await page.goto(`/session/${id}`);
    await expect(page.locator('[data-screen-id="UF-09.1"]')).toBeVisible();
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
    const pause = page.getByRole("button", { name: "Pause workout" });
    const box = await pause.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await expect(page.getByRole("button")).toHaveCount(1);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
    // Pause → UF-09.9 with its one button, Resume.
    await pause.click();
    await expect(page.locator('[data-screen-id="UF-09.9"]')).toBeVisible();
    await expect(page.getByRole("button")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  });
});
