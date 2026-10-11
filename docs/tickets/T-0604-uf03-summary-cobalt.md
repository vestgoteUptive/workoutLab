---
id: T-0604
title: "UF-03.3 Summary in the plan state: stats in the stat role, the PR as a full-bleed lift band, 14-day balance rows, effort 1–5 as a segmented control on its native inputs, Save workout as the one white primary"
lane: web-feature:UF-03
screens: [UF-03.3]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0030]
deps: [T-0603]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ⅓ day. Canvas: "Summary" (#turn-3). Behaviour: T-0305, T-0419. The effort scale stays 1–5 (D-0030; the canvas's 3-point scale is rejected in D-0212 §4). -->
## Why
The summary closes the workout, so it's a plan moment. The README shows the PR as a red band; PRs used `warn` before (D-0211 §5).

## Scope
- **In:**
  - `SummaryContent.tsx`, `EffortSave.tsx` and `summary.css`.
  - The root has `data-wl-state="plan"`.
  - The title is a page title with `.wl-title--stop`.
  - The time, exercises and sets stats are in `.wl-type-stat` with label captions.
  - A PR, when present, is a full-bleed `lift.bg` block with white text.
  - The 14-day balance lines are `.wl-row`; "See balance" is a text button.
  - Effort is a `.wl-segmented` on its existing native inputs (5 options).
  - "Save workout" is the one primary; the save error uses the plan error form.
- **Out:**
  - Copy, new stats (D-0212 §4) and the effort scale.

## Acceptance criteria
- **AC1 (state).** The Summary root has `data-wl-state="plan"`, and `theme-color` is `plan.bg`.
- **AC2 (PR band).**
  - With a seeded PR, the band's background is `lift.bg`, its text is white (≥ 4.8), it spans x = 0 to the viewport width at 390 px, and the PR is named in its existing text.
  - Without a PR, no band renders.
  - Both are tested.
- **AC3 (effort).** The five effort options are found by `getByRole("radio", { name })` with their existing names. The selected one is a `plan.selected` pill (8.6), and arrow keys move it.
- **AC4 (error).** A failed save shows the plan error form, `plan.attention` text (≥ 5.0). A successful one shows none. Both are tested.
- **AC5 (contrast, targets, type, motion, guard).**
  - Axe colour-contrast has 0 violations with and without a PR.
  - Every control is ≥ 44 × 44.
  - No px font size and no raw colour.
  - Only the cross-fade animates, and it's instant under reduced motion. Both values are tested.
- **AC6 (behaviour unchanged).** The `uf-03-list-summary.spec.ts` summary cases and the UF-03 vitest suite pass with no role or name change. "Every area is on target" and the "Next up" line each render.
- **AC7 (visual compare).** `compareWithCanvas` saves "Summary" (turn-3) with a PR, plus an app-only shot without one. The log lists the verdicts. Expected deviations: no volume or 1RM, and a 5-point effort.

Checklist (D-0197 §7):
- PR present and absent, save failed and succeeded, all areas on target and not, and reduced motion on and off are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/features/UF-03/**` (lane)
- `tests/e2e/uf-03-list-summary.spec.ts` (listed extra)
- `docs/tickets/T-0604-uf03-summary-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `uf-03-list-summary.spec.ts` green · commit messages start with `T-0604` and cite UF-03.3.

## Build / accept log

- 2026-10-11 build (frontend-dev). Start: clean, HEAD b3113ae.
  - Files: `index.tsx` (plan root, page title with stop), `SummaryContent.tsx`, `EffortSave.tsx`, `summary.css` (rewritten, scoped to `.wl-uf03-summary`; the old classes were used nowhere else, grepped src and tests/e2e, except `__stat`, kept), `summary-data.ts` (optional `pr` field only), `__tests__/t0604.*`, e2e cases in `uf-03-list-summary.spec.ts`.
  - Effort: the radiogroup is now the `.wl-segmented` itself (labels are its direct children); the heading is its labelled-by sibling. Radios fill their label (≥ 44). Words wrap so five fit at 390.
  - PR seam: no PR is computed. `EndedSummary.pr?: {text} | null` is optional, `loadSummary` leaves it out, so no band renders today. The band is a nested `data-wl-state="lift"` section; its bleed reads `--wl-uf03-gutter` set at the plan root, because the lift state's own `--wl-gutter` is 26 px (first run: band at x = 2).
  - e2e: no real PR source, so the band cases insert the component's own markup into the real page (CSS under test is the app's); vitest renders the real band via a mocked `loadSummary`.
  - AC map: AC1 t0604.cobalt (state, theme-color) + e2e plan bg; AC2 cobalt (band/none/null) + css (bleed, 4.8) + e2e (x 0, w 390, lift.bg, white); AC3 cobalt + e2e (names, arrow keys, plan.selected pill); AC4 cobalt (failed/succeeded) + css (attention 5.0); AC5 css (no px, no raw colour, 200 ms / none) + e2e (axe, 44, transition 0.2s / 0s, nothing else); AC6 existing summary suite + T-0420 e2e + cobalt; AC7 canvas compare "Summary" (turn-3) with PR + no-PR app shot.
  - Planted faults (backup copies, restored): root state removed, band always on, `wl-segmented` removed, error class removed, gutter variable reverted (css red; e2e red x = 2), radio inset removed: each went red on the matching test only.
  - Visual verdict: matches canvas in plan bg, title stop, stat role, full-bleed lift band, hairline rows, segmented pill and white Save. Deviations (expected): no volume or 1RM, no eyebrow or PR sub-line, rows are 14-day balance lines not exercise lines, 5-point effort, no check icon on Save.
  - Title: `apps/web/src/app/__tests__/routes.phase3.render.test.tsx` (web-shell) pins the bare `<h1>{en.screens.sessionSummary}</h1>`, so the full stop is the shared `.wl-title--stop` rule scoped to `.wl-uf03-summary > h1::after` in summary.css (first gate run was red on that test). Follow-up for web-shell: let that test accept a class.
  - Gate: typecheck/lint/test 0; test:repo-checks 0; format:check 0; check-all 0; full e2e 583 passed (exit 0). One run of `list-view.swap.host.test.tsx` failed under load once and passed alone (9/9) and in the second gate.
