---
id: T-0470
title: "UF-11.1 CheckinCard writes: insert the plan_checkins row when first shown online (23505 reads the existing row), Accept in the D-0070 §3 order, Keep current, never silent"
lane: web-feature:UF-11
screens: [UF-11.1]
decisions: [D-0018, D-0021, D-0061, D-0070, D-0158, D-0166, D-0168]
deps: [T-0308c]
status: todo
---
<!-- Written by product-owner 2026-10-03 (groom, D-0168 §5). Second child of the T-0308c board row.
Parent: docs/tickets/T-0308-routines-plan-checkin.md AC-C7–C10. Build flow: wl-build-web. About ½
day. Becomes ready when T-0308c is done. The card is still mounted nowhere (T-0471). -->

## Why
A proposal must be recorded when it is shown (so analytics can count shown vs answered, and a
second device doesn't duplicate it), and only the user's tap may change the plan (principle 4:
never silently). Accept writes the engine's targets first, then the rhythm, then the answer, so a
partial failure never records an answer for a plan that didn't change (D-0070 §3, D-0166).

## Scope
- In (all inside `features/UF-11`, for example `checkin-writes.ts` + `CheckinCard.tsx`):
  - **First-shown insert** (D-0070 §4, T-0223): when the card first renders online with a proposal
    and the cached `plan_checkins` has no row for the last period's `index`, insert one:
    `{period_index, completed_last, completed_prev, rhythm_min_before, rhythm_max_before,
    proposed_min, proposed_max, proposed_at: now, answer: null, answered_at: null}`, with
    `completed_prev` = the previous listed period's `completed`, or `null` when only one period is
    listed. At most one insert per mount. A `23505` (unique `(user_id, period_index)`) reads the
    existing row and shows no error. Offline: no insert; it happens on the first render after
    `online`, without a remount.
  - **Accept** (online only): (1) upsert the 9 `area_targets` `{area_id, sets_per_14d:
    proposal.previewTargets[area], source: "adapted"}` `onConflict: "user_id,area_id"`; (2) update
    `profiles` `rhythm_min`/`rhythm_max` to the proposal for this user; (3) update the row for this
    `period_index` to `answer: "accepted"`, `answered_at: now`. Each only after the previous one
    succeeded (a rejection **or** a non-null `error`, as `save-plan.ts` does). Then `refreshAll()`;
    the card hides as soon as (3) succeeds, even if `refreshAll` rejects.
  - **Keep current**: update the row to `answer: "kept"`, `answered_at: now`; then `refreshAll()`;
    the card hides.
  - **Failure** of any step: "Couldn't update your plan. Try again." (`role="alert"`), the card and
    both buttons stay, a retry re-runs from step (1) (D-0166 §3).
  - **Double taps:** while a write runs, both buttons are disabled and a second tap makes no call.
- Out: the mounts and e2e (T-0471); a transactional write (D-0166); any contract change.

### Edge cases that are in scope
- **Offline:** no insert and no write offline; the insert runs on reconnect (AC-1).
- **A second device:** the 23505 path (AC-1).
- **Zero history:** no proposal, so no insert (AC-1 contrast).
- **Returning after 10 days off:** several remounts over days never write without a tap (AC-4).

## Acceptance criteria
T-0308c's fixtures (P2 = 7, P3 = 3, rhythm 3–4, `now` 2026-09-27T12:00:00+02:00, Europe/Stockholm),
a supabase spy that records `from(table)` + method + payload in call order (the UF-11
`test-helpers.tsx` pattern). Each test title starts with `T-0470 AC-n`.

- **AC-1 (first-shown insert, red on main)** Online, the AC-1 card's first render makes exactly one
  `plan_checkins` insert: `{period_index: 3, completed_last: 3, completed_prev: 7,
  rhythm_min_before: 3, rhythm_max_before: 4, proposed_min: 2, proposed_max: 3, proposed_at: now,
  answer: null, answered_at: null}`. A re-render makes no second insert. A stub with one listed
  period `{index: 0, completed: 0}` inserts `period_index: 0, completed_prev: null`. With a cached
  row for period 3: no insert. A `23505` response: a select for `period_index` 3, no alert, no
  `console.error`. Offline: no insert; dispatching `online` inserts once. No proposal: no insert.
  **Red:** on main T-0308c's card makes no write.
- **AC-2 (Accept, D-0070 §3)** Accept makes, in this order: the 9-row `area_targets` upsert (values
  from `previewTargets`, `source "adapted"`), the `profiles` update `{rhythm_min: 2, rhythm_max: 3}`,
  the row update `{answer: "accepted", answered_at: now}` for `period_index` 3; then `refreshAll`
  once; then no `[data-part="checkin-card"]`. If (1) rejects: (2) and (3) aren't called, the alert
  shows, the card stays. If (2) resolves `{error}`: (3) isn't called; a retry starts again at (1).
  If `refreshAll` rejects, the card is still gone.
- **AC-3 (Keep current)** Keep makes exactly one write, the row update `{answer: "kept",
  answered_at: now}`; no `profiles` or `area_targets` call; `refreshAll` once; the card is gone. A
  failed Keep shows the alert and keeps the card.
- **AC-4 (never silent, principle 4)** With the AC-1 proposal pending and its row cached, 5 mounts
  on 5 fake days (27 Sep–1 Oct) make no `profiles` or `area_targets` write and show the card each
  time.
- **AC-5 (double tap)** A second Accept (or Keep) tap while the first is pending makes no second
  call; both buttons are `disabled` while pending.

**Red proof.** Run AC-1 on main (or on T-0308c's merge) before the change: it fails. Plant one
fault on a backup copy (swap steps (1) and (2)): AC-2's order assert must fail. Record both.

## Paths you may change
- `apps/web/src/features/UF-11/**` (the lane: `web-feature:UF-11`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-11.ts`
  - `docs/tickets/T-0470-checkin-card-writes.md`
- Notes on the extras: added keys only, for the error line if T-0308c didn't add it; this ticket
  file is for the build and accept logs.

## Contract impact
None. The writes use `plan_checkins`, `profiles` and `area_targets` exactly as in
`docs/data-model.md` (T-0223's one-period fields included).

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`,
`-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` green, each test
command inside `flock /tmp/workoutlab-tests.lock` · `uf-11-plan.spec.ts` green · contracts
unchanged · commits start `T-0470` and cite UF-11.1 (for example `T-0470 UF-11.1: accept writes
targets first`).

## Notes
- **Parallel.** UF-11 lane, after T-0308c, before T-0471. Not beside T-0310d or T-0216 if either is
  editing `index.tsx`; otherwise no shared file.

## Build / accept log
