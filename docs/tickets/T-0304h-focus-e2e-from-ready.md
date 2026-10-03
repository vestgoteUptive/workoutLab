---
id: T-0304h
title: UF-09 end-to-end from UF-08.4 — reload mid-rest and mid-pause (NFR-TIME-2), a keyboard-only loop with focus, targets and axe on every step (NFR-A11Y-1/2/6), one screen at a time
lane: web-feature:UF-09
screens: [UF-08.4, UF-09.1, UF-09.2, UF-09.3, UF-09.4, UF-09.5, UF-09.6, UF-09.9, UF-03.3]
decisions: [D-0045, D-0071, D-0086, D-0091, D-0110, D-0112, D-0116, D-0118, D-0120, D-0123, D-0158, D-0168]
deps: [T-0304d, T-0304g, T-0303d]
status: ready
---
<!-- Groomed 2026-10-02 by product-owner; re-groomed 2026-10-03 (D-0168 §1): the 10-set offline
workout (NFR-OFF-2) and two devices (NFR-SYNC-4) moved to T-0468 in a new spec file. Child of
docs/tickets/T-0304-focus-mode.md (parent AC-D7 and AC-D10). Mostly e2e; UF-09 code changes only to
fix what these rows find. Build flow: wl-build-web. About ½ day. All deps are on main. -->

## Why
The unit tests prove each step. This ticket proves two product promises end to end in a built
browser, starting where a real workout starts, on UF-08.4 Start (T-0303d):
- time survives a reload (NFR-TIME-2);
- the whole loop works by keyboard, with the focus on the one primary action of each step
  (principle 1, NFR-A11Y-1/6).

## Scope
- In:
  - **e2e rows** appended to `tests/e2e/uf-09-focus.spec.ts`. They start at `/` → UF-08.1 → UF-08.2
    → UF-08.4 → Start. They reuse `fixtures/uf-04-library-data.js` (`exercises`, `exerciseAreas`,
    `profile`), as `uf-08-setup.spec.ts` does, with no fixture edits.
  - **UF-09 fixes.** Any fix in `features/UF-09/**` that these rows expose, with a unit test that
    pins it.
- Out:
  - The 10-set offline workout and two devices (T-0468, `tests/e2e/uf-09-offline.spec.ts`).
  - New unit features. Back handling (T-0394, on main; a second cycle is T-0462).
  - Edits to `tests/e2e/fixtures/**`, `features/UF-08/**`, `lib/**`, `tests/e2e/uf-08-setup.spec.ts`
    and the shell specs.
  - Any contract change.

### Edge cases that are in scope
- **Time running out:** the reload keeps the wall-clock rest and the paused elapsed time (AC-1).
- **Offline:** AC-1 runs once online and once offline (after the precache settles), because a
  reload with no network is the realistic case in a gym.
- **Zero history:** the profile fixture has no history, so the plan is the engine's zero-history
  plan.
- **Returning after 10 days off:** the 12 h stale rule is T-0304a's and isn't re-tested here.

## Acceptance criteria
**Test setup.**
- Playwright, built app (`vite preview`), `test`/`expect` from `fixtures/guarded-test.js` (D-0086),
  signed in with `mockSupabaseAuth`, `mockSupabaseRest`, `mockSupabaseData({exercises,
  exerciseAreas, profile, …})` and `mockProfilePresent`.
- An in-spec helper `startFromReady(page, budgetChip)` drives `/` → Start workout → UF-08.1 → chip →
  Suggest → UF-08.2 → Looks good → UF-08.4 → Start. It returns the `/session/<id>` id. (T-0468 has
  its own copy in its own spec, D-0168 §1.)
- Timers may be passed with `page.clock` (installed before the first `goto`) or with the step's
  own buttons (Skip rest, Save). At least one set per run goes through the **real** 5 s auto-save
  (D-0120 §9).
- Offline rows run after the precache settles and assert built content after any reload (D-0091
  §1), for example the step heading and "Set n of N".
- Each new test title starts with `T-0304h AC-n`.

