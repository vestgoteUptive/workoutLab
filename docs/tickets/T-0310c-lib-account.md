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
Archived in `docs/tickets/log/T-0310c.md` (D-0157).
