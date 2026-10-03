---
id: D-0168
title: "Groom defaults for the remaining phase-3 features (T-0304h, T-0303c, T-0302b, T-0310d, T-0308c, T-0216, T-0395): four splits by D-0157 §7, UF-08.3 replaces UF-08.2 in place, UF-02.2 renders Today's 45-min preview, equipment editing is a section on UF-11.4, no human needed for Resume"
status: revisit
date: 2026-10-03
by: product-owner (groom, phase 3 remaining features)
area: product
amends: D-0071 §7 (where the UF-08.3 mount renders), D-0061 §3 (where "Edit equipment" lives, made concrete)
builds-on: D-0157 §7, D-0158, D-0065 §5, D-0069 §7, D-0070, D-0079 §5, D-0109, D-0124, D-0136, D-0139, D-0142 §8, D-0166
---
## Context
Seven phase-3 board rows are left. Grooming them against `main` (2026-10-03, HEAD `4fa1f72`)
leaves these open points, each of which changes what a test asserts:
- **Size.** T-0304h (four heavy e2e rows), T-0310d (ten ACs incl. a download/delete e2e) and
  T-0308c (fourteen ACs: copy, writes, two mounts, e2e) are each above D-0157 §7's half day.
- **UF-08.3.** The parent T-0303 says "`?step=swap` renders `SwapSheet`" but not whether UF-08.2
  stays mounted under it. `SwapSheet` carries its own `data-screen-id="UF-05.1"`, so a sheet over
  UF-08.2 puts two screen ids in the DOM. The UF-09 host renders an overlay **in place of** the
  step (`host.tsx`, T-0304e). Nor does the parent say how Keep/Apply leave the history.
- **UF-02.2.** Which `Workout` the preview shows (a second `suggest` call or Today's), where the
  equipment labels come from (`en.uf04.equipment` and `en.uf05.equipment` already exist, T-0341
  tracks consolidating them), and how the rest length is chosen (no `restS` on `WorkoutItem`).
- **T-0216.** D-0061 §3 says "an Edit equipment checklist in account settings". UF-11.4 Account
  settings (D-0136) is the only account screen, and user flows v2 gives no screen ID for a
  separate editor. The board row puts it in lane UF-01, but UF-01 owns no screen after onboarding.
  "none" is one of the 10 vocabulary items, but the engine ignores it (`realEquipment`, D-0040 §1).
- **T-0395.** The board row still says "needs a user-flows v2 addition + decision". Both exist
  (D-0139; the "UF-02 Today" section in `Design-docs/docs/product/user-flows.md`).

## Decision
1. **T-0304h splits in two** (D-0157 §7).
   - T-0304h keeps reload (NFR-TIME-2), the keyboard + focus + targets + axe walk and
     "one screen at a time", in `tests/e2e/uf-09-focus.spec.ts`.
   - **T-0468** takes the 10-set offline workout (NFR-OFF-2) and two devices (NFR-SYNC-4), in a
     **new** spec `tests/e2e/uf-09-offline.spec.ts`, so the two never edit one file.
   - Each spec carries its own `startFromReady` helper (in-spec helpers, D-0071 §10). The
     duplication is accepted until a shared e2e helper exists (`tests/e2e/fixtures/**` is not
     granted to either).
   - Both are e2e on working code, so the red proof is a **planted fault** in `features/UF-09/**`
     on a backup copy (proof hygiene), recorded in the build log.
2. **UF-08.3 renders in place of UF-08.2** (amends D-0071 §7, which named the mount but not its
   position).
   - Each UF-08.2 item row (not the warm-up row) gets a button "Swap {name}". It PUSHes
     `/session/setup?step=swap&item={index}`.
   - At `?step=swap`, the setup host renders `SwapSheet` **instead of** UF-08.2, as the UF-09 host
     renders an overlay instead of its step: exactly one `[data-screen-id]` (`UF-05.1`).
   - `SwapSheet` is imported **statically** from `features/UF-05/index.js` (D-0071 §3). UF-08 has
     no seam registry and no chunk-retry machinery; `check:size` decides. D-0142 §8's "loaded on
     first open" stays a UF-09 seam rule.
   - `timeZone` = the setup host's mount-time zone (D-0107 §4), as T-0446 did for UF-09.
   - **Keep** (Close or Escape) and **Apply** both leave with a history back to the
     `?step=suggested` entry, so one browser Back from UF-08.2 afterwards lands on UF-08.1 and
     never re-opens the sheet. The browser Back while the sheet is open is the same as Keep.
   - Apply sets the setup host's current `Workout` to `onApply`'s argument and leaves the inputs
     record alone (D-0109 Consequences: a later chip, Remove or Shuffle re-suggests and drops it).
   - After Keep or Apply, focus goes to the "Swap" button of the same row index (UF-08.2 has
     re-mounted, so the sheet's own opener-restore can't find the old node).
   - A cold load of `?step=swap` shows UF-08.1, like every other step (D-0107 §1). With a
     `Workout` but an `item` that is missing, not an integer, or out of range, the host replaces
     the URL with `?step=suggested`.
   - "Always use this in <routine>" stays cut (D-0069 §7).
3. **UF-02.2 renders Today's 45-min preview.**
   - `/?view=preview` renders from the same `useToday` hook and `PREVIEW_INPUT` as the UF-02.1
     card, so for the same cache and clock it shows the same `Workout` (principle 3, D-0065 §1):
     one `suggest` call per mount, never a second input. The `features/UF-02/index.tsx` export
     `Today` becomes a small switch on `view`, so `Today.tsx` isn't edited (it stays free for
     T-0395). The heading carries the assumption: "Suggested for 45 min".
   - States mirror the card: loading → a skeleton; `workout` null or `plan.items` `[]` → "Nothing
     suggested yet" with Start still enabled; no profile → the same no-plan line as Today.
   - Rest per row = `REST_COMPOUND_S` for a library `type` `compound`, else `REST_ISOLATION_S`
     (the engine constants, as UF-09 `restFor` does), through `restLabel`.
   - The weight part copies UF-08.2 (D-0109 §4, D-0124): "Bodyweight" when the library says
     `externalLoad: false`; else `formatKg(prefill.weightKg)` when it isn't null; else nothing.
     A back-off reads like UF-08.2's back-off line.
   - Equipment labels are **read** from `en.uf04.equipment` (no edit to `flows/uf-04.ts`, no new
     copy); `none` is dropped, an unknown id prints raw (D-0079 §5). T-0341 repoints the read when
     it moves the labels.
   - C-02 stays visible (it is the `/` route). There is no Swap or Edit on UF-02.2 (swaps happen
     on UF-08.3).
