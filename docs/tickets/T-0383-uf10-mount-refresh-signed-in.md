---
id: T-0383
title: "UF-10 D-0113 retrofit: mount refresh only online + signed-in, once per mount; plus the UF-10 T-0380 rejection guards"
lane: web-feature:UF-10
screens: [UF-10.1, UF-10.2]
decisions: [D-0113, D-0104, D-0115, D-0071]
deps: []
status: ready
---
## Why
`features/UF-10/use-balance.ts` starts `refreshAll` whenever `navigator.onLine` is true and never
checks auth. A `stale` user who opens `/balance` online therefore sends REST reads with an expired
token (TR-0035, D-0113 Consequences). D-0113 §1 to §5 give the rule: refresh only when online and
signed in, at most once per mount.

The UF-10 sites from T-0380 are folded in here (D-0115 §2), because they are in the same lane and
the same files. They are the bare `void loadLibrary().then` in `index.tsx` `useExerciseNames`
(line 274), and the uncaught `void run()` in `use-balance.ts`.

## Scope
- In:
  - The D-0113 condition in `use-balance.ts`. The hook can read `useAuth()` itself, or take a
    `signedIn` argument from the screen the way UF-08's `useSetupData` does.
  - A ref flag that enforces once per mount.
  - The two rejection guards.
  - Tests. Every existing UF-10 test that renders the real hook gets a `useAuth` mock, with the
    online cases set to `signed-in`. Without it `useAuth` throws outside an `AuthProvider`.
- Out:
  - Any change to the 3 s cap value, the cache-first paint (AC-A18) or the copy.
  - A shared `useMountRefresh` hook (D-0113 Revisit).

## Acceptance criteria
- AC1 Given `navigator.onLine` true, `useAuth` mocked to `signed-in`, and `refreshAll` spied, when UF-10.1 mounts, then `refreshAll` is called exactly once, after the cache rows have painted. The balance is recomputed after it settles, as today.
- AC2 Given online and `useAuth` mocked to `stale`, when UF-10.1 mounts and a real 50 ms macrotask passes, then `refreshAll` has 0 calls, `supabase.from` has 0 calls from the screen, and the nine rows render from the cache.
- AC3 Given online and `signed-out`, when it mounts and 50 ms pass, then `refreshAll` has 0 calls.
- AC4 Given online and `stale` at mount, when the mocked status changes to `signed-in` and the screen re-renders, then `refreshAll` is called exactly once. After another real 50 ms, and a further re-render with `signed-in`, it is still 1.
- AC5 Given offline and `signed-in`, when it mounts, then `refreshAll` has 0 calls (the existing offline case, now with a mocked auth status).
- AC6 Given fake timers, `stale` at mount, a hanging `refreshAll`, and the status turning `signed-in` at t = 1000 ms, when time advances, then the post-refresh re-read happens at t = 4000 ms (3 s from the refresh's start, D-0113 §4), not at 3000 ms.
- AC7 Given UF-10.2 with no `exerciseNames` prop, and `loadLibrary` mocked to reject, when it renders and 50 ms pass, then the contributor rows show their existing fallback (the exercise id). No unhandled rejection is recorded (a `process.on("unhandledRejection")` spy), and `console.error` is not called.
- AC8 Given `loadEngineHistory` mocked to reject inside `useBalance`, when UF-10.1 mounts and 50 ms pass, then no unhandled rejection is recorded and the screen keeps its pre-read state (the `result: null` render), with no error screen.
- AC9 Given the existing UF-10 suites, including `qa-real-path.test.tsx`, `balance.engine.test.tsx` and `never-in-workout.test.tsx`, when they run with the `useAuth` mock added where needed, then every existing assertion passes unchanged.

## Paths you may change
- `apps/web/src/features/UF-10/**` (the lane: `web-feature:UF-10`). The edits go in `use-balance.ts`, `index.tsx` and `__tests__/`.
- **Listed extras:**
  - `docs/tickets/T-0383-uf10-mount-refresh-signed-in.md`: this file, for the accept log.
- Read-only imports (not grants): `lib/auth/auth-context.js` (`useAuth`), `lib/offline/history.js`.

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0383` and cite screen IDs.

## Accept log
- 2026-10-02 · product-owner · **done** (branch at 9fe2c26).
  - AC1 to AC8 each have a named test in `__tests__/refresh-auth.test.tsx`. AC1 adds a re-render case and a StrictMode case. AC2/AC3 run as one `it.each`, with a signed-in CONTRAST proving that the `fromCalls` spy records real reads. AC4 adds the case signed-in → stale → signed-in. AC6 checks for no re-read at 3000 ms or 3999 ms, then the re-read at 4000 ms. AC7 has a CONTRAST case with names resolved. AC8 asserts the `result: null` render with no alert.
  - AC9: the UF-10 suites share `__tests__/auth-mock.ts` (mirrors UF-04/T-0384). UF-10 123/123 and web 1590 are green. `never-in-workout.lint.test.ts` gets the 30 s budget (T-0379 follow-up).
  - Fault proofs: 7 red with the fix removed. Removing the once-per-mount flag turns 1 red, removing the auth check 4, removing each guard 1, removing the first-paint gate 1. Orchestrator QA re-planted the auth-gate fault (4 red), reverted it (123/123) and left a clean tree.
  - Principles: deterministic engine untouched, offline cache-first paint kept (AC-A18), 3 s cap value and copy unchanged. Contracts unchanged.
  - Review APPROVE. Non-blocking notes: (a) a stale overwrite is theoretically possible only if the `now`/`timeZone` props become live; (b) the sync-throw note is shared with UF-04 and goes to the D-0113 Revisit (shared `useMountRefresh`).
