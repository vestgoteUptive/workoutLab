---
id: TR-0032
status: open
raised_by: triage (check mode) on T-0905 ci-spec
date: 2026-10-01
---
## Conflict
1. **T-0365 AC-1 cannot pass as written.** `docs/tickets/T-0365-auth-guard-uf043-seeded.md` AC-1 says
   "Given a valid stored session (`seedValidSession`)". In
   `apps/web/src/app/__tests__/auth-guard.phase3.test.tsx:50`, `seedValidSession()` writes
   `{ access_token, expires_at }` with no `user`. `loadLibrary()` (`apps/web/src/lib/offline/history.ts:316`)
   returns `[]` when `currentUserId()` (`lib/offline/current-user.ts`) finds no `user.id`. So the seeded
   `back-squat` / `leg-press` rows can never be read, `CompareContent.tsx:49` redirects to `/library`, and
   AC-1 fails no matter what the dev does. The Scope bullet already points at `signIn(userId)` from
   `lib/offline/__tests__/test-helpers.ts`, which writes `user: { id }`. The AC contradicts its own Scope.
2. **D-0091 §2 and §4 overstate the loop assertion.** They say the URL assertion turns a redirect into a
   "deterministic failure" and that T-0307b's PR run "fails deterministically on that row rather than by
   luck". In the `OTHER_SUB_ROUTES` loop, `toHaveURL` runs straight after `toBeVisible`, and it passes on
   its first poll if the redirect has not happened yet. A built screen that renders a transient wrapper,
   then redirects after its first cache read (the UF-04.3 shape), can still pass both assertions inside
   the ~70–120 ms window. The assertion narrows the race. It does not close it. The deterministic signal
   is the built-content assertion (D-0091 §1), which AC-1 of T-0905 has and the stub loop cannot have.
   T-0905's own ACs are unaffected. The risk sits in §4's reason for leaving UF-06.2 to T-0307b.

## Options
1. (Recommended) Fix the wording, with no decision change:
   - T-0365 AC-1: "a valid stored session that carries a user id (`signIn(userId)` from
     `lib/offline/__tests__/test-helpers.ts`, or `seedValidSession` extended additively with `user.id`), and
     the cache seeded for that same user id".
   - D-0091 §2/§4 and the T-0905 scope bullet: replace "deterministic failure" with "a failure whenever the
     redirect has already happened, which narrows the race". State that T-0307b's grant line is the actual
     guard: the UF-06.2 row must leave the loop and assert built content per §1. Optionally make that an
     AC in T-0307b, not only a Paths note.
2. Make the loop assertion deterministic now, e.g. each stub row also asserts its stub `<h1>` text. A built
   screen drops the stub heading (D-0088 context), so the row fails every time once built. This costs one
   column in `OTHER_SUB_ROUTES`, which collides with T-0905 AC-5 ("other four entries byte-identical") and
   needs a T-0905 scope edit.

## Blocking
T-0365 (AC-1 is unsatisfiable as written). T-0905 is not blocked.

## Resolution
