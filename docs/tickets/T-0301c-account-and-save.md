---
id: T-0301c
title: UF-01.5 Account (magic link, code, Google, privacy link) and `/welcome/save` (the 9 targets, then the profile; the existing profile wins; retry and offline)
lane: web-feature:UF-01
screens: [UF-01.5, UF-01.4, UF-01.1, UF-02.1]
decisions: [D-0010, D-0014, D-0045, D-0064, D-0071, D-0073, D-0097, D-0098, D-0100, D-0101]
deps: [T-0301a, T-0301b, T-0301d, T-0331, T-0378]
status: todo
---
<!-- Groomed 2026-10-01 by product-owner (groom T-0301c) from docs/tickets/T-0301-onboarding.md ACs C1–C8. Build flow: wl-build-web. About ¾ day. Becomes ready when T-0301d, T-0331 and T-0378 are done (T-0378: its signed-in e2e must not hit an unhandled hydrate rejection) (T-0301a and T-0301b are done). Shared files: apps/web/src/app/__tests__/profile-gate.test.tsx is also edited by T-0331 (T-0375 is folded into it), and profile-gate.source.test.ts by any T-0328/T-0333 build. Never run this ticket in parallel with any of them. -->

## Why
Principle 5 ends at UF-01.4 with a plan on screen. The plan only counts once it is saved, and saving needs an account (no guest mode, D-0014). This ticket builds the last two pieces of onboarding:
- **UF-01.5 Account**, the designed sign-in screen. Today it is T-0300b's bare form.
- **`/welcome/save`**, where a signed-in user with no profile gets the pending plan written. That covers the device that showed the plan, and also the D-0045 §5 case: a magic link that opens in another browser context, without the answers.

T-0301a routes every signed-in user without a profile to `/welcome/save` and provides the recheck (D-0073). T-0301b and T-0301d write the pending plan and mark it `planShown` (D-0098). D-0100 settles how `/welcome/save` behaves, and D-0101 lets it call the recheck.

**What exists already.**
- `features/UF-01/index.tsx` exports `Account` and `AuthCallback`:
  - `Account` is T-0300b's bare form: "Send link" / "Enter code" tabs, an email field pre-filled from `lastEmail()`, the `auth.*` result texts, `role="status"`.
  - `AuthCallback` exchanges `?code=` and shows "This link has expired. Send a new one." with a link to `/account`.
- `lib/auth/magic-link.ts` provides `requestMagicLink` (trims, lower-cases, checks offline, `emailRedirectTo` `/auth/callback`) and `verifyCode`.
- Nothing calls Google yet.
- `/welcome/save` currently renders UF-01.1 through T-0301b's catch-all, which also calls `markOnboardingStarted()`. This ticket ends that (D-0100 §5).

## Scope
- In:
  - **UF-01.5 Account** (`/account`, the `Account` export of `features/UF-01/index.tsx`, the name `routes.ts` loads). The UF-01 visual style (`uf-01.css`, the `wl-uf01` classes, tokens only).
    - The heading is "Save your plan" with a saveable pending plan (D-0098 §2), and "Sign in" without one.
    - "Send link" and "Enter code" modes, with the T-0300b accessible names kept.
    - "Continue with Google".
    - The privacy link (D-0064 §10).
    - A Back link to `/welcome/schedule`, only with a saveable plan.
    - `Account` may move into its own module that `index.tsx` re-exports. It stays in `index.tsx`'s static graph (the `/account` route has no lazy step).
  - **`AuthCallback`:** its exchange logic is unchanged. Its expired state adds one line when a saveable plan exists (AC-4).
  - **`/welcome/save`** → `features/UF-01/SaveScreen.tsx`, reached through `React.lazy` from `WelcomeRoutes.tsx` at `path="save"`, with `store={pendingPlan}` (type-only import, the AC-A6 reason in `WelcomeRoutes.tsx`). Its behaviour is D-0100 §1–§5:
    - screen id `UF-01.5-save`;
    - with no saveable plan, it stays and links to `/welcome/goal`;
    - otherwise the existence check, then the targets, then the profile;
    - Retry, and the offline wait;
    - it never touches `startedAtMs`.
    - It calls `useRecheckProfile()`, the only `lib/profile` import any feature may make (D-0101).
  - **Tests:**
    - Vitest in `features/UF-01/__tests__/`;
    - the D-0097 §2 / D-0100 rows in the web-shell test files;
    - the D-0101 §3 allow-list in `profile-gate.source.test.ts`;
    - account and save cases appended to T-0301d's `tests/e2e/uf-01-onboarding.spec.ts`.
  - **Strings:** new keys in `lib/i18n/flows/uf-01.ts`. The existing `en.auth.*` texts are read, never copied.
