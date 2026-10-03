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

**2026-10-03, frontend-dev.** Confirmed the ticket text already carries both D-0172 groom fixes
before building: AC-1's `completed_prev: null` (D-0172 §1) and AC-1b's second-device/23505 case
with both answer values (D-0172 §2). Built `checkin-writes.ts` (`insertIfFirstShown`,
`acceptProposal`, `keepCurrent`) and wired `CheckinCard.tsx`'s two buttons and the first-shown
effect to it; added `__tests__/checkin-writes-helpers.tsx` (own file, D-0172 §8: `seedPeriods`
and a `createWritesSpy` with one-shot 23505/answer-row/gate controls that `test-helpers.tsx`'s
plain spy can't express) and `__tests__/checkin-writes.test.tsx`.

AC→test map (`checkin-writes.test.tsx`, each title starts "T-0470 AC-n"):
- AC-1 → `describe("T-0470 AC-1 first-shown insert")`, 7 cases (payload, one/two-period stubs,
  cached row, offline→online, no proposal, no user id).
- AC-1b → `describe("T-0470 AC-1b second device")`, 2 cases (unanswered stays, answered hides +
  refreshAll).
- AC-2 → `describe("T-0470 AC-2 Accept")`, 4 cases (order/payloads, step-1 fail, step-2 fail +
  retry, rejected refreshAll).
- AC-3 → `describe("T-0470 AC-3 Keep current")`, 2 cases.
- AC-4 → `describe("T-0470 AC-4 never silent")`, 5 fake-day mounts, one case.
- AC-5 → `describe("T-0470 AC-5 double tap")`, 2 cases (Accept, Keep).

Red-on-main proof: swapped `CheckinCard.tsx` for `git show HEAD:...` (pre-T-0470, read-only) and
ran `checkin-writes.test.tsx` — 14/18 failed (every AC-1.. AC-5 case that needs a write), 4 passed
(the no-proposal/no-user-id/cached-row negative cases, which assert "no insert" and are true on
main too). Restored the file from a backup copy (`cp`, not `git checkout`) afterwards.

Planted fault: swapped steps (1) and (2) in `acceptProposal` (area_targets upsert vs profiles
update) on a backup copy — AC-2's 3 order-dependent assertions failed as expected, the other 15
tests stayed green. Restored from the backup copy.

Also fixed along the way: `strings.test.ts`'s bare-literal scan caught `"profile"` (a type
indexed-access, not copy) and `"object"`/needed two new structural allowlist entries
(`"period_index"`, `"23505"`, D-0172 §2) — added with a comment, no existing entries reordered.
`checkin-card.test.tsx`'s old T-0308c AC-7 "no supabase.from call on Accept/Keep" assertion is
now false by design (this ticket adds those writes); removed that one assertion, kept its exports
check, noted why in a comment pointing at this ticket's own AC-2/AC-3/AC-5 coverage.

