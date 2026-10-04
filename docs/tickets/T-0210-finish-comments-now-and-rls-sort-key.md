---
id: T-0210
title: "Finish handler comments: drop the stale injected-`now` header in sessions/core.ts; document loadSessionSets' RLS dependency for its client_id sort key"
lane: backend
screens: [UF-08.1, UF-10.1]
decisions: [D-0053, D-0058, D-0015, D-0157, D-0178]
deps: [T-0203c]
status: ready
---
<!-- Groomed 2026-10-04 by product-owner. Build flow: wl-build-backend. Size: small (about ½ hour). Comment-only, so D-0178 tier: skip review and QA; the orchestrator checks the comments-only proof below at merge. -->

## Why
Two T-0203c review notes (journal 2026-09-28, the D-0058 rework entry) were filed as this
follow-up:
1. **Stale header.** `supabase/functions/sessions/core.ts:1-4` says the core is pure "so a unit
   test can fix `now` (only used as the fallback `updatedAt` …)". `FinishDeps` takes no `now`. It
   holds `loadOwnedSession`, `writeSessionFinish`, `loadSessionSets`, `loadFinishEngineInputs` and
   `balance`. The fallback `updatedAt = ended_at` now lives in `loadFinishEngineInputs` in
   `_shared/repo.ts`, and `buildSummary` passes the stored `ended_at` to `balance` (D-0053 §8).
   A reader who trusts the header will look for a clock seam that doesn't exist.
2. **Unstated RLS dependency.** `loadSessionSets` (`supabase/functions/_shared/repo.ts`, around
   line 209) pages with `pageAll`. It orders by `client_id`, filters on `session_id`, and has **no**
   `.eq("user_id", …)`. A `.range()` page walk is only stable and complete when the order key is
   unique across the rows the query can see. `client_id` is unique only **per user**: the unique
   key is `session_sets_user_id_client_id_key (user_id, client_id)` (`docs/data-model.md`
   session_sets; migration `20260927210000_data_model_v1a.sql`). The function gets per-user
   scoping from RLS: `ctx.supabase` is created with the caller's JWT (`_shared/auth.ts`), and
   policy `session_sets_select` is `using ((select auth.uid()) = user_id)`. Its sibling
   `loadHistoryWindow` filters on `user_id` explicitly. T-0203b's review proved uniqueness for that
   one (journal 2026-09-28: "`unique (user_id, client_id)` + `.eq(user_id)`"). This one doesn't
   say what it relies on. A second guard holds as well: `session_sets_session_fk (session_id,
   user_id) → sessions (id, user_id)`, with `sessions.id` as the PK, ties every set of one
   `session_id` to one `user_id`. The comment states both guarantees and doesn't overclaim either.

## Scope
- In:
  - `supabase/functions/sessions/core.ts`: rewrite the header comment (lines 1-4) only. It says
    the core is pure apart from the injected `deps` (`FinishDeps`), so a unit test can stub the repo
    calls and spy on `balance`. It also says the summary uses the stored `ended_at`, never the
    server clock, so a repeat finish is deep-equal (D-0053 §8). Keep the existing citations
    (D-0037 §9, D-0053 §7–§8, AC24–AC33). Don't mention `now` as an injectable dep.
  - `supabase/functions/_shared/repo.ts`: extend the JSDoc on `loadSessionSets` only. It must
    name:
    (a) the order key `client_id` and why it must be unique (stable, exhaustive `pageAll` walk);
    (b) the unique key `(user_id, client_id)`;
    (c) the RLS dependency: no `user_id` filter, the caller's JWT client and `session_sets_select`
    scope the rows to the caller;
    (d) the composite FK `session_sets_session_fk` as the second guard;
    (e) the consequence: a service-role (RLS-bypassing) client must add
    `.eq("user_id", ctx.userId)`, as `loadHistoryWindow` does.
    About 4–7 added lines, in the file's existing JSDoc style.
- Out:
  - Any code token, import, signature, query or test change, including adding the `.eq("user_id")`
    filter. That would be a behaviour change and needs its own ticket. If the builder thinks it's
    warranted, file it as a follow-up.
  - Other comments in either file, `docs/data-model.md`, migrations, `api/openapi.yaml`.
  - T-0209 (concurrent-finish race) and T-0218 (µs `endedAt`) also edit `core.ts`/`repo.ts`.
    They are the same lane, so the board serialises them. Don't fold their work in.

