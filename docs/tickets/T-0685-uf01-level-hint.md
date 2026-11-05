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

**Build 2026-11-05 (frontend-dev).** Start: clean tree, HEAD d2cb3ddc. `LevelScreen.tsx`: `<p id="wl-uf01-level-later" class="wl-type-label">` after `#wl-uf01-level-hint`, static, no live region; radiogroup `aria-describedby="wl-uf01-level-hint wl-uf01-level-later"`. `flows/uf-01.ts`: Advanced hint → D-0233 §3 copy, new `level.changeLater`. No existing test asserted the old Advanced copy, so no test was edited.
- AC1 → `level-later.test.tsx` "T-0685 AC1 …" (Beginner checked, DOM order, accessible description, not in aria-live/status/alert)
- AC2 → "T-0685 AC2 …" (Advanced exact copy, old copy absent, line unchanged, Intermediate unchanged)
- AC3 → "T-0685 AC3 …" (restored advanced record)
- AC4 → "T-0685 AC4 …" (Get started, Continue, Continue → UF-01.4 with 9 target rows); `screens`/`keyboard`/`timing-frozen`/`a11y` pass unchanged
- AC5 → "T-0685 AC5 navigator.onLine=false|true …" (AC1 + 0 fetch / supabase calls)
- Red on unfixed source (HEAD copies of both files): 5 failed / 1 passed (AC4 green, as it should be).
- Planted faults (backup copies restored with `cp`): drop `wl-uf01-level-later` from describedby → AC1/2/3/5 red; merge the line into the hint `<p>` → AC1/2/3/5 red; preselect intermediate in `pending-plan.ts` → AC1/4/5 red; old Advanced copy → AC2/3 red. Restored: 6/6 green.
- Gate: `turbo run typecheck lint test --filter=@workoutlab/web --force --concurrency=1` green (4/4 tasks, 373 files / 4904 tests); `-w format:check` green; e2e `uf-01-onboarding` 28/28 incl. "3 activations …". `-w check:repo` in this worktree reports `ticket-not-on-base`: there is no local `main`, and `origin/main` (3d91948c) predates the ticket. An isolated clone with `main` at the base d2cb3ddc gives `check-all.mjs` exit 0; the diff is exactly the 4 granted paths.

**Review + QA 2026-11-05 (code-reviewer).** Start: clean tree, HEAD 2868753d. Copy matches D-0232 §2/§4 and D-0233 §3; `barbell-deadlift` is `level: "advanced"` in `data/exercises/library`. Lane: 4 granted paths, no tokens or contracts touched.
- Planted (backup restored with `cp`): line `aria-live="polite"` → AC1/AC5 red; line inside the radiogroup as a radio → AC1/AC5 + `screens` red; describedby order reversed → AC1/2/3/5 red; line only after a level change → AC1/3/5 red; line moved below the equipment group → **all green (gap)**.
- Added "T-0685 AC1 (review) …" (hint's next sibling, in the level group, before the equipment group); red under the last fault, green on the change.
- Fold (scratch Playwright, Desktop Chrome, `vite preview`): Continue bottom 800/844 at 390×844, 724/740 at 360×740, 624/640 at 360×640, so it stays fully in view. The line is 19.6 px. At 360×740 the page now scrolls 28 px where it didn't before. No committed e2e guards this.
