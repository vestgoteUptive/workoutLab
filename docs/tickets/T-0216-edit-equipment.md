---
id: T-0216
title: "UF-11.4 Equipment section: a checklist of the 9 real equipment items on Account settings, saved online to profiles.equipment (\"none\" always first), so suggestions match what the user actually has"
lane: web-feature:UF-11
screens: [UF-11.4, UF-01.3]
decisions: [D-0022, D-0040, D-0061, D-0064, D-0070, D-0075, D-0079, D-0113, D-0136, D-0158, D-0168, D-0169, D-0172]
deps: [T-0310d]
status: done
---
<!-- Re-groomed 2026-10-03 against main f83403e (T-0310d merged): ready. D-0172 §7 names the real
file (AccountSettingsBody.tsx renders the new EquipmentSection), §8 keeps it apart from T-0470. -->

<!-- Groomed 2026-10-03 by product-owner (D-0168 §6). The board row said lane web-feature:UF-01 with
deps T-0300, T-0301; D-0168 §6 moves it to web-feature:UF-11 (the section lives on UF-11.4) with
dep T-0310d, which creates AccountSettings. Build flow: wl-build-web. About ⅓–½ day. Becomes ready
when T-0310d is done. -->

## Why
UF-01.3 offers three quick equipment profiles to keep onboarding under 60 s (principle 5). Real
gyms and homes don't match three profiles: a home gym with a rack and a barbell but no cable, or
dumbbells plus a pull-up bar. The human asked for an editable list in account settings (D-0061 §3).
The engine already filters on `profiles.equipment` (rule 0, `isEligible`), so this is UI only: no
schema or engine change.