- Out:
  - `lib/auth/**` internals (`requestMagicLink`, `verifyCode`, `return-to`, the guards).
  - `lib/profile/**`.
  - `routes.ts`.
  - `en.ts`.
  - The magic-link email template (T-0404).
  - The equipment checklist (T-0216).
  - Priority areas (UF-11.3).
  - Account deletion and export (T-0310).
  - Any contract change.
  - Any new dependency.

### Edge cases that are in scope
- **Offline:**
  - "Send link" shows `auth.offline` (AC-2). Google is disabled with `auth.offline` as its description, and re-enables on `online` (AC-3).
  - `/welcome/save` makes no request while offline, shows "Connect to save your plan", and saves on the next `online` event (AC-8).
- **Time running out:**
  - The fastest saved path is UF-01.4 → `/account` → code → `/welcome/save` → `/`, with the save running without a tap (AC-5, AC-14).
  - An expired link keeps the plan and leads back to "Save your plan" (AC-4).
- **Zero history:** every user here has none. The save writes targets only, and `/` then shows Today's zero state (T-0302a).
- **Returning after 10 days off:**
  - "I already have an account" with a 10-day-old record shows "Sign in", because the record has expired (24 h, D-0064 §6).
  - A code sign-in on an account with a profile lands on `/` with no write (AC-6, AC-14).
  - An existing profile is never overwritten by this device's answers (AC-6).
- **Answers on another device** (D-0045 §5): signed in with no profile and no saveable plan → "Set up your plan" → `/welcome/goal` (AC-9).

## Acceptance criteria
Vitest + Testing Library in `apps/web/src/features/UF-01/__tests__/`. `lib/auth/client.js` is mocked with `vi.mock` and a `from`/`auth` spy. Reuse the `lib/offline/__tests__/select-spy.ts` pattern, extended locally in the test for `upsert`. `Date.now` is faked where time matters.

**`lib/profile` in tests.** Feature tests mock it only with `vi.mock("../../../lib/profile/index.js", …)` and a hoisted spy, and never import it. `profile-gate.source.test.ts` walks every file under `features/**`, including `__tests__`, and D-0101's allow-list names only `SaveScreen.tsx`.

**Fixture `PLAN`** (D-0098): `{version: 1, goal: "get_stronger", level: "advanced", equipmentProfile: "dumbbells", rhythmMin: 2, rhythmMax: 3, startedAtMs: 1000000, timingMs: 42000, planShown: true, savedAtMs: now − 60 000}`. **`UNSHOWN`** is `PLAN` with `planShown: false`.

- **AC-1 (UF-01.5 layout, D-0064 §10, D-0098 §2)**
  - Given `PLAN` is stored, When `/account` renders, Then `[data-screen-id="UF-01.5"]` has one `<h1>` "Save your plan" and a link named "Back" with `href="/welcome/schedule"`.
  - Given no record, or `UNSHOWN`, or `PLAN` with `savedAtMs` = `now − 86 400 001`, Then the `<h1>` is "Sign in" and there is no link to `/welcome/schedule`.
  - In every case, the screen has:
    - tabs "Send link" and "Enter code" (`role="tab"`);
    - a field labelled "Email" (`type="email"`, `autocomplete="email"`) and a "Send link" button;
    - in code mode, a field labelled "6-digit code" (`inputmode="numeric"`, `autocomplete="one-time-code"`, `maxlength="6"`) and a "Verify code" button;
    - a "Continue with Google" button;
    - a link named "Privacy" with `href="https://workout.vestgote.com/privacy/"`.
  - Rendering `/account` leaves a valid record (`PLAN` or `UNSHOWN`) byte-identical, and creates no record when none was stored. An expired or invalid record is deleted on read, as `readPendingPlan` already does (D-0064 §6).
