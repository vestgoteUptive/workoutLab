---
id: T-0689
title: "e2e UF-11.3: in a real browser, arrow keys move the selection through the Level radiogroup (one tab stop, wrap-around, the Goal group untouched, focus ring), online and offline"
lane: qa
screens: [UF-11.3]
decisions: [D-0230, D-0233, D-0178]
deps: [T-0682]
status: ready
---
<!-- Written by product-owner 2026-11-23 (groom). Flow: wl-build-qa (agent qa-tester). About ¼ day. A new spec file only, fixtures unchanged, so no full e2e suite run is needed (D-0178 §3). Kept out of T-0686a's file `uf-11-editable-level.spec.ts` on purpose: that ticket is still `todo` behind T-0683b, and a second ticket in one new spec file would force an order. -->

## Why
T-0682's QA-3 (`edit-plan-level-qa.test.tsx`) checks that the three Level radios are tabbable and that an arrow keydown is not cancelled. That is jsdom: it cannot show that the browser actually moves the selection, which is what a keyboard user relies on. The Level group is native radios in a `role="radiogroup"` (D-0233 §1), so the browser does the work, and a CSS or markup change (the `.wl-option` label rows, the visually hidden input, T-0687's new headings, a `tabindex`) could break it without any unit test noticing. The spec says "Focus order follows the layout order: Goal, Level, the rhythm steppers…" and "2 px `--wl-focus` ring on every control" (UF-11.3 Accessibility).

## Scope
- In: one new `tests/e2e/uf-11-level-keyboard.spec.ts` (Chromium, the project in `playwright.config.ts`).
  - Setup as `uf-11-plan.spec.ts` does: `test` from `./fixtures/guarded-test.js`, `mockSupabaseAuth`, `mockSupabaseRest`, `mockSupabaseData(page, UF11_FIXTURES)`, `injectSession`, then `page.goto("/plan/edit")` (viewport 390 × 844). The shared fixture's profile is level **intermediate**, so no override is needed, and Intermediate starts checked.
  - Ready signal: the Level `radiogroup` is visible (the rows render after the plan data loads). Move focus with `page.keyboard`, not `.focus()`, wherever a tab stop is part of the claim.
- Out:
  - The level-only PATCH, the check-in survival and the favorites round trip (T-0686a).
  - Goal, rhythm and priority keyboard behaviour, and the unit-level QA-3.
  - Any production or fixture change. If a real defect shows (the selection does not move), stop and raise a follow-up to the UF-11 lane; do not weaken the test.

## Acceptance criteria
Test titles start `T-0689 ACn`. Every `expect` on a state that changes after a key press uses a web-first assertion (`toBeChecked`, `toBeFocused`, `expect.poll`), never a one-shot read.
- **AC1 (arrows move the selection, both axes).** Given `/plan/edit` online with Intermediate checked and the Level radio focused (by Tab from the Goal group's checked radio), When ArrowDown is pressed, Then Advanced is checked and focused and Intermediate is not; When ArrowUp is pressed twice, Then Beginner is checked and focused. Then the same with ArrowRight (next) and ArrowLeft (previous), which native radios also honour.
- **AC2 (wrap-around).** Given Advanced checked and focused, When ArrowDown is pressed, Then Beginner is checked and focused. Given Beginner checked and focused, When ArrowUp is pressed, Then Advanced is checked and focused.
- **AC3 (one tab stop).** Given the checked Level radio focused, When Tab is pressed, Then focus leaves the Level group (the next focused element is not a Level radio, it is the first rhythm stepper button); When Shift+Tab is pressed from there, Then the checked Level radio is focused again (the radio that was checked, not the first one). The three radios are never three tab stops: with Advanced checked, `page.locator('input[name="level"]')` has exactly one element with `tabIndex` ≥ 0 reachable by Tab (assert by tabbing through the group and counting level radios focused).
- **AC4 (the change is real, and the screen reacts).** Given Intermediate checked and Save `aria-disabled="true"`, When ArrowDown is pressed (Advanced), Then Save has `aria-disabled="false"`, the `label.wl-option` of Advanced has the selected-block background (`--wl-selected`, computed from `tokens.json` as in `uf-11-plan-layout.spec.ts`) and the Intermediate label has a transparent background. When ArrowUp returns to Intermediate, Then Save is `aria-disabled="true"` again (the draft equals the baseline).
- **AC5 (the Goal group is untouched).** Given Goal "Build muscle" checked, When the Level group is walked with the arrow keys, Then "Build muscle" is still checked and the Goal radios are never focused. (The groups have separate `name`s, so a shared name would show here.)
- **AC6 (focus ring).** Given a Level radio focused by the keyboard, Then its row (`label.wl-option:has(input:focus-visible)`) has an outline 2 px wide whose colour is `--wl-focus` (or `--wl-on-selected` on the selected block, as the spec says), read with `getComputedStyle`. Given the same radio focused by a mouse click, Then the check in AC1 about the selection still holds (the ring is a keyboard concern, so the click case asserts only the selection).
- **AC7 (offline sibling, D-0197 §7).** Given the page loaded online and then `context.setOffline(true)`, When the Level group is walked with the arrow keys, Then the selection still moves (AC1's first step), "Connect to save" is shown and Save stays `aria-disabled="true"` even though a different level is checked (the draft is local, the save is online-only, D-0230). Online case: AC1 and AC4.
- **AC8 (no console error).** The `consoleGuard` fixture sees no `console.error` or page error, and the guarded fixture sees no unmocked Supabase request.
- Planted faults (log, one line each; restore with `cp`): F1 give the Advanced radio `name="goal"` in a backup copy of `EditPlanBody.tsx`: AC5 or AC1 goes red. F2 add `tabIndex={0}` to the non-checked Level radios: AC3 goes red. F3 set `pointer-events: none; display: none` on the Level inputs (not visually hidden): AC1 goes red. The faults are on a copy and the copy is restored; no production file is committed.

Binary-condition check (D-0197 §7): online and offline (AC1 and AC7); keyboard focus and mouse focus (AC6); first radio and last radio (AC2); changed and back at baseline (AC4).

## Paths you may change
- `tests/e2e/uf-11-level-keyboard.spec.ts` (new)

## Contract impact
none

## Definition of done
Every AC passes with `npx playwright test uf-11-level-keyboard` through `scripts/locked.sh heavy`, `--repeat-each 10` green · the new file is wired the way `check-e2e-wiring` and `e2e-lint.test.mjs` require (`pnpm -w lint` lints `tests/e2e`) · `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` green · no `apps/web/src` file changed · commits start `T-0689 UF-11.3:`.

## Build / accept log
- Build (qa): new `tests/e2e/uf-11-level-keyboard.spec.ts`, tests `T-0689 AC1`..`AC8` (one each; AC8 plus the guarded fixture's teardown checks cover all tests). `--repeat-each 3`: 24 passed. Planted faults on backup copies, restored with `cp` and `cmp`-verified: F1 Advanced radio `name="goal"` (7 red: AC1-4, 6-8); F3 `display:none; pointer-events:none` on Level inputs (8 red); F4 per-radio `name` so the radios are not one group (4+ red, AC1-AC4 at least); F2 `tabIndex={0}` on the Level radios stayed green (8 passed): Chromium ignores tabindex on a non-checked radio of a group with a checked one, so AC3's count is proven by F4, not F2. `format:check` and `lint:e2e` green; `check-all.mjs` reports only "ticket-not-on-base" (ticket file not on main yet).
