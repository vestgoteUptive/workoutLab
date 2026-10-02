---
id: T-0412
title: "e2e: a seed whose UF-08.2 main lift is a loaded exercise with history, so the rule 14.7 add_rep kg pre-fill renders on UF-08.2 and UF-09.3"
lane: qa
screens: [UF-08.1, UF-08.2, UF-09.1, UF-09.3]
decisions: [D-0071, D-0086, D-0108, D-0044, D-0109, D-0124]
deps: [T-0393]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-qa. About ¼ day. Follow-up from the T-0393 accept: its AC3 seed put the bodyweight moves first (rule 7.2 rank 1), so the only loaded row was an isolation (14.6 `hold`) and the main-lift 14.7 `add_rep` kg path never ran end to end. Test-only, no app code. -->

## Why
The main lift is the row a user looks at first, and the one whose pre-fill matters most. No e2e has ever rendered a loaded main lift with history: T-0393's AC3 seed logged every loaded exercise in the most recent session, so rule 7.2 rank (1) ("not in the most recent session") put the bodyweight moves first and the main lift was Push-up. The 14.7 `add_rep` result (same W, one more rep) is proven only in engine unit tests and jsdom. This ticket proves it from history through `suggest` to UF-08.2 and UF-09.3, online and offline.

## Scope
- In:
  - `tests/e2e/uf-08-setup.spec.ts`: a new `T-0412` describe block, appended. It reuses T-0393's `seedLoaded`, `exercisesLoaded`, `KG_ROW`-style matchers and helpers from the same file.
  - Its seed rows stay in the spec, and every `completed_at` is relative to `Date.now()` (D-0108 §4). It uses `guarded-test.js` (D-0086).
- Out:
  - Every existing case and export, including the T-0393 block (byte-identical).
  - `tests/e2e/fixtures/**` (no fixture edit is needed; `exercisesLoaded` exists).
  - App code and `packages/engine/**`.

## Acceptance criteria
Each test title starts with `T-0412 ACn`. The seed is T-0393's (FULL-equipment `profileRow`, F-targets, `mockProfilePresent`, `exercisesLoaded`), with a new set of history rows called `mainSeed`.
- **AC1 (the seed, derived by hand)**
  - `mainSeed` is chosen so that rule 7.2 picks a loaded compound `M` as the main lift, and `M`'s most recent session (3 to 9 days ago, so gap < 10 and outside rule 6's 48 h span) has 3 hard sets of 42.5 kg × 6 reps.
  - A comment above `mainSeed` derives it from rules 3, 6, 7.2 and 14: which area has the lowest `r`, why `M` is that area's top compound, and why rule 14 gives `M` 42.5 × 7 (`build_muscle` main slot 6–8; gap < 10; 6 < high 8, so no `increase`; one session at W, so no `deload`; 6 ≥ low 6, so no `hold`; 14.7 `add_rep` → `min(8, 6 + 1)` = 7).
  - One workable shape: `M`'s sets in an older session, and bodyweight hard sets for the other areas in a more recent one, so rank (1) favours `M`. If the rendered main row differs from the derivation, adjust the seed and its comment, never the assertions, and record each attempt in the build log.
- **AC2 (UF-08.2 main row)** **Given** `mainSeed`, **When** UF-08.1 → 30 minutes → Suggest, **Then**:
  - the first row's exercise (mapped by `name` through `exercisesLoaded`) is `M`, and it has `external_load: true`;
  - its `row-detail` matches `/^4 × 6–8 · 42\.5 kg · \d+ min$/` (D-0124: `formatKg` puts U+00A0 before `kg`); if the rendered set count isn't 4, record the observed literal and the rule 7.2 reason in the result rather than editing the seed to fit;
  - every row matches the spec's `DETAIL_PATTERN`, and there are zero console and page errors.
- **AC3 (UF-09.3 shows the add_rep pre-fill)** **Given** AC2's screen, **When** the user taps Start, then skips the warm-up (the T-0304f path), **Then**:
  - UF-09.3 is on screen for `M`'s first set;
  - its load line (`.wl-uf09__load`) reads `42.5 kg × 7`. Seven reps proves 14.7 `add_rep`: 14.6 `hold` would show 6, and 14.4 `increase` would show 45 kg.
  - There are zero console and page errors.
- **AC4 (offline equals online)** For `mainSeed`, the UF-08.2 rows after `precacheSettled`, `context.setOffline(true)`, `/session/setup` and Suggest at 30 equal the online rows, the main row's kg text included (NFR-OFF-3).
- **Red against the old seed.** Run AC2 and AC3 with T-0393's `loadedSets()` in place of `mainSeed`: both must fail (the first row is Push-up, Bodyweight). Record the red run in the build log, then restore `mainSeed`. Don't commit the swap.
- **AC5 (no regression)** Every existing case in `uf-08-setup.spec.ts`, `uf-09-focus.spec.ts`, `uf-04-library.spec.ts` and `shell.spec.ts` passes unedited. The new cases pass with `--repeat-each=5`.

## Paths you may change
- `tests/e2e/**` (the lane: `qa`).
- **Listed extras:**
  - `docs/tickets/T-0412-e2e-main-lift-add-rep-kg.md`: this file, for the build and accept log.

## Contract impact
none

## Coordination
- Files: `tests/e2e/uf-08-setup.spec.ts` (an appended describe block).
- **Overlaps:** a UF-08 web ticket that edits `uf-08-setup.spec.ts` must not run in parallel. T-0409 (ready, UF-09 weight field) changes UF-09.4, not the UF-09.3 load line, so it doesn't conflict; if it lands first, rerun AC3.
- If the derivation shows that no seed can make a loaded compound the main lift under FULL equipment, stop and raise triage: that would be an engine finding, and this ticket must not change the engine or the profile.

## Definition of done
Tests for every AC pass · the Playwright e2e job is green · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` green · commit messages start with `T-0412` and cite UF-08.2 (e.g. `T-0412 UF-08.2: a loaded main lift renders its add_rep kg pre-fill end to end`).

## Build / accept log