- **AC-1 (reload, NFR-TIME-2, parent AC-D7)** Run once online and once offline.
  - **Mid-rest.** After Start, Skip warm-up and Done set, the auto-save gives UF-09.5. The test
    reads the rest `role="timer"` text, waits about 3 s, and reloads. After the reload, UF-09.5
    shows a remaining time equal to the pre-reload value minus the wall time that passed, ±1 s.
  - **Mid-pause.** "Pause workout" leads to UF-09.9. The test reads "Elapsed m:ss", waits about 3 s,
    and reloads. After the reload, UF-09.9 shows the same elapsed ±1 s: it doesn't grow while
    paused.
- **AC-2 (keyboard only, focus, targets and axe, NFR-A11Y-1/2/6, parent AC-D10)**
  - **The walk.** Online, using Tab, Enter and Space only (no `click`, no `page.mouse`):
    1. Start on UF-08.4.
    2. UF-09.1: "Start now".
    3. UF-09.2: "Next move" until the warm-up ends.
    4. UF-09.6: "I'm ready".
    5. UF-09.3: Done set.
    6. UF-09.4: Save.
    7. UF-09.5: Skip rest, back to UF-09.3.
    8. Pause workout → UF-09.9 → Resume → back to the same step.
    9. Pause workout → End workout → confirm "End workout" → `[data-screen-id="UF-03.3"]`.
  - **Focus.** On each new step, `document.activeElement` is that step's primary action (D-0118,
    D-0119, D-0120): Start now, Next move, I'm ready, Done set, Save, Skip rest, Resume, and Cancel
    in the End confirm. Checked with `toBeFocused`.
  - **Targets.** Every visible button on UF-09.1, .2, .3, .4, .5, .6 and .9 is ≥ 44 × 44 px
    (bounding boxes). Done set is ≥ 200 px tall.
  - **axe** reports 0 serious or critical violations on UF-09.1, .2, .3, .4, .5, .6 and .9.
  - **The session row.** It has `ended_at` set (IndexedDB) and the original `started_at`.
- **AC-3 (one screen at a time, principle 1)** In every row above, at every assert point,
  `[data-screen-id]` has count 1, and `getByRole("navigation")` has count 0 on `/session/<id>`.

**Red proof (planted faults, on a backup copy, restored with `cp`).** These rows test code that
is on main, so they are green there. Prove each can fail, and record the red runs in the build log:
- AC-1: make the rest timer restart from its full length on restore (for example, ignore the
  persisted timer start in the restore path). The mid-rest row must fail.
