---
id: T-0384
title: "UF-04 D-0113 retrofit: useScreenData refreshes only online + signed-in, once per mount; plus the UF-04 T-0380 read guard"
lane: web-feature:UF-04
screens: [UF-04.1, UF-04.2, UF-04.3]
decisions: [D-0113, D-0104, D-0115, D-0071]
deps: []
status: ready
---
## Why
`features/UF-04/data.ts` `useScreenData` starts `refreshAll` whenever `refresh` is set and
`navigator.onLine` is true, with no auth check (TR-0035, D-0113 Consequences). D-0113 §1 to §5
give the rule. D-0115 §3 says what `pending` does when the refresh starts late.

The UF-04 site from T-0380 is folded in here (D-0115 §2): the bare `void readRef.current().then`
on line 40.

## Scope
- In:
  - The D-0113 condition (`useAuth().status === "signed-in"` and `navigator.onLine`) in
    `useScreenData`, plus a once-per-mount ref flag.
  - A `stale` or `signed-out` mount is treated like offline (`refreshed: true`).
  - A late `signed-in` starts the one refresh and sets `pending` again (D-0115 §3).
  - The read rejection guard.
  - Tests. Every existing UF-04 test that renders a `refresh: true` screen gets a `useAuth` mock
    (`signed-in` for the online cases). The LibraryDetail "calls refreshAll once" tests in
    `detail.test.tsx` run signed-in.
- Out:
  - `refresh: false` consumers (unchanged: no refresh whatever the auth status).
  - The cap value and the copy.

## Acceptance criteria
- AC1 Given online, `signed-in` and `refreshAll` spied, when UF-04.1 `/library` mounts, then `refreshAll` is called exactly once, and the cache is re-read after it settles or after 3 s.
- AC2 Given online and `stale`, when UF-04.1 mounts and a real 50 ms macrotask passes, then `refreshAll` has 0 calls, `supabase.from` has 0 calls from the screen, and `pending` is false after the first read (the list or "never downloaded" renders from the cache, as offline does).
- AC3 Given online and `signed-out`, when it mounts and 50 ms pass, then `refreshAll` has 0 calls.
- AC4 Given online and `stale` at mount, when the status turns `signed-in` and the screen re-renders, then `refreshAll` is called exactly once, and `pending` is true until the re-read that follows that refresh lands. After another 50 ms and a further re-render with `signed-in`, it is still 1.
- AC5 Given fake timers, `stale` at mount, a hanging `refreshAll`, and `signed-in` at t = 1000 ms, when time advances, then the re-read (`tick + 1`) happens at t = 4000 ms, not 3000 ms (D-0113 §4).
- AC6 Given UF-04.2 `/library/<id>` online and `signed-in`, when it mounts, then `refreshAll` is called exactly once. These are the existing "calls refreshAll once" tests, now run with a `signed-in` mock.
- AC7 Given the `read` passed to `useScreenData` rejects with `new Error("idb")` on the first call and resolves on the post-refresh re-read, when UF-04.1 mounts online and `signed-in`, then no unhandled rejection is recorded and `console.error` is not called. `data` is `undefined` until the re-read lands and then shows the resolved value. If both reads reject, the screen stays on its empty wrapper with no error screen.
- AC8 Given the existing UF-04 suites, including `route.test.tsx`, `browse.test.tsx`, `detail.test.tsx`, `compare.test.tsx` and `offline.test.tsx`, when they run with the `useAuth` mock added where needed, then every existing assertion passes unchanged.

## Paths you may change
- `apps/web/src/features/UF-04/**` (the lane: `web-feature:UF-04`). The edits go in `data.ts` and `__tests__/`.
- **Listed extras:**
  - `docs/tickets/T-0384-uf04-mount-refresh-signed-in.md`: this file, for the accept log.
- Read-only imports (not grants): `lib/auth/auth-context.js` (`useAuth`), `lib/offline/history.js`.

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0384` and cite screen IDs.

## Build / accept log
Archived in `docs/tickets/log/T-0384.md` (D-0157).
