---
id: T-0301
title: UF-01 Onboarding (< 60 s to a first plan) including UF-01.5 Account — profile gate, UF-01.1–.4 with the on-device plan, account and save after sign-in
lane: web-feature:UF-01 (T-0301a is web-shell)
screens: [UF-01.1, UF-01.2, UF-01.3, UF-01.4, UF-01.5]
decisions: [D-0002, D-0010, D-0014, D-0017, D-0022, D-0045, D-0061, D-0063, D-0064, D-0067]
deps: [T-0300, T-0201a]
status: ready
---
<!-- Groomed 2026-09-29 by product-owner. Split into T-0301a/b/c (D-0064 Consequences). ACs are tagged [a]–[c]. -->

## Why
Principle 5: a first plan in under 60 s, measured from the first render of UF-01.1 to the first render of UF-01.4 with a plan (D-0014, NFR-AN-2, PRD target p50 ≤ 45 s, p90 ≤ 60 s). The plan is computed on the device by the engine (principle 3) and saved only after sign-in at UF-01.5 (no guest mode, D-0014). Two real edge cases need shell support. A magic link that opens in a different browser context (iOS PWA → Safari, D-0045 §5) signs the user in without the locally held answers. An old account can meet a new device's answers. Both are handled by a profile gate plus a save step (D-0064 §8–9). Today the `/welcome` and `/account` screens are T-0300's stubs.

## Split (the orchestrator edits the board)
Keep `T-0301` as the parent row with status `split → T-0301a, T-0301b, T-0301c`. Mark it `done` once all three children are done.

| Child | Lane | Scope | Deps | Status | ~Size |
|---|---|---|---|---|---|
| T-0301a | web-shell | Profile gate `lib/profile` + guard wiring (D-0064 §9) | T-0300 | **ready** | ¼ day |
| T-0301b | web-feature:UF-01 | UF-01.1–.4, pending plan, timing, on-device targets | T-0300, T-0201a, T-0318 | todo | ½ day |
| T-0301c | web-feature:UF-01 | UF-01.5 Account (link, code, Google, privacy), `/welcome/save` | T-0301a, T-0301b | todo | ½ day |

T-0301a is a web-shell ticket and must not run in parallel with any other web-shell ticket (T-0318, T-0319, T-0312, T-0313, T-0310). T-0301b needs T-0318 only for its string file `lib/i18n/flows/uf-01.ts` (D-0067 §2). It adds no routes: `/welcome/*` already exists.

## Scope
- In:
  - [a] `apps/web/src/lib/profile/` (`useProfileStatus`, `recheckProfile`, `ProfileGate`), wired into the `protected` and `guest-only` guards for `/welcome/*` in `app/` (D-0064 §9).
  - [b] UF-01.1 Welcome, UF-01.2 Goal, UF-01.3 Level & equipment (3 profiles), UF-01.4 Schedule & plan, nested under `/welcome/*` (D-0063 §2). Pending plan in `localStorage["wl-onboarding"]` (24 h, D-0064 §6). Timing (D-0064 §7). Targets through `deriveTargets` (principle 3).
  - [c] The designed UF-01.5 Account ("Save your plan" / "Sign in"): magic link, 6-digit code, Google (`signInWithOAuth`), privacy link. `/welcome/save`: write profile + 9 targets, existing profile wins, retry, the signed-in onboarding path (D-0064 §8).
- Out: the equipment checklist (T-0216, D-0061 §3); priority areas (UF-11.3, T-0308); goal-based reps in the engine (T-0214; UF-01.2 copy only names them); the `lib/auth` internals (T-0300b: `requestMagicLink`, `verifyCode`, `AuthCallback` exchange logic stay as they are); the magic-link email template (T-0404); account deletion/export (T-0310); any change to `docs/data-model.md`, `api/openapi.yaml`, `docs/engine-rules.md` or tokens.

