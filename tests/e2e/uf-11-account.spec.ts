// T-0469 UF-11.4 Account settings e2e (D-0136, NFR-PRIV-4/5, NFR-A11Y-1/2). Export and deletion
// are only trustworthy end to end with a real IndexedDB, a real download and a mocked Edge
// Function — the unit tests in T-0310d mock `lib/account` entirely.
//
// `test`/`expect` come from `fixtures/guarded-test.js` (D-0086): any unclaimed Supabase request
// fails the test at teardown. The signed-in user is the e2e session helper's
// (`ada@example.com`, id `11111111-1111-4111-8111-111111111111`, D-0172 §6); V below is any
// other uuid.
//
// Export rows (D-0172 §6): `mockSupabaseData` answers every `sessions*`/`session_sets*`/
// `session_sets_live*` read with `[]` first. This spec then registers GET routes matched by a
// predicate on the EXACT pathname (`/rest/v1/sessions`, `/rest/v1/session_sets`) — never a
// `session_sets*` glob, which would also match `session_sets_live?...` (measured in
// `supabase-mock.ts`'s own comment) and silently zero out the history read. Being registered
// after `mockSupabaseData`, these exact-path routes win for the bare paths while
// `session_sets_live*` still falls through to `mockSupabaseData`'s route.
import AxeBuilder from "@axe-core/playwright";
import type { Page, Route } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import { goOffline } from "./fixtures/offline.js";
import {
  FAKE_USER_ID,
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
  VITE_SUPABASE_URL,
} from "./fixtures/supabase-mock.js";
import {
  ACCOUNT_FIXTURES,
  ACCOUNT_PROFILE,
  EXPORT_SESSIONS,
  EXPORT_SETS,
} from "./fixtures/uf-11-account.js";

const MIN_TARGET_PX = 44;
const V = "22222222-2222-4222-8222-222222222222";

/** The exact-pathname predicate (D-0172 §6): matches `/rest/v1/sessions` or
 *  `/rest/v1/sessions?...`, never `/rest/v1/sessions_sets...` or `..._live...`. */
function exactPath(route: Route, pathname: string): boolean {
  return new URL(route.request().url()).pathname === pathname;
}

