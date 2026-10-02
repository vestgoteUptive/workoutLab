---
id: T-0310c
title: "lib/account: paged JSON export v1, file download, the DELETE /account call, the per-user local wipe and the D-0136 §4 order; the shell's one-time account-deleted notice (NFR-PRIV-4, NFR-PRIV-5)"
lane: web-shell
screens: [UF-11.4, UF-01.1, UF-01.5]
decisions: [D-0136, D-0135, D-0001, D-0045, D-0067, D-0071, D-0017]
deps: [T-0300, T-0319]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom, T-0310 split). Build flow: wl-build-web. About ½–¾ day. Both deps are done. It codes to the D-0135 §1 contract (DELETE /account → 204/401/500) with `fetch` mocked, so it doesn't wait on T-0310a/b. Runs in parallel with T-0310a. Web-shell serial: don't run it in parallel with another web-shell ticket that edits app/App.tsx or lib/i18n/en.ts. T-0310d (the UF-11.4 screen) consumes this module. -->

## Why
NFR-PRIV-4 and NFR-PRIV-5 have three parts that don't belong in a screen:
- reading every owned row past PostgREST's 1,000-row cap;
- deleting the account through the new function;
- clearing this user's data from a device that may hold other users' queued sets.

These have to be correct and tested once, in the shell, so the UF-11.4 screen (T-0310d) only wires buttons. D-0045 §6 promised that only account deletion clears the queue. This ticket keeps that promise without breaking NFR-OFF-4 for anyone else on the device.

## Scope
- In:
  - **`apps/web/src/lib/account/`** (new). `index.ts` exports exactly:
    - `exportAccountData`
    - `exportFileName`
    - `downloadAccountExport`
    - `requestAccountDeletion`
    - `wipeLocalUserData`
    - `deleteAccountAndSignOut`
    - `ACCOUNT_DELETED_KEY` (`"wl-account-deleted"`)
    - the types `AccountExport` and `DeletionOutcome` (`"deleted" | "unauthorized" | "offline" | "failed"`)

    Every function takes an optional deps object (supabase client, `fetch`, db, clock, storage), so tests inject fakes. The defaults are the real `supabase` from `lib/auth/client`, `globalThis.fetch` and `offlineDb()`.
    - `exportAccountData({userId, email, now})` builds D-0136 §2 exactly: 7 tables, paged `.order(key, {ascending: true}).range(from, from + 999)` until a short page, plus the `device` section from Dexie. Any `{error}` or rejection makes it reject with an `Error` whose message is `export_failed`. No partial result is returned.
    - `exportFileName(now, tz)` gives `workoutlab-export-YYYY-MM-DD.json` from the **local** date in `tz`.
    - `downloadAccountExport(data, now, tz)`: a `Blob` of `JSON.stringify(data, null, 2)` with type `application/json`, an `<a download>` click, then `URL.revokeObjectURL`.
    - `requestAccountDeletion()`:
      - offline → `"offline"`, with no fetch;
      - no session access token → `"unauthorized"`, with no fetch;
      - unconfigured env → `"failed"`, with no fetch;
      - otherwise `fetch(\`${VITE_SUPABASE_URL without a trailing slash}/functions/v1/account\`, {method: "DELETE", headers: {Authorization: \`Bearer ${token}\`, apikey: VITE_SUPABASE_ANON_KEY}})`, with no body. The status maps 204 → `"deleted"`, 401 → `"unauthorized"`, any other status or a rejection → `"failed"`.
    - `wipeLocalUserData(userId)`:
      - one Dexie `rw` transaction over `db.tables` deletes the rows of `userId` in every table (by PK where the PK is `userId`, otherwise by the `userId` index);
      - then it removes every `localStorage` and `sessionStorage` key starting with `wl-`;
      - other users' rows and other keys are kept (D-0136 §5).
    - `deleteAccountAndSignOut({userId})` runs D-0136 §4 steps (1)–(4) and returns the outcome. Navigation is left to the caller (T-0310d).
  - **`apps/web/src/components/account-deleted-notice/AccountDeletedNotice.tsx`** (new), rendered once in `Shell` in `app/App.tsx`:
    - it reads and removes `sessionStorage["wl-account-deleted"]` at mount and each time `useAuth().status` becomes `signed-out`;
    - it shows the D-0136 §6 text in a polite `role="status"` with a `Dismiss` button, which needs a 44 × 44 px target;
    - it imports only `react`, `lib/auth/auth-context` and `lib/i18n/en`.
  - **`apps/web/src/lib/i18n/en.ts`**: add `screens.accountSettings: "Account settings"` and `accountDeleted: {done, partial, dismiss}` with the D-0136 §6 copy. Add keys only.
  - Tests in `apps/web/src/lib/account/__tests__/` and `apps/web/src/components/account-deleted-notice/__tests__/`, using Vitest, Testing Library and `fake-indexeddb`. `lib/offline/__tests__/supabase-spy.ts`, `select-spy.ts` and `test-helpers.ts` may be imported read-only.
  - Edge cases: zero history, 2 years of data (5,000 sets), two users on one device, offline, no session, a wipe that throws, and a double call.
