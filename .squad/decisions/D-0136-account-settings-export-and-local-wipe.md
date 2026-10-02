---
id: D-0136
title: UF-11.4 Account settings at /plan/account; JSON export v1 built on the device from paged supabase-js reads; deletion confirmed by typing "delete", then a wipe of this user's local data, a local sign-out and a one-time notice
status: revisit
date: 2026-10-02
by: product-owner (groom, T-0310)
area: web
builds-on: D-0001, D-0002, D-0017, D-0045 §3 and §6, D-0067 §3, D-0071, D-0135
---
## Context
T-0310 delivers NFR-PRIV-4 (export: one JSON file with every row the user owns, within 10 s for 2 years of data) and NFR-PRIV-5 (in-app deletion, then the local caches and the queue cleared). User flows v2 has no screen for this. D-0045 §3 says account settings go under Plan, not in a fifth tab. `/account` is already UF-01.5 (guest-only). D-0045 §6 says only account deletion clears the queue, and that no queued row is ever dropped for any other reason (NFR-OFF-4). The Dexie database `wl-offline` holds every user's rows on the device, separated by `userId`. The Workbox precache holds only build assets: `vite.config.ts` has no `runtimeCaching`. PostgREST returns at most 1,000 rows per request (`max_rows = 1000` in `supabase/config.toml`), and 2 years of data is about 5,000 sets.

