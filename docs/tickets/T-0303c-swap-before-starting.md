---
id: T-0303c
title: "UF-08.3 Swap before starting: a Swap button per UF-08.2 item opens the shared UF-05.1 SwapSheet at ?step=swap, in place of UF-08.2; Apply renders the engine's Workout, Keep changes nothing"
lane: web-feature:UF-08
screens: [UF-08.2, UF-08.3, UF-05.1, UF-08.4]
decisions: [D-0065, D-0069, D-0071, D-0107, D-0109, D-0124, D-0142, D-0158, D-0168]
deps: [T-0303b, T-0421]
status: review
---
<!-- Groomed 2026-10-03 by product-owner (D-0168 §2). Child of docs/tickets/T-0303-session-setup.md
(parent AC-C1–C5). Build flow: wl-build-web. About ¼–⅓ day: the sheet, its ranking, chips, copy,
empty state and dialog a11y are T-0421's and are not re-tested here (D-0071 §7: one sheet, one
copy). Both deps are on main. -->

## Why
User flows v2 UF-08.3: before starting, the user can swap an exercise because the machine is
taken, something hurts, they want variety, or they are short on time. The engine ranks the
alternatives and rebuilds the slot (`rankSwaps`, `applySwap`, rule 12); UF-05.1 `SwapSheet`
(T-0421) already shows them and calls `applySwap`. This ticket only mounts that sheet on UF-08.2
and renders what it hands back (principle 3).