- AC-1: let the paused elapsed time grow while paused. The mid-pause row must fail.
- AC-2: remove the initial focus on "Start now" (or on Skip rest). The focus assert must fail.
- AC-3: render a second `[data-screen-id]` on UF-09.9. The count assert must fail.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`), for fixes these rows expose.
- **Listed extras:**
  - `tests/e2e/uf-09-ready.spec.ts`: a **new** spec for this ticket's rows instead of appending to uf-09-focus.spec.ts, to keep clear of T-0462 (orchestrator amendment 2026-10-03, from the build and review).
  - `tests/e2e/uf-09-focus.spec.ts`
  - `apps/web/src/lib/i18n/flows/uf-09.ts`
  - `docs/tickets/T-0304h-focus-e2e-from-ready.md`
- Notes on the extras: the spec gets appended rows and in-spec helpers only (D-0071 §10); the
  strings file gets added keys only, multi-line shape, and only for a fix that needs a string;
  this ticket file is for the build and accept logs.
- Read-only imports (not grants): the existing `tests/e2e/fixtures/*` exports (`guarded-test`,
  `supabase-mock`, `uf-04-library-data`).

## Contract impact
None.

## NFRs owned
TIME-2 end-to-end (AC-1), A11Y-1, A11Y-2 and A11Y-6 for UF-09 (AC-2).

## Definition of done
Tests for every AC pass · the new rows pass twice in a row with no flake · the e2e specs for this
flow (`uf-09-focus.spec.ts`, `uf-08-setup.spec.ts`) green; the whole web e2e only if a UF-09 fix
lands outside a test (D-0158) · `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`,
`-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` green, each
inside `flock /tmp/workoutlab-tests.lock` · contracts unchanged · commits start `T-0304h` and cite
the screen (for example `T-0304h UF-09.5: rest survives a reload`).

## Notes
- **Flow:** `wl-build-web`.
- **Deps.** T-0304d (UF-09.9 End and its focus), T-0303d (UF-08.4 Start) and T-0304g (device
  features) are all on main.
- **Fixture note.** T-0393 is done, so `uf-04-library-data` has loaded exercises. Assert set
  counts, steps and fields, not kg text.
- **Parallel.** T-0468 is the same lane but a different spec file. They share no file, so either
  order works; if one lands a `features/UF-09/**` fix, the other merges main before its gate.
  T-0462 (Back second cycle) also appends to `uf-09-focus.spec.ts`: don't run them together.

## Build / accept log

### Build log (2026-10-03, QA/e2e)
- Rows are in a new file `tests/e2e/uf-09-ready.spec.ts` (orchestrator instruction: parallel T-0462 appends to `uf-09-focus.spec.ts`); `uf-09-focus.spec.ts` is untouched. No UF-09 product code changed; no unit tests needed.
- AC-1 -> "T-0304h AC-1 mid-rest" and "mid-pause", each online and offline (4 tests; rest ±1.2 s of the wall clock, pause ±1 s). AC-2 -> "T-0304h AC-2 the walk" (Tab/Enter/Space only; focus on every primary, targets ≥ 44 (Done set ≥ 200), axe on 09.1/.2/.6/.3/.4/.5/.9, session row `ended_at` + `started_at` in IndexedDB). AC-3 -> `expectOneScreen` (one `[data-screen-id]`, no navigation) at every step in all rows.
- Planted faults (backup copy, restored with `cp`, each red alone): persist.ts restore resets the timer start -> mid-rest red (3.1 s off); timer.ts `elapsedS` ignores `pausedAtMs` -> mid-pause red (3 s growth); get-ready.tsx without the initial focus -> the walk red at "Start now" `toBeFocused`; host.tsx extra `data-screen-id` on UF-09.9 -> the walk red at the count assert. (A first stacked run was discarded; faults re-run one at a time.)
- Results: new spec 5/5, `--repeat-each=3` 15/15; whole web e2e 202/202.

### QA log (2026-10-03, HEAD b3689f4, tree clean before and after)
- AC-1 -> "T-0304h AC-1 mid-rest"/"mid-pause" x online/offline. AC-2 -> "T-0304h AC-2 the walk" (focus, 44 px, axe, session row). AC-3 -> `expectOneScreen` at every step.
- Faults, each alone, restored with `cp`: persist.ts restore resets timer start -> 2 failed (mid-rest, 3.1 s off); second `data-screen-id` on UF-09.9 -> 3 failed (count 2); own: no initial focus on UF-09.6 "I'm ready" -> walk red (`toBeFocused`, inactive).
- Green: spec `--repeat-each=5` 25/25; whole web e2e 202/202; cached gate (typecheck lint test) green; `test:repo-checks` 159/0; format:check clean; check-all rc 0.

### Accept log (2026-10-03, product-owner, HEAD d716a23, tree clean)
- AC-1 -> "T-0304h AC-1 mid-rest"/"mid-pause" x online/offline: builder's planted fault (persist.ts restore resets timer start) reproduced red by QA (2 failed, 3.1 s off). AC-2 -> "T-0304h AC-2 the walk": QA's own planted fault (no initial focus on UF-09.6 "I'm ready") reproduced red (`toBeFocused`, inactive); walk also covers Tab/Enter/Space-only navigation, 44 px targets (Done set ≥ 200 px), axe on UF-09.1/.2/.3/.4/.5/.6/.9, and the session row (`ended_at` + original `started_at`). AC-3 -> `expectOneScreen` at every step; builder's planted fault (second `data-screen-id` on UF-09.9) reproduced red (3 failed, count 2).
- Scope check: only `tests/e2e/uf-09-ready.spec.ts` (new file, per orchestrator amendment to avoid T-0462 collision) and this ticket file changed; no UF-09 product code, no i18n keys, no fixture edits — all within the granted paths.
- Full-tier results confirmed from QA log: spec `--repeat-each=5` 25/25 (no flake), whole web e2e 202/202, cached gate (typecheck lint test) green, `test:repo-checks` 159/0, `format:check` clean, `check-all` rc 0. Contracts unchanged.
- Branch behind main by 11 unrelated commits, no shared files with this ticket's changes; per D-0169 §2 no merge/gate re-run required here.
- Verdict: **done**. Every AC has a passing test backed by an independent red reproduction of a planted fault; the definition of done in the ticket and CLAUDE.md is met.
