---
id: T-0687
title: "UF-11.3 Edit plan: a visible .wl-label heading above the Goal, Level, Sessions per week and Priority areas groups, each group named by aria-labelledby instead of aria-label only"
lane: web-feature:UF-11
screens: [UF-11.3]
decisions: [D-0230, D-0233, D-0203]
deps: [T-0681, T-0682]
status: ready
---
<!-- Written by product-owner 2026-11-23 (groom). Flow: wl-build-web (agent frontend-dev). About ⅓ day. Lane choice (logged here, no decision needed): the board row said `design`, but the work is JSX and CSS in apps/web plus one spec amendment of about ten lines, with no new token and no new class. Splitting it would put a one-paragraph spec edit in a design ticket that has to land first and that the web ticket then has to follow word for word. So the lane is web-feature:UF-11, and the design spec path is a listed extra (orchestrator grant). If the orchestrator prefers the split, the spec edit is AC7 alone. -->

## Why
T-0681's review (WCAG 3.3.2, Labels or Instructions). On UF-11.3 the four groups are named only by `aria-label`: sighted users get no visible heading for Goal, Level, Sessions per week or Priority areas. Level makes it worse: its three option rows read like Goal's three rows (six `.wl-option` rows in a row, with no visible break between "what you want" and "how experienced you are"). Only the preview section has a visible `.wl-label` heading today. `.wl-label` is a foundation class (D-0203; `main.css` styles `h2.wl-label`), so no new token or class is needed.

## Scope
- In:
  - **`apps/web/src/features/UF-11/EditPlanBody.tsx`:**
    - Above each of the four groups, add `<h2 id={…} className="wl-label">` with the group's existing string: `u.goalGroup`, `u.levelGroup`, `u.rhythmGroup`, `u.priorityGroup` (ids from `useId`, in the same style as `levelNoteId`).
    - On each group, replace `aria-label={…}` by `aria-labelledby={<that id>}`. Roles stay: `radiogroup` for Goal and Level, `group` for Sessions per week and Priority areas. The Level group keeps `aria-describedby={levelNoteId}`.
    - The accessible names do not change, so every `getByRole("radiogroup", { name: "Goal" })` style query keeps working.
  - **Heading outline** becomes `h1` "Edit plan", then `h2` ×5: Goal, Level, Sessions per week, Priority areas, New targets per 14 days. The existing preview `h2` already has the `.wl-label` look (the spec says so); only check its class matches the new four.
  - **CSS:** only if a heading needs spacing next to its group in `plan.css` (an existing token, no raw colour). Check the heading colour on the plan background: contrast at least 4.5:1, computed from `packages/design-tokens/src/tokens.json` (AC6).
  - **Spec (listed extra):** `Design-docs/docs/design/screens/UF-11.3.md`: the Layout list (each group has its `.wl-label` heading), the Level group bullet ("`aria-label`" becomes "`aria-labelledby` its heading"), the Accessibility section's heading outline and its "named by `role` plus `aria-label`" line. No other spec text changes.
  - **Tests:** a new `__tests__/edit-plan-headings.test.tsx`; deliberate updates (not weakened tests) where an existing UF-11 test counts headings or queries a group by `aria-label` attribute rather than by accessible name.
- Out:
  - Any new string (the four headings reuse `goalGroup`, `levelGroup`, `rhythmGroup`, `priorityGroup`), so `apps/web/src/lib/i18n/flows/uf-11.ts` is **not** touched.
  - UF-01.3, UF-11.2, UF-11.4 and the other screens.
  - `components/**`, `routes.ts`, the design tokens, and the Save and Cancel logic (T-0683b and T-0690 edit `onSave`, see "Serial with").

**Serial with** T-0683b and T-0690: all three edit `EditPlanBody.tsx` and `edit-plan*.test.tsx`. Never in parallel; whichever merges second rebases. This ticket touches JSX only, not `onSave`.

## Acceptance criteria
Fixtures: F-profile (level beginner, full equipment, rhythm 3–4, no priorities, goal build_muscle), online, as in `edit-plan-level.test.tsx`. Test titles start `T-0687 ACn`.
- **AC1 (headings and names).** Given UF-11.3 online, When it renders, Then:
  - `getAllByRole("heading", { level: 2 })` has texts, in order: "Goal", "Level", "Sessions per week", "Priority areas", "New targets per 14 days";
  - each of the first four has class `wl-label` and is the element named by `aria-labelledby` of its group: `getByRole("radiogroup", { name: "Goal" })`, `getByRole("radiogroup", { name: "Level" })`, `getByRole("group", { name: "Sessions per week" })`, `getByRole("group", { name: "Priority areas" })` all resolve;
  - none of the four groups has an `aria-label` attribute.