- **AC-2 (magic link and code, T-0300b reused)**
  - "Send link" with `" Ada@Example.com "` calls `signInWithOtp` once with `email: "ada@example.com"` and `emailRedirectTo: "<origin>/auth/callback"`, and shows `en.auth.linkSent` in `role="status"`.
  - With the mocked results for `invalid_email`, `offline` (`navigator.onLine = false`) and `rate_limited` (status 429), the matching `en.auth.*` text shows in `role="status"`.
  - "Verify code" with `123456` calls `verifyOtp({email: "ada@example.com", token: "123456", type: "email"})`. `12345` shows `en.auth.invalidCode` with no call.
  - These pass unedited: `lib/auth/magic-link.test.ts`, `lib/auth/auth-callback.test.tsx` (including the AC-B4 last-email pre-fill), `app/auth-guard.test.tsx`, `app/__tests__/auth-guard.phase3.test.tsx` and `tests/e2e/auth.spec.ts`.
- **AC-3 (Google)**
  - Given online, When "Continue with Google" is activated twice quickly, Then `signInWithOAuth` is called **once** with `{provider: "google", options: {redirectTo: "<origin>/auth/callback"}}`.
  - A resolved `{error}` shows `en.auth.unknown` in `role="status"` and re-enables the button.
  - Given `navigator.onLine = false` at render, Then the button has `aria-disabled="true"` (or `disabled`), `aria-describedby` points at text equal to `en.auth.offline`, and activating it makes no call.
  - A `window` `online` event (with `navigator.onLine = true`) re-enables it without a remount.
- **AC-4 (an expired link keeps the plan)**
  - Given `PLAN` is stored, When `/auth/callback?error_code=otp_expired` renders, Then `en.auth.linkExpired` and one more line, "Your plan is still saved on this device.", show. The record is byte-identical.
  - Activating "Send a new one" leads to `/account` with the `<h1>` "Save your plan".
  - Given no record, the extra line is absent.
  - `exchangeCodeForSession` behaviour is unchanged (`auth-callback.test.tsx` unedited).
- **AC-5 (save, D-0100 §3, principle 3)**
  - Given signed in, `PLAN`, and `from("profiles").select("user_id").maybeSingle()` resolving `{data: null, error: null}`, When `/welcome/save` renders, Then without any tap:
    1. **the profiles select** runs once.
    2. **The targets** are written: `from("area_targets").upsert(rows, {onConflict: "user_id,area_id"})`, where `rows` is 9 objects in the order chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves. `sets_per_14d` is 14, 14, 11, 9, 9, 14, 14, 11, 9 (`deriveTargets` for 2–3, R4-E3), `source` is `"default"`, and no `user_id` key is sent.
    3. **After step 2 resolves,** the profile is written: `from("profiles").upsert({goal: "get_stronger", level: "advanced", equipment: ["none","dumbbell","bench"], rhythm_min: 2, rhythm_max: 3, priority_areas: [], onboarding_timing_ms: 42000}, {onConflict: "user_id"})`.
    4. **After step 3 resolves,** `wl-onboarding` is removed and the recheck spy is called once. The location is still `/welcome/save` when the recheck is called.
    5. **After the recheck resolves,** the location is `/`, by a `replace` navigation.
  - With `deriveTargets` spied to add 1 to every area, every `sets_per_14d` is 1 higher. There is no target arithmetic in the module.
  - With `timingMs: null`, `onboarding_timing_ms` is `null`.
- **AC-6 (the existing profile wins, D-0064 §8)** Given `PLAN` and the profiles select resolving a row, Then neither upsert is called, `wl-onboarding` is removed, the recheck is called once, and the location ends at `/`.
- **AC-7 (failure and Retry, D-0100 §3–§4)**
  - Given the targets upsert resolves `{error: {code: "500"}}`, Then:
    - the profiles upsert isn't called;
    - `wl-onboarding` is byte-identical;
    - "Couldn't save your plan. Try again." shows in `role="alert"` with a "Retry" button;
    - the location stays `/welcome/save`.
  - When Retry is activated (twice quickly) and both upserts succeed, Then one more targets upsert and one profiles upsert run, the profiles **select** count stays 1, and the AC-5 end state follows.
  - Given the targets upsert succeeds and the profiles upsert fails, Then the same error shows. Retry resends **both** upserts, in AC-5 order.
  - Given the step-1 `profiles` existence select resolves `{error: {code: "500"}}` (or rejects), Then:
    - the same "Couldn't save your plan. Try again." alert and Retry show;
    - both upserts have 0 calls;
    - `wl-onboarding` is byte-identical.

    When Retry is activated, step 1 runs again (select count 2), and only after it succeeds with `{data: null}` do the upserts follow, in AC-5 order. Step 1 runs once **successfully** per visit (D-0100 §3).
  - The recheck is never called before a successful profiles upsert or an AC-6 existing row.
