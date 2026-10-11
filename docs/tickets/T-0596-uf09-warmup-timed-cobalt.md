---
id: T-0596
title: "UF-09.2 Warm-up and UF-09.7 Timed set in the lift state with the deep fill (lift.bg-deep over lift.bg) replacing the ring; session outline buttons for Restart, Pause and Next; countdown in the hero roles"
lane: web-feature:UF-09
screens: [UF-09.2, UF-09.7]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0119, D-0062]
deps: [T-0595]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ⅓ day. Canvas: "Warm-up", "Timed set" (#turn-4). Behaviour: T-0304c. UF-09 folder chain; never in parallel with T-0580. -->
## Why
Warm-up and timed holds are lift moments with a countdown. The README gives them the drain idea in lift colours: `lift.bg-deep` above `lift.bg`, with red rising as the time runs. That replaces the ring.

## Scope
- **In:**
  - `warmup.tsx`, `timed-set.tsx`, `ring.tsx` (removed from these views) and `uf-09.css`.
  - Both roots have `data-wl-state="lift"` and `.wl-drain .wl-drain--deep`, with `drainStyle(elapsedS, totalS)` from the existing timer state, stepped once per second.
  - The remaining time is in `.wl-type-hero-number`; a single-digit get-in-position countdown is in `.wl-type-countdown` (18.75rem).
  - Restart, Pause timer/Resume timer and Next move are `.wl-button--session-outline`. Log hold is the session primary.
  - The cue is in the body role.
- **Out:**
  - Copy, including the T-0619 captions (already in).
  - Timer, cue and voice behaviour.

## Acceptance criteria
- **AC1 (state and fill).** **Given** UF-09.2 with a 40 s move (fake timers in vitest) **when** 10 s have passed **then** the root's `--wl-drain` is "25%". At 40 s it's "100%". The same for UF-09.7 with its hold length. In Playwright, the top pixel at 0 % is `lift.bg-deep` and at 100 % is `lift.bg`.
- **AC2 (no ring).** Neither view renders `.wl-uf09__ring`. The 3-2-1 voice cue and the 10 s cue still fire once (existing assertions, unchanged).
- **AC3 (state named in text).** The T-0619 captions ("Warm-up · move n of N", "Timed set · n of N") are visible.
- **AC4 (contrast).** White on `lift.bg-deep` (6.1) and on `lift.bg` (4.8) as computed. Axe colour-contrast has 0 violations at 0 %, 50 % and 100 % fill.
- **AC5 (motion).** The fill's `transition-duration` is `1s`, and `0s` under reduced motion (it jumps each second). Both values are tested.
- **AC6 (targets, type, guard).** Controls are ≥ 44 × 44. The changed CSS has no px font size and no raw colour.
- **AC7 (behaviour unchanged).** `uf-09-focus.spec.ts` warm-up and timed cases, `uf-09-offline.spec.ts` and the UF-09 vitest suite pass with no role, name or timing change. Pausing the timer on UF-09.7 freezes `--wl-drain` (the paused value is unchanged after 5 s), and resuming continues it. Both are tested.
- **AC8 (visual compare).** `compareWithCanvas` saves "Warm-up" and "Timed set" (turn-4) pairs at 390 × 844. The log lists the verdicts.

Checklist (D-0197 §7):
- Paused and running (AC7) and reduced motion on and off (AC5) are both covered. With no warm-up in the plan, UF-09.2 never shows: the existing test covers it.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/features/UF-09/**` (lane)
- `tests/e2e/uf-09-focus.spec.ts` (listed extra)
- `docs/tickets/T-0596-uf09-warmup-timed-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · the UF-09 e2e specs green · commit messages start with `T-0596` and cite UF-09.2/UF-09.7.

## Build / accept log

- Build (frontend-dev): host.tsx puts data-wl-state=lift and `wl-drain wl-drain--deep` plus `--wl-drain` (from new `drain-fill.ts`, `drainPercent` of elapsed/total, one step per host re-render) on the UF-09.2/.7 root; warmup.tsx and timed-set.tsx lose Ring (ring.tsx deleted; rest.tsx keeps its own ring CSS); hero number / countdown roles; session-outline controls, Log hold session primary. CSS section `T-0596` in uf-09.css; T-0595's root rule now sets `background-color` so the gradient shows.
- AC map: AC1 t0596.fill (0/25/50 %, 20 %, pure 100 %) + e2e pixels (top = bg-deep at 0 %, lift.bg at 100 %); AC2 t0596.fill no ring + existing cue tests; AC3 t0596.fill + e2e captions; AC4 t0596.fill tokens (>= 6.1 / 4.8) + e2e white text and axe at 0/50/100 %; AC5 t0596.css + e2e 1s/0s both; AC6 t0596.css + e2e >= 64 px; AC7 t0596.fill pause freezes and resumes + existing suites; AC8 canvas pairs below.
- Existing tests changed (ring gone by design): t0304g.motion (UF-09.2/.7 moved out of the ring list), timed-set.test (Pause timer class), t0595.css.test (background-color).
- Planted faults (all red, restored from backup): elapsed vs remaining, pause ignored, reduce block removed, ring class back.
- Red on unfixed: first e2e run top pixel was lift.bg (legacy .wl-uf09 background beat .wl-drain--deep) -> scoped gradient rule added.
- Gate: typecheck/lint/test, test:repo-checks, format:check, check-all, full e2e (511) all exit 0.
- Canvas verdicts: Warm-up and Timed set match layout, fill and hero scale. Deviations: warm-up has Restart and Next move only (no Pause in the machine; Next is outline per ticket); clock tracking -0.02em (the -0.06em role made the colon touch the 4); the sample data (name, cue, caption total) differs.
