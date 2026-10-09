---
id: T-0618
title: "Product wording for the Cobalt app phase: user flows v2 UF-09 rows (full-width Done, drain instead of the orange ring, fill instead of the ring, state captions incl. Lifting), the UF-02.1 week row, the Exercises tab; PRD and gaps A2 cite D-0208/D-0211 instead of the lime ramp; visual-foundation.md header note"
lane: product
screens: [UF-02.1, UF-04.1, UF-09.2, UF-09.3, UF-09.5, UF-09.6, UF-09.7, UF-09.9]
decisions: [D-0208, D-0210, D-0211, D-0212, D-0002]
deps: []
status: ready
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-spec (agent product-owner). About ¼ day, docs only. Screen IDs don't change (D-0002); only description cells and default text do. Spec-first, so the UF-09 tickets are accepted against the new rows. -->
## Why
User flows v2 is the screen-ID source. Its UF-09 rows describe the Chalk & Iron controls: "Done set (200 px)", "orange + cue at 10 s", "ring". Its UF-02.1 entry has no week row, and the tab name changes (D-0212). The PRD and `docs/gaps.md` still name the lime ramp and the `warn` outline. These should match D-0208–D-0212 before the screen tickets are accepted against them.

## Scope
- **In** (`Design-docs/docs/product/user-flows.md`):
  - UF-09.3: "Exercise, 'Lifting · set n of N', weight × reps, one cue" | **Done** (full-width session button).
  - UF-09.5: "Countdown on the rest-to-lift drain, next set only" | "auto-start; cue at 10 s; 'GO' at 0".
  - UF-09.7: "Hold name, 'Timed set · n of N', deep fill".
  - UF-09.2: "Warm-up · move n of N".
  - UF-09.6: "Next exercise" caption, the done line and "Set-up time".
  - UF-09.9: the paused caption.
  - UF-09.4: "Save · start rest" when a rest follows.
  - Each changed row cites D-0208 or D-0212.
  - UF-09.3 keeps "plate loading" out: add "(Phase 5, D-0066 §13)" so the row doesn't promise it.
  - A UF-02.1 line for the week row and week line, citing D-0212 and `docs/specs/cobalt-mock-behaviour.md`.
  - The C-02 line: the tabs are "Today · Exercises · Progress · Plan".
- **In** (other docs):
  - `docs/PRD.md` "Which hue means on target?" row: "Plan coverage ramp `plan.coverage-0..4` (plan.raise → white, OKLCH). Attention is a 2 px `plan.attention` outline with a gap." | D-0208, D-0211.
  - `docs/gaps.md` A2 default: the same text and decisions.
  - `docs/specs/visual-foundation.md`: a header note that the fonts, gutter, type scale and card rules are amended for screens with a state by D-0208, D-0210 and D-0211, and that §4 is decided by D-0211 §1.
- **Out:**
  - Screen IDs, flows and behaviour beyond D-0212.
  - CLAUDE.md (orchestrator follow-up).

## Acceptance criteria
- **AC1.** `node .github/scripts/check-all.mjs` exits 0: screen IDs intact, no v1 labels, no stale wording.
- **AC2.** The UF-09 table in `user-flows.md` contains no "200 px" and no "orange", contains "Lifting · set n of N" and "drain", and cites D-0208 and D-0212. A grep test in the log (or the existing docs check) shows a red run on the old text.
- **AC3.** `docs/PRD.md` and `docs/gaps.md` contain no "lime ramp" and no "`warn` outline", and cite D-0211.
- **AC4.** The flow index table is unchanged (a diff of the "## Flow index" block is empty), so no screen ID is added or removed.

Checklist (D-0197 §7):
- Docs only, no binary runtime condition. No migration fixture: not applicable.

## Paths you may change
- `Design-docs/docs/product/user-flows.md`, `docs/PRD.md`, `docs/specs/visual-foundation.md` (lane)
- `docs/gaps.md` (listed extra)
- `docs/tickets/T-0618-product-wording-cobalt.md` (log only)

## Contract impact
none (screen IDs unchanged)

## Definition of done
check-all green · `format:check` green · commit messages start with `T-0618` and cite the UF IDs.

## Build / accept log
