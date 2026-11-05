---
id: T-0686b
title: "e2e cross-flow for editable level: UF-08.5 text pointer with no way out; a saved level reaches UF-08.5 offline; a running workout is untouched by a level change; nothing level-related in UF-09; UF-01.3 line on the 3-activation path"
lane: qa
screens: [UF-08.5, UF-09.1, UF-09.5, UF-09.9, UF-05.1, UF-01.3]
decisions: [D-0230, D-0231, D-0232, D-0233, D-0109, D-0178]
deps: [T-0682, T-0684, T-0685]
status: todo
---
<!-- Written by product-owner 2026-11-05 (groom, editable-level idea). Flow: wl-build-qa (agent qa-tester). About ½ day. The second half of the triage row T-0686 (D-0157 §7). A new spec file only, with fixtures unchanged, so no full e2e suite run is needed (D-0178 §3). Spec: docs/specs/editable-level.md AC10, AC11, AC12, AC14 and AC15. -->

## Why
Principle 1 (one task on screen in a workout) is the line this idea mustn't cross. D-0231 §3 keeps every level pointer out of UF-09 and everything reachable from it. A running workout must not change when the level changes, because `sessions.plan` is fixed at Start. The UF-08.5 pointer must stay text only, so setup is never discarded. Two more facts need a real browser and the real offline cache:
- a level saved on UF-11.3 reaches UF-08 offline;
- the onboarding fastest path still holds.

## Scope
- In: a new `tests/e2e/uf-08-level-change.spec.ts`.
  - It reuses the session helpers pattern of `uf-09-do-later.spec.ts` (`mockAll`, `startFromReady`, `precacheSettled`), copied into the spec rather than imported, if they aren't exported.
  - It uses a library fixture with pull-up at level intermediate (`fixtures/uf-04-library-data.ts`).
  - The profile row is overridden in the spec (level beginner, full equipment).
  - A spec-local stateful `profiles` route, as in T-0686a.
  - **AC6** is a Node-side source scan in the same spec file (`fs.readFileSync` over a fixed file list). It runs with no page.
- Out:
  - Edits to `tests/e2e/fixtures/**` (they would force a full suite run). If one is necessary, log why, make it, and run the full suite.
  - Edits to existing spec files.

## Acceptance criteria
Viewport 390 × 844. Test titles start `T-0686b ACn`.
- **AC1 (UF-08.5 pointer, spec AC10)** Given level beginner, When the user opens UF-08 Set up, opens Add exercise (UF-08.5) and searches "Pull up", Then:
  - the row's line reads "Above your level. Change it in Plan › Edit plan.";
  - Add is `aria-disabled="true"`;
  - the dialog has no `a[href*="/plan"]`;
  - clicking the line leaves the URL unchanged, with the setup visit intact (the item count before and after is equal).
- **AC2 (new level reaches UF-08 offline, spec AC11)** Given the user saves Level Intermediate on `/plan/edit` online (the stateful route serves the new row), and then the context goes offline, When they open UF-08 with 30 minutes (F-input, zero history) and UF-08.5, Then:
  - Pull up has Add enabled and no "Above your level" line;
  - after Add, the plan lists Pull up.
- **AC3 (running workout untouched, spec AC12)** Given a workout started at level beginner through `startFromReady` (30 minutes), which records the next exercise's name on UF-09.1 and the stored `sessions.plan` item ids (from the session upsert body), When the served profile changes to level advanced and the app refreshes (reload online), and the user resumes `/session/:sessionId`, Then:
  - UF-09.1 shows the same next exercise name;
  - the session's plan item ids read back from the app's offline store (or the next session upsert body, if one is sent) equal the recorded ones.
- **AC4 (UF-01.3 line on the fastest path, spec AC14)** Given a new visitor at `/welcome`, When they activate Get started, then on UF-01.3 the text "You can change this later in Plan." is visible and Beginner is checked, then Continue and Continue, Then UF-01.4 renders a plan within the existing `uf-01-onboarding.spec.ts` AC-7 bound (< 5 s) after 3 activations.
- **AC5 (focus mode is clean, spec AC15)** Given the AC3 workout at level beginner, with a library that has an above-level exercise for a trained area, Then on each of:
  - UF-09.1;
  - UF-09.5 (after logging a set);
  - UF-09.9 Pause;
  - UF-05.1 (swap opened from Pause);

  the page text contains neither "Change level" nor "Change it in Plan", and `page.locator('a[href*="/plan/edit"]')` has count 0.
- **AC6 (no source path, spec AC15)** AC5 only sees the screens one walk reaches, so this is the static half. The Node-side scan covers every file under `apps/web/src/features/UF-09/**` and `apps/web/src/features/UF-05/**`, plus `apps/web/src/lib/i18n/flows/uf-09.ts` and `uf-05.ts`. It finds none of "/plan/edit", "Change level" or "Change it in Plan".
  - Planted fault: on a backup copy, add the string "Change level" to `flows/uf-09.ts`, so AC6 goes red. Restore with `cp`.
- **AC7 (online sibling of AC1)** AC1 run with the context offline gives the same line and no link. UF-08.5 is offline-complete.
- Planted fault (log): on a backup copy of `flows/uf-08.ts`, restore "Above your level", so AC1 goes red. Restore with `cp`.

Binary-condition check (D-0197 §7):
- Online and offline: AC1 against AC7, and AC2 is offline by design.
- Below and at level: AC1 against AC2.
- Level changed and unchanged during a workout: AC3 compares against its own recording.
- First launch and returning: AC4 covers first launch; a returning user skips onboarding (D-0064 §8).

## Paths you may change
- `tests/e2e/**` (lane): the new `uf-08-level-change.spec.ts`
- `docs/tickets/T-0686b-e2e-editable-level-workout.md` (log)

## Contract impact
none.

## Definition of done
- AC1–AC7 pass: `scripts/locked.sh heavy npx playwright test --config tests/e2e/playwright.config.ts uf-08-level-change`, then `--repeat-each=5` on the file. Faults' red runs are logged.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` are green.
- If T-0928's e2e lint is on main, the spec passes it.
- Commits start `T-0686b UF-08.5:`.

## Build / accept log
