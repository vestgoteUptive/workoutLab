---
id: T-0453
title: "UF-07.1 a11y: focus after Remove and after a picker Add never falls to body; the delete confirm traps focus and leaves the form inert (D-0162 §4–§5)"
lane: web-feature:UF-07
screens: [UF-07.1]
decisions: [D-0162, D-0081, D-0070, D-0071]
deps: [T-0308a]
status: done
---
<!-- Groomed 2026-10-03 by product-owner from the T-0308a review and accept (WCAG 2.4.3). Build flow: wl-build-web. About ⅓ day. Start it from a main that has T-0308a (merging now). -->

## Why
The T-0308a review found that focus is lost in two places on UF-07.1:
- **Remove.** The focused button leaves the DOM.
- **A picker Add.** The button becomes the disabled "Added", or at 8 items every Add disables.

In both cases focus falls to `<body>`, so a keyboard or screen-reader user starts again from the top
of the page (WCAG 2.4.3 Focus order). The delete confirm also says `aria-modal="true"`, but Tab
leaves it and the form under it still takes input. D-0162 §4–§5 sets where focus goes and how the
dialog holds it.

## Scope
- In (all in `apps/web/src/features/UF-07/`):
  - `EditorForm.tsx` and/or `use-routine-editor.ts`: focus after Remove and Add (D-0162 §4).
  - The delete dialog: `inert` on every part of the form outside it while it is open, and Tab or
    Shift+Tab cycling between its enabled buttons (D-0162 §5).
  - New tests in `__tests__/` (file names start `t0453`).
  - One appended row in `tests/e2e/uf-07-routines.spec.ts`.
- Out:
  - The unreadable-cache and empty-library copy (T-0454).
  - A shared dialog component in `components/**`.
  - Any change to the move-button focus (AC-A4 of T-0308a), strings, routes or contracts.

### Edge cases that are in scope
- **Offline:** "Delete" is disabled, so the trap holds focus on "Keep routine" (AC-4).
- **At the 8-item limit:** every Add is disabled, so the search field is where focus goes (AC-2).
- **An empty list after Remove** (AC-1).
- **Zero history, 10 days off, time running out:** no effect (the editor reads no history).

## Acceptance criteria
**Test setup.** As T-0308a: `harness.tsx` (`seed()`, routine R "Lower A" = Barbell back squat,
Romanian deadlift (barbell), Leg curl (machine)), `spies.ts`, `MemoryRouter`. Focus is read from
`document.activeElement`. **AC-1, AC-2, AC-3 and AC-4 must fail on `main`.** The build log records
each red run (focus is `<body>`, or the attribute or move is missing).

- **AC-1 (Remove, D-0162 §4)**
  - **A middle row.** On `/plan/routines/R`, focus "Remove Romanian deadlift (barbell)" and click
    it. Focus is then on "Remove Leg curl (machine)", now at position 2.
  - **The last row.** Removing "Leg curl (machine)" puts focus on "Remove Romanian deadlift
    (barbell)".
  - **The only row.** Remove all three, one at a time, with the picker closed. Focus ends on "Add
    exercise". The pair: the same with the picker open ends on the "Search exercises" field.
  - The live region still announces "{name} removed" (unchanged).
- **AC-2 (a picker Add, D-0162 §4)**
  - On `/plan/routines/new` with the picker open, click "Add Plank". Focus is on "Search
    exercises", and the Plank row's button is the disabled "Added".
  - **At the limit.** With routine R2 at 7 items, "Add Plank" makes 8, every Add is disabled, and
    focus is on "Search exercises".
- **AC-3 (the dialog holds focus, D-0162 §5)**
  - Online on `/plan/routines/R`, "Delete routine" opens the dialog with focus on "Keep routine".
    This is unchanged.
  - Tab (a `keydown` of `Tab` on the focused element) moves focus to "Delete". Tab again goes back
    to "Keep routine". Shift+Tab on "Keep routine" goes to "Delete". Focus never leaves
    `[role="dialog"]`.
  - **Inert.** While the dialog is open, each of these has the `inert` attribute: the name field's
    wrapper, the exercises section, the progression card and the actions row. The dialog and its
    ancestors don't. **The pair:** after "Keep routine" (or Escape) closes it, no element in the
    form has `inert`, and focus is on "Delete routine" (unchanged).
- **AC-4 (offline)** With `setOnline(false)` and the dialog open (opened online, then gone offline):
  "Delete" is disabled, and Tab and Shift+Tab both leave focus on "Keep routine".
- **AC-5 (e2e, real Chromium)** One row appended to `tests/e2e/uf-07-routines.spec.ts`:
  - `openSignedIn(page, "/plan/routines/<ROUTINE_ID>")` → "Delete routine" → press Tab 3 times →
    after each press the focused element is inside `[role="dialog"]`.
  - `page.mouse.click` at the centre of the "Name" field's box, then `keyboard.type("x")`: the field
    value is unchanged.
  - "Keep routine": the dialog is gone and focus is on "Delete routine".
  - Then "Remove Leg curl (machine)" by keyboard (focus it, press Enter): focus is on "Remove
    Romanian deadlift (barbell)".
  - No fixture edits. The existing AC-A14 axe rows stay green (0 serious or critical).
- **AC-6 (unchanged surface)** No existing UF-07 test file is edited. The move-button focus tests
  (AC-A4) and `keyboard.test.tsx` pass unedited. `react/jsx-no-literals` is green.

## Paths you may change
- `apps/web/src/features/UF-07/**` (the lane: `web-feature:UF-07`).
- **Listed extras:**
  - `tests/e2e/uf-07-routines.spec.ts`: append the AC-5 row only.
  - `docs/tickets/T-0453-uf07-focus-after-change-and-dialog-trap.md`: this file, for the logs.

## Contract impact
None.

## Definition of done
Tests for every AC pass, with the red runs recorded · the cached gate (D-0158):
`pnpm -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and
`check-all` green · `uf-07-routines.spec.ts` green (one feature folder, so the whole e2e suite isn't
needed) · contracts unchanged · commits start `T-0453` and cite UF-07.1.

## Notes
- **Parallel:** safe with T-0415, T-0416, T-0394, T-0447 and T-0451. They are UF-09/UF-03 work and
  share no file with it.
- **Not with T-0454**, which edits `EditorForm.tsx` too.
- **Start after T-0308a merges.** It is the dep, and it is merging now.
- React 19 renders the boolean `inert` prop. jsdom 25 keeps the attribute but doesn't enforce it,
  which is why AC-5 proves the behaviour in Chromium.

## Build / accept log
Archived in `docs/tickets/log/T-0453.md` (D-0157).
