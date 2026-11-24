# Learn from edits — spec (UF-08, UF-11)

- **Idea:** the owner, 2026-11-24, layer 1 of three, chosen second: repeated swaps become preferences ("Prefer dumbbell press for chest?"), removals become "never suggest X", and a per-session "busy / don't have it today" toggle. Built **after** `docs/specs/areas-first-planning.md`.
- **Screens:** UF-08.2 (a prompt card), UF-08.6 ("Not today" is specified in the layer 3 spec; the count hooks live here), UF-08.3 and UF-05.1 (count only, no new control), UF-11.4 (a "Learning" section), UF-11.5 and UF-11.6 (unchanged lists, where a learned preference is seen and undone).
- **Decisions:** D-0277 (what is counted, thresholds, prompts, reuse), **D-0281 (counts sync through the account in a new table `edit_signals`; supersedes D-0278, the owner's answer of 2026-11-24)**, D-0279 (phasing; tickets T-1000 to T-1010, amended by D-0280 and D-0281). Builds on D-0199 (excluded exercises), D-0202 (favorites), D-0191 (visit-only removes and skipped areas), D-0235 (swap pins), D-0195 (sign-out clears the device), NFR-PRIV-4 and NFR-PRIV-5 (export, delete).
- **Status:** `todo`, phase 2. The data tickets (T-1001, T-1010) have no deps and are ready; the UF-08 prompt (T-1003) starts after the layer 3 UF-08 tickets are done.

## Problem
Today the same swap is made at every workout: the engine suggests bench press, the user swaps it for dumbbell press, again next week. The app already has the tools to stop that (a favorite is tried first, an excluded exercise is never suggested), but the user must go to UF-04.2 and think of it. The app can notice the pattern and ask once.

## What already exists (and is reused, nothing is invented)
| Need | Existing mechanism | Used as |
|---|---|---|
| "Prefer X" | **Favorites** (`favorite_exercises`, `sessionInput.favoriteIds`, rule 0.2, D-0202): a favorite is ranked first in every area where it has weight 1.0, never forced, never past recovery, equipment, level or time | An accepted swap prompt adds the swap-in as a favorite |
| "Never suggest X" | **Excluded exercises** (`excluded_exercises`, `excludeIds`, rule 0.1, D-0199), with the mutual exclusion against favorites | An accepted removal prompt adds the exercise to the list |
| "Not today" | The visit-only `excludeIds` of a Remove (D-0191 §4) and the swap-in pin (D-0235) | "Not today" uses `rankSwaps(…, equipment_taken)` and `applySwap`, and puts the original in the visit's excludes. Nothing is written |
| Visible and reversible | UF-11.6 and UF-11.5 lists, UF-04.2 toggles | A learned preference is an ordinary favorite or exclusion, so it is already listed and removable |
| Export and delete | `export.ts` and the D-0017 delete list already cover favorites and excluded exercises | The favorites and exclusions need no change. The new `edit_signals` table is added to both (D-0281, T-1002) |
| Skip an area | `avoidAreas` (UF-08.1 Skip today) | Not learned from (see Out of scope) |

**Consequence:** the engine needs **no change** for layer 1. The preferences are inputs it already takes (principle 3).

## User stories
1. As a lifter who always swaps bench press for dumbbell press, I want the app to offer once to prefer dumbbell press, so that I stop making the swap.
2. As a lifter who keeps removing an exercise I dislike, I want to be asked once whether to never suggest it.
3. As a lifter whose cable station is busy today, I want one tap to replace the exercise for today without the app concluding I dislike it.
4. As a private person, I want to turn the learning off, forget what was counted, and see and undo everything that was decided.

## What is counted
A **ledger** of edit signals, counted on the device first and synced through the account (D-0281). One entry per pair or exercise, per device:
- **Swap signal** `(from, to)`: a swap of `from` for `to`, from UF-08.3 (before starting) or UF-05.1 (in a workout). Counted only when the swap reason is **none or "discomfort"**. "Equipment taken", "variety" and "short on time" are about today, not about taste, and are never counted. "Not today" is never counted.
- **Removal signal** `exercise`: a Remove of that exercise on UF-08.6 (before starting). The stepper's "Remove {Area}", "Not today", an exercise dropped by a time change, a skip in UF-09 and an exercise not done are never counted.
- **A signal is counted once per visit or workout** for the same pair or exercise (swapping back and forth on one screen is one signal), and an entry's **60-day window** starts at its first signal: a signal after the window restarts the entry at 1, and an old entry stops counting and is deleted (an "asked" mark is kept). A device holds at most 200 entries (oldest dropped). A pair's total is the **sum across the user's devices** (D-0281 §2, §3).
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
- **UF-11.4 Account settings, new section "Learning from your edits"** (D-0278 §2): a checkbox-style toggle **"Suggest preferences from my swaps and removals"** (default on), a line "Counts are saved with your account, only you can see them, and they are included when you export your data. A preference is saved only when you say yes.", and a button **Forget what was counted** (deletes the account's counts on every device, with the status line "Counts cleared."). Turning the toggle off stops counting, drops pending prompts, clears this device's ledger and deletes the account's counts. Offline: the toggle and Forget are both disabled with "Connect to change this" (they change stored data); counting while off is nothing, so a device never needs to know offline; another device learns of an off or a Forget at its next profile read (D-0281 §4).

## Storage and privacy
- **Counts and "asked" marks** are counted in an IndexedDB store on the device first (the `lib/offline` pattern, D-0265), so counting works offline, and are synced through the account into the table `edit_signals` (D-0281): one row per device and key, written only by its own device as an absolute upsert, summed on read. A replayed or late write cannot count a signal twice, and nothing a device writes can overwrite another device's row. A prompt answered ("asked") on one device is not asked again on another once they have synced.
- **Table:** per user, the kind (swap or removal), the exercise ids, a count, `last_seen`, a 60-day window (`window_start`), an `asked_at` mark and a random `device_id`; RLS owner-only; plain CRUD through supabase-js, no Edge Function, no openapi change.
- **Cleared** on sign-out and account deletion with every other `wl-` store on the device (D-0195, NFR-PRIV-5); counts not yet synced at sign-out are dropped. **Deleted on the server** by "Forget what was counted", by turning learning off, and with the account (the table cascades).
- **The setting** is `profiles.learn_from_edits boolean not null default true`, plus `profiles.learn_reset_at` (set by the server when the setting changes or a Forget is done, so a device that was offline cannot bring forgotten counts back). Both ride in the export with the profile row.
- **Export:** `edit_signals` is the 11th table of the account export (NFR-PRIV-4). **Delete:** the rows go with the account.
- **Accepted preferences** are rows in `favorite_exercises` or `excluded_exercises`, as before.
- **Privacy:** which exercises you swapped or removed, and how often, are stored with your account (EU region, owner-only). No third-party analytics (D-0017), no server code and no analytics view reads them, and the engine never sees counts. The landing privacy notice says so (T-1010).
- Honest limits: two devices can show the same prompt before they have synced (answering twice is harmless); the window edge can miss a threshold by one signal; a device that never reconnects never shares its counts.

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
- Fewer repeats of the same swap after a prompt was accepted (the account's count of the swap on later visits; checked by the owner's use and by the e2e of the accepted path).
- Prompt acceptance rate is not measured (no analytics); the owner is asked in a later review if the prompts feel right.
- Guardrails: no prompt in UF-09; never more than one prompt on screen; no write without a tap on Yes.

## Out of scope
- Learning from area edits (a skipped or removed area never changes a target or a preference; targets adapt only through UF-11.1, principle 4).
- Learning "avoid area" or pairwise "prefer A over B" ranking beyond a favorite; `rankSwaps` still takes no favorites input.
- Provenance ("learned") tags, a history of what was learned.
- Learning from "skip" or "Do later" in UF-09.

## Open questions and logged defaults
1. Thresholds 3 (swap) and 2 (removal), window 60 days. **Default as written**, revisit after a month of use.
2. Counts stay on the device. **Owner answer 2026-11-24: no, they sync through the account** (D-0281, supersedes D-0278): a new table with RLS, in the export and deleted with the account. Offline increments merge as one row per device, summed on read, so nothing is counted twice.
4. "Forget what was counted" and the toggle need a connection. **Default: yes** (they change stored data on every device).
5. The 60-day window starts at a device's first signal and restarts after it. **Default: yes**, revisit if prompts come late.
3. A learned preference is not tagged differently in UF-11.5 and UF-11.6. **Default: no tag.**