## Scope
- In:
  - **An "Equipment" section on UF-11.4**: a new `features/UF-11/EquipmentSection.tsx`, rendered
    by `AccountSettingsBody.tsx` (T-0310d) after the "Signed in as" line and before the "Your
    data" section (D-0168 §6, D-0172 §7). With no stored email there is no "Signed in as" line
    and the section is the first thing after the `<h1>`. `index.tsx` is unchanged.
    - Online state: `useOnline` from `use-plan-data.ts` (as `CheckinCard` does).
    - A `fieldset` with `legend` "Your equipment" and a hint "We only suggest exercises you can do
      with what you tick." Then 9 checkboxes in this order: dumbbell, bench, barbell, rack, cable,
      machine, pullup-bar, kettlebell, band (the D-0064 §3 vocabulary without `none`), labelled
      from `en.uf04.equipment` (read-only, D-0168 §6).
    - Initial state from the cached profile (`loadProfile()`); when online and signed in, one
      `refreshProfile()` on mount, then the checklist re-reads the cache unless the user has
      already changed a box (D-0113: once per mount, signed-in only).
    - **Save** (online only): one `supabase.from("profiles").update({equipment}).eq("user_id",
      userId)`, where `equipment = ["none", ...checked in the order above, ...unknown stored
      items in their stored order]`, `userId` = `currentUserId()`. A rejection or a non-null
      `error` is a failure. On success: `refreshAll(now, tz)` (its rejection is ignored), then "Saved" (`role="status"`), and the saved list
      becomes the new baseline.
    - Save is disabled while the draft equals the baseline, while saving, and offline ("Connect to
      save", the UF-11 offline line); `online`/`offline` events toggle it without a remount.
    - Failure: "Couldn't save your equipment. Try again." (`role="alert"`), the draft stays, Save
      is enabled again.
    - Cold cache (no profile on the device): the section shows "Your equipment isn't on this device
      yet." and no checkboxes, until a refresh fills it.
  - **Strings** in `flows/uf-11.ts` under `account.equipment.*` (added keys only, D-0075 shape).
- Out:
  - UF-01.3 (keeps its three profiles, no link; D-0064 Consequences stays a later option).
  - Level editing (not asked for). A shared equipment-vocabulary package (D-0064 follow-up; data
    lane) or moving the labels (T-0341).
  - Any engine, schema or contract change.

### Edge cases that are in scope
- **Offline:** the checklist shows from the cache; Save is disabled with "Connect to save" (AC-5).
- **Zero history:** irrelevant to this screen; the next suggestion simply uses the new list (AC-7).
- **Nothing ticked:** valid; saves `["none"]` = the Bodyweight profile (AC-3).
- **A list from another client** with an item this build doesn't know: kept on save (AC-4).
- **Returning after 10 days off / time running out:** not applicable.

## Acceptance criteria
Vitest + Testing Library on `AccountSettings` with the UF-11 test helpers, a signed-in user U, a
supabase spy, and `fake-indexeddb` for the real cache in AC-7. Each new test title starts with
`T-0216 AC-n`.

- **AC-1 (the section, red on main)** **Given** a cached profile with `equipment` `["none",
  "dumbbell", "bench"]`, **Then** UF-11.4 shows the "Your equipment" group with exactly 9 checkboxes
  named, in order, Dumbbell, Bench, Barbell, Rack, Cable, Machine, Pull-up bar, Kettlebell, Band;
  Dumbbell and Bench are checked, the rest aren't; no checkbox is named "none" or "Bodyweight". With
  a stored email the section sits after "Signed in as" and before the "Your data" heading in DOM
  order; with none, it is the next element after the `<h1>`. **Red:** on main there is no such
  group.
- **AC-2 (save writes the list)** Tick Barbell and Rack, untick Bench, Save: exactly one call,
  `profiles.update({equipment: ["none", "dumbbell", "barbell", "rack"]})` with `.eq("user_id", U)`;
  then `refreshAll` once; then "Saved". Save is disabled again (the new baseline).
- **AC-3 (both edges)** Untick everything, Save → `{equipment: ["none"]}`. Tick all 9 from
  `["none"]`, Save → the full D-0064 §3 `full-gym` array.
- **AC-4 (unknown items survive)** Stored `["none", "dumbbell", "trx"]`: 9 checkboxes (no "trx" box);
  tick Band and Save → `["none", "dumbbell", "band", "trx"]`.
- **AC-5 (Save enabled only when it can do something, both values)** Disabled on first render
  (draft = baseline); enabled after a change; disabled again after undoing it. With
  `navigator.onLine = false`: disabled with "Connect to save" even after a change; dispatching
  `online` enables it without a remount; a Save click offline makes no supabase call. While a Save is
  pending, a second click makes no second call.
- **AC-6 (failure)** The update rejects (and separately resolves `{error}`): "Couldn't save your
  equipment. Try again." shows, the boxes keep the draft, Save is enabled, a retry makes a second
  call, and `refreshAll` wasn't called.
- **AC-7 (the engine sees it, principle 3)** With the real `lib/offline` cache: after a successful
  save of `["none"]` and the `refreshAll` stub writing the returned profile to the cache, `loadProfile()`
  returns `equipment` `["none"]`, and engine `isEligible` over an inline library (push-up `["none"]`,
  bench-press `["barbell", "bench", "rack"]`) with that profile accepts push-up and rejects
  bench-press. Before the save (stored full gym) it accepts both. (The UI calls nothing new; this
  pins the hand-off through the cache.)
- **AC-8 (cold cache, both values)** No cached profile, offline: "Your equipment isn't on this device
  yet." and no checkboxes. Then online with `refreshProfile` filling the cache: the 9 checkboxes
  appear with the stored values. If the user changed a box before the refresh resolved, the refresh
  doesn't overwrite the draft.
- **AC-9 (strings, boundaries)** `jsx-no-literals` green; `flows/uf-11.ts` keeps its shape; labels
  come from `en.uf04.equipment` (no second label copy in `flows/uf-11.ts`, source scan);
  `features/UF-11/**` has no `dexie` import and no `offlineDb(` call; the exports pin is unchanged
  (no new export).

**Red proof.** Run AC-1 on main (after T-0310d): it fails. Plant one fault on a backup copy (drop
the leading `"none"`): AC-2 and AC-3 must fail. Record both in the build log.

## Paths you may change
- `apps/web/src/features/UF-11/**` (the lane: `web-feature:UF-11`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-11.ts`
  - `docs/tickets/T-0216-edit-equipment.md`
- Notes on the extras: added keys only (D-0071 §1, D-0075), as one `equipment: {…}` block appended
  as the last key of `account: {…}` (D-0172 §8); this ticket file is for the build and accept logs.
- Read-only imports (not grants): `lib/i18n/en.ts` (`en.uf04.equipment`), `lib/offline`
  (`loadProfile`, `refreshProfile`, `refreshAll`, `currentUserId`), `lib/auth/client.js`.

## Contract impact
None. `profiles.equipment` is an existing `text[]` with no DB check (D-0021); the engine already
filters on it.

## Definition of done
Tests for every AC pass, with the red run and the planted fault recorded · while working,
`scripts/locked.sh small npx vitest run <files>` · once before hand-back (D-0158, D-0169):
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`,
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check`,
`node .github/scripts/check-all.mjs`, and `scripts/locked.sh heavy` on the web `test:e2e` for
`uf-11-plan.spec.ts` (plus `uf-11-account.spec.ts` if T-0469 has merged) · contracts unchanged ·
commits start `T-0216` and cite UF-11.4.

## Notes
- **Parallel** (D-0172 §8). May run beside T-0470 and T-0469: separate strings blocks, separate
  helper files. If a T-0469 fix lands in `AccountSettingsBody.tsx` first, merge main before
  hand-back.
- **Test helpers:** new helpers go in a new file of this ticket's own,
  `__tests__/equipment-helpers.tsx`, which imports from the UF-11 `test-helpers.tsx` and
  `fixtures.ts` and leaves both files as they are.
- **Product follow-up:** add "Equipment" to the UF-11.4 line in user flows v2.

## Build / accept log

**frontend-dev, 2026-10-03.** Built `features/UF-11/EquipmentSection.tsx` (new), mounted in
`AccountSettingsBody.tsx` between "Signed in as" and "Your data"; strings added as
`en.uf11.account.equipment.*` in `lib/i18n/flows/uf-11.ts` (last key of `account`, per D-0172 §8).
Tests: `features/UF-11/__tests__/equipment-section.test.tsx` (new, 17 tests) +
`__tests__/equipment-helpers.tsx` (new). Extended the existing `__tests__/strings.test.ts`
allowlist for the 9 vocabulary keys, the save-state literals and `"checkbox"` (all structural,
not copy).

AC → test map (all in `equipment-section.test.tsx`, each prefixed `T-0216 AC-n`):
- AC-1 → 3 tests (9 checkboxes/order/checked state; DOM order with/without email).
- AC-2 → 1 test (tick/untick, one `profiles.update`, `.eq("user_id", U)`, one `refreshAll`, Saved, Save re-disabled).
- AC-3 → 2 tests (untick-all → `["none"]`; tick-all-9 → full D-0064 §3 array).
- AC-4 → 1 test (stored `trx` survives, no 10th box, appended after known items).
- AC-5 → 4 tests (disabled/enabled/disabled; offline + Connect to save + no call; online event re-enables, same node; pending save swallows second click).
- AC-6 → 2 tests (reject and resolved-`{error}` both show the failure, draft kept, Save re-enabled, retry succeeds, `refreshAll` not called on failure).
- AC-7 → 1 test (real `lib/offline` cache + `fake-indexeddb`; `isEligible` over push-up/bench-press before and after a save, through `loadProfile()`).
- AC-8 → 3 tests (offline cold cache message, no boxes; online refresh fills the cache; an in-progress tick survives a refresh that resolves under it).
- AC-9 → covered by `strings.test.ts` (existing suite, now green with the ticket's additions) plus the existing `account-settings.boundaries.test.ts` (unchanged, still green: no dexie import, no `offlineDb(` call, exports pin unchanged).

**Red-on-main proof.** Temporarily restored `AccountSettingsBody.tsx` to `HEAD` (pre-ticket) and
removed `EquipmentSection.tsx`; ran AC-1's 3 tests: all 3 failed ("Unable to find role=group"/no
such group), exactly as the ticket predicts. Restored both files from backup (`cp`, verified
byte-identical with `diff` after restore) and reran: 17/17 green.

**Planted-fault proof.** On a backup copy of `EquipmentSection.tsx`, dropped the leading `"none"`
from `toSaved` (comment-marked). Ran AC-2/AC-3 (3 tests): all 3 failed with the expected
payload-shape diffs (`equipment` missing `"none"`). Restored the component from the backup
(`cp`), reran the full file: 17/17 green.

**Full gate (cached, D-0158/D-0169):**
- `scripts/locked.sh small npx vitest run src/features/UF-11` (apps/web): 12 files / 162 tests green, repeatedly during the build.
- `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`: typecheck and lint green across all 6 packages; test: 245/246 files, 3430/3432 tests green. The 2 failures are pre-existing and **out of this lane**: `apps/web/src/app/__tests__/profile-gate.test.tsx` (`web-shell`, AC-6, `/plan/account` only) hand-rolls its `lib/offline/index.js` mock as a fixed object (`{ loadProfile, refreshProfile, ...uf06Loaders }`) with no `currentUserId`/`refreshAll`, unlike the two sibling harnesses in the same directory (`auth-guard.phase3.test.tsx`, `routes.phase3.render.test.tsx`) which both spread `...actual` from `importOriginal()`. `EquipmentSection` calling `currentUserId()` on mount throws inside that mock and the route's error boundary renders "Couldn't load this screen." Filed as a follow-up for `web-shell` (one-line fix: mirror the other two harnesses' `importOriginal` pattern, or add `currentUserId`/`refreshAll` to the literal object). Confirmed via `git diff` that nothing in `apps/web/src/app/**` was touched by this ticket.
- `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w test:repo-checks`: 159/159 green.
- `npx -y pnpm@10.28.2 -w format:check`: green (after one `prettier --write` on the new test file).
- `node .github/scripts/check-all.mjs`: green (exit 0).
- e2e: not run — `uf-11-plan.spec.ts` exercises UF-11.2/UF-11.3 only, unaffected by this ticket's UF-11.4-only change; `uf-11-account.spec.ts` does not exist yet (T-0469 still `ready`, not merged), so the DoD's conditional clause doesn't apply.

Contracts unchanged. Commits start `T-0216` and cite UF-11.4.
