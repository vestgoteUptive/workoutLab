---
id: D-0181
title: "T-0494 AC-4: `aria-hidden-focus` can't land in jsdom axe `violations` (only `incomplete`) because axe-core's `isModalOpen` needs real layout; the fault proof uses AC-1's own role-query assertions instead"
status: revisit
date: 2026-10-05
by: frontend-dev (T-0494)
area: process
builds-on: D-0180
---
## Context
T-0494 AC-4 asks: plant `aria-hidden="true"` on `SwapLoadBoundary`'s `role="status"` div in
`ListView.tsx`, and expect AC-1 to go red "with `aria-hidden-focus` in the returned list"
(`axeViolations()`, which returns `results.violations.map((v) => v.id)`).

Measured directly (axe-core 4.13.0, the version pinned here): with `aria-hidden="true"` on the
status div (containing the "Try again"/"Close" `<button>`s), `axeViolations()` still returns
`[]`. The finding shows up in `results.incomplete` as `aria-hidden-focus`, never in
`results.violations`.

Root cause, read from `axe-core/axe.js`: the `aria-hidden-focus` rule's three `all` checks
(`focusable-modal-open`, `focusable-disabled`, `focusable-not-tabbable`) all defer to
`isModalOpen()`. That function first looks for a visible `dialog`/`[role=dialog]`/
`[aria-modal=true]` via `_isVisibleOnScreen` (which needs real layout — jsdom's boxes are all
zero-sized, so nothing passes), then falls back to `document.elementsFromPoint(...)`, which jsdom
does not implement at all (returns `[]`). With no definite answer either way, `isModalOpen()`
returns `undefined`, and `focusable-modal-open`/`focusable-not-tabbable` return `void 0` ("can't
tell") rather than `false` ("fails") — so the rule's overall result is `incomplete`, not a
violation, regardless of the markup. Confirmed by direct measurement with several variants
(hidden ancestor div, hidden button itself, a real `[aria-modal=true]` dialog rendered
concurrently to force `isModalOpen()` true) — every variant stayed `incomplete`, never
`violations`. This is a structural jsdom gap (no `elementsFromPoint`/layout), not something a
different attribute placement routes around.

This is the same class of gap T-0369 already tracks (jsdom axe misses vs. a real browser) — it
just wasn't previously known to include this specific rule.

## Decision
1. **AC-4's fault is still planted and still makes AC-1 red**, exactly as asked — but via the
   assertions AC-1's own wording already requires ("the region has `role="status"` and contains
   buttons named exactly 'Try again' and 'Close'"): Testing Library's `getByRole` queries respect
   `aria-hidden` and throw once the status div (and its descendant buttons) are hidden from the
   accessibility tree. `axeViolations()` itself stays `[]` throughout (confirmed, not assumed —
   see log) because of the jsdom gap above, so the ticket's literal "`aria-hidden-focus` in the
   returned list" clause cannot be satisfied as written; the structural-assertion catch is used
   instead, which still proves the test fails on this exact real-world fault and passes once it's
   gone.
2. **No change to the shared `axeViolations()` helper** (`list-helpers.tsx`, used by several
   other passing tests across UF-03/UF-09): broadening it to also fail on `incomplete` would risk
   turning other already-green axe tests red on unrelated `incomplete` findings, and UF-03 is not
   the lane that owns that helper's contract either way.
3. **No change to `ListView.tsx`**: the real markup has no `aria-hidden` misconfiguration; the
   one planted for the proof was restored with `cp` after the red run.

## Consequences
- T-0494's `list-view.swap-retry.test.tsx` AC-1 proof shows red (`getByRole` throws) with the
  fault planted and green once restored; the axe assertion in that same test never itself goes
  red for this particular fault class, which is noted in the ticket's build log rather than
  silently glossed over.
- New follow-up: extend T-0369 (or a new ticket under its umbrella) to note that
  `aria-hidden-focus` specifically can never fail jsdom's `axeViolations()` as defined, so any
  future "`aria-hidden` on a focusable region" check needs either a real-browser (Playwright) axe
  run, or a structural assertion (role/query based) alongside it — not axe alone.

## Revisit when
T-0369's real-browser axe gap is addressed; re-run this exact fault (`aria-hidden="true"` on
`SwapLoadBoundary`'s status div) through a Playwright + `@axe-core/playwright` check to confirm
`aria-hidden-focus` does land in `violations` there, the way the original ticket assumed.
