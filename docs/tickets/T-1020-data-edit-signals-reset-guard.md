---
id: T-1020
title: "Server guard: edit_signals writes older than the user's learn_reset_at are ignored, so a stale device cannot undo Forget"
lane: data
screens: []
decisions: [D-0281]
deps: []
status: ready
---
## Why
T-1008 security review: Forget deletes the user's `edit_signals` rows and moves `profiles.learn_reset_at`. A device that was offline (or whose requests failed while `navigator.onLine` stayed true) can later upsert entries counted before the reset as fresh rows; the existing stale guard (`last_seen < old.last_seen`) cannot help because the rows were deleted. T-1008 fixes the client; this adds the server-side guard.

## Acceptance criteria
- AC1 An insert or update on `edit_signals` with `last_seen <= (select learn_reset_at from profiles where user_id = new.user_id)` is a no-op (returns no row), not an error, so clients do not retry forever.
- AC2 A write with `last_seen` after the reset, or when `learn_reset_at` is null, is applied as before.
- AC3 pgTAP covers AC1, AC2 and the existing stale rule still holding; `docs/data-model.md` describes the guard.
- AC4 RLS and the existing tests are unchanged.

## Paths you may change
- `supabase/migrations/**`, `supabase/tests/**`, `docs/data-model.md`, `packages/shared/**` (generated types only if they change)

## Contract impact
`docs/data-model.md` (trigger behaviour) under D-0281.

## Definition of done
Every AC has a test · affected checks green (D-0285; supabase is a shared path: full suite) · commit messages start with `T-1020`.

## Build / accept log

- Build (data): migration `20261125120000_edit_signals_reset_guard.sql` replaces `private.edit_signals_before_write`: first checks the owner's `profiles.learn_reset_at`, and `last_seen <= learn_reset_at` returns null (no row, no error; upsert conflict update skipped too); then the old logic unchanged (RLS, trigger, stale rule untouched). New `027_edit_signals_reset_guard.test.sql` (plan 14); `026` unchanged (69/69). `docs/data-model.md` updated. No generated-type change.
  - AC map: AC1 027 tests 1-7, 10, 14 (insert before/at reset, no row returned, upsert, update, replay after Forget); AC2 027 tests 8, 9, 12, 13 (after reset, null reset, other user); AC3 027 test 11 plus 026 AC5 (stale rule) and the data-model text; AC4 026 69/69 unchanged.
  - pgTAP ran locally on a throwaway Postgres 16 + pgTAP with stubbed Supabase roles/auth (no Docker daemon, no supabase CLI): 026 69/69, 027 14/14. CI runs `supabase db tests`.
  - Planted faults (027 catches each; backup + cp + cmp, none committed): reset check removed (fail), `<` instead of `<=` (fail), raise instead of return null (fail), stale rule removed (027 test 11 fails; 026 also fails), null reset treated as blocking (027 fails). One fault first slipped through (test 11 hit a window_order error); fixed the fixture, re-ran all.
  - Gates: turbo typecheck/lint/test green; format:check green; vendor --check and gen-seed --check exit 0; test:repo-checks and check-all fail only on `ticket-not-on-base` (ticket file is on the branch, not on main; orchestrator process).