### Edge cases that are in scope
- **Offline:** UF-01.1–.4 work fully offline once the shell is cached. The plan is computed on the device with no network (AC-B7). Sending a link offline shows the existing `auth.offline` copy (AC-C2). `/welcome/save` offline keeps the pending plan and retries on `online` (AC-C6). Offline and signed in with no cached profile, the gate is `unknown` and never redirects (AC-A3).
- **Time running out:** the fastest path is 3 activations to a plan (AC-B6). The first render of UF-01.1 never waits on a network request or the engine (AC-B1). The pending plan expires after 24 h (AC-B8). An expired link falls back to the code, and the pending plan is kept (AC-C4).
- **Zero history:** every new user has zero history. The plan is targets only, and Today shows the zero state (T-0302a).
- **Returning after 10 days off:** "I already have an account" → UF-01.5 → sign in → the gate finds the profile → `/` (AC-A2, AC-C7). A 10-day-old pending plan is discarded, so a returning user is never offered stale answers (AC-B8). An existing profile is never overwritten by a device's pending plan (AC-C5).

## Acceptance criteria
Vitest + Testing Library in `apps/web/src/**` (Supabase mocked with the existing spy helpers), Playwright in the child's own spec where tagged **e2e** (`page.route` Supabase mock, D-0045 §10). `now` and `Date.now` are faked where time matters.

### T-0301a Profile gate (web-shell)
- **AC-A1 (status sources)** Given signed in and a cached profile (`loadProfile()` resolves to a profile), When `useProfileStatus()` first renders, Then it returns `"present"` with no `from("profiles")` call awaited. Given no cache, online, and `profiles…maybeSingle()` resolving `{data: null}`, Then it returns `"missing"`. Given `{data: row}`, Then `"present"` and `refreshProfile()` was called once. Given the call rejects, or `navigator.onLine === false`, Then `"unknown"`.
- **AC-A2 (redirects)** Signed in with status `missing`: `/`, `/library`, `/library/back-squat`, `/progress`, `/balance`, `/balance/core`, `/plan` and `/session/setup` each end at `/welcome/save`. `/welcome`, `/welcome/goal` and `/welcome/save` render without a redirect. `/session/0b9e…` renders the UF-09 host (never gated, principle 1). Signed in with `present`: `/welcome/goal` still redirects as T-0300b does (the return-to path, or `/`). Signed out: the AC-B5 table of T-0300b is unchanged (its tests stay green, not edited).
- **AC-A3 (unknown never redirects)** Signed in with status `unknown`: `/` renders UF-02.1 and `/welcome/goal` redirects to `/` (as for `present`).
- **AC-A4 (recheck)** Given `missing`, When the profile row appears and `recheckProfile()` is called, Then the status becomes `present` and a component on `/welcome/save` that navigates to `/` lands on UF-02.1 (no loop back to `/welcome/save`).
- **AC-A5 (principle 5)** Signed out, `/welcome` renders UF-01.1 on the first committed render with a `fetch` that never resolves and no `loadProfile`/`from("profiles")` call (spies). `lib/profile` isn't in the static import graph of `features/UF-01` (a source test).

