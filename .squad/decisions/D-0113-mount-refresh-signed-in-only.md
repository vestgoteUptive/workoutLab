---
id: D-0113
title: A feature screen's mount-time refreshAll runs only for a signed-in session — at most once per mount, at the first moment the screen is mounted, online and signed-in; never for stale or signed-out
status: revisit
date: 2026-10-02
by: triage (TR-0035)
area: web
supersedes: D-0071 §8 — in part (the "when online, it first runs refreshAll" clause only; the rest of D-0071 stays in force)
builds-on: D-0073 §3, D-0104, D-0108 §3
---
## Context
D-0071 §8 says every Phase 3 screen runs `refreshAll` with a 3 s cap "when online". It doesn't say anything about auth status. The shell's own refresh (`lib/offline/AutoSync.tsx`) runs only when `useAuth().status === "signed-in"`. The feature screens copied the online-only check:
- `features/UF-10/use-balance.ts`: `if (!navigator.onLine) return;`, then `refreshAll`. No auth check.
- `features/UF-04/data.ts`: `if (!navigator.onLine) { … }`, then `refreshAll`. No auth check.
- T-0302a (UF-02.1, branch `t/T-0302a-today`) and T-0303a (UF-08.1, building now) do the same, as their AC-8 and AC-10 ask.

`/` is the first screen that mounts while the profile gate is still resolving for a `stale` session (an expired token whose refresh hasn't finished; D-0073 §3 gates `stale` too). Today's refresh calls `refreshProfile` and reads `profiles` a second time, so `app/__tests__/profile-gate.test.tsx` "stale + `missing` on `/`" sees 2 reads where it pins 1 (TR-0035). D-0108 §3 says that file stays byte-identical.

The test is right about more than the count. For a `stale` session, a refresh is wasted work that is likely to fail: its REST reads carry the expired token. `AuthProvider` is already refreshing that session, and `AutoSync` refreshes every cache as soon as the status turns `signed-in`. A `signed-out` session has nothing to refresh. Only signed-in users have server data.

## Decision
1. **One rule for every feature screen's mount refresh.** This covers any `refreshAll`, or any single `refresh*`, that a screen under `apps/web/src/features/**` starts on mount: UF-02, UF-04, UF-08, UF-10, and every later screen (UF-03, UF-06, UF-07, UF-11, …). The refresh starts **only when `navigator.onLine` is true and `useAuth().status === "signed-in"`** (from `lib/auth/auth-context.js`, a read-only import). It is the same condition `AutoSync` uses.
2. **At most once per mount, at the first qualifying moment.**
   - The refresh starts at the first commit where the screen is mounted, `navigator.onLine` is true, and the status is `signed-in`. It never starts again during that mount, for example through a ref flag.
   - If the status is `stale` at mount and turns `signed-in` later in the same mount, the refresh starts then, once, so the screen catches up without a remount. A mount that starts `signed-in` refreshes once and never again.
   - A screen doesn't have to listen for `online` events. `navigator.onLine` is read when the status check runs. (A screen that already re-checks on `online` may keep doing so, as long as the once-per-mount limit holds.)
3. **`stale` and `signed-out` get no refresh at all.** The screen renders from the cache (D-0071 §8's device-side computation is unchanged) and makes 0 `refreshAll` calls and 0 `supabase.from` calls of its own. The cached render is the final render for that mount unless the status turns `signed-in` (§2).
4. **The 3 s cap and the re-read stay as they are (D-0071 §8, D-0104).** The cap is measured from the moment the refresh starts. When there's no refresh, there's no cap and no second read.
5. **Tests.** Every screen with a mount refresh pins both values of the auth condition, using a `vi.mock` of `lib/auth/auth-context.js`'s `useAuth` or a real `AuthProvider`:
   - online + `signed-in` → exactly 1 `refreshAll` call;
   - online + `stale` → 0 calls after a real 50 ms macrotask;
   - online + `stale` → `signed-in` during the mount → exactly 1 call, and none after another 50 ms.
   - The existing online/offline pair stays, with the online case now `signed-in`.
6. **TR-0035 is resolved by option 1.** `profile-gate.test.tsx` stays byte-identical (D-0108 §3). No D-0088 grant is given, and the "the gate really did read" pin at line 951 stays.

## Consequences
- **T-0302a:** AC-8 is amended as §1–§5 say (online → online and signed in, plus the stale cases). AC-10 "Recovery" is online and signed in. The UF-02 tests mock `useAuth`, as UF-10's `qa-real-path.test.tsx` and UF-04's `route.test.tsx` already do. Nothing under `app/**` changes.
- **T-0303a:** AC-9's online run and AC-10 get the same amendment. If the builder has already committed, the change is a small follow-up commit on its branch.
- **UF-10 and UF-04 on main** don't follow §1 yet. They aren't at `/`, so no shell test fails today, but a `stale` user who opens `/balance` or `/library/*` online still triggers a refresh with an expired token. Each gets a small retrofit ticket in its own lane (TR-0035 follow-ups).
- Any later screen ticket that copies the "when online, refreshAll" wording cites D-0113 instead.

## Revisit when
- A screen gets this rule wrong in review, or a fifth screen needs it. At that point, a web-shell ticket should add one exported hook in `lib/offline` (for example `useMountRefresh(now, tz, capMs)`) that encodes §1–§4, and the screens should migrate to it. Four screens (UF-02, UF-04, UF-08, UF-10) each carry their own copy for now, because a shared hook would make two in-flight feature tickets depend on a web-shell ticket.
- `stale` sessions get a server-side read path that works with an expired token. They don't today.