Gate: `scripts/locked.sh small npx vitest run apps/web/src/features/UF-11/` → 162/162 green
(after the fault/red-proof detours, re-verified green each time) · `scripts/locked.sh heavy npx
-y pnpm@10.28.2 --filter @workoutlab/web typecheck` and `lint` → clean · cached full gate
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1` → 19/19 tasks
successful, 3458 tests passed · `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w test:repo-checks`
→ 159/159 · `-w format:check` → clean (ran `prettier --write` once on the 4 new/changed files
first) · `node .github/scripts/check-all.mjs` → exit 0 · `scripts/locked.sh heavy npx -y
pnpm@10.28.2 --filter @workoutlab/web test:e2e uf-11-plan.spec.ts` → 10/10 passed (this spec
covers UF-11.2/.3 only; the card is still mounted nowhere per T-0471).

Status: done. No contract change. No new i18n keys (the failure line reuses
`en.uf11.saveFailed`, as the ticket allowed).

## Review

**2026-10-03, code-reviewer.** Approve.

- Lane: all 6 changed app files under `apps/web/src/features/UF-11/**`; `uf-11.ts` untouched (no
  new i18n keys needed, as logged). No contract diff (`git diff main...HEAD` on `api/openapi.yaml`,
  `docs/data-model.md`, `docs/engine-rules.md`, `tokens.json` is empty).
- `checkin-card.test.tsx`: the removed assertion ("Accept/Keep makes no supabase.from call") is a
  legitimate removal — its premise (no writes) is exactly what this ticket changes by design. The
  new behaviour is covered in `checkin-writes.test.tsx` AC-2/AC-3/AC-5. The exports check
  ("index.tsx exports exactly ...") is kept verbatim.
- Accept order in `checkin-writes.ts` (`acceptProposal`): area_targets upsert → profiles update →
  plan_checkins answer update, matching D-0070 §3 and reaffirmed unchanged by D-0166. The planted
  fault (swap steps 1/2) is genuinely caught: `checkin-writes.test.tsx`'s AC-2 `tablesInOrder()`
  assertion pins the exact call order, so a swap fails that assertion (and the per-call payload
  assertions tied to `spy.calls[0]`/`[1]`).
  AC-1's `completed_prev: null` and AC-1b's second-device/answered-row case both match D-0172 §1/§2
  verbatim.
- Second-device 23505 path (`selectAnsweredElsewhere` in `checkin-writes.ts`): a real
  conflict-resolution branch, not error-swallowing — it performs a genuine
  `.select("answer").eq("period_index", …)` and branches on the row's `answer`
  (null → card stays, no write; set → card hides + `refreshAll()` once), tested on both outcomes
  in AC-1b with no alert/`console.error` either way.
- `strings.test.ts`'s two new allowlist entries (`period_index`, `23505`) are structural: a DB
  filter column and Postgres' unique-violation code respectively, not user-visible copy. Appended
  with a comment, no reordering.
- Re-ran targeted suite: `scripts/locked.sh small npx pnpm --filter @workoutlab/web exec vitest run
  src/features/UF-11/__tests__/checkin-writes.test.tsx
  src/features/UF-11/__tests__/checkin-card.test.tsx src/features/UF-11/__tests__/strings.test.ts`
  → 3 files, 43/43 passed.

No findings. Verdict: **approve**.

## QA

**2026-10-03, qa.** Done.

- Verified all 6 ACs with real tests, not just reading the build log: reproduced the builder's
  red-on-main (14/18 failing against the pre-T-0470 `CheckinCard.tsx`) and the AC-2 order planted
  fault (steps 1/2 swapped) exactly as logged.
- Added an independent planted fault: inverted the second-device branch logic in
  `selectAnsweredElsewhere` (null-answer and set-answer outcomes swapped). AC-1b's two assertions
  (unanswered → card stays/no write; answered → card hides + `refreshAll` once) caught it cleanly.
- `uf-11-plan.spec.ts` e2e: 10/10 passed. Covers UF-11.2/.3 only, not CheckinCard writes
  themselves — expected, since the card is mounted nowhere yet (T-0471).
- Branch state: 8 commits behind `main`, zero file overlap; `git merge-tree` confirms a clean
  merge. Correctly left unmerged per D-0169 §2 (orchestrator merges after accept).

No findings. Verdict: **done**.

## Accept

**2026-10-03, product-owner.** Done.

- All 6 ACs (AC-1, AC-1b, AC-2, AC-3, AC-4, AC-5) have passing tests with a clear AC→test map
  (`describe("T-0470 AC-n ...")` per build log), independently confirmed present in
  `checkin-writes.test.tsx`.
- Read `checkin-writes.ts`: the first-shown insert payload (including `completed_prev: null`,
  D-0172 §1), the 23505 second-device fallback (`selectAnsweredElsewhere`: null answer → card
  stays silently; set answer → `refreshAll` once, no alert/`console.error` either way, D-0172 §2),
  and the Accept order (`area_targets` upsert → `profiles` update → `plan_checkins` answer update,
  each gated on the previous step's success, D-0070 §3) all match the ticket text and the review
  findings verbatim.
- Red-on-main and both planted faults (builder's AC-2 order swap, QA's independent AC-1b branch
  inversion) are recorded and were genuinely caught, not just asserted.
- Contracts unchanged (confirmed by builder and reviewer's empty `git diff` on the 4 contract
  files); no contract-change proposal needed.
- Full gate, repo-checks, format:check and `check-all.mjs` all green per the build log; this is a
  half-day-scoped ticket per its own estimate and D-0157 §7, so no split was needed.
- Branch 8 commits behind `main` with zero file overlap (merge-tree clean) is expected under
  D-0169 §2 — the orchestrator merges after accept, not this role.
- `uf-11-plan.spec.ts` not covering the CheckinCard mount itself is correctly out of scope here;
  T-0471 (mounting) is the next ticket in this lane per the ticket's own Notes section.

Verdict: **done**. All ACs have passing tests, no contract drift, no principle violated.
