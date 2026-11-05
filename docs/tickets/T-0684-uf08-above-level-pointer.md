---
id: T-0684
title: "UF-08.5 Add exercise: 'Above your level. Change it in Plan › Edit plan.' (text only, no link out of setup); a saved level change reaches UF-08.5 through the cached profile"
lane: web-feature:UF-08
screens: [UF-08.5]
decisions: [D-0231, D-0233, D-0205, D-0109]
deps: []
status: ready
---
<!-- Written by product-owner 2026-11-05 (groom, editable-level idea). Flow: wl-build-web (agent frontend-dev). About ¼ day: one string, one deliberate test update, two new tests. Ready without T-0681: the copy and "text only, no link" are fixed by D-0231 §1, and the line keeps the existing disabled-reason style, so there is nothing for design to decide. T-0681 amends UF-08.5.md to the same text in parallel. Spec: docs/specs/editable-level.md AC10 and AC11 (UF-08 side). -->

## Why
A user stuck behind "Above your level" on UF-08.5 had no way out (the idea's trigger). Level is now editable on UF-11.3 (D-0230). D-0231 §1 says UF-08.5 points there in text only. A link would leave UF-08 and discard the setup visit (adds, order, Skip today; D-0109). This follows the "Excluded. Include it again in Plan › Excluded exercises." pattern (D-0205). The new level reaches UF-08 with no code here: `SessionSetup` calls `isEligible(e, data.profile, [])` with the cached profile, which T-0682's Save refreshes.

## Scope
- In:
  - `apps/web/src/lib/i18n/flows/uf-08.ts`: `reasonLevel` becomes "Above your level. Change it in Plan › Edit plan." (with "›", U+203A, as in the excluded line).
  - `apps/web/src/features/UF-08/__tests__/add-states.test.tsx`: the `expectDisabled("Pull up", "Above your level")` assertion changes to the new string. This is a spec change named by D-0231 (Consequences), not a weakened test.
  - A new `apps/web/src/features/UF-08/__tests__/level-pointer.test.tsx` for the ACs below, using `harness.tsx` and `fixtures.ts`.
  - A product change in `features/UF-08/**` only if a test shows one is needed (for example, the line isn't in the actions' `aria-describedby`). Log the red run first.
- Out:
  - Any link, button or navigation to `/plan*` from UF-08 (D-0231 §1, spec non-goal).
  - UF-05.1 and UF-08.3 swap lists (rule 12 filters ineligible exercises, so no line appears).
  - UF-09.

## Acceptance criteria
Fixtures: `fProfile` (beginner, full equipment), the UF-08 test library with pull-up at level intermediate, F-input (`budgetMin 30`), zero history, Europe/Stockholm, offline unless stated (UF-08.5 is offline-complete). Test titles start `T-0684 ACn`.
- **AC1 (the line, spec AC10)** Given level beginner, When UF-08.5 opens and the user searches "Pull up", Then:
  - the Pull up row's line reads exactly "Above your level. Change it in Plan › Edit plan.";
  - its Add (and "Start with this", if shown) is `aria-disabled="true"`, and each action's `aria-describedby` resolves to that line;
  - a tap calls neither `suggest` nor any write.
- **AC2 (no way out, spec AC10)** Given AC1's open sheet, Then:
  - `within(dialog).queryAllByRole("link")` has no element whose `href` contains `/plan`;
  - no button in the dialog has an accessible name containing "Plan" or "level" except the disabled actions;
  - clicking the line text leaves the location unchanged.
- **AC3 (online too)** Given AC1 online, Then the line and AC2 are the same. The offline case is AC1.
- **AC4 (new level reaches UF-08, spec AC11)** Given the cached profile at level intermediate (as after T-0682's Save and `refreshAll`), the device offline, F-input, zero history, back neither recovering nor in Skip today, When UF-08.5 shows Pull up, Then:
  - it has no "Above your level" line, and Add is enabled;
  - when Add is tapped, the re-suggested plan's items include `pull-up` (rule 0 with intermediate; it fits under rule 7.2 step 2 at 30 min).
- **AC5 (advanced also passes)** Given level advanced, Pull up has no line (rule 0: intermediate ≤ advanced).
- Planted fault (log): on a backup copy of `uf-08.ts`, restore the old "Above your level", so AC1 goes red. Restore with `cp`.

Binary-condition check (D-0197 §7):
- Online and offline: AC1 against AC3.
- Below and at-or-above level: AC1 against AC4 and AC5.

## Paths you may change
- `apps/web/src/features/UF-08/**` (lane)
- Listed extras:
  - `apps/web/src/lib/i18n/flows/uf-08.ts` (web-shell flow file): the `reasonLevel` string
  - `docs/tickets/T-0684-uf08-above-level-pointer.md` (log)

## Contract impact
none.

## Definition of done
- Tests for every AC pass. Run with `scripts/locked.sh small npx vitest run <files>`, then the full gate once.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` are green.
- Run the flow's e2e spec once: `scripts/locked.sh heavy npx playwright test --config tests/e2e/playwright.config.ts uf-08-add`. No full suite.
- Commits start `T-0684 UF-08.5:`.

## Build / accept log

**2026-11-05 build (frontend-dev).** Start: clean tree, HEAD d2cb3ddc. `uf-08.ts` `reasonLevel` → "Above your level. Change it in Plan › Edit plan." (U+203A, text only, D-0231 §1). `add-states.test.tsx` AC1 Pull up string updated (D-0231 Consequences; same assertions). New `level-pointer.test.tsx`. No product change in `features/UF-08/**` needed: the line was already each action's `aria-describedby`.
- AC1 → `T-0684 AC1 offline, beginner…` (exact text, Add + Start with this `aria-disabled`, `aria-describedby` resolves to the line, tap: no `suggest`, no `fetch`)
- AC2 → `T-0684 AC2 offline: no link or anchor in the row…` (no link/`a` in row, no `/plan` href in dialog, no Plan/level button but the disabled actions, clicking the line keeps the location)
- AC3 → `T-0684 AC3 online…` (AC1 + AC2 with `useOnline` and `navigator.onLine` true)
- AC4 → `T-0684 AC4 cached profile at intermediate…` (no line, Add enabled, re-suggested items include `pull-up`, offline)
- AC5 → `T-0684 AC5 advanced…`
- Red on unfixed code: new file 3 failed (AC1–AC3) / 2 passed (AC4, AC5: no code needed, as the ticket expects).
- Planted faults (backup + `cp` restore): old copy in `uf-08.ts` → AC1, AC2, AC3 red; `<a href="/plan/edit">` around the line → AC2, AC3 red; Add `aria-describedby` dropped → AC1, AC3 red.
- Gate: `turbo run typecheck lint test --filter=@workoutlab/web --force --concurrency=1` green (373 files, 4903 tests); `-w format:check` green; e2e `uf-08-add` 4/4. `-w check:repo` has one finding, `ticket-not-on-base`, from the environment: the ticket is on local `main-hzlbfc` (4 commits ahead of `origin/main`, not pushed), and the worktree has no `main` ref. The diff only touches ticket-listed paths.
