// Shared `page.route` helper so no e2e spec needs a real Supabase project (D-0045 §10).
// T-0300a's own specs don't call Supabase (auth lands in T-0300b), so this only stubs the
// GoTrue endpoints enough that an unmocked request never leaves the browser silently; T-0300b
// extends it with real email/OTP payloads for the auth spec, and T-0300c does the same for
// `session_sets`/`sessions`/`session_sets_live`.
import type { Page } from "@playwright/test";
import { VITE_SUPABASE_URL } from "../playwright.config.js";

export { VITE_SUPABASE_URL };

/** T-0436 (D-0155 §4): the header both 501 catch-alls set, so `installSupabaseGuard` can tell a
 *  backstop answer from a real mock's. The status, body and route patterns are unchanged. */
export const BACKSTOP_HEADER = "x-wl-e2e-backstop";

/** Fails any Supabase auth call that a spec didn't expect, instead of hitting the network. */
export async function mockSupabaseAuth(page: Page): Promise<void> {
  await page.route(`${VITE_SUPABASE_URL}/auth/v1/**`, (route) =>
    route.fulfill({
      status: 501,
      headers: { [BACKSTOP_HEADER]: "auth" },
      body: "unmocked supabase auth call in e2e",
    }),
  );
}

/** Fails any Supabase PostgREST (`/rest/v1/**`) call a spec didn't expect (T-0300c, AC-C20).
 *  Must be registered before `mockSupabaseData`'s specific routes: Playwright runs the
 *  most-recently-registered handler first, falling back to earlier ones via `route.fallback()`,
 *  so this catch-all has to be the *first* registered to end up as the last-matched backstop. */
export async function mockSupabaseRest(page: Page): Promise<void> {
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/**`, (route) =>
    route.fulfill({
      status: 501,
      headers: { [BACKSTOP_HEADER]: "rest" },
      body: "unmocked supabase rest call in e2e",
    }),
  );
}

const STORAGE_KEY = "sb-abc-auth-token";
const FAKE_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "ada@example.com",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-09-01T00:00:00.000Z",
};

/** The 6-digit code the mocked `/verify` endpoint accepts (AC-B3); any other 6 digits is a
 *  mocked "invalid or expired" GoTrue error. */
export const GOOD_CODE = "123456";

/**
 * Mocks the GoTrue endpoints `lib/auth/magic-link.ts` and `/auth/callback` call, with real
 * email/OTP-shaped payloads (AC-B2, AC-B3, AC-B4). `signInWithOtp` (`POST /otp`) always
 * succeeds; the PKCE code exchange (`POST /token?grant_type=pkce`) succeeds for `code=good`,
 * and `verifyOtp` (`POST /verify`) succeeds for `token=GOOD_CODE`; both return a GoTrue-shaped
 * error otherwise, so a spec can drive both the happy path and the expired/already-used path
 * without a real Supabase project.
 */
export async function mockSupabaseEmailAuth(page: Page): Promise<void> {
  // Registered first so it's the last-matched (Playwright runs the most-recently-registered
  // handler first, falling back to earlier ones via `route.fallback()`): this 501 catch-all
  // must be the final backstop for anything none of the specific handlers below claim, so an
  // unmocked Supabase call (a non-PKCE `/token` grant, `/user`, `/logout`, ...) can never reach
  // the network.
  await mockSupabaseAuth(page);

  // A trailing `*` because these requests carry a query string (`?redirect_to=…`) that a
  // bare path pattern won't match.
  await page.route(`${VITE_SUPABASE_URL}/auth/v1/otp*`, (route) =>
    route.fulfill({ status: 200, json: {} }),
  );

  await page.route(`${VITE_SUPABASE_URL}/auth/v1/verify*`, async (route) => {
    const body = route.request().postDataJSON() as { token?: string };
    if (body.token === GOOD_CODE) {
      return route.fulfill({ status: 200, json: sessionPayload() });
    }
    return route.fulfill({
      status: 403,
      json: { error_code: "otp_expired", msg: "Token has expired or is invalid" },
    });
  });

  // `?` is a single-char wildcard in Playwright's glob matching, so the query string is
  // checked inside the handler instead of in the route pattern.
  await page.route(`${VITE_SUPABASE_URL}/auth/v1/token*`, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("grant_type") !== "pkce") return route.fallback();
    const body = route.request().postDataJSON() as { auth_code?: string };
    if (body.auth_code === "good") {
      return route.fulfill({ status: 200, json: sessionPayload() });
    }
    return route.fulfill({
      status: 403,
      json: { error_code: "otp_expired", msg: "Token has expired or is invalid" },
    });
  });
}

function sessionPayload() {
  return {
    access_token: "fake-access-token",
    refresh_token: "fake-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: FAKE_USER,
  };
}

/**
 * Reads the PKCE flow id supabase-js stashed in `localStorage` after `requestMagicLink()`
 * (AC-B2), so a spec can build the callback URL `?code=good&sb_flow_id=<id>` the way the
 * real magic link would, and the PKCE code exchange finds its verifier (AC-B4).
 */
