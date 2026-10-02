---
id: D-0160
title: UF-05.1 SwapSheet build defaults (T-0421) — one mount-time `now`, the first row is preselected and re-selected on a reason change, a ranking that throws is a load failure, Close in every state
status: revisit
date: 2026-10-02
by: frontend-dev (T-0421 build)
area: web
builds-on: D-0069 §5, D-0071 §7, D-0093, D-0142 §5
---
## Context
T-0421 builds `SwapSheet` (UF-05.1). D-0069 §5, D-0071 §7 and D-0142 §5 fix its props, chips, row content and states. Building it left five small points open:
1. Which `now` the sheet passes to `rankSwaps` and `applySwap`. The props have no `now`.
2. Which row is selected when the sheet opens, and after a reason chip re-ranks.
3. What the sheet shows when `rankSwaps` itself throws (for example D-0059 (c), a plan item with no library row), or `itemIndex` has no item.
4. Whether the list state has a Close button. The ticket names Close only for the empty and failure states.
5. What the title reads before the library has loaded.

## Decision
1. **One `now` per mount.** The sheet reads `new Date().toISOString()` once, when it mounts, and passes the same instant to every `rankSwaps` call and to `applySwap`. The ranking and the swap then see the same 14-day window and the same rule 14 gap. The sheet is short-lived, so the instant is at most a few minutes old.
2. **The first row is preselected.** With no tap, the selected row is the first one (the engine's Best match), so "Use {name}" is one tap away. Tapping a reason chip clears the user's pick, so the selection is again the first row of the new ranking. A pick is kept only while its reason is shown. The sheet never chooses any other row by itself (principle 3).
3. **A ranking that throws is a load failure.** A `rankSwaps` throw, or an `itemIndex` outside `plan.items`, shows "Couldn't load alternatives." and Close, the same as a `null` profile or a rejected loader. Nothing is thrown out of the component.
4. **Close is in every state.** The list state has the same Close button as the empty and failure states. It calls `onClose`, like Escape. It closes the sheet, not the workout, so principle 1 holds.
5. **The title** reads "Replace exercise" until the library has loaded, then "Replace {library name}". An id with no library row prints as its raw id.

## Consequences
- web (T-0422, T-0418, T-0303c): the mounts pass only D-0071 §7's props. They don't pass a clock.
- Tests freeze `Date` alone (`vi.useFakeTimers({toFake: ["Date"]})`), so fake-indexeddb keeps its real timers.
- No contract change.

## Revisit when
- A user leaves the sheet open long enough for the window to roll over midnight. Then `now` should be read at the tap.
- Users ask for no preselection (an explicit pick before Use).
