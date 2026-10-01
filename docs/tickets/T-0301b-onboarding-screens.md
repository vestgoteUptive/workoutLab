---
id: T-0301b
title: UF-01.1 Welcome, UF-01.2 Goal, UF-01.3 Level & equipment — nested `/welcome/*` views, the pending-plan record and the onboarding start time
lane: web-feature:UF-01
screens: [UF-01.1, UF-01.2, UF-01.3, UF-01.4]
decisions: [D-0014, D-0045, D-0061, D-0063, D-0064, D-0067, D-0071, D-0073, D-0088, D-0097, D-0098]
deps: [T-0300, T-0318, T-0301a]
status: ready
---
<!-- Groomed 2026-10-01 by product-owner from docs/tickets/T-0301-onboarding.md (ACs B1–B3, the storage half of B8, the start half of B9). Build flow: wl-build-web. About ½ day. The old T-0301b scope was split: UF-01.4, the plan card, the hand-off and the e2e moved to T-0301d. T-0301c (UF-01.5 + /welcome/save) is unchanged and now depends on T-0301b and T-0301d. Don't run in parallel with T-0366, T-0331 or T-0301c: they all touch profile-gate.test.tsx. -->

## Why
Principle 5: a first plan in under 60 s, timed from the first render of UF-01.1 to the first render of UF-01.4 with a plan (D-0014, NFR-AN-2). Today `/welcome/*` is T-0300a's stub, one `<h1>Welcome</h1>` for every sub-path. This ticket builds the first three screens of the path, nested under `/welcome/*` (D-0071 §2, which replaces D-0063 §2). It also adds the local record they write (D-0064 §6, D-0098) and the start of the timing (D-0064 §7). T-0301d then builds UF-01.4, which turns these answers into the engine's plan.

## Scope
- In:
  - **Nested views in the `/welcome/*` splat** (`Welcome` export of `features/UF-01/index.tsx`, the name `routes.ts` loads). Index → UF-01.1, `goal` → UF-01.2, `level` → UF-01.3, `schedule` → a placeholder `[data-screen-id="UF-01.4"]` with a heading only (T-0301d replaces it), and every other sub-path (including `save`) → UF-01.1 with no redirect (D-0097 §1). UF-01.2, UF-01.3 and UF-01.4 load through `React.lazy`. UF-01.1 is in the splat's first chunk.
  - **UF-01.1 Welcome**, from the `UF01-1-Welcome.dc.html` prototype. App name "workout LAB" (never "[APP NAME]"), the illustration (decorative, `aria-hidden`), the `<h1>`, the subtitle, a "Get started" link to `/welcome/goal`, and an "I already have an account" link to `/account`.
  - **UF-01.2 Goal**: a radio group with the 3 goals in `Goal` enum order (D-0064 §1), progress "1/3", Back, Continue.
  - **UF-01.3 Level & equipment**: a level radio group and an equipment-profile radio group of 3 (D-0061 §3, D-0064 §3), progress "2/3", Back, Continue.
  - **`features/UF-01/equipment-profiles.ts`**: the 3 profiles as constants (D-0064 §3 consequence: pinned by a literal test until a shared package exposes them).
  - **`features/UF-01/pending-plan.ts`**: read, write and clear `localStorage["wl-onboarding"]`, with the D-0098 shape, the 24 h expiry and the invalid-value rule. This is the one module T-0301c and T-0301d use to touch the key.
  - **Start time** (D-0064 §7): `startedAtMs` is set at the first commit of UF-01.1.
  - **Strings** in `lib/i18n/flows/uf-01.ts` only (D-0071 §1). The goal labels stay in this file. They aren't shared with `flows/uf-11.ts`. T-0342 decides about sharing them after T-0308b, which is blocked:H-13.
  - **D-0097 row updates** in two web-shell test files. Only the `/welcome/goal` rows change. See "Paths you may change".
- Out:
  - UF-01.4's steppers, its plan card, `deriveTargets`, `timingMs`, `planShown: true` and the hand-off button (T-0301d).
  - UF-01.5 and `/welcome/save` (T-0301c). `Account` and `AuthCallback` keep their T-0300b behaviour and exports.
  - The equipment checklist (T-0216). Priority areas (UF-11.3).
  - Any `routes.ts` change, any new dependency, any contract change.

