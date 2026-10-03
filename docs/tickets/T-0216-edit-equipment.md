---
id: T-0216
title: "UF-11.4 Equipment section: a checklist of the 9 real equipment items on Account settings, saved online to profiles.equipment (\"none\" always first), so suggestions match what the user actually has"
lane: web-feature:UF-11
screens: [UF-11.4, UF-01.3]
decisions: [D-0022, D-0040, D-0061, D-0064, D-0070, D-0075, D-0079, D-0113, D-0136, D-0158, D-0168]
deps: [T-0310d]
status: todo
---
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
  - **An "Equipment" section on UF-11.4** (`AccountSettings`, T-0310d), after "Signed in as" and
    before "Your data" (D-0168 §6). For example `EquipmentSection.tsx` in `features/UF-11`.
    - A `fieldset` with `legend` "Your equipment" and a hint "We only suggest exercises you can do
      with what you tick." Then 9 checkboxes in this order: dumbbell, bench, barbell, rack, cable,
      machine, pullup-bar, kettlebell, band (the D-0064 §3 vocabulary without `none`), labelled
      from `en.uf04.equipment` (read-only, D-0168 §6).
    - Initial state from the cached profile (`loadProfile()`); when online and signed in, one
      `refreshProfile()` on mount, then the checklist re-reads the cache unless the user has
      already changed a box (D-0113: once per mount, signed-in only).
    - **Save** (online only): one `supabase.from("profiles").update({equipment}).eq("user_id",
      userId)`, where `equipment = ["none", ...checked in the order above, ...unknown stored
      items in their stored order]`. A rejection or a non-null `error` is a failure. On success:
      `refreshAll()` (its rejection is ignored), then "Saved" (`role="status"`), and the saved list
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
  Dumbbell and Bench are checked, the rest aren't; no checkbox is named "none" or "Bodyweight". The
  section sits after "Signed in as" and before "Your data" in DOM order. **Red:** on main (after
  T-0310d) there is no such group.
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
- Notes on the extras: added keys only (D-0071 §1, D-0075); this ticket file is for the build and
  accept logs.
- Read-only imports (not grants): `lib/i18n/en.ts` (`en.uf04.equipment`), `lib/offline`
  (`loadProfile`, `refreshProfile`, `refreshAll`, `currentUserId`), `lib/auth/client.js`.

## Contract impact
None. `profiles.equipment` is an existing `text[]` with no DB check (D-0021); the engine already
filters on it.

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`,
`-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` green, each test
command inside `flock /tmp/workoutlab-tests.lock` · `uf-11-account.spec.ts` (if T-0469 has merged)
and `uf-11-plan.spec.ts` green · contracts unchanged · commits start `T-0216` and cite UF-11.4.

## Notes
- **Board (orchestrator):** lane → `web-feature:UF-11`, deps → `T-0310d`.
- **Parallel.** After T-0310d. Not beside T-0469 if that one is fixing `AccountSettings.tsx`; not
  beside T-0308c/T-0470/T-0471 only if they touch the same file (they normally don't: the card isn't
  on UF-11.4). Parallel-safe with every non-UF-11 ticket.
- **Product follow-up:** add "Equipment" to the UF-11.4 line in user flows v2.

## Build / accept log