### Edge cases that are in scope
- **Not overclaiming.** The comment must not say RLS is the *only* thing keeping `client_id`
  unique here (the composite FK also does). It must not say `client_id` is globally unique (it
  isn't: the key is per user).
- **Prettier reflow.** If `format:check` rewraps the new JSDoc, the rewrap is still comment-only
  and passes AC-4.

## Acceptance criteria
**Test rules.** This ticket is prose. There's no behaviour to test and no planted fault. Each AC
is a command whose output the build log records verbatim (or as a one-line result). "Unedited"
means `git diff main...HEAD -- supabase/tests/` is empty.

- **AC-1 (stale header gone)** Given the branch, When running
  `sed -n '1,6p' supabase/functions/sessions/core.ts | grep -cw 'now'`, Then it prints `0`. (Say
  "server clock", not "now".) And
  `sed -n '1,6p' supabase/functions/sessions/core.ts | grep -cE 'FinishDeps|deps'` prints at
  least `1` (the header names the real seam).
- **AC-2 (RLS dependency documented)** Given the JSDoc block right above
  `export async function loadSessionSets` in `supabase/functions/_shared/repo.ts`, Then it
  contains each of these literal substrings: `client_id`, `(user_id, client_id)`,
  `session_sets_select`, `RLS`, `session_sets_session_fk`, and `.eq("user_id"`. The log shows
  the block (one `sed -n` excerpt).
- **AC-3 (no overclaim)** The same block doesn't contain `globally unique` or `only` next to RLS.
  A one-line self-check in the log is enough.
- **AC-4 (comments only: the proof)** Given `git diff --name-only main...HEAD`, Then it lists only
  `supabase/functions/sessions/core.ts`, `supabase/functions/_shared/repo.ts` and this ticket
  file. And this command prints **nothing**:
  ```
  git diff -U0 main...HEAD -- supabase/functions/sessions/core.ts supabase/functions/_shared/repo.ts \
    | grep -E '^[+-]' | grep -vE '^(\+\+\+|---) ' \
    | grep -vE '^[+-][[:space:]]*(//|/\*\*|\*/|\*([[:space:]]|$))'
  ```
  (Every added or removed line starts with `//`, `/**`, `*` or `*/` after indentation.) And
  `git diff -U0 main...HEAD -- <same two files> | grep -E '^\+' | grep -E '\*/[[:space:]]*[^[:space:]]'`
  prints nothing (no code after a closing `*/` on an added line).
- **AC-5 (type-check, state.md trap)** `npx -y deno@2 check --config supabase/tests/functions/deno.json supabase/functions/sessions/index.ts`
  exits 0 (state.md: run it locally for anything under `supabase/`, T-0229).
- **AC-6 (backend tests green, unedited)**
  `npx -y deno@2 test --config supabase/tests/functions/deno.json --allow-net --allow-env --allow-read supabase/tests/functions/unit/`
  passes with the same pass count as on `main` (run once on `main`, once on the branch, both
  counts logged), and `supabase/tests/` is unchanged. The integration suite needs the local
  stack. It isn't required here, because AC-4 proves no executable line changed. CI runs it on
  push.
- **AC-7 (repo gates)** `npx -y pnpm@10.28.2 -w format:check` and
  `node .github/scripts/check-all.mjs` are green. Prettier covers the `supabase/` files: main's CI
  went red on exactly this after T-0203c (journal 2026-09-29).

## Paths you may change
- Lane `backend` (`supabase/functions/**`, `supabase/seed.sql`, `supabase/tests/**`,
  `supabase/config.toml`). In practice only `supabase/functions/sessions/core.ts` and
  `supabase/functions/_shared/repo.ts`, comment lines only.
- **Listed extras:**
  - `docs/tickets/T-0210-finish-comments-now-and-rls-sort-key.md`: this file, for the log.

## Contract impact
None. The comment restates facts already in `docs/data-model.md` (session_sets keys and RLS) and
migration `20260927210000_data_model_v1a.sql`.

## Definition of done
AC-1 to AC-7 recorded in the log · comments-only proof (AC-4) printed empty · `deno check` and the
unit suite green with tests unedited · `format:check` and `check-all` green · contracts unchanged ·
commits start `T-0210` and cite UF-08.1. No full `-w` typecheck/lint/test or e2e run is needed:
nothing under `apps/` or `packages/` changes, and Turbo doesn't build `supabase/functions` (D-0178
tier for a comment-only change).

## Notes
- **Flow:** `wl-build-backend`. Review and QA are skipped (D-0178, comment-only). The
  orchestrator re-runs the AC-4 command at merge.
- **Parallel:** no shared file with T-0317 (README) or T-0475 (`apps/web` eslint). Don't run it
  alongside T-0209 or T-0218 (same files, same lane).
- **Possible follow-up for the builder to file, not do:** add `.eq("user_id", ctx.userId)` to
  `loadSessionSets` for defence in depth, to match `loadHistoryWindow`.

## Build / accept log