- **AC2 (order).** Given the same render, Then in DOM order each heading comes immediately before its group (no other control between them), and the h1 "Edit plan" comes first.
- **AC3 (nothing else moved).** Given the same render, Then the Level group's radios keep their names (Beginner, Intermediate, Advanced) and descriptions (T-0682 AC1's three hint texts), the Level group's description is still "Level changes which exercises we suggest, not your targets.", and none of the headings, hints or the note is inside `[aria-live]`, `[role=status]` or `[role=alert]`. The "Pick up to 3" status line is still the only status.
- **AC4 (ids resolve, never duplicate).** Given the screen is mounted twice in one document (a remount after Cancel, then open again), Then every `aria-labelledby` value is the id of exactly one element in the document.
- **AC5 (offline sibling, D-0197 §7).** Given offline, When UF-11.3 renders, Then the same four headings and names are present, so the labelling does not depend on the online state. (Online: AC1.)
- **AC6 (contrast and axe).** Given the plan-state tokens, Then the `.wl-label` colour on `--wl-bg` is at least 4.5:1, computed in the test from `tokens.json` (the way `cobalt.test.tsx` does). And `axeViolations()` on the rendered screen reports `[]` (the jsdom limits in `state.md` apply: structure is asserted by AC1 and AC2, not by axe alone).
- **AC7 (spec matches).** Given `Design-docs/docs/design/screens/UF-11.3.md`, When a source-scan test in `__tests__` reads it, Then the heading outline line names the five `h2`s, the Level bullet says `aria-labelledby`, and the text no longer contains "named by `role` plus `aria-label`". The scan asserts it found each of those three lines (not vacuous).
- **AC8 (e2e, a runtime change in apps/web/src).** Given the built app at 390 and 320 px, When `/plan/edit` opens, Then there is no horizontal page scroll, each heading is visible and not clipped, and the existing `uf-11-plan.spec.ts` and `uf-11-plan-layout.spec.ts` pass, including their axe checks. A locator in `uf-11-plan-layout.spec.ts` that the new `h2`s break (for example a bare `locator("h2")` count) gets a deliberate update.
- Planted faults (log, one line each, backup copy restored with `cp`):
  - F1: put `aria-label` back on the Level group and drop its `aria-labelledby`: AC1 goes red;
  - F2: point one `aria-labelledby` at the wrong id: AC1 or AC4 goes red;
  - F3: render the Priority areas heading after its chips: AC2 goes red.

Binary-condition check (D-0197 §7): online and offline (AC1, AC5); first mount and remount (AC1, AC4). Terminal row states do not apply: nothing here migrates or reads rows.

## Paths you may change
- `apps/web/src/features/UF-11/**` (lane)
- Listed extras:
  - `Design-docs/docs/design/screens/UF-11.3.md` (the spec amendment, AC7; design-lane file; orchestrator grant)
  - `tests/e2e/uf-11-plan-layout.spec.ts` (only a deliberate locator update, AC8)

## Contract impact
none. No token, openapi, data-model or engine-rules change. The spec file is a screen spec, not a contract.

## Definition of done
Tests for every AC pass · `pnpm --filter @workoutlab/web typecheck`, then a separate `… lint`, then a separate `… test` · `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` green · the two uf-11-plan e2e specs green · commits start `T-0687 UF-11.3:`.

## Build / accept log
- Build (frontend-dev): four `.wl-label` h2s above Goal, Level, Sessions per week, Priority areas, groups named by `aria-labelledby`; preview h2 moved from `wl-type-label` to `wl-label`; `.wl-edit > h2.wl-label` pulls a heading 8 px toward its group (plan.css); spec UF-11.3.md amended. Tests: `__tests__/edit-plan-headings.test.tsx` AC1–AC7 (AC1 order/names/no aria-label, AC2 order, AC3 hints/note/live regions, AC4 unique ids after remount, AC5 offline, AC6 contrast from tokens.json 4.5:1 + axe, AC7 spec scan); AC8 e2e at 390/320 px in `uf-11-plan-layout.spec.ts`. Faults (backup, `cp`, `cmp`): F1 aria-label on Level red (AC1, AC4, AC5); F2 rhythm labelledby to goal id red (AC1, AC2, AC4, AC5); F3 priority heading after chips red (AC2). Gate: web typecheck, lint, test (412 files, 5401) green; format:check green; uf-11* e2e 97 passed (+2 new). check-all: only `ticket-not-on-base` (the diff base resolves to a ref without the ticket file; ticket is on local main), not a code finding.
