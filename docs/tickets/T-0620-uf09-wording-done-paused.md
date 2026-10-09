---
id: T-0620
title: "UF-09 wording from the mock: \"Done\" instead of \"Done set\" (and its error), \"Save · start rest\" on UF-09.4 when a rest follows, the UF-09.9 caption \"Workout paused · timers stopped\" and value-first paused stats (\"23:10 elapsed\", \"22 min left\", \"6 / 16 sets\")"
lane: web-feature:UF-09
screens: [UF-09.3, UF-09.4, UF-09.9]
decisions: [D-0212, D-0208, D-0118, D-0120]
deps: [T-0598]
status: todo
---
<!-- Groomed 2026-10-09 (D-0212 §1.3, D-0213). Flow: wl-build-web (agent frontend-dev). About ⅓ day. Copy changes after the UF-09 restyle. Spec: docs/specs/cobalt-mock-behaviour.md §1.3. Never in parallel with T-0580. -->
## Why
The owner asked for the mock's wording (2026-10-09). "Done" is shorter on the full-width session button. "Save · start rest" says what happens next. The paused caption says that every timer has stopped, which the screen already guarantees (UF-09.9).

## Scope
- **In** (`lib/i18n/flows/uf-09.ts` and the views):
  - `doneSet: "Done"` and `doneSetError: "Couldn't save. Tap Done again."`. The ✓ is an `aria-hidden` icon.
  - `saveStartRest: "Save · start rest"`. `confirm-set.tsx` shows it when the machine's next state after the save is UF-09.5 Rest (another set or back-off set of the same item follows). Otherwise it shows `save` ("Save"). The decision reads the same machine input the transition uses, not a copy of the rule.
  - `pausedCaption: "Workout paused · timers stopped"`, rendered as the first line above the `h1` "Paused" on both paused views.
  - `elapsed: (clock) => \`${clock} elapsed\``, `left: (n) => n === 1 ? "1 min left" : \`${n} min left\`` and `sets: (logged, planned) => \`${logged} / ${planned} sets\``. Each is rendered as a value span (stat role) and a word span (label role) inside one element, so the text reads in order.
  - The tests that query "Done set", "Elapsed …", "Left …" and "Sets …" move to the new text (logged).
- **Out:**
  - "Skip rest", "Next move", "Restart" and "−15 s"/"+15 s" (kept, spec §1.3).
  - The status lines (T-0621).

## Acceptance criteria
- **AC1 (Done).**
  - **Given** UF-09.3 **then** `getByRole("button", { name: "Done", exact: true })` exists, and no button is named "Done set".
  - **Given** a failed save **then** the status reads "Couldn't save. Tap Done again."
  - The success path shows no status.
- **AC2 (Save · start rest).**
  - **Given** UF-09.4 for set 2 of 4 **then** the primary is named "Save · start rest", and saving goes to UF-09.5.
  - **Given** set 4 of 4 (with no back-off) **then** it's named "Save", and saving goes to UF-09.8, UF-09.6 or the summary as today.
  - **Given** the last normal set when a back-off follows **then** "Save · start rest".
  - The autosave countdown triggers the same transition in each case (existing tests).
- **AC3 (paused caption).** **Given** Pause from UF-09.3 **then** "Workout paused · timers stopped" is the first text line, the `h1` is still "Paused", and every timer is stopped (existing assertion).
- **AC4 (stats).**
  - **Given** 23:10 elapsed, a 45-min budget and 6 of 16 sets **then** the three stats read "23:10 elapsed", "22 min left" and "6 / 16 sets" in DOM order.
  - **Given** 44:30 elapsed on a 45-min budget **then** "1 min left".
  - Over budget gives "0 min left", as the existing clamp does.
- **AC5 (no other names change).** Every other `getByRole` name in the UF-09 suites is unchanged. The log lists every changed assertion.
- **AC6 (offline).** Offline, Done and Save keep their names and still queue the set (existing offline spec). Online is covered by AC1 and AC2.

Checklist (D-0197 §7):
- Rest follows and doesn't, save failed and succeeded, 1 min and n min left, and online and offline are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/features/UF-09/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-09.ts` (own flow file)
- `tests/e2e/uf-09-focus.spec.ts`, `tests/e2e/uf-09-ready.spec.ts`, `tests/e2e/uf-09-offline.spec.ts`, `tests/e2e/uf-09-do-later.spec.ts` (listed extras, name queries only)
- `docs/tickets/T-0620-uf09-wording-done-paused.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · the UF-09 e2e specs green · commit messages start with `T-0620` and cite UF-09.3/UF-09.4/UF-09.9.

## Build / accept log