export async function pendingPkceFlowId(page: Page): Promise<string> {
  const flowId = await page.evaluate((key) => {
    const prefix = `${key}-flow-`;
    const suffix = "-code-verifier";
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix) && k.endsWith(suffix)) {
        return k.slice(prefix.length, -suffix.length);
      }
    }
    return null;
  }, STORAGE_KEY);
  if (!flowId) throw new Error("no pending PKCE flow id in localStorage");
  return flowId;
}

/**
 * Injects a signed-in session directly into `localStorage`, the way supabase-js itself
 * persists one, so a spec can start "signed in" without driving the email/OTP round trip
 * (AC-C20-style cold starts, and any auth spec step that only needs an existing session).
 * Must run after a `page.goto` (a page, hence its `localStorage`, has to exist first).
 */
export async function injectSession(
  page: Page,
  overrides: { expiresInSeconds?: number } = {},
): Promise<void> {
  const expiresInSeconds = overrides.expiresInSeconds ?? 3600;
  await page.evaluate(
    ({ key, session }) => window.localStorage.setItem(key, JSON.stringify(session)),
    {
      key: STORAGE_KEY,
      session: {
        ...sessionPayload(),
        expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
      },
    },
  );
}

/** The user id `injectSession`'s session carries (T-0300c offline e2e). */
export const FAKE_USER_ID = FAKE_USER.id;

/** The profile row shape `offline.spec.ts` uses, carried by `mockProfilePresent` (D-0064 §9). */
const PROFILE_ROW = {
  user_id: FAKE_USER_ID,
  goal: "build_muscle",
  level: "beginner",
  equipment: [] as string[],
  rhythm_min: 3,
  rhythm_max: 4,
  priority_areas: [] as string[],
  onboarded_at: "2026-09-01T00:00:00.000Z",
  plan_changed_at: "2026-09-01T00:00:00.000Z",
};

/** The default row `mockProfilePresent` answers with, exported so a spec can assert on it. */
export const FAKE_PROFILE_ROW = PROFILE_ROW;

/**
 * Answers the profile gate's read (`GET /rest/v1/profiles?select=*`, `lib/profile/status.ts`)
 * with **one row**, so `useProfileStatus()` resolves `present` (D-0064 §9, D-0073 §1) and a
 * signed-in user is redirected off `/welcome/*` instead of standing down.
 *
 * Every signed-in spec must state its profile state (D-0086). Without this, the read goes to the
 * real `abc.supabase.co`, `fetch` *throws* `ERR_NAME_NOT_RESOLVED`, and postgrest-js retries it
 * with 1 s / 2 s / 4 s backoff — the gate resolves only after ~7 s, past the default 5 s `expect`
 * timeout. That is the T-0904 regression; see docs/ci/CI-T-0904-auth-e2e-unmocked-profile-read.md.
 *
 * The body is `[row]`, the shape real PostgREST returns for the `Accept: application/json`
 * header `maybeSingle()` sends (it does not send `Accept: application/vnd.pgrst.object+json`,
 * which would want a bare object). A wrong shape therefore fails a behaviour AC rather than
 * passing silently.
 *
 * Register this **after** `mockSupabaseRest`: Playwright runs the most-recently-registered
 * matching handler first, so the 501 backstop must be registered first to be matched last.
 * AC-2's `waitForResponse` on a `200` catches the reverse order.
 */