### T-0301b UF-01.1–.4
- **AC-B1 (UF-01.1, principle 5)** `/welcome` renders `[data-screen-id="UF-01.1"]` with the app name "workout LAB" (not "[APP NAME]"), a heading, a "Get started" link to `/welcome/goal` and an "I already have an account" link to `/account`. A source test asserts that the UF-01.1 module statically imports none of `@workoutlab/engine`, `lib/offline`, `lib/auth/client` or `@supabase/supabase-js`, and that UF-01.2–.4 load through `React.lazy`.
- **AC-B2 (UF-01.2 Goal)** `/welcome/goal` renders `UF-01.2` with exactly 3 options in this order, as a radio group: "Build muscle" (`build_muscle`), "Get stronger" (`get_stronger`), "General fitness" (`general_fitness`). "Lose fat" isn't in the DOM. `build_muscle` is checked by default. Progress shows "1/3". Back goes to `/welcome`, and Continue goes to `/welcome/level`.
- **AC-B3 (UF-01.3 Level & equipment, D-0061 §3)** `/welcome/level` renders `UF-01.3` with a level radio group Beginner / Intermediate / Advanced (default Beginner) and an equipment radio group of exactly 3: "Bodyweight", "Dumbbells", "Full gym" (default Full gym). The stored `equipment` for each is `["none"]`, `["none","dumbbell","bench"]` and `["none","dumbbell","bench","barbell","rack","cable","machine","pullup-bar","kettlebell","band"]` (a test with these literals, D-0064 §3). Progress "2/3".
- **AC-B4 (UF-01.4 plan from the engine, principle 3)** `/welcome/schedule` renders `UF-01.4` with two steppers ("at least" / "at most" per week, 1–7, default 3 and 4) and a plan card. With 3–4 the card lists the 9 areas in the fixed order with chest 20, back 20, shoulders 16, arms 12, core 12, glutes 20, quads 20, hamstrings 16, calves 12 (R4-E1) and "3–4 per week · 6–8 per 14 days". Stepping to 1–1 shows back 10, shoulders 8, arms 6 (R4-E4). Stepping to 7–7 shows back 30, arms 18 (R4-E5). A spy asserts every value comes from `deriveTargets` (the component source has no target arithmetic: a mutation test that makes the spy return +1 changes every rendered number).
- **AC-B5 (stepper rules, D-0064 §4)** From 3–4: min + ×2 → 5–5, min + → 6–6. From 3–4: max − → 3–3, max − → 2–2. Min − at 1 and max + at 7 are disabled (`aria-disabled`). Each stepper button is ≥ 44 × 44 px (NFR-A11Y-2) and named ("One more session per week, minimum", …).
- **AC-B6 (3 activations, principle 5, e2e)** At a 360 × 640 viewport with Supabase mocked, starting at `/welcome`: activating Get started → Continue → Continue renders `[data-screen-id="UF-01.4"]` with the 9 target rows, in < 5 s wall time for the scripted run. `localStorage["wl-onboarding"].timingMs` is an integer ≥ 0 and ≤ that wall time + 50 ms. The same run using only the keyboard (Tab/Enter/Space/arrow keys) reaches the same state (NFR-A11Y-6). axe on each of UF-01.1–.4 reports 0 serious or critical violations (NFR-A11Y-1).
- **AC-B7 (offline)** With `navigator.onLine = false` and `fetch` rejecting, UF-01.2 → .4 render and the plan card shows the R4-E1 values (no network call made: a spy).
- **AC-B8 (pending plan, D-0064 §6)** Choosing `get_stronger`, Advanced, Dumbbells and 2–3 writes `wl-onboarding` = `{version: 1, goal: "get_stronger", level: "advanced", equipmentProfile: "dumbbells", rhythmMin: 2, rhythmMax: 3, startedAtMs, timingMs, savedAtMs}`. A remount within 24 h pre-selects those answers. With `savedAtMs` 24 h + 1 ms in the past, or `version: 2`, or invalid JSON, the key is removed and the defaults show.
- **AC-B9 (timing, D-0064 §7, NFR-AN-2)** With `Date.now` faked at 1 000 000 on the first UF-01.1 commit and 1 042 000 on the first UF-01.4 commit with a plan, `timingMs` = 42 000. A second visit to UF-01.1 (Back) doesn't reset `startedAtMs`. A re-render of UF-01.4 doesn't change `timingMs`. Starting at `/welcome/goal` with no `startedAtMs` leaves `timingMs` null.
- **AC-B10 (hand-off)** Signed out, UF-01.4's primary button ("Save my plan") navigates to `/account`. Signed in (the signed-in onboarding path), it navigates to `/welcome/save`.