- Out:
  - The UF-11.4 screen, its strings and the `/plan/account` route (T-0310d).
  - The Edge Function (T-0310b).
  - `api/openapi.yaml` (T-0310a).
  - Any change to `lib/offline/**` behaviour (this ticket only reads `offlineDb()` and its exported types).
  - The Workbox config (D-0136 §5 keeps the precache).
  - UF-01 feature files.

## Acceptance criteria
**Fixtures.**
- Users `U = "00000000-0000-4000-8000-0000000000aa"` and `V = "00000000-0000-4000-8000-0000000000bb"`.
- Clock `NOW = new Date("2026-09-27T23:30:00Z")`, tz `Europe/Stockholm`.
- **Fake PostgREST client `pg(rows)`:** `from(table).select("*")` records the table, every `.order(col, opts)` and every `.range(a, b)`, and resolves `{data, error: null}`. With a range, `data` is the rows sorted by the last order column, sliced `[a, min(b, a + 999)]`. Without a range, `data` is the first 1,000 rows, as `max_rows` does. A per-call hook can return `{data: null, error: {...}}` or reject, and can add latency.

Each new test title starts with `T-0310c ACn`. Every AC is red on `main`: `lib/account` and the notice don't exist. Record the red run in the build log.

- **AC1 (paging, red against an unpaged read)**
  - **Given** `pg` seeded with 5,000 `session_sets` rows for U (ids `s0000`…`s4999`, 40 of them with a non-null `deleted_at`), 400 sessions, 1 profile, 9 targets, 2 routines with 5 items and 3 check-ins, **When** `exportAccountData({userId: U, email: "u@test.local", now: NOW})` runs, **Then**:
    - `tables.session_sets` has exactly 5,000 rows, all ids are unique, and they're in ascending `id` order;
    - the 40 tombstones are included;
    - the recorded `session_sets` ranges are `[0,999]`, `[1000,1999]`, `[2000,2999]`, `[3000,3999]`, `[4000,4999]`, `[5000,5999]`, in that order;
    - `sessions` has 400 rows.
  - **Contrast:** with 999 sets there is exactly one range call `[0,999]`. With 1,000 sets there are two (`[0,999]`, `[1000,1999]`).
  - `from("session_sets_live")` is **never** called.
- **AC2 (shape, D-0136 §2)** With AC1's data:
  - `Object.keys(result)` is exactly `["format", "version", "exportedAt", "account", "tables", "device"]`;
  - `format` is `"workoutlab-export"` and `version` is `1`;
  - `exportedAt` is `"2026-09-27T23:30:00.000Z"`;
  - `account` is `{userId: U, email: "u@test.local"}`;
  - `Object.keys(tables).sort()` is the 7 names;
  - each row is passed through unchanged (deep-equal to the seeded row, snake_case).

  The order columns recorded are:
  - `user_id` for `profiles`;
  - `area_id` for `area_targets`;
  - `id` for the other five, ascending.

  **Zero history:** a user with only a profile and 9 targets gets those rows and `[]` for the other 5 tables, never `undefined`.
