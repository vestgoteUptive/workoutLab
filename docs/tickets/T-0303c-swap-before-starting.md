---
id: T-0303c
title: "UF-08.3 Swap before starting: a Swap button per UF-08.2 item opens the shared UF-05.1 SwapSheet at ?step=swap, in place of UF-08.2; Apply renders the engine's Workout, Keep changes nothing"
lane: web-feature:UF-08
screens: [UF-08.2, UF-08.3, UF-05.1, UF-08.4]
decisions: [D-0065, D-0069, D-0071, D-0107, D-0109, D-0124, D-0142, D-0158, D-0168]
deps: [T-0303b, T-0421]
status: done
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
- Deviation: AC-2 "contains Swapped to save time" cannot hold; `itemReasonLine` keeps 2 reasons and the swap one is third. Test asserts the DOM line equals `itemReasonLine(result reasons)` and the engine result carries `swap {short_on_time}` (D-0171, follow-up for web-shell; renumbered from D-0169 after main's own D-0169 "two test locks" landed — see gate log below).
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

### Gate re-run log (frontend-dev, 2026-10-03, HEAD 62d145e, after merging main's T-0474/D-0170)
- `-w typecheck lint test --concurrency=1` via `scripts/locked.sh heavy`: green, no hang. 19/19
  turbo tasks succeeded; `@workoutlab/web:test` 243 files / 3371 tests passed, including the three
  TR-0044 files that previously collected 0 tests (`t0422.lazy-reject`, `t0451.next-open`,
  `t0451.next-entry`) — each now runs its real assertion.
- `-w test:repo-checks`: found this branch's own `D-0169-uf082-swap-reason-hidden-by-two-line-cap.md`
  collided in ID with main's newly landed `D-0169-two-test-locks-qa-gate-batch-merges.md`
  (duplicate-decision-id) and, separately, sits outside this ticket's lane grant
  (`.squad/decisions/**` is the `process` lane, not `web-feature:UF-08`; `lane-path-not-owned`).
  Renumbered the file and its code comment to the next free id, D-0171, and regenerated
  `INDEX.md` (`node .squad/tools/archive.mjs index`) — fixes the duplicate-id finding. The
  lane-path finding remains on `D-0171-...md` and `INDEX.md`: confirmed clean on `main` itself
  (`node .github/scripts/check-all.mjs` → exit 0 there), so this is this branch's own pending
  decision file being outside its lane grant until merge, the same shape as every other ticket's
  decision file — not a regression and not fixable from within `web-feature:UF-08`. No triage
  filed: precedent (T-0304h, T-0463 logs) treats an unmerged branch's own pending decision/gate
  state as the orchestrator's business at merge time, not a blocker to re-raise per ticket.
- `-w format:check`: green.
- `node .github/scripts/check-all.mjs` (standalone, same as above): 2 lane-path findings on this
  branch's own `D-0171-...md`/`INDEX.md`, both expected to clear once the branch merges to main.
- Commit 62d145e: the D-0169→D-0171 renumber (3 files).

### Review log (code-reviewer, 2026-10-03, HEAD a7294b1)
- Verdict: **approve**.
- Static import confirmed: `SessionSetup.tsx` imports `SwapSheet` from `../UF-05/index.js` at
  module top level (no `React.lazy`), matching the ticket's explicit Scope › In.
- History: `leave()` in `SessionSetup.tsx` calls `navigate(-1)` for both Keep and Apply (Apply
  first sets `adjusted.workout = applied`), popping the `?step=swap` entry and landing back on the
  existing `?step=suggested` entry rather than pushing a new one — one further Back reaches
  UF-08.1, never re-opens the sheet. Confirmed by AC-6 tests (`swap-before-start.test.tsx`
  "Keep then one back lands on UF-08.1; the same after Apply", "browser Back while the sheet is
  open is Keep").
- Focus: `leave()` sets `focusSwapItem`, threaded through `Suggested` as a prop; its mount-only
  effect queries `[data-part="swap"]` buttons and focuses index `focusSwapItem`, then clears the
  request via `onSwapFocused`. AC-3 test confirms `Swap Barbell row` has focus after Close and
  after Escape.
- Bad URLs: `parseItem` rejects non-digit, negative (via regex `^\d+$`, so `-1` fails to match) and
  out-of-range values; `badSwap` drives a `replace: true` navigate to `?step=suggested` when a
  `Workout` exists; `stale` (unchanged logic, now excluding `showSwap`) replaces to
  `/session/setup` on a cold load with no `Workout`. AC-6 tests cover both paths (cold load, and
  `x`/`-1`/`3`/missing/`1.5` with a `Workout` present), plus `item=2` opening the sheet. Verified
  green with a targeted rerun (below).
- Deviation (AC-2 "Swapped to save time" can't literally hold): disclosed, not silently dropped.
  `itemReasonLine`'s two-reason cap does cut the swap line from the rendered row; the test instead
  asserts DOM-equality with `itemReasonLine(result reasons)` *and* separately asserts the engine
  result still carries `reasons` containing `{code: "swap", reason: "short_on_time"}` — so the
  underlying data is proven present even though the cap hides it from the user. Filed as D-0171,
  a real, lane-correct (`area: web`) follow-up for `web-shell` naming the actual fix (let
  `itemReasonLine` surface a swap reason or lift the cap by one). Not a leftover artifact.
- D-0170→D-0171 renumber: confirmed via `git diff main...HEAD -- .squad/decisions/INDEX.md` that
  D-0171's entry is the swap-reason-cap content (not a stray duplicate), and `main` already carries
  a later commit (6748da4) that reserves the next free ids after this exact renumber — consistent
  with the ticket's account of a numbering collision caught and fixed correctly.
- Lane-path findings: ran `node .github/scripts/check-all.mjs` on `main` directly (HEAD 6748da4,
  clean tree) → exit 0, no findings. Confirms the two `lane-path-not-owned` hits on this branch's
  own pending `D-0171-...md`/`INDEX.md` are solely an artifact of the unmerged decision file
  sitting under `.squad/decisions/**` (process lane) before merge, not a real violation introduced
  by this ticket's `web-feature:UF-08` changes.
- TR-0044/TR-0045 cross-lane gate hang: correctly out of scope for this review; already resolved on
  main by T-0474/D-0170 and merged into this branch (571750e). The re-run gate log after that merge
  is green (19/19 turbo tasks, 243 files / 3371 tests).
- Targeted rerun: `scripts/locked.sh small npx vitest run
  src/features/UF-08/__tests__/swap-before-start.test.tsx
  src/features/UF-08/__tests__/suggested-actions.test.tsx` (run from `apps/web`) → 2 files, 46
  tests, all passed.
- No lane or contract violations found: all changed paths are inside `web-feature:UF-08`'s owned
  paths or the ticket's three listed extras (`lib/i18n/flows/uf-08.ts` additive keys,
  `tests/e2e/uf-08-setup.spec.ts` appended rows, this ticket file). No contract file touched.

### QA log (qa, 2026-10-03, HEAD f325afe)
- Verdict: **done**. All 10 ACs proven: reproduced the builder's red-on-main (AC-1) and the
  planted-fault (`swap` left out of `pastSetup`, AC-2) proofs independently; added one new fault of
  its own (`navigate(-1)` → push, i.e. the reviewed Apply/Keep history pop swapped for a push) and
  confirmed it breaks AC-6's "one back lands on UF-08.1" assertion, restoring from a backup copy.
- e2e: `uf-08-setup.spec.ts` + `uf-05-swap.spec.ts`, 33/33, including AC-9's flow, axe (0
  serious/critical on the sheet), 44 × 44 px (every `Swap` button) and keyboard-only rows.
- Branch is ahead 7 / behind 2 of `main` — squad bookkeeping only (the D-0169→D-0170→D-0171
  decision-file renumbers and the `chore(squad)` commits on `main` in between); confirmed
  non-conflicting with a dry-run merge check. Correctly left unmerged per D-0169 §2 (orchestrator
  merges after accept).

### Accept log (product-owner, 2026-10-03, HEAD f325afe)
- Verdict: **done**.
- AC→evidence: AC-1 mount (red-on-main reproduced by QA; `swap-before-start.test.tsx` 4 tests) ·
  AC-2 apply renders engine result (QA reproduced the planted-fault red; D-0171 follow-up disclosed
  and lane-correct for the `itemReasonLine` two-reason cap) · AC-3 keep (Close + Escape, focus
  back on `Swap Barbell row`) · AC-4 over budget after swap · AC-5 start writes the swapped plan ·
  AC-6 history/bad URLs (QA's own new fault — push vs pop — caught by this AC's test) · AC-7
  offline (no `fetch`) · AC-8 exports/import boundaries — confirmed directly: `UF-08/index.tsx`
  exports exactly `SessionSetup`, `readFocusPrefs`, `writeFocusPrefs`; `SessionSetup.tsx`'s only
  UF-05 import is `../UF-05/index.js` · AC-9 e2e (flow + axe + 44px + keyboard, 33/33, confirmed by
  reading `uf-08-setup.spec.ts`'s `T-0303c AC-9` describe block) · AC-10 no regression (one
  pre-existing assertion in `suggested-actions.test.tsx` updated to the new truth, noted in the
  build log).
- Gate: green on re-run (19/19 turbo tasks; `@workoutlab/web:test` 3371 tests) after merging main's
  T-0474/D-0170 fix for the unrelated TR-0044/TR-0045 cross-lane hang; `test:repo-checks` and
  `format:check` green.
- Ran `node .github/scripts/check-all.mjs` directly on this branch: the same two
  `lane-path-not-owned` findings already recorded in the gate re-run and review logs, both on this
  branch's own pending `D-0171-...md`/`INDEX.md` under `.squad/decisions/**` (the `process` lane).
  Confirmed by decision-index inspection that D-0171 is a legitimate, non-duplicate, correctly
  indexed `revisit` follow-up (not a contract change, not this ticket's lane). These findings are a
  pre-merge artifact only — `main` itself is clean — and clear once the orchestrator merges; not a
  defect of `web-feature:UF-08`'s changes and not grounds to withhold accept.
- No contract file touched (confirmed: no diff under `api/openapi.yaml`, `docs/data-model.md`,
  `docs/engine-rules.md`, `packages/design-tokens/src/tokens.json`). Principle 3 (deterministic
  engine) upheld: the sheet calls the engine's `applySwap`/`rankSwaps`, UF-08 only renders what
  comes back, no LLM or ad hoc exercise selection added.
- Branch left unmerged (ahead 7 / behind 2 of `main`) per D-0169 §2; this is squad bookkeeping, not
  an accept blocker.