### Edge cases that are in scope
- **Offline:** UF-01.1–.3 make no network call at all (AC-9).
- **Time running out:** the defaults are preselected, so Continue → Continue needs no choice (AC-3, AC-4). The first UF-01.1 render waits on nothing (AC-1).
- **Zero history:** every user here has none. Nothing on these screens reads history.
- **Returning after 10 days off:** a record older than 24 h is deleted on read, and the defaults show (AC-6). "I already have an account" leaves the record at `planShown: false`, so T-0301c doesn't offer default answers for saving (D-0098).

## Acceptance criteria
Vitest + Testing Library in `apps/web/src/features/UF-01/__tests__/`. `Date.now` is faked where time matters. The views are mounted under a `MemoryRouter` with a `/welcome/*` route, the way `routes.ts` mounts them. axe is axe-core loaded through the `@axe-core/playwright` dependency, as in `features/UF-04/__tests__/howto-credit.test.tsx`.

- **AC-1 (UF-01.1, principle 5)** Given signed out and `fetch` stubbed to a promise that never resolves, When `/welcome` renders, Then `[data-screen-id="UF-01.1"]` contains the text "workout LAB", one `<h1>`, a link named "Get started" with `href="/welcome/goal"`, and a link named "I already have an account" with `href="/account"`. "[APP NAME]" isn't in the DOM. A source test asserts that the UF-01.1 module statically imports none of `@workoutlab/engine`, `lib/offline`, `lib/profile`, `lib/auth/client` or `@supabase/supabase-js`, and that the UF-01.2, UF-01.3 and UF-01.4 views are reached only through `React.lazy(() => import(…))`.
- **AC-2 (sub-path ids, D-0097 §1)** Given signed out, When each path renders, Then the screen id is: `/welcome` → UF-01.1, `/welcome/goal` → UF-01.2, `/welcome/level` → UF-01.3, `/welcome/schedule` → UF-01.4, `/welcome/save` → UF-01.1, `/welcome/xyz` → UF-01.1. The location is unchanged after one more settled tick in every case.
- **AC-3 (UF-01.2 Goal, D-0064 §1–§2)** Given no stored record, When `/welcome/goal` renders, Then it has one `radiogroup` with exactly 3 radios in this order: "Build muscle" (value `build_muscle`), "Get stronger" (`get_stronger`), "General fitness" (`general_fitness`). "Build muscle" is checked. The text "Lose fat" isn't in the DOM. The progress reads "1/3". Back goes to `/welcome`, and Continue goes to `/welcome/level`.
- **AC-4 (UF-01.3 Level & equipment, D-0061 §3, D-0064 §2–§3)** Given no stored record, When `/welcome/level` renders, Then the level group has Beginner / Intermediate / Advanced with Beginner checked. The equipment group has exactly "Bodyweight" / "Dumbbells" / "Full gym" with Full gym checked. The progress reads "2/3". Back goes to `/welcome/goal`, and Continue goes to `/welcome/schedule`. A separate test pins `equipment-profiles.ts` to these literals: `bodyweight` = `["none"]`, `dumbbells` = `["none","dumbbell","bench"]`, `full-gym` = `["none","dumbbell","bench","barbell","rack","cable","machine","pullup-bar","kettlebell","band"]`.
- **AC-5 (the record is written, D-0064 §6, D-0098)** Given `Date.now` = 5 000 000 and no record, When the user picks "Get stronger", Continues, picks Advanced and Dumbbells, and Continues, Then `JSON.parse(localStorage["wl-onboarding"])` deep-equals `{version: 1, goal: "get_stronger", level: "advanced", equipmentProfile: "dumbbells", rhythmMin: 3, rhythmMax: 4, startedAtMs: null, timingMs: null, planShown: false, savedAtMs: 5000000}` (no UF-01.1 visit in this test, so `startedAtMs` is null). Each radio change rewrites the key and `savedAtMs`. Continue with the untouched defaults also writes the key (`goal: "build_muscle"`, `level: "beginner"`, `equipmentProfile: "full-gym"`).
- **AC-6 (restore and expiry, D-0064 §6)** Given the AC-5 record with `savedAtMs` = `now − 86 400 000`, When `/welcome/goal` and then `/welcome/level` remount, Then "Get stronger", Advanced and Dumbbells are checked. Given `savedAtMs` = `now − 86 400 001`, or `version: 2`, or the string `"{"`, or a record without a boolean `planShown`, Then reading the record removes the key, and the defaults from AC-3 and AC-4 show. Unit tests on `pending-plan.ts` cover each case directly, and one render test covers expiry.
- **AC-7 (start time, D-0064 §7)** Given `Date.now` = 1 000 000 and no record, When `/welcome` commits, Then the stored `startedAtMs` is 1 000 000 and `planShown` is false. Given that record, When the user goes to `/welcome/goal`, presses Back, and UF-01.1 commits again at `Date.now` = 1 010 000, Then `startedAtMs` is still 1 000 000. Given an expired record (AC-6) at `Date.now` = 2 000 000, When `/welcome` commits, Then `startedAtMs` is 2 000 000. Given a record with `startedAtMs: null` created on `/welcome/goal`, When `/welcome` commits later, Then `startedAtMs` is set then (the earliest UF-01.1 commit wins, and it never moves once set).
- **AC-8 (keyboard and a11y, NFR-A11Y-1, NFR-A11Y-6)** Using only `userEvent.keyboard` (Tab, Enter, Space, the arrow keys), a test goes from `/welcome` → Get started → ArrowDown to "Get stronger" → Continue → `/welcome/level`, and the record holds `get_stronger`. Each radio group has an accessible name (`fieldset`/`legend` or `aria-labelledby`). axe on UF-01.1, UF-01.2 and UF-01.3 reports 0 violations, with colour-contrast off as in the UF-04 test.
- **AC-9 (offline, no network)** Given `navigator.onLine = false` and `fetch` rejecting, When the AC-5 path runs from `/welcome`, Then every screen renders and the record is written. Spies show 0 calls to `fetch` and 0 imports of `@supabase/supabase-js`, `lib/offline` and `lib/profile` from the UF-01.1–.3 modules (the source test from AC-1, extended to the UF-01.2 and UF-01.3 modules).
- **AC-10 (the web-shell rows, D-0097 §2–§3)** In `apps/web/src/app/auth-guard.test.tsx` and `apps/web/src/app/__tests__/profile-gate.test.tsx`:
  - Where `/welcome/goal` sits in a shared `it.each` array (profile-gate today: lines ~278, 319, 352, 450 and 626), it is removed from the array. A sibling case for `/welcome/goal` alone takes its place. The sibling has the same state setup and the same location and no-bounce assertions as the shared body, and asserts UF-01.2 where the shared body asserts UF-01.1. The shared bodies and the remaining entries are byte-identical.
  - Single `/welcome/goal` cases (auth-guard "signed out: /welcome/goal renders without a redirect", and the profile-gate in-place `SIGNED_IN` `present` contrast) change only their expected id, to UF-01.2.
  - The two synchronous first-render text queries, `auth-guard.test.tsx:131` (AC-B6) and `profile-gate.test.tsx:702` (AC-10), point at the built UF-01.1 heading instead of "Welcome". Each still runs with no `await` or `waitFor` before it.
  - `git diff main` on both files shows only these changes. The number of `/welcome/goal` cases before and after is equal, counting array entries plus single cases. Both files pass in full.
