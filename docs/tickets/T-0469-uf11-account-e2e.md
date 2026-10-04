---
id: T-0469
title: "UF-11.4 Account settings e2e: export downloads one JSON file, delete calls DELETE /account then wipes only this user's device data and lands on /welcome, a 500 keeps everything, axe + targets + keyboard (NFR-PRIV-4/5, NFR-A11Y-1/2)"
lane: web-feature:UF-11
screens: [UF-11.4, UF-11.2, UF-01.1]
decisions: [D-0135, D-0136, D-0071, D-0086, D-0091, D-0158, D-0168, D-0169, D-0172]
deps: [T-0310d]
status: ready
---
<!-- Re-groomed 2026-10-03 against main f83403e (T-0310d merged): ready. D-0172 §6 fixes the
signed-in user to the e2e session helper's, and the export rows to an exact-path route so the
`session_sets_live` history read isn't shadowed. -->

<!-- Written by product-owner 2026-10-03 (groom, D-0168 §4). Split out of T-0310d (its former AC-D9).
Build flow: wl-build-web. About ⅓ day. Becomes ready when T-0310d is done. Test-only unless a row
finds a bug in features/UF-11. -->

## Why
Export and deletion are privacy promises (NFR-PRIV-4, NFR-PRIV-5). The unit tests in T-0310d mock
`lib/account`. Only the built app with a real IndexedDB, a real download and a mocked Edge Function
proves that the right file comes out, that deletion wipes this user's data and nobody else's, and
that a server error wipes nothing.

## Scope
- In:
  - A new spec `tests/e2e/uf-11-account.spec.ts`, using the existing `injectSession`,
    `mockSupabaseAuth` and `mockSupabaseData` (the `uf-11-plan.ts` fixture may be imported
    read-only) plus `page.route("**/functions/v1/account", …)`.
  - **Export rows** (D-0172 §6): `mockSupabaseData` answers every `sessions*`/`session_sets*` read
    with `[]`. Register, after it, GET routes matched by a predicate on the **exact** pathname
    (`/rest/v1/sessions`, `/rest/v1/session_sets`), never a `session_sets*` glob (it would shadow
    `session_sets_live*`, the history read). They answer 2 sessions and 3 sets of U.
  - Fixture data in the spec (D-0071 §10). A new `tests/e2e/fixtures/uf-11-account.ts` is
    allowed only if the data passes ~60 lines; it then triggers the whole web e2e once (D-0158).
  - Fixes in `features/UF-11/**` that these rows expose, each with a unit test.
- Out:
  - `lib/account`, the Edge Function, `lib/offline`: a bug there is a follow-up for its lane, not a
    fix here.
  - The Equipment section (T-0216). Any contract change.

### Edge cases that are in scope
- **Offline:** both actions disabled offline is unit-tested in T-0310d (AC-D5); this ticket adds
  one e2e row for it (AC-4).
- **Zero history / another user on the device:** AC-2 seeds a second user's row and proves it
  survives.
- **A server error:** AC-3.
- **Time running out / returning after 10 days off:** not applicable to this screen.

## Acceptance criteria
Preview build, `test`/`expect` from `fixtures/guarded-test.js` (D-0086), signed in as user U = the
`injectSession` user (`ada@example.com`, id `11111111-1111-4111-8111-111111111111`, D-0172 §6);
V is any other uuid. `mockSupabaseData` (a profile, 9 targets) plus the exact-path export routes
(2 sessions, 3 sets). Each test title starts with `T-0469 AC-n`.

- **AC-1 (export, NFR-PRIV-4)** `page.waitForEvent("download")` after `Export my data` gives a file
  named `workoutlab-export-YYYY-MM-DD.json` (today's local date in the browser's zone). Its JSON
  has `format: "workoutlab-export"`, `version: 1`, exactly the 7 `tables` keys (`profiles`,
  `area_targets`, `sessions`, `session_sets`, `routines`, `routine_items`, `plan_checkins`), 2
  `sessions` and 3 `session_sets`. The base `session_sets_live` route was still hit (the history
  read wasn't shadowed).
- **AC-2 (delete, NFR-PRIV-5)**
  - Before confirming, seed IndexedDB `wl-offline` (through `page.evaluate`, after the app has
    opened it) with one `sets` row for U and one for user V, and set `localStorage["wl-last-email"]`.
  - The route answers `DELETE **/functions/v1/account` with 204 and records the request.
  - After typing `delete` and confirming:
    - the request had method `DELETE` and `Authorization: Bearer …`;
    - the page lands on `/welcome` and shows `Your account and all your data are deleted.`;
    - `wl-offline.sets` has 0 rows for U and still has V's row;
    - `localStorage` has no key starting with `wl-` (the one-time notice flag
      `wl-account-deleted` lives in `sessionStorage`, set after the wipe; it isn't asserted
      absent).
- **AC-3 (server error)** The route answers 500. The page stays on `[data-screen-id="UF-11.4"]` with
  `Couldn't delete your account. Try again.`, and U's seeded row is still in `wl-offline.sets`.
- **AC-4 (offline)** After the precache settles, the context goes offline and reloads
  `/plan/account`: the built screen shows (D-0091 §1: the heading), both `Export my data` and
  `Delete account…` are disabled, and no request to `/functions/v1/account` is recorded. Going online
  enables both without a reload.
- **AC-5 (a11y, NFR-A11Y-1/-2)**
  - axe reports 0 serious or critical violations on `/plan/account` with the panel closed and open;
  - every `button`, `input` and `a` on it has a `boundingBox()` ≥ 44 × 44 CSS px;
  - with the real keyboard, Tab to `Delete account…` and Enter opens the panel with focus in the
    input; from `/plan`, Tab to `Account` and Enter lands on UF-11.4.

**Red proof (planted faults on a backup copy, restored with `cp`; record each red run).**
- AC-2: make the screen navigate to `/welcome` without calling `deleteAccountAndSignOut` (or skip
  the wipe): the request or IndexedDB assert must fail.
- AC-3: navigate to `/welcome` on any outcome: AC-3 must fail.

## Paths you may change
- `apps/web/src/features/UF-11/**` (the lane: `web-feature:UF-11`), for fixes these rows expose.
- **Listed extras:**
  - `tests/e2e/uf-11-account.spec.ts`
  - `tests/e2e/fixtures/uf-11-account.ts`
  - `docs/tickets/T-0469-uf11-account-e2e.md`
- Notes on the extras: the spec and the fixture file are new (D-0071 §10); no edit to any existing
  fixture file; this ticket file is for the build and accept logs.

## Contract impact
None. The rows observe the D-0135 `DELETE /account` call that `lib/account` already makes.

## NFRs owned
PRIV-4 and PRIV-5 end-to-end (AC-1–AC-3), A11Y-1/2 on UF-11.4 (AC-5).

## Definition of done
Tests for every AC pass, twice in a row with no flake (`scripts/locked.sh heavy` on the web
`test:e2e` for `uf-11-account.spec.ts`, `--repeat-each=2`) · the whole web e2e once **only if** a
file under `tests/e2e/fixtures/**` was added (D-0158) · once before hand-back (D-0169):
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`,
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check` and
`node .github/scripts/check-all.mjs` · contracts unchanged · commits start `T-0469` and cite
UF-11.4.

## Notes
- **Parallel** (D-0172 §8). May run beside T-0216 and T-0470. A fix in `AccountSettingsBody.tsx`
  is the only shared-file risk (T-0216 renders its section from there): keep such a fix minimal
  and note it in the log, so T-0216 merges main cleanly.

## Build / accept log
Archived in `docs/tickets/log/T-0469.md` (D-0157).
