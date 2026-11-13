---
id: D-0239
title: "Empty-start review rulings: open questions closed on the defaults (T-0937/T-0938 deferrable); visit-level mainPickId; Start with this demotes the old main to a pin; tightened fallback trigger; budget words not colour; one live region; refusals show where the tap was; Suggestions above Add exercise; warm-up counts in used; T-0936 re-vendors"
status: decided
date: 2026-11-13
by: triage (human accepted the spec defaults, 2026-11-13: "implement all")
area: product
amends: D-0205, D-0235, D-0236, D-0237, D-0238
---
## Context
The human accepted the product owner's defaults for the seven open questions in `docs/specs/empty-start-plan.md` and said "implement all". The one change came from the data-modeler: question 7, the openapi ticket T-0937 and the validator ticket T-0938, are filed but can be deferred. They don't block anything.

The designer, data-modeler and engine-dev impact reviews (2026-11-13) found two engine-use bugs in the spec, one conflict with D-0211, a contradiction with the UF-08.2 screen spec, an inconsistency in the warm-up counting, and some process gaps. This decision resolves each of them. It amends D-0236, D-0237 and D-0238 where they differ, D-0205 §5 for empty mode, and D-0235 §2 for the main lift.

## Decision
**Open questions (spec §Open questions).** 1–6 keep their defaults. 7: T-0937 and T-0938 are filed but deferrable. No web, engine or QA ticket depends on them. Until they land, `/workouts/suggest` returns 400 for the two new keys. Nothing calls it from the app (D-0063 §3).

**Engine use**
1. **Visit-level `mainPickId` (fixes BUG 2).** The setup record gains `mainPickId: string | null`, which is the main lift the *user* chose on this visit. It is set by:
   - "Start with this";
   - adding a suggestion tagged "Main lift";
   - a UF-08.3 swap of the main lift (D-0235 §2).

   It is cleared by Remove of that item (D-0205 §6). Back to UF-08.1 drops it with the rest of the record. Every re-suggest passes `mainLiftId = mainPickId` in empty mode, and `mainPickId ?? plan.mainLiftId` in suggested mode. It is never read back from a plan that may have lost it. So a time chip that drops the main lift doesn't lose it for good: picking more time brings it back, the same as a pin. The dropped main lift is named in the "Doesn't fit in {n} min: {names}." line, like a pin. This amends D-0235 §2 in both modes. It is implemented in T-0940, which runs after T-0935.
2. **"Start with this" in empty mode keeps the old main lift (fixes BUG 1).** When X becomes the main lift:
   - the previous main lift M (if any) moves to the **front** of `addedIds`, so it is kept as a 3-set pin and not dropped by `fill: false`;
   - X leaves `addedIds` if it was there;
   - `mainPickId = X`.

   The safety net then checks every pick, M included. This amends D-0205 §5 for empty mode only. Suggested mode keeps "returns to the pool".
3. **Fallback trigger, tightened (amends D-0238 §2).** The second suggestions call (`autoMainLift: false`) is made only when an id that is **in the current plan** (a pick or `mainPickId`) is missing from the first call's result. Picks dropped by a time chip are not in the plan, so they don't trigger it.
4. **Engine switches (amends D-0237 §1).**
   - Only `=== false` turns a switch off.
   - A present value that isn't a boolean throws `RangeError`, like the other `SessionInput` checks.
   - The switches are never copied into `Workout`, which stays deep-equal to today's.
   - When the auto main lift equals a pin, that is allowed. It is placed once, as the main lift. T-0936 adds an example.
5. **Energy.** Behaviours B1–B19 assume `energy: "normal"`. At high energy, `fill: false` leaves spare time, so the main lift may get its back-off set (rule 7.4). The plan's minutes can then differ from the minutes on the suggestion row. That is accepted (D-0238 §4 already allows a pick to differ from its row). The B5 property runs at low, normal and high energy, and must still never refuse a tap.

**Screen (UF-08.2 empty mode)**

6. **Words, not colour (D-0211 §5).** Over budget, the bar does **not** change colour. The line reads "{used} of {n} min · {over} min over" and the bar keeps its existing `data-over` treatment with no new colour or token. The spec's "turns orange" is removed.
7. **Running total.** `used` counts the warm-up when it is in the budget, as today's bar does (`totalS`, rounded up). `left` is `unusedS`, rounded down. With the warm-up outside the budget, the line keeps today's " + warm-up" suffix after "{n} min". So B1 at 30 min with the warm-up on reads "3 of 30 min · 27 min left", and B3 reads "15 of 30 min · 15 min left".
8. **Layout.** In empty mode the order from top to bottom is:
   1. the bar;
   2. the why chips;
   3. Your workout;
   4. **Suggestions** (its rows, then "Other suggestions", then "Fill the rest for me");
   5. "Add exercise";
   6. Reorder and "Looks good".

   This puts the main path first. In markup, Suggestions is a `<section aria-labelledby>` with an `h2` and a `<ul>`. It doesn't use `.wl-option`, its rows follow the UF-08.5 row anatomy, and the tags reuse `wl-chip wl-uf08__tag`. No new token.
