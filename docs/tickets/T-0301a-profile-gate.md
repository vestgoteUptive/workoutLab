---
id: T-0301a
title: Profile gate (UF-01.1, UF-01.5) — `lib/profile` `useProfileStatus`/`recheckProfile`, signed in without a profile → `/welcome/save`, `/welcome/*` renders, `/session/:sessionId` never gated
lane: web-shell
screens: [UF-01.1, UF-01.5, UF-02.1, UF-09, UF-03.3, UF-08.1]
decisions: [D-0014, D-0045, D-0064, D-0071, D-0073]
deps: [T-0300, T-0318, T-0319]
status: done
---
<!-- Written by product-owner 2026-09-29 (spec mode) from D-0064 §9 and D-0071 §11, on top of the merged T-0318 and T-0319. Build flow: wl-build-web. About ¼–½ day. Web-shell: never in parallel with T-0318, T-0319, T-0310, T-0312 or T-0313. Board order (D-0071 §11): T-0318 → T-0319 → T-0301a. -->

## Why
A magic link can open in a different browser context from the one holding the local onboarding answers (the iOS PWA case, D-0045 §5). The user then lands signed in on a protected route with **no `profiles` row**, every engine read returns nothing and `/workouts/suggest` would 422. D-0064 §9 closes that hole with one shell-level gate: signed in and no profile → `/welcome/save`, which T-0301c then uses to write the profile and its 9 `area_targets`.

The gate is web-shell work because it decides routing, and because the two principles it must not break are shell-level:
- **Principle 1.** `/session/:sessionId` and `/session/:sessionId/summary` are **never** gated. A missing or unreadable profile must not interrupt a workout or its summary (D-0071 §2, §11).
- **Principle 5.** Signed out, nothing changes. `/welcome`'s first committed render never waits for the gate, never touches `lib/offline` and never calls the network.

This ticket is the last web-shell prerequisite for T-0301c, which owns `/welcome/save` itself.

