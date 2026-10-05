---
id: T-0497
title: "loadSessionSets filters on user_id explicitly (.eq(\"user_id\", ctx.userId)), as loadHistoryWindow does"
lane: backend
screens: [UF-08.1, UF-10.1]
decisions: [D-0053, D-0058, D-0015, D-0178, D-0180]
deps: [T-0210]
status: ready
groomed: 2026-10-05
---
<!-- Written by product-owner 2026-10-05 (groom mode, D-0180 §1). Build flow: wl-build-backend.
About 1 hour. One query line, one JSDoc edit, one Deno unit test. D-0178: small, self-proven
diff (the planted fault is the proof). Same files as T-0209 and T-0218 (both `todo` at groom
time): the board must not run this alongside either. -->

## Why
T-0210 documented that `loadSessionSets` (`supabase/functions/_shared/repo.ts`) pages
`session_sets` ordered by `client_id` with **no** `user_id` filter. It relies on two things for a
stable `pageAll` walk: the caller's-JWT client plus the `session_sets_select` RLS policy, and the
composite FK `session_sets_session_fk (session_id, user_id)`. `client_id` is unique only per user
(`session_sets_user_id_client_id_key (user_id, client_id)`). The JSDoc ends with "A service-role
(RLS-bypassing) client must add `.eq("user_id", ctx.userId)`, as `loadHistoryWindow` does."

That is a trap waiting for the first service-role caller. The filter costs nothing and makes the
function correct on its own: defence in depth. T-0210 kept it out of scope because it changes a
query; this ticket makes that change.

## Scope
- In:
  - `supabase/functions/_shared/repo.ts`, `loadSessionSets` only: add
    `.eq("user_id", ctx.userId)` to the query, next to the existing `.eq("session_id", sessionId)`.
    Order of the filter calls doesn't matter to PostgREST; put `user_id` first, as
    `loadHistoryWindow` does.
  - The JSDoc above `loadSessionSets`: replace the RLS-dependency paragraph with what is now
    true. It must say that the query filters on `user_id` itself, so `(user_id, client_id)`
    uniqueness makes `client_id` a unique order key for the walk regardless of the client (JWT or
    service-role); that RLS (`session_sets_select`) and `session_sets_session_fk` still hold and
    are now a second and third guard. Drop the sentence "There is no `user_id` filter here" and the
    "must add `.eq(\"user_id\"…)`" instruction (both stale once the filter exists).
  - `supabase/tests/functions/unit/repo.test.ts`: new Deno tests (see ACs) with a fake query
    builder that records every `.eq(column, value)` call and serves rows through `.range()`.
- Out:
  - `loadOwnedSession`, `writeSessionFinish`, `loadHistoryWindow`, `loadFinishEngineInputs` and
    every other function in `repo.ts`.
  - `supabase/functions/sessions/core.ts` (T-0209 race, T-0218 µs `endedAt`: their own tickets).
  - Migrations, RLS policies, `docs/data-model.md`, `api/openapi.yaml`. No service-role client is
    introduced anywhere.
  - The response shape: for a JWT client RLS already returns only the caller's rows, so the
    finish summary is byte-identical. No `sessions-core.test.ts` or pgTAP change is expected.

### Edge cases that are in scope
- **Mismatched owner.** A fake client that (like a service-role client) would return rows for
  `session_id = S1` belonging to two users must, through `loadSessionSets`, yield only the
  caller's rows. The fake must honour the recorded `.eq` filters when it serves `.range()`, so the
  test proves the filter is applied, not just that a method was called.
- **Paging still exhausts.** More than `HISTORY_PAGE_SIZE` (1000) rows for the caller still come
  back complete, in `client_id` order (the existing `pageAll` behaviour, through this function).

## Acceptance criteria
**Test rules.** Deno tests in `supabase/tests/functions/unit/repo.test.ts`; each title starts with
"T-0497 AC-n". Run with
`deno test --config supabase/tests/functions/deno.json --allow-net --allow-env --allow-read supabase/tests/functions/unit/`.
- **AC-1 (filter applied)** Given a fake client recording calls, When
  `loadSessionSets({ userId: "u1", supabase: fake }, "S1")` runs, Then the recorded filters include
  `eq("user_id", "u1")` and `eq("session_id", "S1")` and `is("deleted_at", null)`, and the order is
  `client_id` ascending.
- **AC-2 (other users' rows excluded, service-role shape)** Given a fake that holds, for
  `session_id = "S1"`, rows `a1`, `a2` for `user_id "u1"` and rows `a1`, `b1` for `user_id "u2"`
  (note the shared `client_id` `a1`), and applies the recorded `eq` filters before slicing by
  `.range()`, When `loadSessionSets` runs for `u1`, Then it returns exactly 2 sets, client ids
  `["a1", "a2"]`, none of them `u2`'s.
- **AC-3 (paging intact)** Given the same filtering fake with 1 001 live rows for `u1` on `S1`
  and 5 rows for `u2`, When `loadSessionSets` runs for `u1`, Then it returns 1 001 sets, and
  `.range()` was called exactly twice (1000, then 1).
- **AC-4 (fault proof)** On a backup copy (`cp`), delete the new `.eq("user_id", …)` line, run
  the unit dir: AC-1 and AC-2 fail (AC-2 returns 3 or 4 sets). Restore with `cp`. Record both runs
  in the log.
- **AC-5 (JSDoc)** The block above `export async function loadSessionSets` contains the
  substrings `(user_id, client_id)`, `session_sets_select` and `session_sets_session_fk`, and
  contains neither `must add` nor `There is no` (the two stale T-0210 sentences). One `sed -n`
  excerpt in the log.
- **AC-6 (no regression)** The whole `supabase/tests/functions/unit/` dir is green unedited apart
  from the new tests (`git diff main...HEAD -- supabase/tests/` touches only `repo.test.ts`).

## Paths you may change
- `supabase/functions/_shared/repo.ts` (`loadSessionSets` and its JSDoc only)
- `supabase/tests/functions/unit/repo.test.ts`
- `docs/tickets/T-0497-load-session-sets-user-filter.md` (build log only)

## Contract impact
None. Same rows for every existing caller; RLS, schema and API unchanged.

## Definition of done
AC-1..AC-6 hold and are recorded · the Deno unit dir green · `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`,
`npx -y pnpm@10.28.2 -w test:repo-checks`, `npx -y pnpm@10.28.2 -w format:check` and
`node .github/scripts/check-all.mjs` green · no e2e run needed (no web change) · commits start
`T-0497` (for example `T-0497 UF-08.1: loadSessionSets filters on user_id`).

## Notes
- If `deno` isn't on the machine, say so in the handback and let CI's `deno test` step be the
  proof; don't install it (the ticket can then go through review on CI's result).
- Serialise with T-0209 and T-0218 (same file). If either has moved to `doing` when this is
  picked, wait.

## Build / accept log
