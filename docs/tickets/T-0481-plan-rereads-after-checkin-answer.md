---
id: T-0481
title: "UF-11.2 re-reads the plan after the card's Accept or Keep (CheckinCard onAnswered → PlanBody remount)"
lane: web-feature:UF-11
screens: [UF-11.1, UF-11.2]
decisions: [D-0070, D-0113, D-0174]
deps: [T-0471]
status: todo
---
<!-- Written by product-owner 2026-10-03 (groom, D-0174 §2). Split from T-0471 by D-0157 §7.
Build flow: wl-build-web. About ¼ day. Becomes ready when T-0471 is done. -->

## Why
Once T-0471 mounts the card at the top of UF-11.2, a successful Accept changes the rhythm and the
9 targets. But `PlanBody` read the cache once, when it mounted, so the screen keeps showing the
old "3–4 per week" and the old numbers right under the card that just changed them. That's a
silent mismatch (principle 4: targets adapt, and the user sees it).

## Scope
- In:
  - `CheckinCard` gets an optional `onAnswered?: () => void`. The card calls it **once**, after a
    successful Accept or Keep, once that write's `refreshAll` has settled (resolved or
    rejected). It doesn't call it for a failed write, and it doesn't call it when the card hides
    because another device answered (D-0172 §2).
  - UF-11.2 (`features/UF-11/index.tsx`) passes a callback that remounts `PlanBody` (a `key`
    bump), so the body reads the cache again.
- Out:
  - Today (UF-02.1). Its slot takes no props, so it keeps its pre-Accept view until the next
    mount (T-0482).
  - Any change to the writes or to `use-plan-data.ts`'s refresh rule (D-0113).

### Edge cases that are in scope
- **Offline:** the buttons are disabled offline, so `onAnswered` can't fire (AC-3).
- **Refresh fails after the write:** the cache still holds whatever `refreshAll` wrote before it
  failed. The callback still fires, and the body shows what the cache has (AC-2).

## Acceptance criteria
Each test title starts with `T-0481 AC-n`. The fixtures are T-0308c's (the AC-1 proposal: rhythm
3–4 → 2–3, chest 20 → 14), with `refreshAll` stubbed to write the accepted profile and targets
into the cache.

- **AC-1 (Accept, red on main)** **Given** `/plan` with the proposal cached, **when** Accept
  succeeds, **then**:
  - the card is gone;
  - the Plan body's rhythm line shows 2–3 and the chest target shows 14, with no reload;
  - `onAnswered` was called exactly once, after the `refreshAll` promise settled.

  **Red:** on main (after T-0471), the body still shows 3–4 and 20.
- **AC-2 (Keep, and a rejected refresh)** **Given** the same setup, **when** Keep current
  succeeds, **then** `onAnswered` is called once and the body re-renders with the same values
  (rhythm 3–4). **When** Accept succeeds but `refreshAll` rejects, **then** `onAnswered` is
  still called once.
- **AC-3 (no call when nothing was answered)** `onAnswered` is called 0 times in each of these
  cases:
  - the area_targets step of Accept fails, and so the card shows its error;
  - the card hides because the 23505 path found an answered row;
  - offline, where the buttons are disabled.

  Check each one after a real 50 ms macrotask.
- **AC-4 (one remount)** After an Accept, `PlanBody` mounts exactly twice in total: the first
  mount, plus one remount. Its D-0113 mount refresh therefore runs at most once more.

**Red proof.** Run AC-1 on main: it fails. Plant one fault on a backup copy (call `onAnswered`
before `refreshAll` settles): AC-1's ordering check must fail. Restore from the backup and record
both runs.

## Paths you may change
- `apps/web/src/features/UF-11/**` (the lane: `web-feature:UF-11`).
- **Listed extras:**
  - `docs/tickets/T-0481-plan-rereads-after-checkin-answer.md`

## Contract impact
None.

## Definition of done
- Tests for every AC pass.
- `uf-11-plan.spec.ts` is green.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` are green, each through
  `scripts/locked.sh` (D-0169).
- Contracts are unchanged.
- Commits start `T-0481` and cite UF-11.2.

## Build / accept log
