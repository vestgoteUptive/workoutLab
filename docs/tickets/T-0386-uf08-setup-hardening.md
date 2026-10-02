---
id: T-0386
title: "UF-08.1 hardening: read-sequence guard test, DST fall-back earliest occurrence, finish-time focus (WCAG 2.4.3)"
lane: web-feature:UF-08
screens: [UF-08.1]
decisions: [D-0107, D-0113, D-0115]
deps: [T-0303a, T-0303b]
status: ready
---
## Why
T-0303a QA left three gaps on UF-08.1.
- **Read-sequence guard.** `use-setup-data.ts` has a guard (`seq < publishedSeq.current`) that
  stops a slow first read from overwriting the post-refresh re-read. No test covers it.
- **DST fall-back.** `time.ts` `todayAt` picks one of the two instants for a wall time in the
  repeated hour, and nothing defines which. D-0115 §4: use the earliest occurrence after `now`.
- **Focus.** Opening the finish-time input leaves focus on a button that unmounts. Closing it
  drops focus to `<body>`. D-0115 §5 fixes the focus order (WCAG 2.4.3).

**Scheduling:** T-0303b holds `features/UF-08/**` now. This ticket runs after T-0303b merges. It
must also not run in parallel with T-0303c or T-0303d, which share the lane.

## Scope
- In:
  - A guard test in `features/UF-08/__tests__/`.
  - The DST rule in `time.ts`, with tests.
  - Focus moves in `SessionSetup.tsx` (refs plus an effect that runs on open and close only),
    with tests.
- Out:
  - Spring-forward gaps (D-0115 §4).
  - Ticking "done by".
  - Any copy change.
  - The real-browser 24-hour `<input type="time">` probe from the board row. That is a qa-lane
    e2e follow-up, because it needs `tests/e2e/**`.

## Acceptance criteria
- AC1 (guard) Given `signedIn` true, online, a first `readCache` whose loaders resolve only when the test releases them (content A), `refreshAll` resolving at once, and a second read resolving at once with content B (a different `targets` value), when the second read publishes and then the first read is released, then the published state stays B. A `suggest` spy records no call for A after B. The builder notes in the accept log that this test fails when the `seq < publishedSeq.current` check is removed.
- AC2 (DST, Europe/Stockholm, 2026-10-25, the repeated hour 02:00–02:59) `finishToBudget(value, now, "Europe/Stockholm")` returns:
  - now `2026-10-25T00:10:00Z` (02:10 CEST), "02:30" → ok 20;
  - now `2026-10-25T00:45:00Z` (02:45 CEST), "02:30" → ok 45 (the second occurrence, 01:30Z);
  - now `2026-10-25T01:40:00Z` (02:40 CET), "02:30" → rejected;
  - now `2026-10-24T23:30:00Z` (01:30 CEST), "02:30" → ok 60 (the earliest occurrence, not the later one);
  - now `2026-10-25T00:10:00Z`, "03:00" → ok 110.
- AC3 (DST, America/New_York, 2026-11-01, the repeated hour 01:00–01:59) `finishToBudget(value, now, "America/New_York")` returns:
  - now `2026-11-01T05:10:00Z` (01:10 EDT), "01:30" → ok 20;
  - now `2026-11-01T05:45:00Z` (01:45 EDT), "01:30" → ok 45 (06:30Z);
  - now `2026-11-01T06:40:00Z` (01:40 EST), "01:30" → rejected;
  - now `2026-11-01T05:10:00Z`, "02:00" → ok 110.
- AC4 Given the existing `time.ts` and controls tests (13:07 → 67, 23:59 → 120, rejected and partial values), when they run, then they pass unchanged.
- AC5 (focus open) Given UF-08.1 rendered, when "Set a finish time" is activated, then `document.activeElement` is the input labelled "Finish by".
- AC6 (focus close) Given the input is open, when "13:07" converts (`now` 12:00), then the input is gone and `document.activeElement` is the "Set a finish time" button.
- AC7 (focus stays) Given the input is open, when a rejected value ("11:00" with `now` 12:00) or a partial value is entered, then focus stays on the "Finish by" input.
- AC8 (no focus steal) Given a fresh mount of `/session/setup`, when the first commit lands, then `document.activeElement` is not the "Set a finish time" button or the input (no focus moved on mount).
- AC9 Given the D-0071 §9 import bans, `jsx-no-literals` and the UF-08 export pin, when they run, then they are green and unchanged.