export async function mockProfilePresent(
  page: Page,
  row: Record<string, unknown> = PROFILE_ROW,
): Promise<void> {
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/profiles*`, (route) =>
    route.fulfill({ status: 200, json: [row] }),
  );
}

/**
 * Answers the profile gate's read with **no row**, so `useProfileStatus()` resolves `missing`:
 * `/welcome/*` stands down and renders onboarding (D-0073 §1, T-0301a AC-7), and a gated route
 * redirects to `/welcome/save` (D-0064 §9).
 *
 * `200 []` is what real PostgREST returns for a `maybeSingle()` that matches nothing — not a
 * 404 and not `null` — which is why `maybeSingle()` gives `{data: null, error: null}` for it.
 *
 * Called in a test body, this overrides a `beforeEach`'s `mockProfilePresent`, because the
 * most-recently-registered matching route runs first.
 */
export async function mockProfileMissing(page: Page): Promise<void> {
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/profiles*`, (route) =>
    route.fulfill({ status: 200, json: [] }),
  );
}

export interface OfflineFixtures {
  sets: unknown[];
  exercises: unknown[];
  exerciseAreas: unknown[];
  areaTargets: unknown[];
  profile: unknown;
  // The four tables T-0319's Dexie v2 refreshes select (D-0072). Optional, defaulting to `[]`:
  // no spec asserts on `exerciseDetails`, `checkinCache` or `routineCache` yet, and AC-C20 only
  // needs these selects to *resolve* instead of hitting the 501 catch-all. Declaring them here
  // rather than hard-coding `[]` lets a later spec — say one asserting a cached routine renders
  // offline — supply real rows without reopening this fixture.
  exerciseVariants?: unknown[];
  checkins?: unknown[];
  routines?: unknown[];
  routineItems?: unknown[];
}

/**
 * Mocks the PostgREST endpoints `lib/offline/*` calls (AC-C20, D-0045 §7): `session_sets_live`,
 * `exercises`, `exercise_areas`, `area_targets`, `profiles`, the four tables Dexie v2 added
 * (`exercise_variants`, `plan_checkins`, `routines`, `routine_items` — T-0319, D-0072), and the
 * `sessions`/`session_sets` upsert targets (accepted no-ops, since this spec doesn't queue
 * anything to flush). Registered after `mockSupabaseAuth`'s 501 catch-all in `beforeEach`,
 * which — being registered first — is
 * Playwright's last-matched fallback for anything none of these claim (see that function's
 * comment): a request to an endpoint this spec doesn't expect still fails loudly instead of
 * reaching the network.
 */
export async function mockSupabaseData(page: Page, fixtures: OfflineFixtures): Promise<void> {
  // `session_sets*` (below) also glob-matches `session_sets_live?...` — Playwright runs the
  // most-recently-registered matching handler first, so the `session_sets_live*` route below
  // must be registered *after* `session_sets*`, or the latter's `json: []` always wins and
  // AC-C20's cached history count is silently 0.
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/sessions*`, (route) =>
    route.fulfill({ status: 200, json: [] }),
  );
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/session_sets*`, (route) =>
    route.fulfill({ status: 200, json: [] }),
  );
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/exercises*`, (route) =>
    route.fulfill({ status: 200, json: fixtures.exercises }),
  );
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/exercise_areas*`, (route) =>
    route.fulfill({ status: 200, json: fixtures.exerciseAreas }),
  );
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/area_targets*`, (route) =>
    route.fulfill({ status: 200, json: fixtures.areaTargets }),
  );
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/profiles*`, (route) =>
    route.fulfill({ status: 200, json: fixtures.profile }),
  );
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/session_sets_live*`, (route) =>
    route.fulfill({ status: 200, json: fixtures.sets }),
  );

  // Dexie v2's four new selects (T-0319, D-0072). Without them `refreshLibrary` throws on the
  // unmocked `exercise_variants` select *before* entering its transaction, so `libraryCache` is
  // never written and AC-C20's `{library: 12}` assertion sees 0.
  //
  // On the `session_sets*` / `session_sets_live*` shadowing hazard above: it does NOT apply to
  // any of these four, and that was measured rather than assumed (T-0323). Playwright's `*`
  // does not match across a prefix that isn't actually a prefix: `session_sets` genuinely is a
  // prefix of `session_sets_live`, so that glob shadows. `exercises` is NOT a prefix of
  // `exercise_variants` (they diverge at `s` vs `_`), and likewise `routines` is not a prefix of
  // `routine_items`. Probed directly with a scratch spec:
  //   "exercises*"    vs "exercise_variants?..."  => no match
  //   "exercises*"    vs "exercises?..."          => match
  //   "session_sets*" vs "session_sets_live?..."  => match
  //   "routines*"     vs "routine_items?..."      => no match
  // So the four routes below are order-independent. They are still registered after `exercises*`
  // to match this file's convention (most specific last), but nothing breaks if that moves —
  // don't rely on the ordering as a safety property here.
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/exercise_variants*`, (route) =>
    route.fulfill({ status: 200, json: fixtures.exerciseVariants ?? [] }),
  );
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/plan_checkins*`, (route) =>
    route.fulfill({ status: 200, json: fixtures.checkins ?? [] }),
  );
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/routines*`, (route) =>
    route.fulfill({ status: 200, json: fixtures.routines ?? [] }),
  );
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/routine_items*`, (route) =>
    route.fulfill({ status: 200, json: fixtures.routineItems ?? [] }),
  );
}

/**
 * T-0436 (D-0155 §4): answers the reads the signed-in shell's AutoSync fires (everything
 * `mockSupabaseData` serves except `profiles*`, which a spec states with `mockProfilePresent` /
 * `mockProfileMissing`) with `200 []`, for a spec that doesn't care about the cached data. Without
 * it each of those reads is a hit on the 501 backstop. Register it **after** `mockSupabaseRest`.
 */
export async function mockSupabaseEmptyReads(page: Page): Promise<void> {
  for (const table of [
    "sessions",
    "session_sets",
    "exercises",
    "exercise_areas",
    "area_targets",
    "session_sets_live",
    "exercise_variants",
    "plan_checkins",
    "routines",
    "routine_items",
  ]) {
    await page.route(`${VITE_SUPABASE_URL}/rest/v1/${table}*`, (route) =>
      route.fulfill({ status: 200, json: [] }),
    );
  }
}