- **AC3 (device section)**
  - **Given** Dexie with, for U:
    - a queued session `pending: true` (S1);
    - a flushed session `pending: false` (S2);
    - a `queued` set and a `rejected` set.

    For V: a pending session and a queued set.
  - **Then**:
    - `device.queuedSessions` is `[S1.row]`;
    - `device.queuedSets` has U's 2 sets, each without `key` or `userId` keys;
    - nothing of V's is in the file (assert V's ids are absent from `JSON.stringify(result)`).
- **AC4 (all or nothing)**
  - Each of these makes `exportAccountData` reject with `export_failed`:
    - `routines` resolves with an `error`;
    - the 3rd `session_sets` page rejects;
    - `profiles` resolves `{data: null, error: null}`.
  - `downloadAccountExport` is never reached in the AC12 flow that wraps it.
- **AC5 (10 s for 2 years, NFR-PRIV-4)** With AC1's data and 25 ms of latency on every request, `exportAccountData` followed by `JSON.stringify(result, null, 2)` completes in under 10,000 ms of real time. The test has a 15,000 ms timeout and asserts the measured duration, not just completion.
- **AC6 (file name and download)**
  - `exportFileName(NOW, "Europe/Stockholm")` is `workoutlab-export-2026-09-28.json`.
  - **Contrast:** `exportFileName(NOW, "UTC")` is `…-2026-09-27.json`, so a UTC-date implementation fails the first assertion.
  - With `URL.createObjectURL` and `revokeObjectURL` spied, `downloadAccountExport` creates exactly one `Blob`:
    - its `type` is `application/json`;
    - its text `JSON.parse`s deep-equal to the input and is indented with 2 spaces;
    - it clicks an `<a>` whose `download` is the file name and whose `href` is the object URL;
    - it revokes that URL;
    - it leaves no `<a>` in the document.
- **AC7 (the delete request, D-0135 §1, §6)** With `vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321/")`, `VITE_SUPABASE_ANON_KEY` `"anon-k"`, a session with access token `"tok-u"`, and `fetch` spied:
  - `requestAccountDeletion()` makes exactly one call to `http://127.0.0.1:54321/functions/v1/account` (single slash), with method `DELETE`, headers `Authorization: Bearer tok-u` and `apikey: anon-k`, and no `body`.
  - Responses map 204 → `"deleted"`, 401 → `"unauthorized"`, and 200, 404 and 500 → `"failed"`. A rejected fetch → `"failed"`.
  - `navigator.onLine = false` → `"offline"`, with **zero** fetch calls. No session → `"unauthorized"`, with zero fetch calls.
- **AC8 (the wipe, two users on one device)**
  - **Given** one row for U **and** one for V in each of the 11 tables of `offlineDb()`:
    - `sessions`, `sets`, `historyCache`, `libraryCache`, `targetCache`, `profileCache`, `syncMeta`;
    - `exerciseDetails`, `sessionCache`, `checkinCache`, `routineCache`.

    The test asserts that `db.tables.map(t => t.name).sort()` equals this list, so a future table must be added here. U's `sets` row is `rejected`.
  - Also given:
    - `localStorage` keys `wl-last-email`, `wl-onboarding`, `wl-focus-prefs` and `other-app`;
    - `sessionStorage` keys `wl-return-to` and `other-tab`.
  - **When** `wipeLocalUserData(U)` runs, **Then**:
    - every table has 0 rows with `userId === U` and still has V's row (count 1);
    - every `wl-` key is gone;
    - `other-app` and `other-tab` remain.
  - A rerun on an already-wiped user resolves without error.