- **AC-11 (strings and lint, NFR-I18N-1)** Every user-visible string on UF-01.1–.3 comes from `en.uf01` (`lib/i18n/flows/uf-01.ts`). `react/jsx-no-literals` is green. `en.ts` is unchanged.

## Paths you may change
- `apps/web/src/features/UF-01/**` (the lane: `web-feature:UF-01`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-01.ts`: this flow's strings file (D-0071 §1); add keys only.
  - `apps/web/src/app/auth-guard.test.tsx`: the `/welcome/goal` row and the AC-B6 heading query only (D-0097 §2–§4).
  - `apps/web/src/app/__tests__/profile-gate.test.tsx`: the `/welcome/goal` rows (split out of shared arrays into sibling cases) and the AC-10 heading query only (D-0097 §2–§4).
  - `docs/tickets/T-0301b-onboarding-screens.md`: this file, for the accept log.

## Contract impact
None. Nothing is written to Supabase. `wl-onboarding` is local storage, and its shape is set by D-0064 §6 and D-0098 (both `revisit`). Tokens are only read.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green · `check:size` green (the `/welcome/*` chunk ≤ 100 KB gzip, with the engine outside it) · contracts unchanged · commits start `T-0301b` and cite screen ids (for example `T-0301b UF-01.2: goal radio group`).

## Notes
- **Flow:** `wl-build-web`. Ask review to check that the two web-shell files change only within D-0097 §2–§4.
- T-0301a's gate is merged. This ticket mustn't import `lib/profile` (T-0301a AC-12 enforces that).
