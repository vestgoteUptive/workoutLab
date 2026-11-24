# Learn from edits — spec (UF-08, UF-11)

- **Idea:** the owner, 2026-11-24, layer 1 of three, chosen second: repeated swaps become preferences ("Prefer dumbbell press for chest?"), removals become "never suggest X", and a per-session "busy / don't have it today" toggle. Built **after** `docs/specs/areas-first-planning.md`.
- **Screens:** UF-08.2 (a prompt card), UF-08.6 ("Not today" is specified in the layer 3 spec; the count hooks live here), UF-08.3 and UF-05.1 (count only, no new control), UF-11.4 (a "Learning" section), UF-11.5 and UF-11.6 (unchanged lists, where a learned preference is seen and undone).
- **Decisions:** D-0277 (what is counted, thresholds, prompts, reuse), D-0278 (storage, privacy, the one new column), D-0279 (phasing; tickets T-1000 to T-1006). Builds on D-0199 (excluded exercises), D-0202 (favorites), D-0191 (visit-only removes and skipped areas), D-0235 (swap pins), D-0195 (sign-out clears the device), NFR-PRIV-4 and NFR-PRIV-5 (export, delete).
- **Status:** `todo`, phase 2. It starts after the layer 3 UF-08 tickets are done.

## Problem
Today the same swap is made at every workout: the engine suggests bench press, the user swaps it for dumbbell press, again next week. The app already has the tools to stop that (a favorite is tried first, an excluded exercise is never suggested), but the user must go to UF-04.2 and think of it. The app can notice the pattern and ask once.

## What already exists (and is reused, nothing is invented)
| Need | Existing mechanism | Used as |
|---|---|---|
| "Prefer X" | **Favorites** (`favorite_exercises`, `sessionInput.favoriteIds`, rule 0.2, D-0202): a favorite is ranked first in every area where it has weight 1.0, never forced, never past recovery, equipment, level or time | An accepted swap prompt adds the swap-in as a favorite |
| "Never suggest X" | **Excluded exercises** (`excluded_exercises`, `excludeIds`, rule 0.1, D-0199), with the mutual exclusion against favorites | An accepted removal prompt adds the exercise to the list |
| "Not today" | The visit-only `excludeIds` of a Remove (D-0191 §4) and the swap-in pin (D-0235) | "Not today" uses `rankSwaps(…, equipment_taken)` and `applySwap`, and puts the original in the visit's excludes. Nothing is written |
| Visible and reversible | UF-11.6 and UF-11.5 lists, UF-04.2 toggles | A learned preference is an ordinary favorite or exclusion, so it is already listed and removable |
| Export and delete | `export.ts` and the D-0017 delete list already cover both tables | No change |
| Skip an area | `avoidAreas` (UF-08.1 Skip today) | Not learned from (see Out of scope) |

**Consequence:** the engine needs **no change** for layer 1. The preferences are inputs it already takes (principle 3).

## User stories
1. As a lifter who always swaps bench press for dumbbell press, I want the app to offer once to prefer dumbbell press, so that I stop making the swap.
2. As a lifter who keeps removing an exercise I dislike, I want to be asked once whether to never suggest it.
3. As a lifter whose cable station is busy today, I want one tap to replace the exercise for today without the app concluding I dislike it.
4. As a private person, I want to turn the learning off, forget what was counted, and see and undo everything that was decided.

## What is counted
A **ledger** of edit signals, kept on this device (D-0278 §1). One entry per pair or exercise:
- **Swap signal** `(from, to)`: a swap of `from` for `to`, from UF-08.3 (before starting) or UF-05.1 (in a workout). Counted only when the swap reason is **none or "discomfort"**. "Equipment taken", "variety" and "short on time" are about today, not about taste, and are never counted. "Not today" is never counted.
- **Removal signal** `exercise`: a Remove of that exercise on UF-08.6 (before starting). The stepper's "Remove {Area}", "Not today", an exercise dropped by a time change, a skip in UF-09 and an exercise not done are never counted.
- **A signal is counted once per visit or workout** for the same pair or exercise (swapping back and forth on one screen is one signal), and entries older than **60 days** are dropped. The ledger holds at most 200 entries (oldest dropped).
- An exercise that is already a favorite (for a swap-in), already excluded, or excluded-and-removed raises no prompt.