- **AC-8 (offline, D-0100 §4)**
  - Given `PLAN` and `navigator.onLine = false` at mount, Then `supabase.from` has 0 calls, "Connect to save your plan" shows, and there is no enabled Retry.
  - When `navigator.onLine` becomes true and a `window` `online` event fires, Then the AC-5 sequence runs with no tap and ends at `/`.
  - Given an AC-7 failure and then an `offline` → `online` pair, the save restarts at the targets upsert.
- **AC-9 (no saveable plan, D-0100 §2)**
  - Given signed in and no record (or `UNSHOWN`, or an expired `PLAN`), When `/welcome/save` renders, Then `[data-screen-id="UF-01.5-save"]` shows:
    - the `<h1>` "Set up your plan";
    - the line "Your answers aren't on this device. It takes under a minute.";
    - a link named "Set up my plan" with `href="/welcome/goal"`.
  - After two more settled ticks, the location is still `/welcome/save` and `supabase.from` has 0 calls.
  - An `UNSHOWN` record is byte-identical afterwards (D-0098 §2: it isn't deleted).
- **AC-10 (the start time is untouched, D-0100 §5, D-0064 §7)**
  - Given no record and `Date.now` = 1 000 000, When `/welcome/save` renders, Then `localStorage["wl-onboarding"]` is absent.
  - Given `UNSHOWN` with `startedAtMs: null`, Then `startedAtMs` is still null afterwards.
  - A source test asserts that `SaveScreen.tsx` contains no `markOnboardingStarted` and that `WelcomeRoutes.tsx`'s `save` route element isn't `WelcomeScreen`.
  - T-0301b's `screens.test.tsx` AC-2 row `["/welcome/save", "UF-01.1"]` becomes `["/welcome/save", "UF-01.5-save"]`. The other rows are unchanged.
- **AC-11 (module boundaries, principle 5)**
  - In T-0301b's `source.test.ts`, `SaveScreen` joins the `LAZY` list. So it is reached only as `lazy(() => import("./SaveScreen.js"))`, it is outside `index.tsx`'s static graph, and it value-imports no module the splat's chunk holds (so `pending-plan.ts` comes in as a type only).
  - The static graphs of `index.tsx` and `WelcomeRoutes.tsx` still reach none of `@workoutlab/engine`, `lib/offline`, `lib/profile` or supabase-js (`MODULES` unchanged).
  - T-0301d's AC-9 source test ("the engine is imported only by the UF-01.4 module") is widened to "only by the UF-01.4 module and `SaveScreen.tsx`, both reached through `React.lazy`". The `/welcome` first chunk still has no engine.
  - `apps/web/build.test.ts` (AC-A6 manifest) and `check:size` are green.
- **AC-12 (the D-0101 allow-list)** In `apps/web/src/app/__tests__/profile-gate.source.test.ts`, "no file under features/ imports lib/profile", its dynamic-import twin and "features/UF-01 does not import lib/profile or lib/offline" use the allow-list `{"features/UF-01/SaveScreen.tsx": ["useRecheckProfile"]}`:
  - Every other feature file has 0 `lib/profile` specifiers, static or dynamic.
  - `SaveScreen.tsx` has exactly one `lib/profile` import, whose only named binding is `useRecheckProfile`.
  - The `lib/offline` ban over `features/UF-01/**` is unchanged.
  - A contrast case runs the same check on a synthetic source string, `import { useRecheckProfile, useProfileStatus } from "../../lib/profile/index.js";` attributed to `SaveScreen.tsx`, and it fails. A second contrast case adds `useRecheckProfile` to `GoalScreen.tsx`'s source string, and that fails too.
  - The `ProfileGate` test and the walker non-vacuity test are byte-identical.
- **AC-13 (the web-shell rows, D-0097 §2, D-0100 §1)** In `apps/web/src/app/__tests__/profile-gate.test.tsx`:
  - **Shared tables:** the three `it.each` arrays that list `/welcome/save` with `/welcome` are AC-7 "renders UF-01.1 and stays put", the no-bounce `Recorder` table and the "fails open" table. In each one, `/welcome/save` is removed from the array and a sibling case for `/welcome/save` alone takes its place. The sibling has the same state, location and no-bounce assertions, and asserts `UF-01.5-save` where the shared body asserts `UF-01.1`. The shared bodies and the `/welcome` entries are byte-identical.
  - **Single expected-id changes** (UF-01.1 → UF-01.5-save, nothing else on the line):
    - the AC-5 `it.each(GATED)` body's `screenOf("UF-01.1")`, the redirect target for every entry, with the location assertion unchanged;
    - the `/account` table's `missing` row cell;
    - the D-0073 §3 `stale` + `missing` case;
    - the first AC-11 case.
  - **The "not redirected" marker:** in the AC-6 `unknown` and `present` bodies and the "never settles" body, `expect(screenOf("UF-01.5-save")).not.toBeInTheDocument()` is added right after the existing UF-01.1 negative. Without it, a redirect to `/welcome/save` would no longer show UF-01.1.
  - **Waiting for the lazy chunk:** `SaveScreen` loads through `React.lazy`, so a positive `UF-01.5-save` assertion may (and should) wait for it, with `await waitFor(() => expect(screenOf("UF-01.5-save")).toBeInTheDocument())` or `await screen.findBy…`.
    - This covers the D-0073 §3 `stale` case (~line 905), which today asserts synchronously after a location `waitFor`. A synchronous assertion on a cold lazy chunk is the T-0331 flake class.
    - That wrapping is the only other change allowed on those lines.
    - Negative markers stay synchronous, after the body's existing settle.
  - **The stale case** still asserts `spy.countFor("profiles")` is 1. AC-9 keeps that true, because the no-plan screen makes no call.
  - **Scope of the diff:** `git diff main` on the file shows only these changes. The number of `/welcome/save` cases (array entries plus single cases) is equal before and after. The file passes in full and in isolation (`-t '/welcome/save'`).
  - **`apps/web/src/app/auth-guard.test.tsx`** is granted by D-0097 §4. It has no `/welcome/save` row today, so its expected diff is empty.
- **AC-14 (e2e, appended to `tests/e2e/uf-01-onboarding.spec.ts`)** Supabase is mocked with `page.route` handlers registered in the spec, on top of `fixtures/supabase-mock.ts` (D-0086 guard; `fixtures/` is unchanged).
  - (a) **New user.** At 360 × 640, Get started → Continue → Continue → "Save my plan" → `/account` shows "Save your plan" → Enter code → `GOOD_CODE` → Verify. The `profiles` GET answers `[]` until the `profiles` POST, and `[row]` after it. The page reaches `/welcome/save` and then `[data-screen-id="UF-02.1"]` at `/`. The `area_targets` POST body has 9 rows in AC-5 order, and it is sent before the `profiles` POST (request order). `localStorage["wl-onboarding"]` is absent at the end.
  - (b) **Returning user** (AC-6, the old AC-C7). With `mockProfilePresent`, a code sign-in on `/account` ends at `/` on UF-02.1 with 0 POSTs to `profiles` or `area_targets`.
  - (c) **A11y.** axe reports 0 serious or critical violations on UF-01.5 with each heading and on UF-01.5-save's no-plan state. A keyboard-only run (Tab, Enter, Space) fills the email and activates "Send link" (NFR-A11Y-6). Every button, tab and link on UF-01.5 measures ≥ 44 × 44 px (`boundingBox`, NFR-A11Y-2).
- **AC-15 (strings and lint, NFR-I18N-1)** Every new user-visible string comes from `en.uf01` (`lib/i18n/flows/uf-01.ts`, keys added only). The `en.auth.*` texts are read from `en.auth`. `react/jsx-no-literals` is green over every UF-01 `.tsx`, and `en.ts` is unchanged.

## Paths you may change
- `apps/web/src/features/UF-01/**` (the lane: `web-feature:UF-01`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-01.ts`: this flow's strings file (D-0071 §1); add keys only.
  - `apps/web/src/app/__tests__/profile-gate.test.tsx`: the `/welcome/save` rows and markers that AC-13 lists (D-0097 §2, D-0100 §1).
  - `apps/web/src/app/auth-guard.test.tsx`: the `/welcome/save` rows (D-0097 §4); the expected diff today is empty.
  - `apps/web/src/app/__tests__/profile-gate.source.test.ts`: the D-0101 §3 allow-list and its contrast cases (AC-12).
  - `tests/e2e/uf-01-onboarding.spec.ts`: append the AC-14 cases to T-0301d's spec (D-0071 §10).
  - `docs/tickets/T-0301c-account-and-save.md`: this file, for the accept log.

## Contract impact
None. The writes match `docs/data-model.md` exactly:
- `area_targets` takes `area_id`, `sets_per_14d` and `source`, and `user_id` defaults to `auth.uid()`.
- `profiles` takes `goal`, `level`, `equipment`, `rhythm_min`, `rhythm_max`, `priority_areas` and `onboarding_timing_ms`. The trigger sets `onboarded_at`, `plan_changed_at` and the timestamps.

RLS is unchanged. The engine is only called (`deriveTargets`), and tokens are only read. The behaviour defaults are D-0100 and D-0101 (both `revisit`).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green for AC-14 and for the unedited `auth.spec.ts` · `check:size` green · contracts unchanged · commits start `T-0301c` and cite screen ids (for example `T-0301c UF-01.5: Continue with Google`).

## Notes
- **Flow:** `wl-build-web`. Ask review to check that the three web-shell test files change only within AC-12 and AC-13, and that `SaveScreen.tsx` is the only feature file importing `lib/profile`.
- **Serial with:** T-0331 (`profile-gate.test.tsx`; T-0375 is folded into it), T-0377 (`features/UF-01/**`, either order), and any T-0328 or T-0333 build (the gate seam that D-0101 depends on).
- **Google** needs H-08 done in the Supabase dashboard to work for real. The tests mock it, so this ticket doesn't wait on it.

## Accept log

### Build 2026-10-02 (frontend-dev, `wl-build-web`, `0f2c6e5`)
- UF-01.5 Account: the heading depends on whether a saveable plan exists. Send link / Enter code keep the T-0300b names. Google has an in-flight guard and an offline guard. The screen has the Privacy link, and Back shows only with a plan. AuthCallback's expired state adds the "plan kept" line.
- Lazy `/welcome/save` SaveScreen: existence check → 9 targets → profile → clear → await recheck → `replace` to `/`. Step 1 succeeds once per visit. Retry and double-tap are guarded. Offline waits for `online`. With no plan the screen stays and links to `/welcome/goal`. It never calls `markOnboardingStarted`.
- Web 1009/1009, e2e 56/56, `check:size` and AC-A6 green. About 20 planted mutations went red.

### Review: APPROVE
No open redirect, no PII in logs. `noValidate` doesn't weaken validation, because the code still validates. Lows:
- the profile-gate.source bare-import gap (QA then failed on it, fixed in the rework);
- D-0100 has no addendum for the signed-out + saveable plan → `/account` redirect;
- clear-before-recheck heals itself;
- the Account tabs have no roving tabindex and no live-region mount (pre-existing).

### QA attempt 1: FAIL (AC-12 only)
A bare `import "…lib/profile…"` passed the allow-list, and two main import-ban tests had lost bare-import coverage (D-0101 §3). Everything else passed:
- data safety: a profile-first fault → 11 red; skipping the existence check → 9 red;
- browser probe: POST order, recovery from a partial failure, double-tap = one request;
- principle 5.

### Rework `b6ac31c` (test-only)
`profileStatements()` now collects bare imports, and there are 3 more contrast rows. The orchestrator re-planted the fault: a bare import in SaveScreen → 4 red, in GoalScreen → 6 red, restored → 21/21.

### Accept 2026-10-02 (product-owner): done
- AC-1 to AC-4 (Account, magic link/code, Google, expired link): pass in Build and QA. The T-0300b auth files pass unedited.
- AC-5 to AC-8 (save order, existing profile wins, failure/Retry, offline): pass. QA's data-safety mutations and the browser probe confirm targets-before-profile, one successful existence check, and no overwrite of an existing profile.
- AC-9 and AC-10 (no plan, start time untouched): pass. `markOnboardingStarted` is absent from SaveScreen.
- AC-11 (lazy boundary, no engine in the first chunk): pass. `check:size` and AC-A6 are green.
- AC-12 (the D-0101 allow-list): passes after the rework. The checker now sees bare imports, the contrast cases fire, and the re-planted faults go red.
- AC-13 (web-shell rows): Review confirmed the diff stays inside AC-12/AC-13.
- AC-14 (e2e) and AC-15 (strings/lint): green.
- Principles hold: 3 (targets come only from `deriveTargets`) and 5 (no await before UF-01.1; save without a tap).
- Follow-up (spec gap, not a blocker): D-0100 needs an addendum covering the redirect of a signed-out user with a saveable plan to `/account` ("Save your plan"). The behaviour shipped as the reasonable default, but no decision records it yet.