## Paths you may change
- `apps/web/src/features/UF-08/**` (the lane: `web-feature:UF-08`). The edits go in `time.ts`, `SessionSetup.tsx` and `__tests__/`.
- **Listed extras:**
  - `docs/tickets/T-0386-uf08-setup-hardening.md`: this file, for the accept log.

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0386` and cite screen IDs.

## Build log (2026-10-02, frontend-dev)
- **AC1 guard** (`__tests__/read-sequence.test.tsx`). The first read's four loaders hang until the test releases them (content A, chest 20). `refreshAll` resolves at once. Every later read serves content B (chest 24). The `suggest` spy's `targets` argument tells A and B apart. After B publishes, releasing A leaves the calls at `["B"]`, and the fit line doesn't change. Contrast row: `refreshAll` is held, A is released first and publishes (`["A"]`), then the refresh settles and B replaces it (`["A", "B"]`). **Planted fault:** with `seq < publishedSeq.current` removed from the check, the guard row turns red with `expected [ 'B', 'A' ] to deeply equal [ 'B' ]`, and the contrast row still passes. Reverted, green.
- **AC2-AC3 DST** (`time.ts`, `__tests__/time-dst.test.ts`). `occurrencesToday` collects every instant of `hh:mm` on now's local day. It tries the zone offsets at −12 h, 0 and +12 h around the wall time, and keeps only the candidates that format back to the same day and `hh:mm`. `finishAt` picks the earliest instant that is strictly after now. If none is after now, it returns the last one, which then rejects. With no occurrence (a spring-forward gap), `finishAt` falls back to the unchanged `todayAt`, so that behaviour stays as it was (pinned: 2026-03-29 Stockholm, 01:30 CET, "02:30" → 60). Both contrast rows run on the same days, outside the repeated hour. **Planted fault:** on the old `todayAt`, 3 rows are red. The old code took the later instant in Stockholm (00:10Z → 80, 23:30Z → 120) and the earlier instant in New York (05:45Z → rejected).
- **AC4.** `time.test.ts` and `controls.test.tsx` are unchanged and green.
- **AC5-AC8 focus** (`SessionSetup.tsx`, `__tests__/finish-focus.test.tsx`). There are refs on the "Finish by" input and the "Set a finish time" button. A `finishWasOpen` ref and one effect keyed on `[finishOpen]` move focus only when `finishOpen` flips: into the input when it opens, to the button when it closes. A rejected or partial value never closes the input, so focus stays put. Mount moves no focus, including under StrictMode, because the ref starts equal to the state. Contrast rows: an unrelated re-render (a chip while the input is open, + while it is closed) leaves focus on the control the user used. **Planted faults:** (a) without the two `.focus()` calls, 8 rows are red (all of AC5-AC7); (b) without the flip check, with the effect running on every render, 4 rows are red (the AC8 mount row, both unrelated re-render rows and the AC5 contrast row). Reverted, green.
- **AC9.** `exports-and-lint.test.ts` (the import bans, `jsx-no-literals`, the export pin) is unchanged and green. No new strings or exports.
- **Runs.**
  - UF-08 folder: 267/267.
  - web typecheck and lint green.
  - web `test`: 123 files, 1814 tests, green on 2 of 3 runs. The first run had 1 failure in the untouched `ready-start.test.tsx` "retry: the second tap reuses the same id…" (193 ms, the message wasn't captured). It passed 3/3 in isolation and in both later full runs. Filed as a follow-up.
  - `uf-08-setup` e2e: 15/15.
  - `-w format:check` clean; `check-all.mjs` exit 0.
