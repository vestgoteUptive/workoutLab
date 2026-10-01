---
id: TR-0032
status: resolved
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
Resolved 2026-10-01 by triage. Option 1 (wording only). No new decision: this aligns T-0365's AC with its own
Scope and with D-0088 §2 / D-0091 §1 ("seed the fixture so the screen really renders"). Item 2 is wording.

1. **T-0365 AC-1 (done).** `docs/tickets/T-0365-auth-guard-uf043-seeded.md` AC-1 now reads "a valid stored
   session that carries a user id (`signIn(userId)` from `lib/offline/__tests__/test-helpers.ts`) … the cache
   seeded … for that same user id". The Scope seed bullet says the rows are keyed to that user id and that the
   file's existing `seedValidSession()` stays unchanged, because the other rows use it (D-0088 §3, T-0365
   AC-4). Extending `seedValidSession` was rejected: it touches a helper every other row uses, and AC-4's
   byte-identity is easier to review when the helper stays as it is. The `## Paths you may change` section now
   uses the lane bullet plus the `- **Listed extras:**` sub-bullet shape that `check-lane-paths` parses. The
   grant is unchanged. T-0365 can go to `ready`.
2. **D-0091 §2/§4 wording (deferred, not edited here).** The finding is correct. The `OTHER_SUB_ROUTES` URL
   assertion fails only when the redirect has already happened, so it narrows the race but does not close it.
   The deterministic signal is the built-content assertion (D-0091 §1). D-0091 is being edited by a separate
   product-owner run (T-0367, §2), so triage leaves it alone to avoid a conflicting edit. That run, or a
   follow-up, replaces "deterministic failure" / "fails deterministically" in §2 and §4 with "a failure
   whenever the redirect has already happened, which narrows the race". It also states that the real guard
   for UF-06.2 is T-0307b moving that row out of the loop and asserting built content per §1, written as a
   T-0307b AC and not only a Paths note. The T-0905 scope bullet is merged history and stays as it is.
   Option 2 (stub `<h1>` column) was rejected because it reopens T-0905 AC-5.
