---
id: T-0939
title: "Screen specs: new UF-08.1.md with \"Start empty\"; UF-08.2.md \"Empty mode\" section; UF-08.5.md empty-mode lead line; retired fonts replaced"
lane: design
screens: [UF-08.1, UF-08.2, UF-08.5]
decisions: [D-0236, D-0238, D-0239, D-0205, D-0211, D-0208]
deps: []
status: ready
---
## Why
Empty-start planning (`docs/specs/empty-start-plan.md`) adds a second UF-08.1 button and a new UF-08.2 mode with a Suggestions section. D-0239 §6–§13 settles the layout, the live region, focus and refusal copy, and §16 makes this ticket a dependency of T-0940, T-0941 and T-0942. UF-08.1 has no screen spec yet, and UF-08.2.md and UF-08.5.md still name the fonts Cobalt retired (D-0208, T-0625).

## Scope
- In:
  - New `Design-docs/docs/design/screens/UF-08.1.md` for the **whole** screen as built today (minutes stepper and chips, "done by", warm-up toggle, Energy, Skip today, live fit line, "Suggest my workout") plus the secondary **"Start empty"** button under "Suggest my workout" (D-0236 §1): Cobalt secondary-button treatment, at least 44 px, same width as the primary.
  - `UF-08.2.md` gains an **"Empty mode"** section covering D-0239 §6–§13:
    - running-total line "{used} of {n} min · {left} min left", " + warm-up" suffix after "{n} min" when the warm-up is outside the budget, over budget "{used} of {n} min · {over} min over" with the existing `data-over` treatment and **no colour change** (D-0211 §5, D-0239 §6–§7); not `aria-live` in empty mode;
    - layout order (D-0239 §8): bar, why chips, Your workout, Suggestions (rows, then "Other suggestions", then "Fill the rest for me"), "Add exercise", Reorder and "Looks good";
    - empty list copy "Nothing here yet. Pick from the suggestions or add an exercise."; and the empty-mode branch of the existing **Empty states** section;
    - Suggestions: `<section aria-labelledby>` + `h2` "Suggestions" + `<ul>` of `<li>`; sub-line "For the areas that need work most. Fits your {left} min."; rows in UF-08.5 row anatomy (name · sets × reps · minutes; reason line; "Favorite" and "Main lift" tags as `wl-chip wl-uf08__tag`; **Add** with accessible name "Add {name}", ≥ 44 px); no `.wl-option`; list copies "Your {n} min are full.", "No suggestions right now. Search to add an exercise.", "Your workout is {over} min over {n} min. Remove or swap an exercise.";
    - "Looks good" at 0 items: `aria-disabled="true"`, focusable, `aria-describedby` → "Add at least one exercise.";
    - one polite live region (the existing `role="status"` line) and its messages ("{name} added. {left} min left.", "{name} is the main lift now.", refusals, the time-chip "Doesn't fit" line); the `role="alert"` for a failed exclusion write unchanged;
    - focus rules (D-0239 §10), verbatim;
    - refusal location (D-0239 §12) as an explicit exception to "Refusals show on the sheet", and the three refusal copies in first-match order (D-0239 §13).
  - `UF-08.5.md`: in empty mode the header lead line reads "{left} of {n} min left." instead of "The rest of your workout adjusts to fit {n} min.".
  - Replace "DM Sans" and "Big Shoulders Display" in `UF-08.2.md` and `UF-08.5.md` with the Cobalt fonts and `--wl-*` variables (D-0208: Familjen Grotesk for plan screens).
- Out: any token change (no new token, D-0239 §8); prototypes beyond what the spec needs; UF-08.3, UF-08.4 and UF-09 (unchanged).

