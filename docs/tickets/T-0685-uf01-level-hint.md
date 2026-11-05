---
id: T-0685
title: "UF-01.3: one static line 'You can change this later in Plan.' under the level hint, in the 'Training experience' radiogroup's aria-describedby; Advanced hint becomes '2+ years. Adds the most demanding lifts, like the barbell deadlift.'; Beginner preselect and the 3-activation path unchanged"
lane: web-feature:UF-01
screens: [UF-01.3]
decisions: [D-0232, D-0233, D-0064, D-0014]
deps: []
status: ready
---
<!-- Written by product-owner 2026-11-05 (groom, editable-level idea). Flow: wl-build-web (agent frontend-dev). About ¼ day. Ready without T-0681: D-0232 §2 and D-0233 §2–§3 fix the copy, the place (under the level hint), the style (the hint's `wl-type-label`) and the a11y. T-0681 updates the prototype copy in parallel. The UF-01.3 canvas compare (`uf-01-onboarding.spec.ts` AC8) only writes images when `WL_CANVAS_COMPARE=1`, so the new line doesn't fail it. Spec: docs/specs/editable-level.md AC14. -->

## Why
Onboarding keeps the Beginner preselect for a 3-activation path to a plan (principle 5, D-0064 §2). Now that level is editable (D-0230), one line tells the user the choice isn't final (D-0232). The old Advanced hint, "Higher volume and advanced progression schemes.", is false in v1, because level changes neither targets (rule 4) nor progression (rule 14). D-0233 §3 replaces it.

## Scope
- In:
  - **`apps/web/src/features/UF-01/LevelScreen.tsx`:**
    - Under `#wl-uf01-level-hint`, add `<p id="wl-uf01-level-later" className="wl-type-label">` with the new line.
    - The radiogroup's `aria-describedby` becomes `"wl-uf01-level-hint wl-uf01-level-later"`.
    - The line is static: the same text for every selection, and not a live region.
  - **`apps/web/src/lib/i18n/flows/uf-01.ts`:**
    - `level.levels.advanced.hint` gets the D-0233 §3 copy;
    - a new `level.changeLater`.
    - The Beginner and Intermediate hints are unchanged.
  - **Tests:** a new `apps/web/src/features/UF-01/__tests__/level-later.test.tsx`, plus a deliberate update to any UF-01 test that asserts the old Advanced hint (a copy change named by D-0233 §3).
- Out:
  - The control, its "Training experience" name, the preselect, steps and timing (D-0232 §1–§3).
  - The prototype (T-0681).
  - UF-11.

## Acceptance criteria
Test titles start `T-0685 ACn`.
- **AC1 (the line, spec AC14)** Given a new visitor at `/welcome/level`, Then:
  - Beginner is checked;
  - the text "You can change this later in Plan." is shown after the level hint in DOM order;
  - the radiogroup named "Training experience" has the accessible description "Under 6 months. We start with form-first variations like the goblet squat. You can change this later in Plan.";
  - the line is not inside `[aria-live]`, `[role=status]` or `[role=alert]`.
- **AC2 (static across selections)** When the user picks Advanced, Then:
  - the hint reads "2+ years. Adds the most demanding lifts, like the barbell deadlift.";
  - the line is unchanged and still in the description;
  - no element reads "Higher volume and advanced progression schemes."
  - Picking Intermediate shows its unchanged hint "6 months to 2 years. Barbell basics plus targeted accessories."
- **AC3 (restored answer, D-0064 §6)** Given a pending plan restored with level advanced, When UF-01.3 renders, Then Advanced is checked and the line is shown. The preselected case is AC1.
- **AC4 (fastest path unchanged, spec AC14 and principle 5)** Given a new visitor, When they activate Get started, Continue and Continue, Then UF-01.4 renders a plan. The existing 3-activation tests (`screens.test.tsx`, `keyboard.test.ts`, `timing-frozen.test.tsx`) pass unchanged, and the e2e `uf-01-onboarding.spec.ts` "3 activations …" test passes.
- **AC5 (offline)** Given offline (onboarding works from the device), Then AC1 holds. Online is AC1 as well; the screen makes no request.
- Planted fault (log): on a backup copy, drop `wl-uf01-level-later` from `aria-describedby`, so AC1 goes red. Restore with `cp`.

Binary-condition check (D-0197 §7):
- Preselected and restored level: AC1 against AC3.
- Online and offline: AC5.
- First launch and returning: a returning user with a profile skips onboarding (D-0064 §8), so only the first-launch case can reach UF-01.3.

## Paths you may change
- `apps/web/src/features/UF-01/**` (lane)
- Listed extras:
  - `apps/web/src/lib/i18n/flows/uf-01.ts` (web-shell flow file): the Advanced hint and `changeLater`
  - `docs/tickets/T-0685-uf01-level-hint.md` (log)

## Contract impact
none.

## Definition of done
- Tests for every AC pass. Run with `scripts/locked.sh small npx vitest run <files>`, then the full gate once.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` are green.
- Run the flow's e2e spec once: `scripts/locked.sh heavy npx playwright test --config tests/e2e/playwright.config.ts uf-01-onboarding`. No full suite.
- Commits start `T-0685 UF-01.3:`.

## Build / accept log
