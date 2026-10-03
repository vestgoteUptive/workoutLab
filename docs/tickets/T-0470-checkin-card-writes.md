---
id: T-0470
title: "UF-11.1 CheckinCard writes: insert the plan_checkins row when first shown online (23505 reads the existing row), Accept in the D-0070 §3 order, Keep current, never silent"
lane: web-feature:UF-11
screens: [UF-11.1]
decisions: [D-0018, D-0021, D-0061, D-0070, D-0158, D-0166, D-0168, D-0169, D-0172]
deps: [T-0308c]
status: ready
---
<!-- Re-groomed 2026-10-03 against main f83403e (T-0308c merged): ready. D-0172 §1 corrects
AC-1's completed_prev to null (the engine lists one period), §2 adds the cache refresh after the
insert and the answered-on-another-device case, §8 keeps parallel UF-11 tickets in their own
files. -->

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
    `completed_prev` = the `completed` of the entry before the last one in `evaluation.periods`,
    or `null` when there is none (always `null` with today's one-period engine, D-0172 §1). At most
    one insert per mount. After a successful insert, `refreshCheckins()` once (rejection ignored),
    so the next mount reads the row from the cache (D-0172 §2). Offline: no insert; it happens on
    the first render after `online`, without a remount.
  - **A second device** (D-0172 §2): a `23505` (unique `(user_id, period_index)`) selects the row
    for this `period_index`. `answer` null → the card stays, no write. `answer` set → the card
    hides and `refreshAll(now, tz)` runs once (rejection ignored). No alert and no `console.error`
    either way; a failed select keeps the card silently.
  - **User id:** `currentUserId()` from `lib/offline` (as `save-plan.ts` does); with none, no
    write at all. Writes go through `supabase` from `lib/auth/client.js`, never `lib/offline`.
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
- **A second device:** the 23505 path, unanswered and answered (AC-1b).
- **Zero history:** no proposal, so no insert (AC-1 contrast).
- **Returning after 10 days off:** several remounts over days never write without a tap (AC-4).

## Acceptance criteria
T-0308c's fixtures (P2 = 7, P3 = 3, rhythm 3–4, `now` 2026-09-27T12:00:00+02:00, Europe/Stockholm),
a supabase spy that records `from(table)` + method + payload in call order (the UF-11
`test-helpers.tsx` pattern). Each test title starts with `T-0470 AC-n`.

- **AC-1 (first-shown insert, red on main)** Online, the AC-1 card's first render (real engine)
  makes exactly one `plan_checkins` insert: `{period_index: 3, completed_last: 3, completed_prev:
  null, rhythm_min_before: 3, rhythm_max_before: 4, proposed_min: 2, proposed_max: 3, proposed_at:
  now, answer: null, answered_at: null}`, then `refreshCheckins` once. A re-render makes no second
  insert. Stubs: one listed period `{index: 0, completed: 0}` inserts `period_index: 0,
  completed_prev: null`; two listed periods (`{index: 2, completed: 4}`, `{index: 3, completed:
  1}`) insert `period_index: 3, completed_last: 1, completed_prev: 4`. With a cached row for
  period 3: no insert. Offline: no insert; dispatching `online` inserts once. No proposal: no
  insert. No user id: no insert. **Red:** on main T-0308c's card makes no write.
- **AC-1b (second device, D-0172 §2, both values)** The insert resolves `{error: {code:
  "23505"}}`: one select for `period_index` 3 follows. The select returns `answer: null` → the
  card and both buttons stay, no further write. The select returns `answer: "accepted"` → no
  `[data-part="checkin-card"]`, `refreshAll` once. In both cases no `role="alert"` and no
  `console.error` (spy).
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
- Notes on the extras: added keys only, appended at the end of `checkin: {…}` (D-0172 §8; T-0216
  appends to `account: {…}` in parallel). The failure line may reuse the existing top-level
  `saveFailed` ("Couldn't update your plan. Try again.") instead of a new key. This ticket file is
  for the build and accept logs.
- Read-only imports (not grants): `lib/offline` (`currentUserId`, `refreshAll`,
  `refreshCheckins`, `loadCheckins`), `lib/auth/client.js` (`supabase`).

## Contract impact
None. The writes use `plan_checkins`, `profiles` and `area_targets` exactly as in
`docs/data-model.md` (T-0223's one-period fields included).

## Definition of done
Tests for every AC pass, with the red run and the planted fault recorded · while working,
`scripts/locked.sh small npx vitest run <files>` · once before hand-back (D-0158, D-0169):
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`,
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check`,
`node .github/scripts/check-all.mjs`, and `scripts/locked.sh heavy` on the web `test:e2e` for
`uf-11-plan.spec.ts` · contracts unchanged · commits start `T-0470` and cite UF-11.1 (for example
`T-0470 UF-11.1: accept writes targets first`).

## Notes
- **Parallel.** UF-11 lane, after T-0308c, before T-0471. May run beside T-0216 and T-0469
  (D-0172 §8: separate strings blocks, separate helper files; none edits `index.tsx`). The card
  is still mounted nowhere, so no UF-02 file and no e2e change here.
- **Test helpers** (D-0172 §8): new helpers go in a new file of this ticket's own,
  `__tests__/checkin-writes-helpers.tsx`, which imports from the UF-11 `test-helpers.tsx` and
  `fixtures.ts` and leaves both files as they are.

## Build / accept log
Archived in `docs/tickets/log/T-0470.md` (D-0157).