async function mockExportRows(page: Page): Promise<void> {
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/sessions*`, (route) => {
    if (route.request().method() !== "GET" || !exactPath(route, "/rest/v1/sessions")) {
      return route.fallback();
    }
    return route.fulfill({ status: 200, json: EXPORT_SESSIONS });
  });
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/session_sets*`, (route) => {
    if (route.request().method() !== "GET" || !exactPath(route, "/rest/v1/session_sets")) {
      return route.fallback();
    }
    return route.fulfill({ status: 200, json: EXPORT_SETS });
  });
  // `mockSupabaseData`'s `profiles*` route answers the shell's profile-gate `maybeSingle()`
  // read with a bare object (the real PostgREST shape for that call's
  // `Accept: application/vnd.pgrst.object+json`). The export's own `.select("*")` read (no
  // `maybeSingle`) sends a plain `Accept: application/json` and needs an array — the one case
  // this spec's fixture profile isn't already array-shaped. Distinguish by that header, falling
  // back to the shared route otherwise.
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/profiles*`, (route) => {
    const accept = route.request().headers().accept ?? "";
    if (route.request().method() !== "GET" || accept.includes("vnd.pgrst.object")) {
      return route.fallback();
    }
    return route.fulfill({ status: 200, json: [ACCOUNT_PROFILE] });
  });
}

interface AccountCall {
  method: string;
  authorization: string | null;
}

/** Registers `DELETE **\/functions/v1/account`, recording every call, answered with `status`.
 *  Also mocks the GoTrue local sign-out (`POST /auth/v1/logout?scope=local`) that
 *  `deleteAccountAndSignOut` fires right after a 204 (D-0136 §4 step 4) — unmocked, it hits the
 *  501 backstop and the guard fails the test even though the screen behaves correctly. Both
 *  routes must be awaited before the page navigates, or the route may not be active yet when the
 *  request is made (Playwright registers routes asynchronously).
 *
 *  D-0173 (fixed by T-0480, merged to main): on a 204, both of these are fulfilled correctly
 *  (confirmed with a temporary `requestfailed` listener: both got their 204), but the app's own,
 *  correct, existing behaviour (D-0136 §4 comment: a still-"signed-in" `AuthProvider` ref at
 *  check time does a **hard** `window.location.replace("/welcome")`, not an SPA navigate) tears
 *  the frame down right after, and Chromium also reports both as `requestfailed:
 *  net::ERR_ABORTED` even though they already resolved in-page. `guarded-test.ts`'s detector 2
 *  now exempts an already-fulfilled request aborted by a same-tick hard navigation (T-0480 added
 *  a `fulfilledResponses` set checked before reporting `requestfailed`), so this no longer fails
 *  the guard. AC-2 is written to the correct behaviour either way. */
async function mockAccountDelete(page: Page, status: number): Promise<AccountCall[]> {
  const calls: AccountCall[] = [];
  await page.route(`${VITE_SUPABASE_URL}/functions/v1/account`, (route) => {
    const request = route.request();
    calls.push({
      method: request.method(),
      authorization: request.headers().authorization ?? null,
    });
    if (status === 204) return route.fulfill({ status: 204 });
    return route.fulfill({ status, json: { error: "boom" } });
  });
  await page.route(`${VITE_SUPABASE_URL}/auth/v1/logout*`, (route) =>
    route.fulfill({ status: 204 }),
  );
  return calls;
}

async function open(page: Page): Promise<void> {
  await mockSupabaseData(page, ACCOUNT_FIXTURES);
  await mockExportRows(page);
  await page.goto("/");
  await injectSession(page);
  await page.goto("/plan/account");
}

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
});

test.describe("T-0469 AC-1 export (NFR-PRIV-4)", () => {
  test("T-0469 AC-1 downloads one workoutlab-export file with the 7 tables, 2 sessions, 3 sets", async ({
    page,
  }) => {
    let historyHit = false;
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/rest/v1/session_sets_live") historyHit = true;
    });

    await open(page);
    await expect(page.locator('[data-screen-id="UF-11.4"]')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export my data" }).click(),
    ]);

    const today = new Intl.DateTimeFormat("en-US", {
      timeZone: await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {} as Record<string, string>);
    expect(download.suggestedFilename()).toBe(
      `workoutlab-export-${today.year}-${today.month}-${today.day}.json`,
    );

    const path = await download.path();
    const body = JSON.parse(await (await import("node:fs/promises")).readFile(path!, "utf-8"));
    expect(body.format).toBe("workoutlab-export");
    expect(body.version).toBe(1);
    expect(Object.keys(body.tables)).toEqual([
      "profiles",
      "area_targets",
      "sessions",
      "session_sets",
      "routines",
      "routine_items",
      "plan_checkins",
    ]);
    expect(body.tables.sessions).toHaveLength(2);
    expect(body.tables.session_sets).toHaveLength(3);
    expect(historyHit, "the session_sets_live history read was shadowed").toBe(true);
  });
});

/** Polls until the real app (its own AutoSync/Dexie open, D-0113) has created `wl-offline`'s
 *  `sets` store, so a version-less `indexedDB.open` from this spec never races Dexie's own
 *  versioned open into creating an empty v1 database with no stores at all. */
async function waitForOfflineDb(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        const req = indexedDB.open("wl-offline");
        const db = await new Promise<IDBDatabase | null>((resolve) => {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        if (!db) return false;
        const has = db.objectStoreNames.contains("sets");
        db.close();
        return has;
      });
    })
    .toBe(true);
}

async function seedDevice(page: Page): Promise<void> {
  await waitForOfflineDb(page);
  await page.evaluate(
    async ({ userId, other }) => {
      const req = indexedDB.open("wl-offline");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("sets", "readwrite");
        const store = tx.objectStore("sets");
        const row = (uid: string, clientId: string) => ({
          key: `${uid}:${clientId}`,
          userId: uid,
          clientId,
          sessionId: "s1",
          exerciseId: "squat",
          setIndex: 0,
          kind: "reps",
          reps: 5,
          weightKg: 60,
          durationS: null,
          rir: null,
          isWarmup: false,
          backoff: false,
          completedAt: "2026-09-27T09:00:00Z",
          editedAt: "2026-09-27T09:00:00Z",
          deletedAt: null,
          status: "queued",
        });
        store.put(row(userId, "c-u"));
        store.put(row(other, "c-v"));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      window.localStorage.setItem("wl-last-email", "ada@example.com");
    },
    { userId: FAKE_USER_ID, other: V },
  );
}

async function countSets(page: Page, userId: string): Promise<number> {
  return page.evaluate(async (uid: string) => {
    const req = indexedDB.open("wl-offline");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction("sets", "readonly");
      const store = tx.objectStore("sets");
      const r = store.count(IDBKeyRange.bound(`${uid}:`, `${uid}:￿`));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return count;
  }, userId);
}

test.describe("T-0469 AC-2 delete (NFR-PRIV-5)", () => {
  async function confirmDelete(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Delete account…" }).click();
    await page.getByLabel("Type delete to confirm").fill("delete");
    await page.getByRole("button", { name: "Delete my account" }).click();
  }

  test("T-0469 AC-2 deletes this user's data only, lands on /welcome with the notice", async ({
    page,
  }) => {
    const calls = await mockAccountDelete(page, 204);
    await open(page);
    await seedDevice(page);
    await expect.poll(() => countSets(page, FAKE_USER_ID)).toBe(1);

    await confirmDelete(page);

    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByText("Your account and all your data are deleted.")).toBeVisible();

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].authorization).toMatch(/^Bearer /);

    expect(await countSets(page, FAKE_USER_ID)).toBe(0);
    expect(await countSets(page, V)).toBe(1);

    const wlKeys = await page.evaluate(() => {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith("wl-")) keys.push(k);
      }
      return keys;
    });
    expect(wlKeys).toEqual([]);
  });
});

test.describe("T-0469 AC-3 server error", () => {
  test("T-0469 AC-3 a 500 keeps the user on UF-11.4 with the error and the seeded row intact", async ({
    page,
  }) => {
    await mockAccountDelete(page, 500);
    await open(page);
    await waitForOfflineDb(page);
    await page.evaluate(async (userId: string) => {
      const req = indexedDB.open("wl-offline");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("sets", "readwrite");
        tx.objectStore("sets").put({
          key: `${userId}:c-u`,
          userId,
          clientId: "c-u",
          sessionId: "s1",
          exerciseId: "squat",
          setIndex: 0,
          kind: "reps",
          reps: 5,
          weightKg: 60,
          durationS: null,
          rir: null,
          isWarmup: false,
          backoff: false,
          completedAt: "2026-09-27T09:00:00Z",
          editedAt: "2026-09-27T09:00:00Z",
          deletedAt: null,
          status: "queued",
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, FAKE_USER_ID);

    await page.getByRole("button", { name: "Delete account…" }).click();
    await page.getByLabel("Type delete to confirm").fill("delete");
    await page.getByRole("button", { name: "Delete my account" }).click();

    await expect(page.getByText("Couldn't delete your account. Try again.")).toBeVisible();
    await expect(page.locator('[data-screen-id="UF-11.4"]')).toBeVisible();
    await expect(page).not.toHaveURL(/\/welcome$/);

    const count = await page.evaluate(async (userId: string) => {
      const req = indexedDB.open("wl-offline");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const n = await new Promise<number>((resolve, reject) => {
        const tx = db.transaction("sets", "readonly");
        const r = tx.objectStore("sets").count(IDBKeyRange.bound(`${userId}:`, `${userId}:￿`));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      db.close();
      return n;
    }, FAKE_USER_ID);
    expect(count).toBe(1);
  });
});

test.describe("T-0469 AC-4 offline", () => {
  test("T-0469 AC-4 both actions disable offline, no request, and re-enable online without a reload", async ({
    page,
    context,
  }) => {
    await mockAccountDelete(page, 204);
    await open(page);
    await expect(page.locator('[data-screen-id="UF-11.4"]')).toBeVisible();

    // Let the service worker precache settle before going offline, and reload, per the pattern
    // measured in offline.spec.ts (T-0904): hasDocument must be true or the reload can hit
    // net::ERR_INTERNET_DISCONNECTED on an incompletely-populated precache.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(async () => {
        return page.evaluate(async () => {
          const keys = await caches.keys();
          const precache = keys.find((k) => k.startsWith("workbox-precache"));
          if (!precache) return false;
          const cache = await caches.open(precache);
          const requests = await cache.keys();
          return requests.some((r) => new URL(r.url).pathname === "/index.html");
        });
      })
      .toBe(true);

    let accountCalls = 0;
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/functions/v1/account") accountCalls += 1;
    });

    await context.setOffline(true);
    await page.reload();

    await expect(page.locator('[data-screen-id="UF-11.4"]')).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Account settings");

    const exportButton = page.getByRole("button", { name: "Export my data" });
    const deleteButton = page.getByRole("button", { name: "Delete account…" });
    await expect(exportButton).toBeDisabled();
    await expect(deleteButton).toBeDisabled();

    await context.setOffline(false);
    await expect(exportButton).toBeEnabled();
    await expect(deleteButton).toBeEnabled();

    expect(accountCalls).toBe(0);
  });
});

test.describe("T-0469 AC-5 accessibility (NFR-A11Y-1/-2)", () => {
  test("T-0469 AC-5 axe reports 0 serious/critical violations, panel closed and open", async ({
    page,
  }) => {
    await open(page);
    await expect(page.locator('[data-screen-id="UF-11.4"]')).toBeVisible();

    const closed = await new AxeBuilder({ page }).include('[data-screen-id="UF-11.4"]').analyze();
    expect(
      closed.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);

    await page.getByRole("button", { name: "Delete account…" }).click();
    await expect(page.getByLabel("Type delete to confirm")).toBeVisible();

    const open_ = await new AxeBuilder({ page }).include('[data-screen-id="UF-11.4"]').analyze();
    expect(
      open_.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);
  });

  test("T-0469 AC-5 every button, input and link is at least 44 x 44 CSS px", async ({ page }) => {
    await open(page);
    const host = page.locator('[data-screen-id="UF-11.4"]');
    await expect(host).toBeVisible();
    await page.getByRole("button", { name: "Delete account…" }).click();
    await expect(page.getByLabel("Type delete to confirm")).toBeVisible();

    const candidates = host.locator("button, input, a");
    const count = await candidates.count();
    expect(count).toBeGreaterThan(3);

    const tooSmall: string[] = [];
    for (let i = 0; i < count; i += 1) {
      let element = candidates.nth(i);
      if (!(await element.isVisible())) continue;
      // T-0550: the C-03 checkbox's hit target is its 44 px label (24 px box inside it).
      if ((await element.getAttribute("type")) === "checkbox") {
        element = element.locator("xpath=ancestor::label[1]");
      }
      const box = await element.boundingBox();
      if (!box) continue;
      if (box.width < MIN_TARGET_PX || box.height < MIN_TARGET_PX) {
        // `textContent` on an <input> (e.g. the checkboxes here) is "" , not null/undefined, so
        // `??` alone never falls through to the tag-name branch — a failing checkbox would print
        // with no name. Treat a blank string the same as null/undefined.
        const label = (await element.getAttribute("aria-label")) || (await element.textContent());
        const name = label?.trim() || (await element.evaluate((el) => el.tagName.toLowerCase()));
        tooSmall.push(`${name}: ${Math.round(box.width)} x ${Math.round(box.height)}`);
      }
    }
    expect(tooSmall).toEqual([]);
  });

  test("T-0469 AC-5 keyboard: Tab+Enter opens the panel with focus in the input; Account from /plan reaches UF-11.4", async ({
    page,
  }) => {
    await open(page);
    await expect(page.locator('[data-screen-id="UF-11.4"]')).toBeVisible();

    const deleteOpen = page.getByRole("button", { name: "Delete account…" });
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    let reached = false;
    for (let i = 0; i < 60 && !reached; i += 1) {
      await page.keyboard.press("Tab");
      reached = await deleteOpen.evaluate((el) => el === document.activeElement);
    }
    expect(reached, "Delete account… was not reachable by Tab within 60 presses").toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Type delete to confirm")).toBeFocused();

    await page.goto("/plan");
    await expect(page.locator('[data-screen-id="UF-11.2"]')).toBeVisible();
    const accountLink = page.getByRole("link", { name: "Account and sign out" });
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    reached = false;
    for (let i = 0; i < 60 && !reached; i += 1) {
      await page.keyboard.press("Tab");
      reached = await accountLink.evaluate((el) => el === document.activeElement);
    }
    expect(reached, "Account and sign out was not reachable by Tab within 60 presses").toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-screen-id="UF-11.4"]')).toBeVisible();
  });
});

async function libraryCacheRows(page: Page, userId: string): Promise<number> {
  return page.evaluate(async (uid: string) => {
    const req = indexedDB.open("wl-offline");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction("libraryCache", "readonly");
      const r = tx.objectStore("libraryCache").index("userId").count(uid);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return count;
  }, userId);
}

async function putLibraryRow(page: Page, userId: string): Promise<void> {
  await page.evaluate(async (uid: string) => {
    const req = indexedDB.open("wl-offline");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("libraryCache", "readwrite");
      tx.objectStore("libraryCache").put({ key: `${uid}:squat`, userId: uid, id: "squat" });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, userId);
}

async function wlAndAuthKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith("wl-") || k.endsWith("-auth-token"))) keys.push(k);
    }
    return keys;
  });
}

test.describe("T-0529 findable sign out (D-0195, GitHub #35)", () => {
  test("T-0529 AC-7 the link is above the fold at 360x640; Sign out lands on /welcome and clears the device", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.route(`${VITE_SUPABASE_URL}/auth/v1/logout*`, (route) =>
      route.fulfill({ status: 204 }),
    );
    await mockSupabaseData(page, ACCOUNT_FIXTURES);
    await page.goto("/");
    await injectSession(page);
    await page.goto("/plan");
    await expect(page.locator('[data-screen-id="UF-11.2"]')).toBeVisible();
    await waitForOfflineDb(page);
    await putLibraryRow(page, FAKE_USER_ID);
    await page.evaluate(() => {
      window.localStorage.setItem("wl-last-email", "ada@example.com");
      window.localStorage.setItem("wl-onboarding", "T0529-SENTINEL");
    });

    const link = page.getByRole("link", { name: "Account and sign out" });
    await expect(link).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const box = (await link.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(640);
    expect(box.x + box.width).toBeLessThanOrEqual(360);

    await link.click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.locator('[data-screen-id="UF-01.1"]')).toBeVisible();
    // UF-01 may write a fresh guest draft to `wl-onboarding` once /welcome renders; the
    // signed-in session's value (the sentinel) must be gone, and every other wl- key too.
    const left = await wlAndAuthKeys(page);
    expect(left.filter((k) => k !== "wl-onboarding")).toEqual([]);
    expect(await page.evaluate(() => window.localStorage.getItem("wl-onboarding"))).not.toBe(
      "T0529-SENTINEL",
    );
    expect(await libraryCacheRows(page, FAKE_USER_ID)).toBe(0);
  });

  test("T-0529 AC-8 offline with a queued set: confirm, Sign out anyway, /welcome, the set is kept", async ({
    page,
    context,
  }) => {
    await page.route(`${VITE_SUPABASE_URL}/auth/v1/logout*`, (route) =>
      route.fulfill({ status: 204 }),
    );
    await open(page);
    await seedDevice(page);
    await expect.poll(() => countSets(page, FAKE_USER_ID)).toBe(1);
    await goOffline(page, context);

    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByText(
        "Some workouts haven't synced yet. They stay on this device and upload the next time you sign in here.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign out anyway" }).click();
    await expect(page).toHaveURL(/\/welcome$/);
    expect(await countSets(page, FAKE_USER_ID)).toBe(1);
  });

  test.describe("T-0908 AC-4 no service worker controls the page", () => {
    test.use({ serviceWorkers: "block" });

    test("T-0908 AC-4 offline with a queued set, service worker blocked (CI): confirm, Sign out anyway, /welcome, the set is kept", async ({
      page,
      context,
    }) => {
      await page.route(`${VITE_SUPABASE_URL}/auth/v1/logout*`, (route) =>
        route.fulfill({ status: 204 }),
      );
      await open(page);
      await seedDevice(page);
      await expect.poll(() => countSets(page, FAKE_USER_ID)).toBe(1);
      await goOffline(page, context);

      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(
        page.getByText(
          "Some workouts haven't synced yet. They stay on this device and upload the next time you sign in here.",
        ),
      ).toBeVisible();
      await page.getByRole("button", { name: "Sign out anyway" }).click();
      await expect(page).toHaveURL(/\/welcome$/);
      expect(await countSets(page, FAKE_USER_ID)).toBe(1);
    });
  });

  test("T-0529 AC-6 axe: the unsynced confirm on UF-11.4 and UF-11.2 with the header link", async ({
    page,
  }) => {
    await open(page);
    await seedDevice(page);
    await expect.poll(() => countSets(page, FAKE_USER_ID)).toBe(1);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sign out anyway" })).toBeFocused();
    const confirm = await new AxeBuilder({ page }).include('[data-screen-id="UF-11.4"]').analyze();
    expect(
      confirm.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);

    await page.goto("/plan");
    await expect(page.getByRole("link", { name: "Account and sign out" })).toBeVisible();
    const plan = await new AxeBuilder({ page }).include('[data-screen-id="UF-11.2"]').analyze();
    expect(
      plan.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);
  });
});

// T-0550 UF-11.4 rework (D-0203 §4; spec UF-11.4.md AC2, AC6, AC7).
test.describe("T-0550 UF-11.4 layout, back link and targets", () => {
  const ROOT = '[data-screen-id="UF-11.4"]';

  async function setEmail(page: Page, email: string): Promise<void> {
    await page.evaluate((e) => {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (!k || !k.endsWith("-auth-token")) continue;
        const t = JSON.parse(window.localStorage.getItem(k)!);
        (t.currentSession ?? t).user.email = e;
        window.localStorage.setItem(k, JSON.stringify(t));
      }
    }, email);
  }

  test("T-0550 AC2 the back link lands on Plan", async ({ page }) => {
    await open(page);
    await page.getByRole("link", { name: "Back to Plan" }).click();
    await expect(page.locator('[data-screen-id="UF-11.2"]')).toBeVisible();
  });

  test("T-0550 AC6 390 x 844: title type and gutter; saves a screenshot", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await expect(page.getByRole("group", { name: "Your equipment" })).toBeVisible();
    const h1 = await page.locator(`${ROOT} h1`).evaluate((el) => {
      const c = getComputedStyle(el);
      return { f: c.fontFamily, w: c.fontWeight, t: c.textTransform, s: parseFloat(c.fontSize) };
    });
    expect(h1.f.startsWith('"Big Shoulders Display"')).toBe(true);
    expect(h1.w).toBe("800");
    expect(h1.t).toBe("uppercase");
    expect(h1.s).toBeGreaterThanOrEqual(32);
    expect(h1.s).toBeLessThanOrEqual(40);
    const pad = await page
      .locator(ROOT)
      .evaluate((el) => [getComputedStyle(el).paddingLeft, getComputedStyle(el).paddingRight]);
    expect(pad).toEqual(["20px", "20px"]);
    await page.screenshot({ path: testInfo.outputPath("account-390.png"), fullPage: true });
  });

  test("T-0550 AC6 320 x 640 with a 64-character email: no horizontal scroll, email not clipped", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page);
    await setEmail(page, `${"a".repeat(52)}@example.com`);
    await page.goto("/plan/account");
    const email = page.locator(".wl-account__email");
    await expect(email).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);
    expect(await email.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("T-0550 AC7 every target is 44 px and the confirm input border is text-muted", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await expect(page.getByRole("group", { name: "Your equipment" })).toBeVisible();
    await page.getByRole("button", { name: "Delete account…" }).click();
    const input = page.getByLabel("Type delete to confirm");
    await expect(input).toBeVisible();
    const heights = await page
      .locator(`${ROOT} :is(a, button, input:not([type="checkbox"]), label.wl-checkbox)`)
      .evaluateAll((els) =>
        els.map((el) => ({
          name: el.textContent?.trim() || el.tagName,
          h: el.getBoundingClientRect().height,
        })),
      );
    expect(heights.length).toBeGreaterThan(10);
    for (const t of heights) expect(t.h, t.name).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    const { border, expected } = await input.evaluate((el) => {
      const probe = document.createElement("i");
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(
        "--wl-color-text-muted",
      );
      document.body.append(probe);
      const expectedColor = getComputedStyle(probe).color;
      probe.remove();
      return { border: getComputedStyle(el).borderTopColor, expected: expectedColor };
    });
    expect(border).toBe(expected);
  });
});
