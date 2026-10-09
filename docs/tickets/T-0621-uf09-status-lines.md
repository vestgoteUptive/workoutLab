---
id: T-0621
title: "UF-09 status lines from the mock: \"Target hit.\" on UF-09.4 when reps ≥ repsMax, \"{name} done · n sets\" and a \"Set-up time\" label on UF-09.6, \"First up\" with the first step on UF-09.1"
lane: web-feature:UF-09
screens: [UF-09.1, UF-09.4, UF-09.6]
decisions: [D-0212, D-0066, D-0118]
deps: [T-0620]
status: todo
---
<!-- Groomed 2026-10-09 (D-0212 §1.4, D-0213). Flow: wl-build-web (agent frontend-dev). About ⅓ day. Spec: docs/specs/cobalt-mock-behaviour.md §1.4. Display of data the machine already holds; no engine or data change. Never in parallel with T-0580. -->
## Why
The mock shows short status lines that answer "how did that go" and "what's next" without adding a control. That keeps principle 1 (one task on screen).

## Scope
- **In** (`lib/i18n/flows/uf-09.ts` and the views):
  - **`targetHit: "Target hit."`** on UF-09.4. It shows when the item's `repsMax` is non-null, the set is neither timed nor a back-off set, and the reps value currently in the input is ≥ `repsMax`. It updates as the reps change, and it's plain text, not a live region.
  - **`exerciseDone: (name, sets) => sets === 1 ? \`${name} done · 1 set\` : \`${name} done · ${sets} sets\``** on UF-09.6, with a leading `aria-hidden` tick icon.
    - `sets` = the sets logged in this session for the item just finished.
    - Hidden when UF-09.6 follows UF-09.1 or the warm-up, or when the previous item has 0 logged sets.
  - **`setupTime: "Set-up time"`** on UF-09.6: a visible label for the existing countdown. The `role="timer"` element gets `aria-labelledby` pointing at it.
  - **`firstUp: "First up"`** on UF-09.1, under the countdown, then the first step:
    - with a warm-up: "Warm-up" and `warmupSummary: (moves, seconds) => \`${moves} moves · ${seconds} s each\`` (D-0066 per-move time; "1 move" when there's one);
    - without one: the first exercise's name and its existing `itemSummary`.
- **Out:**
  - The canvas's other content (D-0212 §4).
  - Styling beyond the label and caption roles.

## Acceptance criteria
- **AC1 (Target hit).**
  - **Given** an item with `repsMin 6`, `repsMax 8` **when** reps are 8 **then** "Target hit." shows. At 9 it shows; at 7 it doesn't.
  - **Given** a back-off set, a timed item, or `repsMax` null **then** it never shows.
  - Each case is a vitest.
- **AC2 (done line).**
  - **Given** UF-09.6 after Back Squat with 4 logged sets **then** "Back Squat done · 4 sets" shows, and the tick is `aria-hidden`.
  - With 1 set: "· 1 set".
  - **Given** UF-09.6 directly after the warm-up or UF-09.1, or after a skipped item with 0 sets **then** no done line.
- **AC3 (Set-up time).** The countdown is found by `getByRole("timer", { name: "Set-up time" })`, and the label is visible.
- **AC4 (First up).**
  - **Given** a plan with a 3-move warm-up at 40 s **then** UF-09.1 shows "First up", "Warm-up" and "3 moves · 40 s each".
  - **Given** no warm-up (or Skip warm-up chosen on a previous visit, if that changes the plan) **then** it shows the first exercise's name and summary.
  - Both are tested.
- **AC5 (principle 1).** None of the lines is a button, link or focusable element. The existing principle-1 assertions pass.
- **AC6 (no regressions, offline).** The UF-09 suites pass with no name change apart from the timer's new name (logged). A resumed offline session computes the done line from the persisted logged sets (one case). The fresh, online path is covered by AC2.

Checklist (D-0197 §7):
- At, above and below the target, warm-up and none, previous item done and skipped, and fresh and resumed sessions are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/features/UF-09/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-09.ts` (own flow file)
- `tests/e2e/uf-09-focus.spec.ts`, `tests/e2e/uf-09-ready.spec.ts` (listed extras)
- `docs/tickets/T-0621-uf09-status-lines.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · the UF-09 e2e specs green · commit messages start with `T-0621` and cite UF-09.1/UF-09.4/UF-09.6.

## Build / accept log