## Scope
- In:
  - **Swap button.** Each UF-08.2 item row (`data-part="item-row"`) gets a button named
    `Swap {exercise name}` (`en.uf08.swapItem(name)`, visible text "Swap"), `data-part="swap"`,
    ≥ 44 × 44 px. The warm-up row has none. An empty plan has none.
  - **Open.** The button PUSHes `/session/setup?step=swap&item={index}`.
  - **The step.** `SessionSetup` treats `swap` as a past-setup step (today `pastSetup` is only
    `suggested`/`ready`, so the current `Workout` would be cleared). At `?step=swap` with a current
    `Workout` and a valid `item`, it renders `<SwapSheet workout={current} itemIndex={item}
    onApply={…} onClose={…} timeZone={tz} />` **instead of** UF-08.2 (D-0168 §2). `SwapSheet` is
    imported statically from `../UF-05/index.js`.
  - **Leave.** Keep (the sheet's `onClose`: Close button or Escape) and Apply (`onApply(result)`)
    both go back in history to the `?step=suggested` entry. Apply first sets the current `Workout`
    to `result` (reference-equal) and leaves the setup inputs record unchanged. After either,
    focus goes to the `Swap` button of row `item`.
  - **Bad URLs.** A cold load of `?step=swap` (no `Workout`) shows UF-08.1, as every step does.
    With a `Workout`, an `item` that is missing, not an integer, negative or ≥ the item count
    replaces the URL with `?step=suggested`.
  - **Strings** in `flows/uf-08.ts` (added keys only): `swap: "Swap"`, `swapItem: (name) =>
    "Swap " + name` (a template literal in the file).
  - **e2e** appended to `tests/e2e/uf-08-setup.spec.ts`.
- Out:
  - Anything inside `SwapSheet` (T-0421): chips, rows, ranking, empty state, focus trap, copy.
  - "Always use this in <routine>" (D-0069 §7, cut).
  - Keeping a swap across a later chip, Remove or Shuffle (D-0109 Consequences: those re-suggest
    from the inputs record and drop the swap; v1 accepts it).
  - Any change to `features/UF-05/**`, the engine, or a contract.

### Edge cases that are in scope
- **Offline:** `SwapSheet` reads only the device cache, so the swap works offline (AC-7).
- **Time running out:** a swap can push the plan over budget; UF-08.2's over state shows it (AC-4).
- **Zero history:** the fixture profile has no history; `applySwap` pre-fills a first-time weight
  (rule 14), which UF-08.2 renders as it already does.
- **Returning after 10 days off:** not applicable to a pre-start screen (no session yet).

## Acceptance criteria
Vitest + Testing Library on the existing UF-08 harness (`__tests__/harness.tsx`), at
`now = 2026-09-27T10:00:00Z`, `timeZone` "UTC", with the UF-05 fixture library (barbell-row,
db-row, …) and W5 = bench-press × 4 (main), barbell-row × 3, leg-extension × 2, budget 30,
warm-up in. Each new test title starts with `T-0303c AC-n`.

- **AC-1 (mount, D-0071 §7, red on main)** **Given** UF-08.2 with W5, **When** the user clicks
  `Swap Barbell row`, **Then** the location is `/session/setup?step=swap&item=1`, exactly one
  `[data-screen-id]` is in the DOM and it is `UF-05.1`, and `SwapSheet` received `workout` (reference-
  equal to the rendered `Workout`), `itemIndex` 1 and `timeZone` "UTC" (a `vi.mock` of
  `../UF-05/index.js` records the props in one test; the other ACs use the real sheet). The warm-up
  row has no `Swap` button; with `plan.items` `[]` there is none at all. **Red:** on main there is
  no `Swap` button.
- **AC-2 (apply renders the engine result)** With the real sheet and engine: pick the
  "Short on time" chip, pick db-row, apply. **Then** the location is `?step=suggested`, row 2 shows
  db-row's fixture library name with the reason line `itemReasonLine(result.plan.items[1].reasons)`
  (contains "Swapped to save time"), rows 1 and 3 are unchanged, and the `suggest` spy count is the
  same as before the swap. Then pressing chip 20 calls `suggest` once with the inputs record and
  the swap is gone (expected, D-0109).
- **AC-3 (keep)** Close, and separately Escape: the location is `?step=suggested`, the rendered
  `Workout` is reference-unchanged, `suggest` wasn't called, and `Swap Barbell row` has focus.
- **AC-4 (over budget after a swap)** With a mocked sheet whose `onApply` receives a `Workout`
  with `itemsTotalS` > `availableS(30, true)`, UF-08.2 shows the existing over-budget state (the
  T-0303b AC-B5 text and `var(--wl-color-warn)` on the bar).
- **AC-5 (start after a swap)** After AC-2's swap, Looks good → Start: `upsertSession` was called
  with `plan` deep-equal to the swapped `workout.plan`, and that plan passes `parseSessionPlan`.
- **AC-6 (history and bad URLs, both values)**
  - In a `MemoryRouter` with entries `[time, suggested]`: open the sheet, then Keep, then one
    `navigate(-1)` lands on `/session/setup` (UF-08.1), not on `?step=swap` or a second
    `?step=suggested`. The same after Apply.
  - Browser Back while the sheet is open = Keep (location `?step=suggested`, `Workout` unchanged).
  - Cold `/session/setup?step=swap&item=1`: UF-08.1 renders and the location is `/session/setup`.
  - With a `Workout`: `item` = `"x"`, `"-1"`, `"3"` and missing each replace the URL with
    `?step=suggested`; `item=2` opens the sheet.
- **AC-7 (offline)** With `navigator.onLine = false` and a `fetch` spy, AC-2's swap works the same
  and `fetch` isn't called.
- **AC-8 (exports, strings, boundaries)** `features/UF-08/index.tsx` still exports exactly
  `["SessionSetup", "readFocusPrefs", "writeFocusPrefs"]`. `features/UF-08/**` imports UF-05 only
  as `../UF-05/index.js`, and the existing import-ban tests pass unedited. `jsx-no-literals` is
  green, and `flows/uf-08.ts` keeps its multi-line shape (`lib/i18n/__tests__/flows.test.ts`
  unedited).
- **AC-9 (e2e + a11y)** In `uf-08-setup.spec.ts`: `/` → UF-08.1 → chip 30 → Suggest → UF-08.2 →
  `Swap <second item>` → a chip → the first candidate → apply → back on UF-08.2 with that row's
  name changed → Looks good → UF-08.4 → Start lands on `/session/<uuid>`, and the IndexedDB
  session row's plan has the new exercise id at that index. axe reports 0 serious or critical
  violations on the sheet at `?step=swap`. Every `Swap` button is ≥ 44 × 44 px. The path from
  `Swap` to apply works with the keyboard only (Tab, Enter, Space).
- **AC-10 (no regression)** Every existing `features/UF-08/__tests__/*` test passes unedited,
  except a test that asserts "no swap button" (T-0303b AC-B6's "With T-0303c not merged"), if one
  exists: update that one assertion to the new truth and note it in the build log.

**Red proof.** Run AC-1 and AC-6's cold-load row on main before the fix; AC-1 must fail. Plant one
fault on a backup copy (for example, leave `swap` out of `pastSetup`): AC-2 must fail. Record both.

## Paths you may change
- `apps/web/src/features/UF-08/**` (the lane: `web-feature:UF-08`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-08.ts`
  - `tests/e2e/uf-08-setup.spec.ts`
  - `docs/tickets/T-0303c-swap-before-starting.md`
- Notes on the extras: the strings file gets added keys only (D-0071 §1, D-0075 shape); the e2e
  spec gets appended rows (D-0071 §10); this ticket file is for the build and accept logs.
- Read-only imports (not grants): `features/UF-05/index.tsx` (`SwapSheet`, `SwapSheetProps`),
  `features/UF-05/__tests__/fixtures.ts` from UF-08 tests, `@workoutlab/engine`, `lib/offline`,
  `lib/i18n/workout.ts`.

## Contract impact
None. The engine's `applySwap` is reached only through `SwapSheet` (D-0065 §5, D-0071 §7).

## NFRs owned
A11Y-1/2/6 for UF-08.3 (AC-3, AC-9), OFF-3 for the swap (AC-7).

## Definition of done
Tests for every AC pass · `uf-08-setup.spec.ts` and `uf-05-swap.spec.ts` green (the whole web e2e
isn't needed: one feature folder, D-0158) · `npx -y pnpm@10.28.2 -w typecheck lint test
--concurrency=1`, `-w test:repo-checks`, `-w format:check`, `node .github/scripts/check-all.mjs`
and `check:size` (with a fresh build; record the UF-08 chunk and the max chunk) green, each test
command inside `flock /tmp/workoutlab-tests.lock` · contracts unchanged · commits start `T-0303c`
and cite UF-08.3 (for example `T-0303c UF-08.3: swap before starting mounts the shared sheet`).

## Notes
- **Flow:** `wl-build-web`.
- **Parallel.** Alone in the UF-08 lane. Shares no file with T-0302b, T-0395, T-0310d, T-0308c,
  T-0304h or T-0468, so it can run beside any of them. T-0445 (UF-08 flake, todo) touches
  `ready-start.test.tsx`; don't run them together.

## Build / accept log

### Build log (frontend-dev, 2026-10-03, base ebb08ce)
- Built: Swap button in `Suggested.tsx` (`data-part="swap"`, `.wl-uf08__icon--text`), `swap` step in `SessionSetup.tsx` (pastSetup, static `SwapSheet` import, leave = `navigate(-1)`, focus back through `focusSwapItem`, bad `item` replaces to `?step=suggested`), two strings. Static import per the ticket, so no lazy seam.
- AC→test (`__tests__/swap-before-start.test.tsx`): AC-1 four tests · AC-2 one · AC-3 two (Close, Escape) · AC-4 one · AC-5 one · AC-6 six (keep/apply back, browser Back, cold, 5 bad items, item=2) · AC-7 one · AC-9 `uf-08-setup.spec.ts` four (flow, axe, 44px, keyboard) · AC-8/AC-10 existing exports-and-lint, controls, flows tests unedited.
- AC-10: `suggested-actions.test.tsx` "no button starting with Swap" updated to the new truth (one Swap button per item row).
- Deviation: AC-2 "contains Swapped to save time" cannot hold; `itemReasonLine` keeps 2 reasons and the swap one is third. Test asserts the DOM line equals `itemReasonLine(result reasons)` and the engine result carries `swap {short_on_time}` (D-0170, follow-up for web-shell).
- Red on unfixed code (Suggested/SessionSetup from HEAD): 17 of 19 fail, AC-1 included. Planted fault (`swap` left out of `pastSetup`, backup restored with `cp`): 16 of 19 fail, AC-2 included.
- e2e `uf-08-setup` + `uf-05-swap`: 33 passed.

### Gate log (frontend-dev, 2026-10-03)
- `-w typecheck lint test --concurrency=1` via `scripts/locked.sh heavy` hung twice (full timeout,
  zero CPU, a worker stuck in `ep_poll`), not a flaky slow run. Root-caused, not just retried: the
  ticket's static `import { SwapSheet } from "../UF-05/index.js"` in `SessionSetup.tsx` is reached
  by `UF-09/device.ts` through the `UF-08` barrel (`device.ts` imports `readFocusPrefs` from
  `UF-08/index.tsx`, which also re-exports `SessionSetup`, forcing its body — and now its UF-05
  import — to evaluate). Three pre-existing UF-09 tests mock `../../UF-05/index.js` with a
  throwing factory (`t0422.lazy-reject.test.tsx`, `t0451.next-open.test.tsx`,
  `t0451.next-entry.test.tsx`); none render `SessionSetup`, but the barrel chain lands them in the
  same mocked module, which the mocker misreports and which stalls a worker under the full
  pool. Confirmed by isolating just `SessionSetup.tsx`'s one-line diff against plain `main` in a
  disposable clone: `t0422.lazy-reject.test.tsx` goes from 1 passed to "0 test" with nothing else
  changed. Not fixable inside `web-feature:UF-08` alone (the fix is either a `UF-09/device.ts`
  import path change, outside this lane, or dropping the ticket's explicit static-import
  requirement). Raised as [TR-0044](../../.squad/triage/TR-0044-uf08-static-swapsheet-import-poisons-uf09-mocks.md).
  My own new file (`swap-before-start.test.tsx`) is not implicated: it passes clean and fast
  (19/19, ~3.8 s) alone and paired with the affected files under `--maxWorkers=1`.
- Everything else already recorded above (build, AC/fault/e2e proof) stands unchanged; only the
  cached full gate is blocked, by TR-0044, not by this ticket's own tests.
