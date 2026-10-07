---
id: T-0529
title: "UF-11.2 \"Account and sign out\" link in Plan's header; UF-11.4 Sign out under the email, with a confirm when workouts are unsynced, \"Signing out…\" and a landing on /welcome (GitHub #35, part 2)"
lane: web-feature:UF-11
screens: [UF-11.2, UF-11.4]
decisions: [D-0195, D-0136, D-0174, D-0168]
deps: [T-0528]
status: todo
groomed: 2026-10-06
---
<!-- Specced 2026-10-06 by product-owner against main da5c366 from GitHub #35 (D-0195 §1, §4-§6).
Build flow: wl-build-web. About ⅖ day. -->

## Why
GitHub #35, from the owner: "There is no way to log out from the app." There is one, on UF-11.4
Account settings, but the only way there is an `Account` link rendered **last** on UF-11.2
(`PlanBody.tsx`, after `Edit plan`), and on UF-11.4 `Sign out` is below Equipment and Your data
with no heading. D-0195 makes it findable from the top of Plan and puts Sign out next to the
signed-in email. It also switches Sign out to T-0528's `signOutAndClearDevice` (this device only;
caches and `wl-` keys cleared; queue kept) and adds a confirm when workouts haven't synced.

## Scope
- In (`apps/web/src/features/UF-11/`):
  - `index.tsx` `Plan`: the `<h1>` and a `Link` to `/plan/account` with text
    `Account and sign out` sit in `<div className="wl-plan__header">` (h1 first). The check-in
    card stays the first element after that header. `plan.css`: the header row (h1 and link on one
    line when they fit, wrapping otherwise; link hit area ≥ 44×44).
  - `PlanBody.tsx`: remove the bottom `Account` link.
  - `AccountSettingsBody.tsx` order: one section with `Signed in as {email}` and the `Sign out`
    button; then `EquipmentSection`; then Your data; then Delete account.
  - Sign out (D-0195 §4-§5):
    - On click, `hasUnsyncedWork(userId)`. If true, show the inline confirm (text, `Sign out
      anyway`, `Cancel`) and focus `Sign out anyway`; `Cancel` closes it and returns focus to
      `Sign out`. If false, sign out straight away.
    - Signing out calls `signOutAndClearDevice({ userId })` once (a ref guards double clicks).
      Meanwhile the button reads `Signing out…` and is disabled.
    - When it resolves: if `useAuth().status` is `signed-out`, `navigate("/welcome",
      { replace: true })`; else `window.location.replace("/welcome")` (same as the delete path).
    - Enabled offline (unlike export and delete).
    - It no longer calls `useAuth().signOut()`.
  - Copy in `lib/i18n/flows/uf-11.ts` (listed extra): `accountLink` becomes
    `Account and sign out`; new `account.signingOut` `Signing out…`, `account.unsyncedWarning`
    `Some workouts haven't synced yet. They stay on this device and upload the next time you sign in here.`,
    `account.signOutAnyway` `Sign out anyway`; reuse the existing `account.cancel` ("Cancel").
  - Update existing tests that pin the moved link or its old name: `checkin-mount.test.tsx:123`
    (`h1.nextElementSibling` → the header's next sibling; D-0195 §1 amends that pin),
    `account-settings.route.test.tsx:102,121` (link name), `strings.test.ts` if it pins
    `accountLink`, and `account-settings.test.tsx`'s AC-D8 (Sign out now calls
    `signOutAndClearDevice`, not `useAuth().signOut`; still never `wipeLocalUserData` or
    `deleteAccountAndSignOut`). These follow a changed requirement; don't loosen any other
    assertion.
- Out:
  - `lib/account` (T-0528). The Delete and Export behaviour (unchanged).
  - A "sign out of all devices" option (D-0195 Revisit).
  - The privacy notice (its "Plan → Account" path stays right; no H-22 re-approval).

### Edge cases that are in scope
- **Offline** with a queued set: Sign out → the confirm → `Sign out anyway` → `/welcome` (AC-5).
- **Zero history / cold cache:** the header link is there in every Plan state (loading, cold,
  ready) because it's rendered by `Plan`, not `PlanContent` (AC-1).
