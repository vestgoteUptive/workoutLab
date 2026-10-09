---
id: T-0619
title: "UF-09 state captions so every session screen names its state in text (the colour-blind fallback): \"Warm-up · move n of N\", \"Lifting · set n of N\" / \"Lifting · back-off set\" on UF-09.3 and UF-09.4, \"Next exercise\" on UF-09.6, \"Timed set · n of N\" on UF-09.7"
lane: web-feature:UF-09
screens: [UF-09.2, UF-09.3, UF-09.4, UF-09.6, UF-09.7]
decisions: [D-0212, D-0208, D-0118, D-0119]
deps: []
status: ready
---
<!-- Groomed 2026-10-09 (D-0212 §1.2 and §2, D-0213). Flow: wl-build-web (agent frontend-dev). About ⅓ day. New copy, not a restyle; it runs before the UF-09 restyle (T-0595) so no red or teal UF-09 screen ships without its state named in text. Spec: docs/specs/cobalt-mock-behaviour.md §1.2. Never in parallel with T-0580 (same folder). -->
## Why
Lift (`#CC4225`) and rest (`#3F7A76`) have almost the same luminance (1.03:1), so they're told apart by hue only. The README requires every session screen to name its state in text. Today UF-09.3, UF-09.4, UF-09.6 and UF-09.7 don't, and UF-09.2 says only "Move n of N". The owner asked for the mock's "Lifting" label (2026-10-09).

## Scope
- **In:**
  - `lib/i18n/flows/uf-09.ts` gains:
    - `warmupCaption: (n, total) => \`Warm-up · move ${n} of ${total}\``
    - `liftingCaption: (n, total) => \`Lifting · set ${n} of ${total}\``
    - `liftingBackoff: "Lifting · back-off set"`
    - `timedCaption: (n, total) => \`Timed set · ${n} of ${total}\``

    UF-09.6 uses the existing `titles.next` ("Next exercise").
  - `warmup.tsx`, `current-set.tsx`, `confirm-set.tsx`, `next-exercise.tsx` and `timed-set.tsx` render `<p class="wl-uf09__state">` as the first text line of the view, above the `h1`. On UF-09.3 it replaces the "Set n of N" or "Back-off set" line; on UF-09.2 it replaces "Move n of N".
  - `setOf`, `backoffSet` and `warmupMove` are removed if nothing else reads them. A grep in the log shows this.
  - The tests that query "Set 2 of 4" or "Move 1 of 3" move to the new text (logged).
- **Out:**
  - Styling (T-0595–T-0597 style the caption).
  - The `h1`s (unchanged), and UF-09.1, UF-09.5 and UF-09.9, which already name their state.

## Acceptance criteria
- **AC1 (UF-09.3).**
  - **Given** set 2 of a 4-set item **when** UF-09.3 renders **then** the first text line is exactly "Lifting · set 2 of 4", and the `h1` is still the exercise name.
  - **Given** a back-off set **then** it's "Lifting · back-off set".
  - Both are tested.
- **AC2 (UF-09.4).** **Given** the confirm step for set 2 of 4 **then** the same caption shows above the `h1`. For a back-off set it's "Lifting · back-off set".
- **AC3 (UF-09.2).** **Given** move 1 of 3 **then** the caption is "Warm-up · move 1 of 3", and "Move 1 of 3" no longer renders.
- **AC4 (UF-09.6).** **Given** the next-exercise step **then** "Next exercise" shows above the exercise-name `h1`.
- **AC5 (UF-09.7).**
  - **Given** set 1 of a 3-set timed item **then** "Timed set · 1 of 3" shows, and the "Get in position" / "Hold" phase line is unchanged.
  - A 1-set item shows "Timed set · 1 of 1".
- **AC6 (not a heading, not live).** No caption is a heading or a live region. `getByRole("heading")` names are unchanged on every screen. The captions are read from `en.uf09` keys in the tests, not from literals.
- **AC7 (principle 1).** Each view still shows one task: the caption adds no control. The existing principle-1 e2e assertions in `uf-09-focus.spec.ts` pass.
- **AC8 (no regressions).** The UF-09 vitest suite, `uf-09-focus.spec.ts`, `uf-09-ready.spec.ts`, `uf-09-offline.spec.ts` and `uf-09-do-later.spec.ts` pass. The only changed assertions are the "Set n of N" and "Move n of N" text queries, each listed in the log.
- **AC9 (offline and resume).** A session resumed after a reload (offline) shows the correct caption for the persisted set index (one e2e case). The online, uninterrupted path is covered by AC1.

Checklist (D-0197 §7):
- Back-off and normal sets, a 1-set and a multi-set timed item, and a resumed and a fresh session are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/features/UF-09/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-09.ts` (own flow file)
- `tests/e2e/uf-09-focus.spec.ts`, `tests/e2e/uf-09-offline.spec.ts` (listed extras)
- `docs/tickets/T-0619-uf09-state-captions.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · the UF-09 e2e specs green · commit messages start with `T-0619` and cite the UF-09 IDs.

## Build / accept log