## Decision
1. **Screen UF-11.4 Account settings** (new step in UF-11, added to the user flows v2 flow index):
   - Route `/plan/account`, guard `protected` (so it's behind the profile gate too, D-0071 §11), `showTabBar: false` (like `/plan/edit`). `<h1>` is `en.screens.accountSettings` = `Account settings`.
   - It's reached from an `Account` link on UF-11.2. It's never linked from UF-03, UF-08 or UF-09 (the D-0071 §9 import bans already stop those features from importing UF-11).
   - Top to bottom: `Signed in as {email}`; a "Your data" section with `Export my data`; `Sign out`; a "Delete account" section.
2. **Export format v1.** It's built on the device with supabase-js under RLS. Reading your own rows is plain CRUD (D-0001), so there's no export endpoint.
   - The file is `workoutlab-export-{YYYY-MM-DD}.json`, using the local date in the device tz. It's `application/json`, pretty-printed with 2 spaces.
   - Top-level keys, exactly: `format` (`"workoutlab-export"`), `version` (`1`), `exportedAt` (ISO instant), `account` (`{userId, email}`), `tables`, `device`.
   - `tables` has exactly 7 keys, each an array of the raw rows as PostgREST returns them (snake_case, every column, `select("*")`): `profiles`, `area_targets`, `sessions`, `session_sets`, `routines`, `routine_items`, `plan_checkins`.
   - `session_sets` reads the table, not `session_sets_live`, so tombstoned rows are included. They are rows the user owns.
   - Paging: each table is read with `.order(<key>, {ascending: true}).range(from, from + 999)` from 0, until a page returns fewer than 1,000 rows. The order keys are `user_id` for `profiles`, `area_id` for `area_targets`, and `id` for the other five. Rows appear in the file in that order.
   - `device` has `queuedSessions` (this user's Dexie `sessions` entries with `pending: true`, each as its `row`) and `queuedSets` (this user's Dexie `sets` entries with any `status`, minus `key` and `userId`). These are rows on this device that the server doesn't have yet.
   - All or nothing: if any request rejects or resolves with a non-null `error`, the export fails and no file is offered.
   - Online only. Offline, the button is disabled with `Connect to export your data.`
3. **Deletion confirm.** `Delete account…` opens an inline panel with the permanence text, an input `Type delete to confirm`, `Delete my account` and `Cancel`.
   - `Delete my account` is enabled only when the input, trimmed and lower-cased, equals `delete`.
   - Online only. Offline, it's disabled with `Connect to delete your account.`
   - One request per confirm. Double clicks don't send a second one.
4. **Order after confirm** (one function in `lib/account`):
   - (1) `DELETE /account` (D-0135).
   - (2) Only on 204: wipe this user's local data (§5).
   - (3) Set `sessionStorage["wl-account-deleted"]` to `"1"`, or to `"partial"` if the wipe threw.
   - (4) `supabase.auth.signOut({scope: "local"})`. The server user is gone, so a global sign-out has nothing to revoke.
   - (5) Go to `/welcome` (replace).
   - On 401: no wipe and no sign-out. Show `Your sign-in has expired. Sign in again, then delete your account.`
   - On any other status, or a network error: no wipe and no sign-out. Show `Couldn't delete your account. Try again.`
5. **Wipe scope.**
   - In one Dexie `rw` transaction over **every** table of `offlineDb()`, delete the rows whose `userId` is this user. That covers the queue (`sessions`, `sets`, including rejected rows) and every cache.
   - Other users' rows on the device stay (D-0045 §6, NFR-OFF-4).
   - Then remove every `localStorage` and `sessionStorage` key that starts with `wl-`. Keys of other origins and apps aren't touched.
   - The supabase-js session goes in step (4).
   - The Workbox precache is kept: it holds no user data, and deleting it would break the offline shell for the next user.
6. **The notice.** The shell (not UF-01) reads `sessionStorage["wl-account-deleted"]` at mount, and again each time the auth status becomes `signed-out` (the step (4) sign-out fires `SIGNED_OUT` in the same page). It removes the key as soon as it reads it.
   - When it was `"1"`, it shows a polite `role="status"`: `Your account and all your data are deleted.`
   - When it was `"partial"`, the text is: `Your account is deleted. Some data may still be on this device: clear this site's data in your browser settings.`
   - Both have a `Dismiss` button. A reload shows nothing.
   - The notice component is a static, tiny shell import. It imports neither `lib/account` nor `lib/offline` (principle 5: `/welcome`'s first render).
7. **Sign out** on UF-11.4 calls the existing `useAuth().signOut()`. The queue stays (D-0045 §6).
8. **Copy** (UF-11.4, in `flows/uf-11.ts`):
   - `Signed in as {email}`
   - `Your data`
   - `Download everything we store for you as one JSON file.`
   - `Export my data`
   - `Preparing your file…`
   - `Couldn't export your data. Try again.`
   - `Connect to export your data.`
   - `Sign out`
   - `Delete account`
   - `This deletes your account and every workout, set, routine and plan, on our servers and on this device. It can't be undone. Export your data first if you want a copy.`
   - `Delete account…`
   - `Type delete to confirm`
   - `Delete my account`
   - `Cancel`
   - `Deleting…`
   - `Connect to delete your account.`
   - the two error lines in §4.

   The notice copy and `en.screens.accountSettings` go in the shell catalogue `en.ts`.

## Consequences
- web-shell (T-0310c): `lib/account` (export, download, delete call, wipe, the §4 orchestration), the shell notice and the `en.ts` keys.
- web-feature:UF-11 (T-0310d): the UF-11.4 screen, the UF-11.2 `Account` link, the `/plan/account` route row and the e2e. It waits on T-0308b, which owns `features/UF-11` today.
- product: the privacy notice (NFR-PRIV-6, T-0309/T-0403) says "Plan → Account settings" for export and deletion.
- Residual risk: if the 204 is lost in transit, the retry gets 401 and the local data stays. It is isolated by `userId` and never shown to another user. Signing in again with the same email creates a new, empty account.

## Revisit when
- A runtime cache with API responses is added to the service worker (then the wipe clears it).
- Users ask for CSV, or the export passes 10 s on real 2-year data (then stream it, or move it to an Edge Function).
- User tests find the typed confirm too heavy (then a second button press).
- The lost-204 case shows up in support (then the function returns 204 for a token whose user is already gone).
