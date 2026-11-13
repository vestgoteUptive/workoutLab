---
id: D-0246
title: "Add exercise during a workout, review rulings: the owner accepts the ten open-question defaults; \"In this workout\" also covers any exercise with a set logged this workout (swap-then-add-back); insertItem check order and 9th/duplicate refusals; timeLeftS consistency condition and model limits; empty-plan atIndex clamp; the sheet is self-contained (own CSS, .wl-uf08 root) and lazily loaded from UF-08 index.tsx (no leaf entry); Back/Escape closes only the sheet; Paused keeps focus and has a status line on mount; T-0945 re-vendors, after T-0936"
status: decided
date: 2026-11-13
by: triage (orchestrator check mode; the human said "implement it" and accepts the product owner's defaults)
area: product
amends: D-0243, D-0244, D-0245
builds-on: D-0111 §7, D-0123, D-0138, D-0142 §8, D-0162 §3, D-0170 §1, D-0205 §2 §9, D-0236, D-0239 §14
---
## Context
The spec `docs/specs/add-exercise-in-session.md` and D-0243/D-0244/D-0245 went through three impact reviews (data-modeler, designer, engine-dev) on 2026-11-13. The human said to implement it and accepts the product owner's defaults for the spec's ten open questions. The reviews found one real bug (a restore misattribution), several gaps, and some stale or wrong citations. Checking them against the repo found two more conflicts with D-0170 §1 (decided): a leaf entry may export only pure functions and types, and its `<topic>` is lower-case letters only (`FEATURE_ENTRY_SOURCE = index(\.[a-z]+)?\.js$` in `apps/web/eslint.config.mjs`). D-0245 §4's `index.add-in-workout.ts` breaks both rules, because it renders a sheet and its name has hyphens.

## Decision
**Open questions.**
1. All ten defaults in the spec ship as written. D-0243, D-0244 and D-0245 move to `decided`. The board rows move from `idea` to `todo`.

**Product and screens (amends D-0243).**
2. **Row state 1 is wider.** "In this workout" covers any plan item that isn't skipped, **and any exercise with a `LoggedSet` in this workout that is no longer a plan item** (it was swapped out after sets were logged). Skipped items still read "Skipped in this workout". Why: restore realigns logged sets by exercise id (D-0245 §3). If the user logs sets of A, swaps A→B and then adds A, a reload would move the pre-swap A sets onto the added A. Server data would be fine, but focus mode and List view would be wrong. Blocking the add closes the hole with no contract change, and it matches open question 6 (no extra sets). `ctx.insertItem` repeats the same guard (no write, no event), so the rule doesn't rest on the UI alone.
3. **Accessible name.** It follows UF-08.5: "Add {name}", and "Add {name}, {area}" when the same exercise shows under more than one "Today's areas" section. The visible text "Add" starts the name (WCAG 2.5.3).
4. **Status copy.** The "{name} added." variant in D-0243 §7 is dropped, because it can't happen: the insert is at `itemIndex + 1 ≥ 1`. The only success line is "{name} added after {current name}."
5. **Position from UF-09.6.** On a pause from UF-09.6 (`resumePhase: "next"`), the current exercise is the one about to start, so the add lands after it. "Do {name} later" on that exercise puts the added one first.
6. **Back and Escape.** With UF-09.10 open, Back (`popstate`) and Escape close only the sheet. Focus goes back to "Add exercise", and nothing navigates or ends. The D-0123 Back→Pause guard (`features/UF-09/back-guard.ts`) is unchanged, because the machine is already paused.
7. **Focus and announcements on UF-09.9.**
   - Opening and closing the sheet, and `ITEM_INSERTED` with its new `ctx.plan`, must not remount Paused.
   - Focus lands on "Add exercise" after a close and after a successful add. Paused's existing Resume focus on mount still applies on first entry.
   - Paused renders one `role="status"` line, **empty on mount**, so the success line is announced.
   - Refusals use the sheet's own `role="status"` line. A failed write uses `role="alert"`, as Do later does.
   - "One status line" (B19) means one per surface. The sheet is modal, so only one surface is live at a time.

**Engine (amends D-0244).**
8. **`insertItem` check order:** structural `RangeError`s first, then `items.length ≥ 8` → `{refused: "items_cap"}`, then the time fit → `{refused: "time"}`.
   - The structural errors are: unknown id or warm-up move; id already an item, skipped or not; `atIndex` not an integer in `[0, items.length]`; `leftS` not an integer; `now` with no offset.
   - Tests cover a 9th item (openapi `maxItems: 8`; `parseSessionPlan` would read the plan as null) and a duplicate id (realign depends on unique ids).
9. **Implementation notes** (for the T-0945 ticket text):
   - Reuse `buildItem`, `repRange`, `prefillFrom`, `plannedDurationFrom` and the totals from `apply-swap.ts`.
   - Pass `swap: undefined`, not `null`, because `null` writes `swap: null` (`session.ts`). Pass `previous = null` to `prefillFrom`, and `backoff: false`.
   - Reasons, in order: `area_deficit`, `days_since`, `energy_low_trim`, `prefill`. No swap reason. `sessionReasons` is unchanged; say so in rule 12.3.
   - Add `insertItem` and `timeLeftS` to the §0 purity list and to the traceability table.
10. **Invariants after an insert.**
    - `itemsTotalS` may exceed `available`, because skipped items keep their full cost. R7-E8 (Σ ≤ available) is not asserted after an insert.
    - `unusedS` clamps at 0.
11. **`timeLeftS`.**
    - Use rule 8's per-set cost (`perSetS` in `timecheck.ts`: `(costS − 60) / (sets + backoff)`).
    - Validate: `elapsedS` an integer ≥ 0; `warmupLeftS` an integer in `[0, 180]`, and 0 when `warmupInBudget` is off; each `setsDone[i]` an integer ≥ 0.
    - **Consistency condition:** between exercises, `timeLeftS = −behindS` only when no item at or after the next one has sets logged ahead (List view) and none of them is skipped. D-0244 §2's unconditional sentence is replaced by this.
    - **Documented model limits** (rule 8 text and the spec):
      - Paused during a rest overstates the time left by up to 120 s, because the running rest isn't subtracted.
      - Paused mid-set understates it.
      - "Never over budget through an add" holds against the rule 7.1 cost model, not the wall clock.
12. **Empty plan.** The caller passes `atIndex = min(itemIndex + 1, items.length)`. An empty-start plan (D-0236) can't reach focus mode with 0 items, because "Looks good" is disabled at 0, but the clamp guards it anyway. The engine still throws on an out-of-range `atIndex`.
13. **Tests (D-0244 Consequences, made concrete).**
    - Determinism: repeated calls deep-equal, and inputs are frozen.
    - Engine examples R12-E20 onward and R8-E4 onward, from spec B1–B6, B8 and B13.
    - Five simulated histories:
      - zero history, balanced, and all-chest: valid inserts;
      - returning after 10 days: `hold_after_break`;
      - 15 min: refused for time;
      - 90 min: fill to 8 items, then `items_cap`.
    - Seeded property tests, ≥ 200 cases each. They use the existing `mulberry32` helper in `packages/engine/test/fixtures/random.ts`; fast-check is not a dependency and isn't added. The properties:
      - after an insert, `timeLeftS` drops by exactly the item's `costS` and stays ≥ 0;
      - every other item and the warm-up deep-equal;
      - insert then `removeItem` round-trips;
      - between exercises with nothing logged ahead, `timeLeftS = −timeCheck.behindS`.
14. **Vendor and order.** `supabase/functions/_shared/vendor/` holds all of the engine's `src`, so D-0244 §3's "unless" applies. T-0945 lists `supabase/functions/_shared/vendor/**`, runs `node supabase/scripts/vendor.mjs`, and commits the copy (as D-0239 §14 does for T-0936). T-0936 changes the same files and `engine-rules.md` §0, so T-0945 branches from `main` after T-0936 merges.

**Web (amends D-0245).**
15. **Citations.** Focus state is device-local and a second device writing the plan would drop the added item. The source for that is D-0111 §7 (restore; D-0138 supersedes only its parse-failure case), not D-0123. The spec's Sync section is corrected.
16. **No leaf entry, and a self-contained sheet.** This replaces D-0245 §4's `index.add-in-workout.ts`, which breaks D-0170 §1 on content (a component) and on name (hyphens).
    - UF-08 exports one new component, `AddExerciseInWorkout`, from `features/UF-08/index.tsx`, and updates that file's export pin test.
    - The UF-09 seam loads it lazily with `import("../UF-08/index.js")`, the way the swap seam loads UF-05 (D-0142 §8), and retries in-page (D-0162 §3).
    - The component computes the D-0243 §3 row reasons itself, from the `FocusSession` ctx.
    - The module behind it **imports `./uf-08.css` itself**. Today `SessionSetup.tsx` is the only importer, so after a reload into UF-09 the sheet would have no styles.
    - Its root carries `class="wl-uf08"` and `data-wl-state="plan"`, so the `.wl-uf08[data-wl-state]` row and button rules (44 px) apply outside SessionSetup.
    - T-0948 tests: rendered standalone (no SessionSetup in the tree), the sheet's root matches `.wl-uf08[data-wl-state="plan"]` and its module imports the CSS.
17. **Finish while the write is queued** (T-0950): the stored summary (UF-03.3) includes the added item.

**Design (T-0944).**
18. T-0944 also fixes `Design-docs/docs/design/screens/UF-08.5.md`:
    - line 3 ("Never reachable from … UF-09") now points to UF-09.10 (D-0243);
    - the retired Chalk & Iron fonts and `.wl-card` rows become `--wl-font` (Familjen Grotesk) and hairline rows (D-0208).
    - The new `UF-09.10.md` lists how its rows differ from UF-08.5:
      - "Skipped in this workout" and the widened "In this workout";
      - short Excluded / Above your level lines with no Plan pointer;
      - no "Skipping {Area} today";
      - recovery measured at `started_at`;
      - no "Start with this";
      - the "{m} min left" lead line.
    - `UF-09.9.md` adds the action (order per D-0243 §1, 56 px row, "+" `aria-hidden`, hidden for `resumePhase: "timeCheck"`), a combined action table, and the status line in item 7.

## Consequences
- The spec is amended in place. Its open questions are marked resolved, and the board rows T-0944–T-0950 move to `todo` with these deps and notes.
- No contract changes: openapi, data model and tokens stay as they are. `engine-rules.md` gains rule 12.3 and the rule 8 paragraph under D-0244, as already planned.
- No human gate.

## Revisit when
The first user test of the add, or a second device can run the same session (D-0245).