- **AC9 (order of the steps, D-0136 §4)** With a shared call log over fetch, the wipe, `sessionStorage.setItem` and `supabase.auth.signOut`:
  - 204 → the log is exactly `[fetch DELETE, wipe(U), setItem("wl-account-deleted", "1"), signOut({scope: "local"})]`, and the result is `"deleted"`.
  - 401, 500, offline and no session → no wipe, no `setItem`, no `signOut`. The result is the AC7 outcome, and U's Dexie rows are still there.
  - The wipe rejecting (stub a table's `delete` to throw) → `setItem("wl-account-deleted", "partial")`, then `signOut({scope: "local"})`. The result is still `"deleted"`.
  - Two concurrent calls send **one** fetch, and both resolve to the same outcome.
- **AC10 (the notice, D-0136 §6)** Rendering `App` at `/welcome`, signed out:
  - with `sessionStorage["wl-account-deleted"] = "1"`: a `role="status"` reads `Your account and all your data are deleted.`, and the key is removed;
  - with `"partial"`: the partial text;
  - with neither: no element with either text.
  - `Dismiss` removes the notice. A remount after the key was consumed shows nothing.
  - **Same page:** start signed in on `/`, set the key, then fire `SIGNED_OUT`. The notice appears without a remount.
  - The `Dismiss` button's box is at least 44 × 44 px (computed style or the existing size helper).
  - `/welcome`'s first render doesn't wait on anything new. The notice reads `sessionStorage` synchronously.
- **AC11 (import boundaries, principle 5)**
  - A source scan finds no static `import … from` of `lib/account` in `apps/web/src/app/**`, `components/**` or `lib/auth/**`.
  - `AccountDeletedNotice.tsx` imports only `react`, `../../lib/auth/auth-context.js` and `../../lib/i18n/en.js`.
  - `Object.keys(await import("../index.js")).sort()` equals the 7 runtime exports listed in Scope.
  - The existing T-0300c AC-C20 check (`lib/offline` not in `/welcome`'s static graph) passes unedited.
- **AC12 (strings and lint)**
  - `en.screens.accountSettings === "Account settings"`, and `en.accountDeleted` has exactly `done`, `partial` and `dismiss`, with the D-0136 §6 copy.
  - `react/jsx-no-literals` is green.
  - `lib/i18n/__tests__/flows.test.ts`, `App.test.tsx`, `auth-guard.test.tsx` and `app/__tests__/*.phase3*.test.ts*` pass **unedited**.

## Paths you may change
- `apps/web/src/lib/account/**`, `apps/web/src/components/account-deleted-notice/**`, `apps/web/src/app/App.tsx` (the one `<AccountDeletedNotice />` line and its import) and `apps/web/src/lib/i18n/en.ts` (new keys) (the lane: `web-shell`).
- **Listed extras:**
  - `docs/tickets/T-0310c-lib-account.md`: this file, for the build and accept log.

## Contract impact
None. The export reads the 7 tables exactly as `docs/data-model.md` defines them, under RLS. The delete call follows `DELETE /account` as D-0135 §1 fixes it (T-0310a writes it into `api/openapi.yaml`). If the merged contract differs from D-0135 §1, stop and raise triage.

## Coordination
- Web-shell serial with any ticket editing `app/App.tsx` or `lib/i18n/en.ts`.
- T-0310d imports `exportAccountData`, `downloadAccountExport`, `exportFileName` and `deleteAccountAndSignOut` from `lib/account/index.ts`. Keep those names.

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` is green · `pnpm --filter @workoutlab/web check:size` after a fresh build, with the measured numbers reported (the initial chunk must stay within budget, because the notice is static) · contracts unchanged · commit messages start with `T-0310c` and cite UF-11.4 (e.g. `T-0310c UF-11.4: paged export and per-user wipe (D-0136)`).

## Build / accept log
- **Build (2026-10-02, frontend-dev).** New `apps/web/src/lib/account/` (`deps.ts`, `export.ts`, `download.ts`, `delete.ts`, `wipe.ts`, `index.ts` with exactly the 7 runtime exports), `components/account-deleted-notice/AccountDeletedNotice.tsx` (one line + import in `Shell`), and the `en.ts` keys `screens.accountSettings`, `accountDeleted.{done,partial,dismiss}`. Choices inside scope:
  - `requestAccountDeletion` checks offline, then unconfigured env (`"failed"`), then the session (`"unauthorized"`), so an unconfigured build never reports "sign in again". A rejected `getSession` is `"failed"`. It never throws.
  - `deleteAccountAndSignOut` keeps one module-level in-flight promise: a second call joins it; a call after it settles sends a new request. `setItem` and `signOut` failures are swallowed (the server account is gone; the outcome stays `"deleted"`).
  - `wipeLocalUserData` iterates `db.tables` inside one `rw` transaction (PK delete for `profileCache`/`syncMeta`, `userId` index for the rest, a filter fallback for a future table without one). If the transaction throws it still clears the `wl-` keys, then rejects. Note for tests: `db.table(name)` is the instance the transaction uses; `db.profileCache` is a different object, so stubs go on `db.table("profileCache")`.
  - The export reads the 7 tables in parallel (pages within a table in series) and the Dexie device section, all under one `Promise.all`, so a second failure can't become an unhandled rejection.
  - The notice imports no stylesheet (AC11), so it uses inline styles with `--wl-color-*` variables only; Dismiss has `min-width`/`min-height` 44px. It reads `sessionStorage` synchronously at first render and removes the key in an effect (StrictMode-safe), and again whenever `status` becomes `signed-out`. It renders nothing (no empty live region) when there is no key, so the existing `/welcome` `getByRole("status")` e2e locators are unaffected.
  - Tests: `lib/account/__tests__/{export,download,delete,wipe,boundaries}.test.ts` with the `pg(rows)` fake in `fixtures.ts` (max_rows cap, last-order sort, per-call hook, latency) and `dexie-seed.ts`; `components/account-deleted-notice/__tests__/AccountDeletedNotice.test.tsx`. 60 tests, every title `T-0310c ACn`.
  - **Red on main** (lib/account and the notice removed, App.tsx/en.ts reverted, tests kept): 6 files failed, the 5 `lib/account` suites at import (`Failed to resolve import "../index.js"`), and AC10 6 of 9 failed (`Unable to find role="status"` / `"Dismiss"`); the 3 passing are the "nothing shown" rows.
  - **Planted faults** (each restored): an unpaged `select("*")` → AC1 (both), AC2, AC4 (×5) and AC5 red (14 with the next fault); `table.clear()` instead of the per-user delete → AC8 ×3 and AC9 ×2 red; the in-flight guard removed → AC9 "two concurrent calls" red; the notice reading only at mount → AC10 "same page" red.
  - Runs: `lib/account` + notice vitest 60/60; web `typecheck` and `lint` green (incl. `react/jsx-no-literals`); web `test` 145 files / 2,167 tests green, with `flows.test.ts`, `App.test.tsx`, `auth-guard.test.tsx` and the `*.phase3*` tests unedited; `offline` e2e (AC-C20) 1/1; `-w format:check` clean; `check-all.mjs` exit 0; `check:size` green after the fresh build: initial JS 153.1 KB gzip (budget 200), largest lazy chunk 35.0 KB (budget 100).
- **Rework 2 (2026-10-02, frontend-dev): security L1 (and L2).**
  - **L1 choice: check, don't substitute.** The public API is unchanged. A new internal `readSession(deps)` (`deps.ts`) returns `{token, userId}` from **one** `getSession()` result. `deleteAccountAndSignOut({userId})` sends the DELETE only when `session.user.id === input.userId`. If the ids differ, or the session has no user id, it returns `"failed"` before any request: no DELETE, no wipe, no `setItem`, no sign-out. A missing token is still `"unauthorized"`. The wipe then runs for that same, verified id. `requestAccountDeletion()` called alone has no expected user, so it keeps its AC7 behaviour. `exportAccountData` reads the session first and rejects `export_failed` before any PostgREST or Dexie read if the session user isn't `input.userId`. The device section is read for the session's user id. Mismatch gives `"failed"`, not `"unauthorized"`: the session is valid, just for a different user, so "sign in again" would be the wrong advice.
  - **L2.** supabase-js `signOut({scope: "local"})` still calls the revoke endpoint. It ignores 401/403/404 and removes the stored session (firing SIGNED_OUT) even when it returns an error. If `signOut` throws or returns `{error}`, `lib/account` now also removes the `sb-*-auth-token` and `-code-verifier` keys from localStorage, and the outcome stays `"deleted"`. The next load then starts signed out. Residual case: if signOut *throws* before supabase-js clears its in-memory session, `useAuth().status` can still read `signed-in` in this page. `/welcome` is `guest-only` and would then bounce to `/`, so T-0310d should navigate with `window.location.replace("/welcome")` in that case (follow-up).
  - Tests (+10): `delete.test.ts` has "T-0310c L1 (a)" ×2 (session V and session with no user id, both for input U), "(b)" (session V, input V: one DELETE with `Bearer tok-v`, only V's rows wiped), "requestAccountDeletion alone" and L2 ×3. `export.test.ts` has "T-0310c L1 (c)" ×3 (session V on a shared device gives only V's queue; session V or no session for input U gives `export_failed`, zero PostgREST calls and no `db.sets.where`). The `pg` fixture's `getSession` now reports a session for U by default (`sessionUserId` option), so AC1–AC5 run with a matching session.
  - **Red on 864877d** (the new tests over the old `delete.ts`/`export.ts`/`deps.ts`): 6 of 61 failed. L1 (a) ×2: the old code sent the DELETE and wiped. L1 (c) mismatch ×2: the old code exported. L2 ×2: the old code left the session keys.
  - Runs: `lib/account` vitest 61/61; web `typecheck` and `lint` green; web `test` 145 files / 2,177 green; `-w format:check` clean; `check-all.mjs` exit 0.
- **Accept (2026-10-02, product-owner): done.** I checked `lib/account/{delete,deps}.ts`, `AccountDeletedNotice.tsx` and the six test files at 6855748, against the build and rework logs and the QA and security verdicts.
  - **Every AC has tests titled `T-0310c ACn`:**
    - AC1–AC5 are in `export.test.ts`. AC4 covers the three listed failures, a Dexie failure, "no 4th page", and the export-then-download flow, which never calls `createObjectURL` or `click`. AC5 asserts elapsed time ≥ 150 ms and < 10,000 ms, with a 15 s timeout.
    - AC6 is in `download.test.ts`.
    - AC7 and AC9 are in `delete.test.ts`.
    - AC8 is in `wipe.test.ts`.
    - AC10 is in `AccountDeletedNotice.test.tsx`.
    - AC11 and AC12 are in `boundaries.test.ts`.
  - **Red and planted faults.** Build 1 recorded every AC red on main and four planted faults caught. QA proved all 12 ACs both ways and caught 25 planted faults. A two-user Dexie probe found no cross-user leak.
  - **Rework 2 (L1, L2).** It keeps the public API and the AC7 behaviour of `requestAccountDeletion()`. `deleteAccountAndSignOut` checks the session user against `input.userId` before any request, and returns `"failed"` before any fetch, wipe, `setItem` or sign-out. The export rejects `export_failed` before any read. Six new tests were red on 864877d. The security re-review closed L1 with no new leak.
  - **Two in-scope choices, both acceptable:**
    - The unconfigured-env check runs before the session check. Every path still makes zero fetch calls.
    - A user mismatch gives `"failed"`, not `"unauthorized"`.
  - **Scope holds.** `App.tsx` gets one line and an import, and `en.ts` gets keys only. There are no `lib/offline` behaviour changes and no Workbox change. Contracts are unchanged: the call matches D-0135 §1.
  - **Principles.**
    - Principle 5: the notice reads `sessionStorage` synchronously, imports only react, auth-context and en, and AC-C20 still passes.
    - Principles 1–4 are unaffected: this ticket adds no workout screen and doesn't touch the engine or targets.
  - **Runs.** Web 2,177 green; whole e2e 90/90 per QA on build 1; `check:size` 153.1 KB initial against a 200 KB budget.
  - **Outstanding DoD.** The orchestrator runs the full `-w typecheck lint test --force --concurrency=1` and `check:size` on main at merge. The `location.replace` fallback for a throwing `signOut` is already a note on T-0310d.
