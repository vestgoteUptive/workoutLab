---
id: T-0633
title: "UF-11.4 \"Bar and plates\" section: bar weight input (0–50 kg) and plate checkboxes 25…0.5 kg, Save through profiles.update + refreshAll, disabled offline with \"Connect to save\""
lane: web-feature:UF-11
screens: [UF-11.4]
decisions: [D-0217, D-0218, D-0136, D-0195, D-0210]
deps: [T-0613, T-0632]
status: todo
---
<!-- Written by product-owner 2026-10-09 (spec, D-0217 §1). Flow: wl-build-web (agent frontend-dev). About ½ day (mirrors EquipmentSection.tsx). Spec: docs/specs/cobalt-mock-behaviour.md §3.1 "Settings". Runs after the UF-11.4 restyle (T-0613), in the Cobalt paper/plan look. -->

## Why
The plate line on UF-09.3 is only right when it knows the user's bar and plates. The defaults (20 kg bar, 25…1.25 kg plates) fit most gyms; this section lets the rest change them. It sits next to the equipment section on UF-11.4, because both describe the user's gym.

## Scope
- **In:**
  - `features/UF-11/BarPlatesSection.tsx`, rendered directly under the equipment section on UF-11.4, built like `EquipmentSection.tsx` (a `wl-card` with a fieldset, C-03 checkboxes, its own Save).
  - Legend "Bar and plates"; hint "Shown during a set as the plates to load on each side. You have pairs of every plate you tick."
  - "Bar weight (kg)": text input, `inputmode="decimal"`, pre-filled from `loadBarbell().barKg`; parses a comma or a point with up to 2 decimals; valid range 0–50. Invalid → Save disabled and "Enter a bar weight from 0 to 50 kg." under the input (`aria-describedby`, `aria-invalid`).
  - Plate checkboxes, largest first: 25, 20, 15, 10, 5, 2.5, 1.25, 0.5, labelled "{n} kg". Checked from `platesKg`. A stored size outside this list is one more checked box in size order, kept on save unless unticked.
  - Save: `supabase.from("profiles").update({ bar_kg, plates_kg }).eq("user_id", uid)`, then `refreshAll` (a failed re-read doesn't block "Saved"). Plates are saved largest first.
  - Copy in `flows/uf-11.ts` under `account.barPlates`: `legend`, `hint`, `barLabel`, `barInvalid`, `plate(n)`, `save` "Save", `saving` "Saving", `saved` "Saved", `connectToSave` "Connect to save", `saveFailed` "Couldn't save your bar and plates. Try again.", `coldCache` "Your bar and plates aren't on this device yet."
  - Save is enabled only when the values differ from the stored ones, are valid, and the device is online.
- **Out:** a count per plate size, more than one bar, lb (D-0218 "Revisit when").

## Acceptance criteria
- **AC1 (pre-fill).** Given a cached barbell `{ barKg: 15, platesKg: [20, 10, 0.75] }`, When UF-11.4 renders, Then the input reads "15", the 20 and 10 kg boxes are checked, the others aren't, and a checked "0.75 kg" box sits between "1.25 kg" and "0.5 kg".
- **AC2 (defaults).** Given no cached barbell, Then the input reads "20" and 25, 20, 15, 10, 5, 2.5 and 1.25 kg are checked, 0.5 kg isn't.
- **AC3 (save).** Given online, When the user types "17,5", unticks 25 kg and taps Save, Then exactly one `profiles` update is sent with `{ bar_kg: 17.5, plates_kg: [20, 15, 10, 5, 2.5, 1.25] }` for this user, the button shows "Saving" during it, then "Saved", and `refreshAll` ran once.
- **AC4 (unknown size kept).** With AC1's cache, saving after changing only the bar sends `plates_kg: [20, 10, 0.75]`.
- **AC5 (validation).** "51", "-1", "abc", "" and "20.555" each disable Save and show "Enter a bar weight from 0 to 50 kg."; "0" and "50" are valid. Each is a case.
- **AC6 (unchanged).** With values equal to the stored ones, Save is disabled; changing and changing back disables it again.
- **AC7 (failure).** A rejected update shows "Couldn't save your bar and plates. Try again." and keeps the edited values; a second Save retries.
- **AC8 (offline).** Offline, the input and boxes are readable, Save is disabled and "Connect to save" is its description. Going online enables it (both values tested).
- **AC9 (cold cache).** Signed in with no cached profile at all, the section shows "Your bar and plates aren't on this device yet." and no Save.
- **AC10 (a11y).** Axe reports 0 violations with and without the invalid message; every box has its "{n} kg" accessible name; the fieldset is named "Bar and plates".
- **AC11 (e2e).** In `uf-11-account.spec.ts`, a seeded profile, change bar to 15 and save: the mocked PATCH body carries `bar_kg: 15`, and a reload shows "15".
- **AC12 (no regressions).** The equipment section's tests pass unchanged.

Checklist (D-0197 §7):
- Online and offline, cached and cold, valid and invalid, changed and unchanged, and save succeeded and failed are all covered.

## Paths you may change
- `apps/web/src/features/UF-11/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-11.ts` (own flow file)
- `tests/e2e/uf-11-account.spec.ts` (listed extra)
- `docs/tickets/T-0633-uf11-bar-and-plates-settings.md` (log only)

## Contract impact
none (writes the D-0218 columns through the existing `profiles_update` policy)

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `uf-11-account.spec.ts` green · commit messages start with `T-0633` and cite UF-11.4.

## Build / accept log
