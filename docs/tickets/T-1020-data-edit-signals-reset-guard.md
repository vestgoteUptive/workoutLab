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