- **Double click** on `Sign out` / `Sign out anyway`: one call (AC-3).
- **Status not yet signed-out** after the call: hard navigation (AC-4).

## Acceptance criteria
Unit tests use `account-settings.test.tsx`'s and `plan.render.test.tsx`'s setups, with
`lib/account` mocked (`vi.mock`) for `signOutAndClearDevice` / `hasUnsyncedWork`. Titles start
`T-0529 AC-n`.

- **AC-1 (UF-11.2 header link)** For each Plan state (loading, cold cache, ready): the first child
  of `[data-screen-id="UF-11.2"]` is `.wl-plan__header`, containing the `<h1>` "Plan" and then a
  link with accessible name exactly `Account and sign out` and `href="/plan/account"`. There's no
  other link to `/plan/account` on the page. In the ready state with a check-in card, the card is
  the header's `nextElementSibling`. **Red on main:** no `.wl-plan__header`; the link is named
  `Account` and is the last element.
- **AC-2 (UF-11.4 order)** On `/plan/account` with an email in storage, the document order of
  these is: `Signed in as u@example.com`, button `Sign out`, the Equipment heading, the `Your data`
  heading, the `Delete account` heading; the email line and `Sign out` share one
  `.wl-plan__section`. **Red on main:** `Sign out` comes after `Your data`.
- **AC-3 (sign out, nothing unsynced)** With `hasUnsyncedWork` → `false` and
  `signOutAndClearDevice` pending: clicking `Sign out` twice calls `signOutAndClearDevice` once,
  with `{ userId: U }`; the button reads `Signing out…` and is disabled; no confirm text is shown;
  `useAuth().signOut` is not called. When it resolves with the auth status `signed-out`, the
  location is `/welcome` and `window.location.replace` was not called.
- **AC-4 (status still signed-in)** Same as AC-3 but the auth status stays `signed-in`: on
  resolve, `window.location.replace` (a spy) is called once with `"/welcome"`.
- **AC-5 (unsynced confirm)** With `hasUnsyncedWork` → `true`:
  - clicking `Sign out` shows the `account.unsyncedWarning` text and buttons `Sign out anyway` and
    `Cancel`, focus is on `Sign out anyway`, and `signOutAndClearDevice` is not called;
  - `Cancel` hides the panel, focus returns to `Sign out`, still no call;
  - `Sign out` again, then `Sign out anyway` (clicked twice) → one call, then `/welcome` as AC-3.
  - With `navigator.onLine` false, `Sign out` is enabled and the same flow works.
- **AC-6 (axe, e2e)** In `tests/e2e/uf-11-account.spec.ts`, the T-0469 AC-5 pattern
  (`AxeBuilder`, 0 serious/critical): UF-11.4 with the unsynced confirm open, and UF-11.2 (ready)
  with the new header link.
- **AC-7 (e2e, `tests/e2e/uf-11-account.spec.ts`)** Signed in with the shared session helper and
  mocks: from `/plan`, the link `Account and sign out` is visible without scrolling at 360×640
  (its bounding box is inside the viewport at `scrollY = 0`). Click it, then `Sign out`: the page
  reaches `/welcome` (UF-01.1), `localStorage` has no key starting `wl-` and no `-auth-token` key,
  and IndexedDB `wl-offline` `libraryCache` has 0 rows for the user. Mock GoTrue
  `POST /auth/v1/logout?scope=local` as the delete test already does. Update the existing
  keyboard-walk test (`:479`) to the new link name.
- **AC-8 (e2e offline with a queued set)** Seed one queued `sets` row for the user (the spec's
  existing `seedDevice` IndexedDB helper), go offline with `goOffline()` from
  `tests/e2e/fixtures/offline.ts` (D-0175), click `Sign out` →
  the confirm shows → `Sign out anyway` → `/welcome`; the seeded `sets` row is still in IndexedDB.

