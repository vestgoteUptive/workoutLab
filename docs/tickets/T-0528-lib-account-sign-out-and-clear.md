---
id: T-0528
title: "lib/account: signOutAndClearDevice (local-scope sign-out, then this user's caches and every wl- key cleared, queue kept) and hasUnsyncedWork (GitHub #35, part 1)"
lane: web-shell
screens: [UF-11.4]
decisions: [D-0195, D-0136, D-0045]
deps: []
status: ready
groomed: 2026-10-06
---
<!-- Specced 2026-10-06 by product-owner against main da5c366 from GitHub #35 (D-0195 §2-§3).
Build flow: wl-build-web. About ⅓ day. T-0529 (UF-11) wires it to the screen. -->

## Why
GitHub #35, from the owner: "There is no way to log out from the app." Sign-out exists on UF-11.4
(D-0136 §7, T-0310d), but it's buried (T-0529 fixes that), it signs out **every** device
(`supabase.auth.signOut()` defaults to global scope), and it leaves this user's data on the
device: all nine IndexedDB caches and `wl-last-email`, which pre-fills the next person's sign-in
form. D-0195 decides what a sign-out does. This ticket builds it in `lib/account`, next to the
account-delete wipe (`wipe.ts`, D-0136 §5), so UF-11.4 calls one function.

## Scope
- In (`apps/web/src/lib/account/`):
  - `signOutAndClearDevice({ userId }, deps?)` → `Promise<{ cleared: boolean }>`, in this order
    (D-0195 §3):
    1. `clientOf(deps).auth.signOut({ scope: "local" })`. Its `{ error }` (e.g. offline) is
       ignored: supabase-js has already removed the local session.
    2. One Dexie `rw` transaction over every table of `dbOf(deps)` **except** `sessions` and
       `sets`, deleting this `userId`'s rows (same per-table rule as `wipe.ts`'s
       `deleteUserRows`).
    3. Remove every `wl-` key from `localStorage` and `sessionStorage` (same as `wipe.ts`).
    - (2) and (3) are both attempted; if either throws, the function still resolves, with
      `cleared: false`. If (1) rejects (throws, not `{error}`), (2) and (3) still run and the
      function resolves `cleared` as usual; it never rejects.
  - `hasUnsyncedWork(userId, deps?)` → `Promise<boolean>`: true when this user has a `sets` row
    with `status: "queued"` or a `sessions` row with `pending: true`. Rejected sets and other
    users' rows don't count. A Dexie read error resolves `false` (never blocks sign-out).
  - Share `deleteUserRows` / `removePrefixedKeys` between `wipe.ts` and the new module (e.g. a
    small `local-data.ts`). `wipeLocalUserData` keeps its behaviour: its tests stay green
    unchanged.
  - Export both from `lib/account/index.ts`.
- Out:
  - The UF-11.4 button, confirm and navigation (T-0529).
  - `useAuth().signOut()` in `lib/auth` (unchanged, D-0195 Consequences).
  - The service-worker precache (kept, D-0136 §5).

### Edge cases that are in scope
- **Offline:** the logout request fails with a network error; the session on this device must
  still be gone and the caches cleared (AC-3).
- **Two users on one device:** only this user's cache rows go; the other user's caches and queue,
  and this user's queue, stay (AC-1).
- **Unsynced work:** kept, and visible to `hasUnsyncedWork` (AC-4).
- **Wipe failure:** sign-out has already happened; resolves `cleared: false` (AC-5).

## Acceptance criteria
vitest in `apps/web/src/lib/account/__tests__/sign-out.test.ts` (new), using `fake-indexeddb`,
the `dexie-seed.ts` / `fixtures.ts` helpers and fake storages as `wipe.test.ts` does. Titles start
`T-0528 AC-n`. U = `"user-u"`, V = `"user-v"`.

