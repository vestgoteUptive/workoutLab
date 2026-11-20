---
id: D-0259
title: "RIR progression and own steps: impact-review rulings (strict heldOnce, radiogroup, default chip resets, editable offline, server suggest uses the override, RIR through the web cache) and the owner's open-question defaults accepted"
status: decided
date: 2026-11-20
by: triage
area: product
amends: D-0250, D-0251, D-0252, D-0253
builds-on: D-0026, D-0199, D-0202, D-0211, D-0258
---
## Context
The designer and engine/data impact reviews of `docs/specs/rir-progression-and-increments.md` found gaps. The owner asked to build the feature and accepts every open-question default. D-0250 to D-0253 are now `decided`. Where this decision and those differ, this one wins.

## Decision
**Engine (T-0952)**
1. **`heldOnce` is strict.** True only when the session before the last (a) has the same `W`, (b) has every set at `W` with reps >= high, (c) was itself a hold: its own `rirMin` is non-null and < 2 (not `effortOk`), and (d) is less than 10 local days before the last session (same day-gap count as steps 2-3). Otherwise false. "One hold, then up" is therefore literal, and a stale session cannot let an RIR 0 session jump.
2. **Rule 14 text.** Step 4: "Loaded, every set at W has reps >= high, and (rirMin is none or >= 2, or heldOnce): W + inc, low reps (`increase`)." Step 4b: "Loaded, every set at W has reps >= high, otherwise: W, high reps (`hold_effort`)." `rirMin` = lowest valid non-null `rir` over the sets used for `minReps` (at `W`, non-null reps, hard, back-off excluded); `atW()` returns rir of those same sets. A non-integer or out-of-range `rir` is null. Bodyweight stays on step 4 (RIR is never read there). Timed returns earlier.
3. **Nothing else reads `rir`.** Rule 15 (records), balance, `timeCheck`, deload (step 5), steps 1-3 and 6-7 never read it. A test shows their output is unchanged when `rir` is present.
4. New examples R14-E24 (earlier session was not a hold: top reps at RIR 3, then RIR 1 gives `hold_effort`) and R14-E25 (earlier hold 12 days before: `hold_effort`).
5. **Tests:** seeded properties use an inline mulberry32 PRNG, at least 200 cases, no fast-check. Also: invalid `rir` gives null, the two `heldOnce` gap cases, rule 15 unchanged with `rir`, effective library gives the same step in `suggest`, `applySwap` and `prefill`, `floorInc(91.8)` with 1.25 gives 91.25.
6. **Sequencing.** T-0952 lands before T-0961 (e1RM rule 16). Each re-vendors `supabase/functions/_shared/vendor/**` (`vendor.mjs --check` passes). Both edit rule 15's paragraph; T-0961 rebases onto T-0952.

**Design and UF-04.2 (T-0955, T-0956)**
7. **Radiogroup, not `aria-pressed`.** `role="radiogroup"` labelled "Weight step", chips 1.25 / 2.5 / 5 / Other, roving tabindex, each at least 44 px, selected state by `--wl-selected` plus a check mark (never colour alone). Accessible names start with the visible text. Numbers go through `Intl`.
8. **The chip equal to the library default is a reset** (deletes the row). A text button "Use default ({n} kg)" shows only while an override exists.
9. **"Other".** `inputmode="decimal"`, label "Step in kg", a Save button, Cancel and Escape restore. Comma or dot accepted. Valid: a multiple of 0.25 from 0.25 to 10 inclusive. Validate on Save and blur, with `aria-invalid` and `aria-describedby`. An off-list value keeps Other selected and shows "Other: 1.5 kg". Error copy: "Enter a step from 0.25 to 10 kg, in multiples of 0.25." (replaces the spec's earlier copy). Helper line: "How much the weight goes up each time."
10. **Feedback.** One `role="status"` present on mount: "Weight step set to 1.25 kg." / "Weight step back to the default, 2.5 kg." A failed save gives `role="alert"` "Couldn't save. Try again." and the row reverts. No undo.
11. **Hide, not disable,** the row for timed and bodyweight exercises. One shared external-load predicate serves the UI and the engine (in `packages/shared`, used by both).
12. **`hold_effort` copy** drops `{reps}`, since the engine does not output it: "Same weight again. Last time was close to failure. Leave a couple of reps in reserve and it goes up." The reason has no extra fields. Principle 1: this is the only change in focus mode (reason text); no banner, modal or link.
13. **Offline: the row is editable offline.** The step has a device store and a write queue (the favorites pattern), so it applies at once and syncs later, last write wins by `updated_at`. D-0199 and D-0202 disable UF-04.2 controls offline ("Connect to change...") only for writes that have no queue. This is a stated carve-out: queued per-exercise controls stay enabled. The existing disabled controls stay as they are. No "Connect to change..." copy on this row.

**Web and data (T-0951, T-0953, T-0954, T-0959)**
14. **RIR reaches the engine (T-0953 expanded):** (a) `toHistorySet` in `packages/shared/src/mappers.ts` picks `rir`, one shared mapper for server and queued sets; (b) the `session_sets_live` select includes `rir` (T-0953 checks the view exposes it, and asks the data lane for a follow-up if not); (c) `CachedHistorySet` gains `rir` with an IndexedDB version upgrade from v4 (old rows null until the next refresh); (d) `history.ts` copies `rir`; (e) the queued-set mapper maps `queued.rir`. Test: an offline RIR 0 set gives `hold_effort` on the next pre-fill with no network.
15. **Server suggest (new T-0959).** `POST /workouts/suggest` (`supabase/functions/workouts/core.ts`) runs the engine with the DB library. It reads the caller's `exercise_settings` through the user's RLS client and builds the effective library, so server and client agree on step and back-off. No openapi change (request and response are unchanged). It re-vendors the engine and `database.gen.ts` gains the table (data lane, T-0951). A test shows the override changes the server back-off.
16. **Data (T-0951).** `exercise_settings` mirrors favorites/excluded, with the stricter update trigger. The table is added to the account export (`apps/web/src/lib/account/export.ts`, ordered by `exercise_id`) and to the D-0017 delete list, with tests for both.

**Scope**
17. **Open questions 1 to 12 of the spec are resolved at their stated defaults.**
18. No human gate is needed (no secret, spend, store or legal action).

## Consequences
- The spec is amended in place. D-0250 to D-0253 are `decided`; the `heldOnce` definition in D-0250 §1 and the copy in the spec are overridden by this decision.
- Board rows T-0951 to T-0958 move from `idea` to `todo`. New row T-0959. T-0953 also depends on T-0951 (view and table types) and is expanded; T-0954 depends on T-0951; T-0956 depends on T-0954 and T-0955. **T-0961 (e1RM) must depend on T-0952**: the orchestrator or the e1RM triage adds that dependency to its row.
- D-0253 §Consequences ("rows stay idea until the owner accepts") is satisfied: the owner accepted.

## Revisit when
- Users hit `hold_effort` twice in a row often, or fewer than a third of sets carry RIR.