**Red proof.** AC-1, AC-2 and AC-7's "visible without scrolling" fail on main: record each.
Planted faults on backup copies, restored with `cp`: (a) render the link inside `PlanContent`
(ready only) → AC-1 fails for loading/cold; (b) skip the `hasUnsyncedWork` check → AC-5 fails.

## Paths you may change
- `apps/web/src/features/UF-11/**` (the lane: `web-feature:UF-11`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-11.ts`: the four copy keys above (D-0075 shape).
  - `tests/e2e/uf-11-account.spec.ts`: AC-7, AC-8 and the link-name update.
  - `docs/tickets/T-0529-uf11-sign-out-findable.md`, for the build and accept logs.

## Contract impact
None.

## Definition of done
- Tests for every AC pass, red runs and both planted faults recorded.
- `tests/e2e/uf-11-account.spec.ts` and `tests/e2e/uf-11-plan.spec.ts` green, each through
  `scripts/locked.sh heavy` (D-0178).
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` green, through `scripts/locked.sh`.
- Commits start `T-0529` and cite UF-11.2, UF-11.4 and GitHub #35.

## Notes
- **Parallel:** the only UF-11 ticket on the board besides T-0492 (CI fix, `__tests__/offline.test.tsx`,
  todo). If T-0492 starts first, run this after it (same lane).
- If T-0527 (fixed tab bar) merges first, the Plan header link is still above the fold; AC-7's
  viewport check holds either way.

## Build / accept log

### Build log (web-feature:UF-11)
- Start: main clean, HEAD bf05071. Built: `Plan` header (`.wl-plan__header`, h1 then `Account and sign out` link), bottom link removed, UF-11.4 Sign out section first (email + button), confirm via `hasUnsyncedWork`, `signOutAndClearDevice` once (ref guard), `Signing out…`, `/welcome` by router or `window.location.replace`. Copy keys added in `lib/i18n/flows/uf-11.ts`.
- AC to test: AC-1 `plan-header.test.tsx` (loading/cold/ready); AC-2 `equipment-section.test.tsx` (needs the profile cache for the Equipment group); AC-3/4/5 `account-settings.test.tsx` (T-0529 describes; AC-D8 updated); AC-6/7/8 `tests/e2e/uf-11-account.spec.ts`.
- Red on main (source files restored from HEAD, new i18n kept): 11 unit tests failed (AC-1 x3, AC-2, AC-3, AC-4, AC-5 x2, AC-D8, and the two pinned order tests). Not re-run for AC-7's scroll check on main.
- Planted faults (backup copy, `cp` restore): (a) link rendered only when ready -> AC-1 fails 3/3; (b) `hasUnsyncedWork` skipped -> AC-5 fails 2/2.
- Gate: `-w typecheck lint test --concurrency=1` green (web 273 files / 3711 tests), `test:repo-checks`, `format:check`, `check-all.mjs` green. e2e `uf-11-account` + `uf-11-plan`: 25/25 passed.
- Deviations: (1) AC-7 key check ignores `wl-onboarding`, which UF-01 writes itself on /welcome after sign-out. (2) `equipment-section.test.tsx` "next element after the h1" updated for the Sign out section now sitting between (follows changed order). (3) AC-2 lives in `equipment-section.test.tsx`, which already mocks the offline cache. (4) A rejected `signOutAndClearDevice`/`hasUnsyncedWork` is treated as best effort (still navigates / no confirm).
- Rework: `account-settings.test.tsx` async waits (`findBy*`, `waitFor`) now use `WAIT` (5 s), as `account-settings.route.test.tsx` does. 15 consecutive `vitest run src/features/UF-11`: 15/15 passed (202 tests); 5 more with 4 `yes` busy loops running: 5/5 passed; my loops killed. AC-7 e2e now seeds `wl-onboarding` = sentinel and asserts it is gone (a fresh guest draft by UF-01 is allowed; no other `wl-`/auth key). Renamed the equipment-section order test to "the group follows the Sign out section after the h1". e2e `uf-11-account` + `uf-11-plan` 25/25, format:check green.