## Acceptance criteria
Design docs are checked by automated text checks (a test that greps the files is acceptable; the orchestrator's `check-all.mjs` covers screen IDs).
- AC1 Given the repo, Then `Design-docs/docs/design/screens/UF-08.1.md` exists, its title names UF-08.1, and it specifies every UF-08.1 control listed in user flows v2 plus "Start empty" with its position (under "Suggest my workout"), button treatment and ≥ 44 px target.
- AC2 Given `UF-08.2.md`, Then it has a `## Empty mode` heading whose body contains each of the exact strings: "{used} of {n} min · {left} min left", "{used} of {n} min · {over} min over", "Nothing here yet. Pick from the suggestions or add an exercise.", "For the areas that need work most. Fits your {left} min.", "Your {n} min are full.", "No suggestions right now. Search to add an exercise.", "Your workout is {over} min over {n} min. Remove or swap an exercise.", "Your workout is {over} min over. Remove or swap an exercise first.", "{name} would push out {pick}. Pick more time or remove an exercise.", "{name} added. {left} min left.", "Add at least one exercise.", "Other suggestions", "Fill the rest for me".
- AC3 Given `UF-08.2.md` Empty mode, Then it states that the bar does not change colour when over and that the budget line is not `aria-live` in empty mode (and is unchanged in suggested mode, the binary sibling).
- AC4 Given `UF-08.2.md` Empty mode, Then the layout list is in D-0239 §8's order and the focus rules list D-0239 §10's six cases.
- AC5 Given `UF-08.2.md` `## Empty states`, Then it has an empty-mode branch (0 items copy) alongside the suggested-mode one.
- AC6 Given `UF-08.5.md`, Then it contains "{left} of {n} min left." scoped to empty mode, and the suggested-mode line "The rest of your workout adjusts to fit {n} min." is still there.
- AC7 Given `UF-08.2.md` and `UF-08.5.md`, Then neither contains "DM Sans" or "Big Shoulders".
- AC8 Given the diff, Then `packages/design-tokens/src/tokens.json` is unchanged.

## Paths you may change
`Design-docs/docs/design/**`

## Contract impact
none (no token change, D-0239 §8). User flows v2 (`Design-docs/docs/product/user-flows.md`) is product-lane and was updated for UF-08.1, UF-08.2 and UF-08.5 empty mode when this ticket was groomed (2026-11-13); this ticket does not touch it.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0939` and cite UF-08.1, UF-08.2, UF-08.5.

## Build / accept log
- 2026-11-13 designer. Start: `git status` clean, HEAD 7f0d71fa (`t/T-0939-uf08-empty-specs`). New `screens/UF-08.1.md`; `UF-08.2.md` gains `## Empty mode` and the empty-mode Empty-states branch; `UF-08.5.md` gains the empty-mode lead line and the two extra refusal copies; DM Sans / Big Shoulders → Familjen Grotesk via `--wl-font`. Test: `packages/design-tokens/test/uf08-empty-mode-specs.test.ts` (design lane path, outside the ticket's listed path, because the docs tests live there).
- AC1 → "T-0939 AC1" (title, every user-flows control, Start empty under the primary, secondary, full width, ≥ 44 px). AC2 → "AC2" (13 exact strings in `## Empty mode`, row markup, refusal order). AC3 → "AC3" (no colour change, `data-over`, not `aria-live` in empty mode, suggested mode unchanged). AC4 → "AC4" (layout order; the six focus bullets equal and also found verbatim in D-0239). AC5 → "AC5". AC6 → "AC6". AC7 → "AC7". AC8 → "AC8" (every `--wl-` variable the three specs name exists in the tokens build or `main.css`) plus `git diff main-hzlbfc -- packages/design-tokens/src/tokens.json` empty.
- Red: the test on the base UF-08.2/UF-08.5 fails at collection (no `## Empty mode`). Planted faults (backup + `cp` restore): "Start empty" moved above the primary → AC1 red; "DM Sans" back in UF-08.5 → AC7 red.
- Spec defaults not set by a decision (in the spec's "Spec defaults" list; T-0941 builds from them): "Fill the rest for me" refused with the over-budget copy while over budget; Suggestions sub-line only while rows show; empty-plan line replaces both suggested-mode empty lines; Reorder mode hides Suggestions; "Start empty" disabled state follows the primary.
- Gate: design-tokens typecheck + lint + vitest 222/222; `-w format:check`, `-w check:repo`, `check-all.mjs` green; `-w test:repo-checks` see handback.