## When to ask, and how
- **Thresholds (defaults, revisit):** a swap pair reaches **3** signals within 60 days; a removal reaches **2**.
- **Asked once.** When a threshold is reached the entry is marked pending. The prompt is shown the next time UF-08.2 mounts (never during a workout, never on UF-09 or UF-05.1, principle 1). Any answer, "yes" or "no", marks the entry **asked** for good: the same pair or exercise is never asked again, even when the count keeps growing. Dismissing by leaving the screen leaves it pending (it shows again next time); there is no timeout.
- **One prompt at a time**, oldest pending first, in a neutral card above the area rows (same pattern as the neutral notice, not the attention colour). Never a modal, never over another control, never on UF-08.1.
- **Swap prompt:** "Prefer {Dumbbell bench press} for {Chest}?" with the line "You've swapped {Bench press} for it 3 times." and two buttons: **Prefer it** and **No thanks**. `{Chest}` is the swap-in's first primary area. Yes adds the swap-in to favorites.
- **Removal prompt:** "Stop suggesting {Cable crunch}?" with "You've removed it 2 times." and **Never suggest** and **No thanks**. Yes adds it to the excluded list.
- **After Yes:** the card turns into a status line "{name} is a favorite now. Undo" / "{name} won't be suggested. Undo" (a text button, no timeout, until the user leaves the screen), and "Manage it in Plan" names where it lives. The plan already shown is not rebuilt (preferences apply from the next plan).
- **Offline:** the buttons are `aria-disabled` with "Connect to change favorites" or "Connect to change excluded exercises" (the existing wording), the prompt stays pending, and counting keeps working.
- **A conflict** (the swap-in was excluded in the meantime) drops the entry silently.

## "Not today" (per visit, no learning)
Specified with UF-08.6 (layer 3 spec). In this phase it gets one extra guarantee: it writes nothing to the ledger, so a busy machine never becomes a preference. Equipment-level "busy today" (one tap for every cable exercise) is out of scope.

## Where preferences are shown and undone
- **UF-11.6 Favorite exercises** and **UF-11.5 Excluded exercises** list them, with their existing Remove and Include again. A learned preference is not marked differently in v1 (D-0278 §3: no provenance column; revisit).
- **Immediately after Yes**, the Undo on the status line removes it again (the same write as UF-11.6 Remove).
- **UF-11.4 Account settings, new section "Learning from your edits"** (D-0278 §2): a checkbox-style toggle **"Suggest preferences from my swaps and removals"** (default on), a line "Counts are kept on this device only and are never sent anywhere. A preference is saved only when you say yes.", and a button **Forget what was counted** (clears this device's ledger, with the status line "Counts cleared."). Turning the toggle off stops counting, drops pending prompts and clears the ledger. Offline: the toggle is disabled with "Connect to change this" (it is a stored setting); counting while off is nothing, so the device never needs to know offline.

## Storage and privacy
- **Counts and "asked" marks** live in an IndexedDB store on this device (the `lib/offline` pattern, D-0265). They are not sent to the server and not synced between devices; a second device counts for itself. **They are cleared** on sign-out and on account deletion with every other `wl-` store (D-0195, NFR-PRIV-5), and by "Forget what was counted".
- **The setting** is one column, `profiles.learn_from_edits boolean not null default true` (D-0278 §2): it follows the account, is included in the export with the whole profile row (NFR-PRIV-4), and goes with the account when it is deleted (the profile cascades).
- **Accepted preferences** are rows in `favorite_exercises` or `excluded_exercises`, which the export and the delete already cover. No new table, no new RLS policy, no openapi change.
- No third-party analytics (D-0017). Nothing about the counts leaves the device.
- Honest limit: because counts are per device, a user who swaps on two devices needs 3 swaps on one of them. Accepted for v1.

## Screen states
| State | What shows |
|---|---|
| Nothing pending | No card |
| Swap prompt pending | The card with Prefer it / No thanks |
| Removal prompt pending | The card with Never suggest / No thanks |
| Two pending | The oldest first; the next one after the answer |
| Learning off | No card; UF-11.4 shows the toggle off |
| Offline | The card shows, buttons disabled with the reason |
| Zero history | No ledger, so nothing |
| Returning after 10 days off | Entries from the last 60 days still count |

## Success metrics
- Fewer repeats of the same swap after a prompt was accepted (device count of the swap on later visits; checked by the owner's use and by the e2e of the accepted path).
- Prompt acceptance rate is not measured (no analytics); the owner is asked in a later review if the prompts feel right.
- Guardrails: no prompt in UF-09; never more than one prompt on screen; no write without a tap on Yes.

## Out of scope
- Learning from area edits (a skipped or removed area never changes a target or a preference; targets adapt only through UF-11.1, principle 4).
- Learning "avoid area" or pairwise "prefer A over B" ranking beyond a favorite; `rankSwaps` still takes no favorites input.
- Provenance ("learned") tags, a history of what was learned, server-side signals, cross-device counts.
- Learning from "skip" or "Do later" in UF-09.

## Open questions and logged defaults
1. Thresholds 3 (swap) and 2 (removal), window 60 days. **Default as written**, revisit after a month of use.
2. Counts stay on the device and prompts are per device. **Default: yes** (stronger privacy, no new table). Owner decision needed only if cross-device learning matters.
3. A learned preference is not tagged differently in UF-11.5 and UF-11.6. **Default: no tag.**