### T-0301c UF-01.5 Account + save
- **AC-C1 (UF-01.5 layout)** `/account` renders `UF-01.5`. With a valid pending plan, the heading is "Save your plan" and a Back link goes to `/welcome/schedule`. Without one, the heading is "Sign in". It shows an email field, "Send link", an "Enter code" mode (6-digit, `autocomplete="one-time-code"`), "Continue with Google", and a link to `https://workout.vestgote.com/privacy/` (NFR-PRIV-6). All controls are ≥ 44 px tall.
- **AC-C2 (magic link + code reuse T-0300b)** "Send link" with " Ada@Example.com " calls `requestMagicLink` (spy) and shows `auth.linkSent`. The results `invalid_email`, `offline` and `rate_limited` show the matching `auth.*` text in `role="status"`. "Verify code" calls `verifyCode(email, code)`. The T-0300b tests `magic-link.test.ts`, `auth-callback.test.tsx` and `auth-guard.test.tsx` pass unchanged.
- **AC-C3 (Google)** "Continue with Google" calls `supabase.auth.signInWithOAuth({provider: "google", options: {redirectTo: "<origin>/auth/callback"}})` once. Offline, the button is disabled with `auth.offline` as its description.
- **AC-C4 (expired link keeps the plan)** Given a pending plan and `/auth/callback?error_code=otp_expired`, Then the pending plan is still in localStorage, and "Send a new one" leads to `/account` with the heading "Save your plan".
- **AC-C5 (save, D-0064 §8)** Given signed in, the pending plan from AC-B8 with `timingMs` 42 000, no `profiles` row, and `/welcome/save`, Then `from("profiles").upsert` receives `{goal: "get_stronger", level: "advanced", equipment: ["none","dumbbell","bench"], rhythm_min: 2, rhythm_max: 3, priority_areas: [], onboarding_timing_ms: 42000}`, and **after it resolves** `from("area_targets").upsert` receives 9 rows in the fixed area order with `sets_per_14d` = `deriveTargets({rhythmMin: 2, rhythmMax: 3, priorityAreas: []})` (back 14, shoulders 11, arms 9, R4-E3) and `source: "default"`, with `{onConflict: "user_id,area_id"}`. Then `wl-onboarding` is removed, `recheckProfile()` has been called, and the location is `/`. Given a `profiles` row already exists, Then neither upsert is called, the pending plan is removed, and the location is `/` (the existing profile wins).
- **AC-C6 (save failure / offline)** Given the targets upsert fails with a 500, Then the pending plan stays, "Couldn't save your plan. Try again." shows with a Retry button, and Retry resends **both** upserts (idempotent). Given offline, Then no upsert is attempted, "Connect to save your plan" shows, and a `window` `online` event triggers the save automatically.
- **AC-C7 (no pending plan)** Given signed in, no profile and no pending plan, When `/welcome/save` renders, Then it navigates to `/welcome/goal` (the signed-in onboarding path, AC-B10). Given a returning user with a profile who signs in by code on `/account`, Then they end on `/` (UF-02.1) and no profile or target write happens (e2e, with the mocked `profiles` returning a row).
- **AC-C8 (a11y, e2e)** axe on UF-01.5 in both headings reports 0 serious/critical. A keyboard-only run fills the email and activates Send link (NFR-A11Y-6).

## Paths you may change
- **T-0301a (web-shell):** `apps/web/src/lib/profile/**` (new), `apps/web/src/app/**` (the guard wiring and route guard values only), `apps/web/src/lib/auth/guards.tsx` (to accept the gate). No `routes.ts` path change.
- **T-0301b and T-0301c (web-feature:UF-01):** `apps/web/src/features/UF-01/**`. Extras (D-0063, D-0067 §2): `apps/web/src/lib/i18n/flows/uf-01.ts` (created empty by T-0318; `en.ts` unchanged), and `tests/e2e/uf-01-onboarding.spec.ts` (T-0301b creates it, and T-0301c appends its account cases). `AuthCallback` stays exported from `features/UF-01/index.tsx` with the T-0300b behaviour, and T-0301c only adds the pending-plan-aware copy around it.
- No new dependencies (react, react-router, supabase-js and the engine are already dependencies of `apps/web`).

## Contract impact
none. `profiles` and `area_targets` are written exactly as `docs/data-model.md` defines them (`onboarding_timing_ms` is write-once, `onboarded_at` and `plan_changed_at` are server-set). The engine is only called (`deriveTargets`). Tokens are only read. Defaults: D-0063, D-0064 (`revisit`).

## NFRs owned
AN-2 client part (timing written with the profile: AC-B9, AC-C5), A11Y-6 UF-01 part (AC-B6, AC-C8), A11Y-1/2 for UF-01.x (AC-B5, AC-B6, AC-C1, AC-C8), PRIV-6 link (AC-C1), I18N-1 (lint green; strings in `lib/i18n/flows/uf-01.ts`).

## Definition of done
Tests for every AC in the child pass · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green for the child's e2e ACs · `check:size` green (each route chunk ≤ 100 KB gzip) · contracts unchanged · commits start with the child id and cite screen IDs (for example `T-0301b UF-01.4: plan card from deriveTargets`).