## Scope
- In:
  - **`apps/web/src/lib/profile/`** (new module, web-shell): `useProfileStatus(): "unknown" | "present" | "missing"`, `recheckProfile(): void | Promise<void>` and the `ProfileGate` component the shell wraps routes in. Resolution order per D-0064 §9:
    1. Signed out (`useAuth().status === "signed-out"`) → the gate is inert; it never reads storage or the network.
    2. A **cached** profile (`loadProfile()` from `lib/offline` resolves non-null) → `present`, **with no network wait**.
    3. Otherwise, online → `supabase.from("profiles").select(…).maybeSingle()`: a row → `present` and `refreshProfile()` is called once; `{data: null}` → `missing`.
    4. An error (rejection or `{error}`), or `navigator.onLine === false` → `unknown`.
    5. Before any of 2–4 resolves → `unknown`.
  - **Which routes gate** (D-0071 §11): **every route in `routes.ts` whose `guard` is `protected`, plus the literal path `/session/setup`** — derived from the route table at runtime, not a hard-coded list, so the routes T-0318 added (`/library/:exerciseId/compare/:otherId`, `/progress/:exerciseId`, `/plan/edit`, `/plan/routines/new`, `/plan/routines/:routineId`) are gated without this ticket naming them, and a future `protected` route is gated the day it is added.
  - **Which routes never gate**: `/session/:sessionId`, `/session/:sessionId/summary` (both `session` guard, principle 1), `/welcome/*`, `/account`, `/auth/callback`.
  - **`/welcome/*` renders instead of redirecting** for a signed-in user whose status is `missing`. `/welcome/*` is `guest-only` today, so `RedirectIfSignedIn` would bounce a signed-in user off `/welcome/save` before T-0301c could run. `lib/auth/guards.tsx` is amended to stand down in exactly that case (§D-0073, recorded below). With `present` or `unknown` the `guest-only` behaviour is unchanged (T-0300b's return-to path, or `/`).
  - **`recheckProfile()`** so T-0301c can re-evaluate after its writes land, without a reload and without a redirect loop back to `/welcome/save`.
- Out:
  - **`/welcome/save` itself** — the screen, the `profiles` + `area_targets` upserts, "the existing profile wins", the Retry/offline handling and the `/welcome/goal` fallback are **T-0301c** (D-0064 §8). This ticket only guarantees the user arrives there and that `recheckProfile()` exists for it to call.
  - UF-01.1–.4, the pending plan and the onboarding timing — **T-0301b** (D-0064 §6, §7).
  - Any `routes.ts` **path** change, and any change to a route's `guard` value.
  - `lib/auth` internals (T-0300b): `requestMagicLink`, `verifyCode`, the `AuthCallback` exchange and the `redirectTarget`/return-to logic keep their behaviour. `auth-guard.test.tsx` and `__tests__/auth-guard.phase3.test.tsx` are **not edited**.
  - `lib/offline` (T-0319, merged): `loadProfile()` and `refreshProfile()` are consumed as they are. No new cache table, no write.
  - Any contract change, and any Edge Function call (D-0071 §8: the web calls none in v1).

### Edge cases that are in scope
- **Offline.** Signed in, offline, no cached profile → `unknown` → **no redirect**; `/` renders UF-02.1 (AC-4, AC-6). Signed in, offline, **with** a cached profile → `present` with no network attempt (AC-2).
- **Time running out / mid-workout.** A cold load of `/session/<id>` or `/session/<id>/summary` with `missing` renders the workout, not `/welcome/save` (AC-8). A status that flips to `missing` while the user is already on a session route still does not redirect.
- **Zero history.** A brand-new signed-in user is exactly the `missing` case; that is the path this ticket exists for (AC-5).
- **Returning after 10 days off.** Sign in on a fresh device: no cache, online, a row exists → `present` → `/` renders, and `refreshProfile()` warms the cache for the next cold start (AC-3).
- **Race / flap.** The gate resolves once per mount and per `recheckProfile()`. A component unmounted before the `maybeSingle()` promise settles must not set state (no React warning, asserted in AC-11).
- **Signed out.** No change at all (AC-9, AC-10).

## Acceptance criteria
Vitest + Testing Library. Unit tests for the hook in `apps/web/src/lib/profile/__tests__/`; routing tests in `apps/web/src/app/__tests__/profile-gate.test.tsx`, reusing the `auth-guard.phase3.test.tsx` harness (`MemoryRouter` + `AuthProvider` + `Shell`, `vi.mock` of `lib/auth/client.js`, `seedValidSession()`). `lib/offline` and `supabase.from` are mocked with the existing spies (`lib/offline/__tests__/select-spy.ts` pattern). Assertions are on **behaviour** (which screen id is on the DOM, which spy was called), never on the gate's internals.

- **AC-1 (three states exist and are exhaustive)** `useProfileStatus()` returns one of exactly `"unknown" | "present" | "missing"`. Before any source resolves (a `loadProfile` that never settles), the first committed render returns `"unknown"`. A test asserts the union type has exactly these three members (a source/type-level test, as T-0318 AC-1 pins the table) so a fourth state can't be added silently.
- **AC-2 (cached fast path: `present`, no network wait)** Given signed in and `loadProfile()` resolving to a profile, When `useProfileStatus()` resolves, Then it is `"present"` **and** `supabase.from` was never called with `"profiles"`. Stated as a wait-free assertion the way T-0300b AC-B6 does it: with `fetch` stubbed to a promise that **never resolves** and `navigator.onLine = true`, the status still reaches `"present"`. Repeated with `navigator.onLine = false`: still `"present"` (the cache doesn't need the network).
- **AC-3 (online, row → `present` + `refreshProfile`)** Given signed in, `loadProfile()` → `null`, online, and `from("profiles")…maybeSingle()` → `{data: <row>, error: null}`, Then the status is `"present"` and `refreshProfile` was called **exactly once**. A second render/`recheckProfile()` in the same mount does not call it a second time for the same resolution.
- **AC-4 (online, no row → `missing`; error/offline → `unknown`)** Same setup, `maybeSingle()` → `{data: null, error: null}` → `"missing"`. `{data: null, error: {status: 500}}` → `"unknown"`. A rejected promise (`new TypeError("Failed to fetch")`) → `"unknown"`. `navigator.onLine === false` with no cache → `"unknown"` **and** `from` was never called with `"profiles"`.
- **AC-5 (every gated route redirects, derived from the table)** A test **iterates `routes` from `routes.ts`** and, for signed in + `missing`, asserts that each entry with `guard === "protected"` plus the entry `/session/setup` ends on `/welcome/save` (the `UF-01.1` welcome splat screen id is on the DOM and the router location is `/welcome/save`). The iteration asserts a non-zero, **exact expected count** (12 `protected` entries + `/session/setup` on the merged table) so the test fails if the table shrinks or an entry's guard changes. Concrete paths are substituted for params: `/`, `/library`, `/library/back-squat`, `/library/back-squat/compare/leg-press`, `/progress`, `/progress/back-squat`, `/balance`, `/balance/core`, `/plan`, `/plan/edit`, `/plan/routines/new`, `/plan/routines/R1`, `/session/setup`.
- **AC-6 (`unknown` never redirects — contrast to AC-5)** The **same iteration** as AC-5, same signed-in session, but with the status forced to `"unknown"` (offline, no cache): **every** one of those paths renders its own screen (`UF-02.1`, `UF-04.1`, `UF-04.2`, `UF-04.3`, `UF-06.1`, `UF-06.2`, `UF-10.1`, `UF-10.2`, `UF-11.2`, `UF-11.3`, `UF-07.1`, `UF-07.1`, `UF-08.1`) and `/welcome/save` is **not** reached. Repeated with `"present"`, same result. This is the negative half that stops AC-5 from passing vacuously (a gate that redirected unconditionally would fail here).
- **AC-7 (`/welcome/*` renders instead of redirecting)** Given signed in and `missing`: `/welcome/save`, `/welcome` and `/welcome/goal` each render `[data-screen-id="UF-01.1"]` (the `/welcome/*` splat export) with **no** navigation away — the router location after settling is the one it started on. **Contrast, same file:** given signed in and `present` (or `unknown`), `/welcome/goal` **does** redirect as T-0300b defines (a stored `wl-return-to` is honoured, otherwise `/` → `UF-02.1`), and `/account` redirects in both cases. Without this contrast pair a `guest-only` guard disabled outright would pass AC-7.
- **AC-8 (`/session/:sessionId` and its summary are never gated — principle 1)** Given signed in and `missing`: `/session/0b9e1f` renders `[data-screen-id="UF-09"]` and `/session/0b9e1f/summary` renders `[data-screen-id="UF-03.3"]`; neither reaches `/welcome/save`, and no `role="alert"` or `role="banner"` appears. Also with the status resolving to `missing` **after** mount (the gate's source settles late): the session screen stays on the DOM. **Contrast, same file:** `/session/setup` with the same state **does** redirect to `/welcome/save` — so the suite cannot pass by every `/session/*` path having been excluded by a loose prefix match.
- **AC-9 (signed out is unchanged — principle 5)** With no stored session, the existing `auth-guard.test.tsx` AC-B5 table still holds, **run against the wired shell** in the new file: `/`, `/library`, `/progress`, `/balance`, `/plan`, `/session/setup` each render `UF-01.1`; `/welcome`, `/welcome/goal` render `UF-01.1`; `/account` renders `UF-01.5`; `/auth/callback` renders `UF-01.5-auth-callback`. `auth-guard.test.tsx` and `auth-guard.phase3.test.tsx` pass **unedited**.
- **AC-10 (signed out: the gate costs nothing — principle 5)** Rendering `/welcome` signed out with `fetch` stubbed to a never-resolving promise: `[data-screen-id="UF-01.1"]` is present on the **first committed render** (a synchronous assertion, no `await`/`waitFor` before it, the T-0300b AC-B6 pattern), and spies show **zero** calls to `loadProfile`, `refreshProfile` and `from("profiles")`. A **source test** asserts `lib/profile` is not in the static import graph of `features/UF-01/**` and that `lib/profile` reaches `lib/offline` only through a `lazy`/dynamic `import()` or a call made after a signed-in check — i.e. a signed-out first render cannot pull the Dexie chunk (the `AutoSyncGate` precedent in `app/App.tsx`).
- **AC-11 (`recheckProfile` re-evaluates after a `/welcome/save` write)** Given signed in and `missing` (so a test component sits on `/welcome/save`), When the mocked `maybeSingle()` starts returning a row and `recheckProfile()` is called, Then `useProfileStatus()` becomes `"present"`, and a test double standing in for T-0301c that navigates to `/` after the recheck lands on `UF-02.1` with **no loop back** to `/welcome/save` (the router location is `/` and stays `/` for at least one more settled tick). Also: `recheckProfile()` while the component is unmounted mid-flight produces no state update and no React warning (the test fails on any `console.error`).
- **AC-12 (the gate is in one place)** A source test asserts the gate is applied from the shell's route wiring (`app/App.tsx` / `app/routes.ts` consumers) and that **no file under `apps/web/src/features/**` imports `lib/profile`** — features never re-implement or bypass the gate. `pnpm -w lint` stays green.

## Paths you may change
- `apps/web/src/lib/profile/**` (new; web-shell owns `apps/web/src/lib/**`).
- `apps/web/src/app/**` — the guard **wiring** only (`App.tsx`), plus the new test file. **No** `routes.ts` `path` or `guard` value changes.
- `apps/web/src/lib/auth/guards.tsx` — only to let `RedirectIfSignedIn` stand down for a `missing` profile (D-0073). No other behaviour change.
- `apps/web/src/lib/i18n/**` only if the gate needs a string (it should need none: it redirects, it does not render copy). If it does, add to `lib/i18n/flows/uf-01.ts`, which T-0318 created empty and **T-0301b also owns** — so if you touch it, say so in your result, because T-0301b must not run in parallel with this ticket.

Not yours: `apps/web/src/features/**`, `tests/e2e/**`, any contract file.

## Contract impact
None. No schema, API, engine or token change. `profiles` is only **read**, with the `select(…).maybeSingle()` shape `lib/offline/history.ts` already uses, under the existing RLS. No Edge Function is called (D-0071 §8).

## Decision recorded (D-0064 is `status: revisit`)
D-0064 §9 is ambiguous or incomplete in three places. None of them **conflicts** with a `decided` decision, so per `CLAUDE.md` ("never stall") each gets a stated default. **Write `.squad/decisions/D-0073-profile-gate-guard-seam.md` (`status: revisit`, area: web) in this ticket, recording all three, and cite D-0073 in the commit.**

1. **`/welcome/*` is `guest-only`, so §9's "`/welcome/*` renders instead of redirecting" cannot hold as written.** `RedirectIfSignedIn` (`lib/auth/guards.tsx`) sends any signed-in or `stale` user away from `/welcome/*` and `/account`, which is exactly the user §8 needs on `/welcome/save`. **Default:** the gate makes `guest-only` conditional — for `/welcome/*` only, a signed-in user whose status is `missing` renders instead of redirecting; `present` and `unknown` keep today's behaviour, and `/account` is unaffected in every case. This is the smallest change that satisfies both §8 and §9 and keeps T-0300b's tests unedited (AC-7, AC-9). **Needs a decision:** no — it is a mechanical consequence of D-0064 §8 + §9, recorded for the record only.
2. **§9's route list is narrower than the merged route table.** §9 names `/`, `/library*`, `/progress`, `/balance*`, `/plan` and `/session/setup`, which predates the five `protected` routes T-0318 added. D-0071 §11 (`status: decided`, later) says the gate covers "every `protected` route plus `/session/setup` … rather than a fixed list". **Default: D-0071 §11 wins** — newest decision wins, it is `decided` where D-0064 is `revisit`, and it is the superset. Derive from `routes.ts` (AC-5). **Not a conflict:** §9's list is a subset of §11's rule, so nothing in §9 becomes false.
3. **§9 says "signed in", and `useAuth()` has three statuses** (`signed-out`, `signed-in`, `stale`). **Default:** the gate is active whenever `status !== "signed-out"`, i.e. `stale` is gated too — a stale user is still in the app, and a stale token's `maybeSingle()` will usually error, which yields `unknown` and therefore no redirect anyway (AC-4). So the default is safe in the bad case and correct in the good one. **Needs a decision:** no, but flag it in D-0073 as the one place a reviewer should push back if a stale user ever sees `/welcome/save` unexpectedly.

Also noted, no default needed: §9's "A cached profile → `present` with no network wait" does **not** ask the gate to revalidate afterwards. It doesn't. `refreshProfile()` already runs from `refreshAll` on an online start (T-0319), so the cache is kept fresh outside the gate.

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test --force --concurrency=1` green — **`--force` is not optional**: without it turbo replays another worktree's cache and reports a green it never ran (the T-0006 false-green; QA confirmed `0 cached` is the signal to look for on T-0318) · `auth-guard.test.tsx` and `__tests__/auth-guard.phase3.test.tsx` pass **unedited** · contracts unchanged (zero of `docs/data-model.md`, `api/openapi.yaml`, `docs/engine-rules.md`, `packages/design-tokens/src/tokens.json` touched) · `.squad/decisions/D-0073-profile-gate-guard-seam.md` written · commits start `T-0301a:` and cite screen ids (for example `T-0301a UF-01.5: gate protected routes on a missing profile`).

## Build / accept log
Archived in `docs/tickets/log/T-0301a.md` (D-0157).