- **AC-1 (what's cleared and what stays)**
  - **Given** a fresh DB seeded with one row for U **and** one for V in every table (`sessions`
    with `pending: true` for U, `sets` with `status: "queued"` for U), `localStorage` holding
    `wl-last-email`, `wl-onboarding`, `wl-focus-prefs` and `other-app`, and `sessionStorage`
    holding `wl-return-to`, and a fake client whose `signOut` resolves `{ error: null }`.
  - **When** `signOutAndClearDevice({ userId: U }, deps)` resolves.
  - **Then** it resolves `{ cleared: true }`; each of the nine non-queue tables has 0 rows for U
    and 1 for V; `sessions` and `sets` still have U's row and V's row; `localStorage` holds only
    `other-app`; `sessionStorage` is empty.
- **AC-2 (order and scope)** With a shared call log, the log is exactly
  `[signOut({scope:"local"}), dexie transaction, storage removal]`: `signOut` is called once, with
  `{ scope: "local" }` (not `"global"`, not no argument), **before** any Dexie delete.
  **Contrast:** the fake records the argument; a call with `{}` fails the test.
- **AC-3 (offline, real supabase-js)** Using a real `createClient` from `@supabase/supabase-js`
  (the version the app ships) with `auth: { storage: <in-memory Storage>, persistSession: true,
  autoRefreshToken: false, detectSessionInUrl: false }` and `global: { fetch }` where `fetch`
  rejects with `new TypeError("Failed to fetch")`, and a valid-looking session written to that
  storage under the client's storage key (non-expired `expires_at`), when
  `signOutAndClearDevice({ userId: U }, { supabase: client, db, localStorage, sessionStorage })`
  resolves, then `client.auth.getSession()` returns `session: null`, the storage key is gone, and
  U's cache rows are gone. This pins D-0195 §2: a supabase-js upgrade that keeps the session on a
  network error fails here.
- **AC-4 (hasUnsyncedWork)** On a fresh DB:
  - empty → `false`;
  - one U `sets` row `status: "rejected"` and one U `sessions` row `pending: false` → `false`;
  - plus one V `sets` row `status: "queued"` → still `false` for U;
  - plus one U `sets` row `status: "queued"` → `true`;
  - only one U `sessions` row `pending: true` (no sets) → `true`;
  - with the DB's `sets` table stubbed to throw on read → `false`, no rejection.
- **AC-5 (failures never reject)**
  - The Dexie transaction stubbed to reject → resolves `{ cleared: false }`, `signOut` was still
    called once first, and the `wl-` storage keys are still removed.
  - `localStorage.removeItem` throwing → resolves `{ cleared: false }`; the Dexie rows for U are
    still deleted.
  - `signOut` rejecting (throws) → resolves; U's cache rows are deleted.
- **AC-6 (wipe unchanged)** `wipe.test.ts`, `delete.test.ts` and `boundaries.test.ts` pass with no
  edits.

**Red proof.** AC-1..AC-5 fail on main (the functions don't exist): record one run. Planted faults
on backup copies, restored with `cp`, each recorded: (a) include `sessions` in the cleared tables →
AC-1 fails; (b) call `signOut()` with no argument → AC-2 fails; (c) count `status: "rejected"` as
unsynced → AC-4 fails.

## Paths you may change
- `apps/web/src/lib/account/**` (the lane: `web-shell`).
- **Listed extras:** `docs/tickets/T-0528-lib-account-sign-out-and-clear.md`, for the build and
  accept logs.

## Contract impact
None (no schema, API or engine change; the Dexie schema is unchanged).

## Definition of done
- Tests for every AC pass, red run and the three planted faults recorded.
- `npx vitest run src/lib/account` (from `apps/web`, through `scripts/locked.sh small`) green.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` green, through `scripts/locked.sh`.
- No e2e needed: no screen changes here (T-0529 has the e2e).
- Commits start `T-0528` and cite UF-11.4 and GitHub #35.

## Notes
- `lib/account` stays out of the shell's static import graph (principle 5): only UF-11 imports it
  (`boundaries.test.ts` already pins that).
- **Parallel:** web-shell lane, as is T-0527 (no shared files). T-0529 waits for this one.

## Build / accept log

### Build (web-shell, 2026-10-06)
- Added `lib/account/sign-out.ts` (`signOutAndClearDevice`, `hasUnsyncedWork`) and `local-data.ts` (shared `deleteUserRows`/`removePrefixedKeys`, now used by `wipe.ts`); exported from `index.ts`.
- AC→test: AC-1..AC-5 in `__tests__/sign-out.test.ts` (AC-5 has three tests, AC-4 four); AC-6: `wipe`/`delete` tests unchanged and green.
- Deviation: `boundaries.test.ts` pins the exact export list of `index.ts`; it had to change (7 → 9 exports) for the two new exports. Only that list and its title changed.
- Red run on main: not recorded as a separate run; the functions did not exist (import of `signOutAndClearDevice` is undefined there).
- Planted faults (backup copy, restored with `cp`): (a) `sessions` cleared → AC-1 fails; (b) `signOut({})` → AC-2 fails; (c) rejected counted unsynced → AC-4 fails. Restored: 10/10 green.
- Gate: `-w typecheck lint test --concurrency=1` green, `test:repo-checks`, `format:check`, `check-all.mjs` green. No e2e (no screen change).

### QA (2026-10-06, HEAD cc5d0ba, tree clean; merge-tree with main is conflict-free)
- Green: `scripts/locked.sh small npx vitest run src/lib/account` (apps/web) 7 files, 74/74. No e2e (no screen change).
- Red on main: with `sign-out.ts` absent (main's lib/account), `sign-out.test.ts` fails at import: 1 file failed, no tests. Restored.
- QA faults (backup copy, restored with `cp`; each run 74 tests):
  - V's rows deleted (`userId` `notEqual`) → AC-1, AC-3, AC-5 (x2) fail (plus wipe/delete tests).
  - `sessionStorage` not cleared → AC-1 and AC-5 (Dexie reject) fail.
  - non-`wl-` key removed (prefix check dropped) → AC-1 and AC-5 fail (plus wipe tests).
  - Dexie failure path rethrows instead of `cleared:false` → AC-5 (rejecting Dexie) fails, only that test.
  - `wipe.ts` skips the `sets` table → wipe AC8, delete AC9 and L1(b) fail (AC-6 guards the wipe).
- AC→test: AC-1..AC-5 in `sign-out.test.ts` (each meaningful, shown red by the faults above and the builder's three); AC-6 `wipe`/`delete`/`boundaries` tests green.
- Note: `boundaries.test.ts` export-list edit (7 → 9) is a legitimate consequence of the new exports.
- Verdict: pass.