9. **One live region.** In empty mode, the UF-08.2 `role="status"` line is the only polite live region. The budget text is not `aria-live` in empty mode. Suggested mode is unchanged. A successful Add says "{name} added. {left} min left." The `role="alert"` for a failed exclusion write stays as it is.
10. **Focus.**
    - **After a suggestion Add:** focus moves to the Add button of the row now in the tapped row's place. If the tapped row was last, it moves to the new last row's Add. If no rows are left, it moves to "Add exercise".
    - **After "Other suggestions":** focus stays on it. If it disappears, focus moves to "Add exercise".
    - **After "Fill the rest for me":** focus moves to "Add exercise".
    - **After a refusal:** focus stays on the tapped button.
    - **UF-08.5 Add:** keeps D-0205 §4 (focus to the new row).
    - Focus never drops to `body`.
11. **"Looks good" at 0 items** is `aria-disabled`. It stays focusable and has `aria-describedby` → "Add at least one exercise." (D-0236 §4, restated).
12. **Refusal location.** A refusal shows where the tap was. A UF-08.5 Add or "Start with {name}" refuses on the sheet (D-0205 §4). A suggestion Add or a row's "Start with this" refuses in the UF-08.2 status line. This is an explicit exception to the UF-08.2 screen spec's "Refusals show on the sheet", and it matches what row "Start with this" already does.
13. **Which "doesn't fit" copy appears where.** The first match wins:
    1. **The plan is already over budget** (only after a UF-08.3 swap with `fitsBudget: false`): no suggestions call is made. The Suggestions list reads "Your workout is {over} min over {n} min. Remove or swap an exercise." Any Add or "Start with this" is refused with "Your workout is {over} min over. Remove or swap an exercise first." The swap-in is the cause, so the new pick isn't blamed.
    2. **The new item itself is missing** from the result: D-0205 §4 copy, including the cap copy.
    3. **The new item fits but pushes out an existing pick or the main lift:** "{name} would push out {pick}. Pick more time or remove an exercise." `{pick}` is the first pushed-out item in plan order.
    The spec's single "{name} doesn't fit in {n} min." safety-net copy is replaced by these.

**Process**

14. **T-0936 re-vendors.** The root test runs `node supabase/scripts/vendor.mjs --check`. T-0936 lists `supabase/functions/_shared/vendor/**` in its paths and commits the regenerated copy. Without it, `pnpm -w test` goes red. T-0936 also:
    - writes the rule text and examples named by the engine-dev (§0; 7.2 steps 1 and 3; the empty-items warm-up in 7.3; a rule 13 note; R7-E31 onward with traceability rows);
    - writes the simulated 14-day tests: 5 histories with the switches absent, and with true/true, deep-equal across budgets, energy and shuffle 0..6; both off with no pins gives `[]`; picks only on returning-after-10-days; R7-E8 caps with random switches; R0-E1 determinism; B5 as a seeded fast-check property.
15. **B18 widened.** `autoMainLift: false` with an eligible `mainLiftId` (and `fill` absent) gives a result deep-equal to today's.
16. **Dependencies.** The design ticket T-0939 is a dependency of T-0940, T-0941 and T-0942. T-0939 also:
    - creates `Design-docs/docs/design/screens/UF-08.1.md` for the whole screen;
    - adds an "Empty mode" section to UF-08.2.md, including the empty-mode branch of its Empty states;
    - adds the UF-08.5.md empty-mode lead line;
    - replaces the retired fonts DM Sans and Big Shoulders in UF-08.2.md and UF-08.5.md.

    The UF-08 copy lives in `apps/web/src/lib/i18n/flows/uf-08.ts` (web-shell). T-0940 and T-0941 list that file in their paths.

## Consequences
- The spec is amended in place, and its open questions are marked resolved.
- On the board, all seven rows move to `todo`, with T-0937 and T-0938 marked deferrable.
- Suggested mode changes in one place only: re-suggests prefer `mainPickId` (§1).

## Revisit when
- After an over-budget swap, people expect an Add to work, for example by dropping the swap-in.
- High-energy back-off sets make suggestion-row minutes visibly wrong often enough to confuse people.