4. **T-0310d splits in two.** T-0310d keeps the screen, route, link and unit ACs (AC-D1–D8,
   AC-D10). **T-0469** takes the AC-D9 e2e (`tests/e2e/uf-11-account.spec.ts`). AC-D10's
   "`git diff --name-only` lists only granted paths" is a build-log check, never a committed test
   (state.md trap; `check-lane-paths` enforces it).
5. **T-0308c splits in three.**
   - **T-0308c**: the `CheckinCard` component and its read side (evaluation, copy, preview,
     no-card cases, offline-disabled actions), exported from `features/UF-11/index.tsx` but
     **mounted nowhere**, so `main` never shows buttons that do nothing.
   - **T-0470**: the card's writes: the first-shown insert, Accept, Keep, never silent (D-0070
     §3–§4, D-0166).
   - **T-0471**: the mounts (top of UF-11.2; UF-02.1 via `todayCheckinSlot` only), the
     never-in-a-workout router test and the e2e.
6. **"Edit equipment" is a section on UF-11.4 Account settings** (D-0061 §3 made concrete; no new
   screen ID).
   - Lane `web-feature:UF-11`, after T-0310d (it edits `AccountSettings`).
   - The checklist shows the **9 real items** in the D-0064 §3 vocabulary order (dumbbell, bench,
     barbell, rack, cable, machine, pullup-bar, kettlebell, band), labelled from
     `en.uf04.equipment`. `none` is not a checkbox: it is always written, first.
     `profiles.equipment` = `["none", …checked in vocabulary order]`. Nothing checked is valid
     and equals the Bodyweight profile (`["none"]`).
   - Save is one online-only `profiles.update({equipment})` for this user, then `refreshAll`
     (the D-0070 §2 pattern). Save is disabled while the draft equals the stored list, while
     saving, and offline ("Connect to save"). A failure shows "Couldn't save your equipment.
     Try again." and keeps the draft.
   - An unknown stored item (not in the vocabulary) is kept on save, after the known ones, so an
     older or newer client never drops data.
   - UF-01.3 keeps its three profiles and gets no link (D-0064 Consequences stays a later option).
7. **T-0395 needs no human.** D-0139 is the default and user flows v2 already has the line. The
   ticket stays `ready`; only its coordination notes and DoD are refreshed (D-0158 gate).

## Consequences
- New tickets: T-0468, T-0469, T-0470, T-0471. Board (orchestrator): add their rows; move T-0216 to
  lane `web-feature:UF-11` with deps T-0310d; T-0308c's row text becomes "CheckinCard read side";
  T-0395's row text drops "needs a user-flows v2 addition + decision".
- File serialisation (nothing else conflicts):
  - `features/UF-02/Today.tsx` and `tests/e2e/uf-02-today.spec.ts`: T-0302b and T-0395.
  - `features/UF-02/slots.tsx`: T-0395 and T-0471.
  - `features/UF-11/index.tsx`, its exports pin and `PlanBody.tsx`: T-0310d, T-0308c, T-0471.
  - `features/UF-11/AccountSettings.tsx`: T-0310d, then T-0216, T-0469.
  - `features/UF-09/**`: T-0304h, T-0468 (test-only unless a row finds a bug).
  - `features/UF-08/**` and `tests/e2e/uf-08-setup.spec.ts`: T-0303c alone.
- Product follow-ups (product lane, not this groom's grant): add "Equipment" to the UF-11.4 line
  in `Design-docs/docs/product/user-flows.md`; the UF-11.1 line still says "two 14-day periods in
  a row", which D-0061 §2 changed to one.
- T-0341 now has two more readers of `en.uf04.equipment` (UF-02.2, UF-11.4).

## Revisit when
- A user reports losing their place when a swap sheet opens on UF-08 (§2: render over UF-08.2
  instead).
- The UF-08 chunk exceeds the `check:size` limit after T-0303c (§2: lazy-load like UF-09).
- UF-02.2 needs a budget of its own (§3), or account settings grows past one screen (§6: give the
  editor its own UF-11 screen ID in user flows v2).
