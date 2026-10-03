---
id: T-0465
title: "App shell: RouteBoundary moves focus to Reload when its fallback mounts, and resets on a pathname change within a route, so one bad /library/:exerciseId doesn't block the others (D-0167 §5)"
lane: web-shell
screens: [UF-04.2]
decisions: [D-0167, D-0164, D-0111, D-0144]
deps: [T-0459]
status: ready
---
<!-- Groomed 2026-10-03 by product-owner from the T-0459 review. Build flow: wl-build-web. About ¼ day. T-0459 is in QA: start from a main that has it. It touches app/App.tsx, so it runs the whole web e2e. -->

## Why
T-0459's fallback ("Couldn't load this screen." + Reload) leaves focus where it was, often the
tab bar link that was just pressed, or `<body>`. A keyboard or screen-reader user must hunt for the
one action on screen. The boundary is keyed by the route pattern, so a render error on one
`/library/:exerciseId` keeps the fallback for every other id until a reload (D-0164 §7 assumed
only chunk failures, which reload anyway). D-0167 §5 amends that.

## Scope
- In (`apps/web/src/app/`):
  - `RouteBoundary.tsx`: when the fallback mounts, focus moves to "Reload". The boundary takes a
    reset value (the current `location.pathname`) and clears its failed state when that value
    changes (the `resetKeys` pattern: compare in `componentDidUpdate` or
    `getDerivedStateFromProps`).
  - `App.tsx`: pass the pathname to each route's boundary. Keep `key={route.path}`. Don't key on
    the pathname (D-0167 §5: that would remount working routes).
  - Tests in `app/__tests__/` (extend `route-boundary.test.tsx` or add
    `route-boundary.t0465.test.tsx`).
- Out:
  - The copy, the styles, an automatic reload, telemetry (as T-0459).
  - Feature boundaries (UF-09 seams, T-0463).

### Edge cases that are in scope
- **Chunk failure plus a param change:** the reset re-renders the cached rejected `lazy()`, and the
  fallback shows again with focus on Reload. No loop, one fallback (AC-2 pair).
- **Mid-workout:** a reset on `/session/:id` never re-runs the `session` guard. The boundary stays
  inside the guard (AC-4).
- **Offline, zero history, 10 days off, time running out:** no effect beyond T-0459's.

## Acceptance criteria
**Test setup.** The T-0459 harness (`<Shell>` in a `MemoryRouter`, the `auth-context` mock signed
in, a `vi.mock` of `./routes.js` via `importOriginal`). For a render error, the `/library/:exerciseId`
route's `load` resolves to a test component that throws when its `exerciseId` param is `"bad"` and
otherwise renders `<p data-testid="detail">{exerciseId}</p>`, counting its mounts in a
`useEffect(() => { mounts += 1 }, [])`. Navigation goes through a test `Link`, or a
`useNavigate` handle rendered inside the router. React's console error for a caught error is
silenced only inside these tests.

**Test rules.** Both values of every binary condition get a test. **AC-1 and AC-2 must fail on a
`main` with T-0459**: the build log records each red run (focus on `<body>`; the fallback stays on
`/library/good`). It also records one planted fault turning AC-3 red: `key={location.pathname}`
on the boundary instead of the reset value.

- **AC-1 (focus)** Given `/progress`'s load rejects, When `<Shell>` renders at `/progress`, Then
  `document.activeElement` is the "Reload" button. The same holds when the fallback appears after
  a navigation from `/library` by the tab bar link. **The pair:** a route that renders normally
  leaves focus where it was (`<body>` on first render, the tab bar link after a tab navigation).
- **AC-2 (reset on a pathname change)** At `/library/bad` the fallback shows. Navigating to
  `/library/good` renders `detail` "good" and no alert. Navigating back to `/library/bad` shows the
  fallback again with focus on Reload. **The pair (chunk failure):** with the route's `load`
  rejecting, going from `/library/a` to `/library/b` still shows exactly one fallback, and the load
  isn't called in a loop (at most once per navigation).
- **AC-3 (no remount of a working route)** From `/library/good` to `/library/other`, `mounts` stays
  1, and `detail` reads "other".
- **AC-4 (unchanged surface)** T-0459's tests, `App.test.tsx`, `routes.phase3.render.test.tsx`,
  `profile-gate.test.tsx`, `profile-gate.source.test.ts` and `import-bans.test.ts` pass unedited,
  the mid-workout guard test included (the guard isn't re-run after a reset). The vitest axe helper
  finds 0 violations on the fallback. `check:size` stays within the NFR-PERF-2 entry budget.

## Paths you may change
- `apps/web/src/app/**` (the lane: `web-shell`).
- **Listed extras:**
  - `docs/tickets/T-0465-route-boundary-focus-and-reset.md`: this file, for the logs.

## Contract impact
None.

## Definition of done
Tests for every AC pass, with the red runs and the planted fault recorded · the cached gate
(D-0158): `pnpm -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check`
and `check-all` green · `check:size` green · the whole web e2e green (`app/App.tsx` changed) ·
contracts unchanged · commits start `T-0465`.

## Notes
- **Flow:** `wl-build-web`.
- **Parallel:**
  - **Not with T-0459** (in QA): same files (`RouteBoundary.tsx`, `App.tsx`, its test). Start after
    it merges.
  - **T-0446, T-0417, T-0461, T-0463:** no shared file (all under `features/**`). Its whole-suite
    e2e run shares the machine's test lock with every other e2e run.

## Build / accept log
