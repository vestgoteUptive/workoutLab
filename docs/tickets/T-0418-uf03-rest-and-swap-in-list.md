---
id: T-0418
title: "UF-03.2 rest bar and rest view on the host's wall-clock rest (startRest/adjustRest/skipRest, no rest after the session's last planned set), with focus targets"
lane: web-feature:UF-03
screens: [UF-03.1, UF-03.2]
decisions: [D-0142, D-0071, D-0118, D-0066, D-0157, D-0158, D-0169, D-0172]
deps: [T-0417, T-0414]
status: ready
---
<!-- Groomed 2026-10-02 by product-owner as the third child of the T-0305a board row (D-0142 §1 §3
§5 §7). Re-groomed 2026-10-03 against main f83403e (T-0417, T-0457, T-0458, T-0421, T-0414
merged): ready, and split by D-0157 §7 (D-0172 §3–§5 added focus and time-zone ACs that took it
past half a day). This ticket keeps the rest; the Swap button in the list is T-0478, which runs
after it (both edit ListView.tsx). Build flow: wl-build-web. About ⅓ day. -->

## Why
**UF-03.2:** the rest between sets in the List view. It uses the host's wall-clock rest (D-0071 §5,
NFR-TIME-1), so a rest started in the list carries on in focus mode, and a background tab doesn't
drift.

## Scope
- In (`features/UF-03`):
  - **The rest bar** "Rest · {m:ss} left" reads `ctx.rest`. It is shown while `ctx.rest` is
    non-null. After a check resolves, `ctx.startRest(item.exerciseId)` is called, unless no planned
    set of the session is left unlogged (D-0142 §3).
  - **The rest view (UF-03.2):** the bar expands to a view with −15 s, +15 s and Skip
    (`ctx.adjustRest(∓15)`, `ctx.skipRest()`) and "Back to list". It replaces the table while open
    (one `[data-screen-id]`).
  - **`ListViewCtx`** (`ListView.tsx`, D-0142 §5) gains `rest`, `startRest`, `adjustRest`,
    `skipRest`, typed structurally (no `features/UF-09` import). `seams.tsx` passes the real
    `FocusSession`, so `tsc` proves the shapes match (D-0172 §4).
  - **Focus** (D-0172 §3): after "Back to list" → the rest bar; after Skip, or when the rest ends
    with the rest view open (the view closes itself) → the current card's first unchecked row
    checkbox, else "Finish".
  - **No bar when the host starts no rest.** The host starts a rest only from
    `set`/`confirm`/`rest`/`timed` (`REST_STARTABLE`). The List view calls `ctx.startRest` per
    AC-1/AC-2 and shows the bar only while `ctx.rest` is non-null; widening the host's phases is
    T-0477 (D-0172 §5).
- Out:
  - The Swap button in the list (T-0478). The `swap` seam on UF-09.9/UF-09.6 (T-0422, done).
  - A List-view announcer of its own: the host's chrome announcer (D-0118 §10) speaks "10 seconds"
    and "Go".
  - Any `features/UF-09` file.

### Edge cases that are in scope
- **Offline:** the rest is wall-clock and needs no network (AC-1 runs with `navigator.onLine =
  false` once).
- **Backgrounded tab:** the rest reads the wall clock (AC-1).
- **The session's last set:** no rest after it (AC-2).
- **Zero history / returning after 10 days off:** no effect on the rest (rest length comes from the
  library `type`, not history).

## Acceptance criteria
**Test setup.** T-0417's. The rest tests use the real host (the rest is the host's) with fake timers
and a mocked `Date.now`. Each new test title starts with `T-0418 AC-n`.

**Test rules.** Both values of every binary condition get a test. Negative asserts wait ≥ 50 ms.
Every AC must fail on main's code. The build log records these planted faults turning their ACs red:
- a `setInterval` countdown inside UF-03 (AC-1, through a UF-03 copy of the T-0304a tick-counting
  source scan, because a test in `features/UF-03` may not deep-import `features/UF-09/__tests__`);
- `startRest` after the session's last planned set (AC-2);
- focus left on `body` after Skip (AC-5).

- **AC-1 (rest bar, NFR-TIME-1)**
  - **Start.** After checking back-squat row 1 (a compound), `ctx.startRest("back-squat")` is
    called once, and the bar reads "Rest · 2:00 left" (`REST_COMPOUND_S`). After an isolation
    (leg-curl), it reads "Rest · 1:00 left" (`REST_ISOLATION_S`).
  - **Wall clock.** With `Date.now` advanced 90 s and no timer ticks run (as if backgrounded), the
    next render reads "0:30". Same with `navigator.onLine = false`.
  - **Expiry.** At 0 the bar is gone (the host's `REST_END`).
  - **No own timer.** A source scan of `features/UF-03` finds no `setInterval`/`setTimeout`
    countdown (a copy of the T-0304a AC-2 helper).
  - **Edits.** Edit and uncheck start no rest (spy).
- **AC-2 (no rest after the last planned set, D-0142 §3)** Given every planned set of S1 logged
  except leg-curl row 3, When row 3 is checked, Then `startRest` isn't called, and there is no bar.
  The pair: with leg-curl rows 2 and 3 unlogged, checking row 2 starts a rest.
- **AC-3 (rest view UF-03.2)**
  - **Open.** Tapping the bar shows exactly one `[data-screen-id="UF-03.2"]` with the time,
    "−15 s", "+15 s", "Skip" and "Back to list".
  - **Adjust.** At "0:30", "+15 s" calls `ctx.adjustRest(15)` and reads "0:45". "−15 s" reads "0:30".
  - **Skip** calls `ctx.skipRest()` and returns to UF-03.1 with no bar.
  - **Back to list** returns to UF-03.1 with the bar still running.
  - **Announcer.** In the real host, while the List view is open, the chrome announcer
    (`[data-field="announcer"]`) reads "10 seconds" once at ≤ 10 s and "Go" at the expiry
    (D-0118 §10). UF-03 renders no `aria-live` region of its own for the rest.
- **AC-4 (a11y)** The rest bar is a `button` named "Rest, {m:ss} left, show rest". The rest view
  buttons are named. The vitest axe helper finds 0 violations on UF-03.2 and on UF-03.1 with the
  bar showing.
- **AC-5 (focus, D-0172 §3)**
  - After "Back to list": `document.activeElement` is the rest bar.
  - After Skip with leg-curl rows 2–3 unchecked on the current leg-curl card: row 2's checkbox.
    With every row of the current card checked: "Finish".
  - With the rest view open and `Date.now` advanced past the rest's end: the view closes and focus
    is on the first unchecked row's checkbox.

## Paths you may change
- `apps/web/src/features/UF-03/**` (the lane: `web-feature:UF-03`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-03.ts`: this flow's strings file (D-0071 §1); add keys.
  - `docs/tickets/T-0418-uf03-rest-and-swap-in-list.md`: this file, for the build and accept logs.
- Read-only imports (not grants): `lib/i18n/workout.ts` (`restLabel`), `@workoutlab/engine`
  (`REST_COMPOUND_S`, `REST_ISOLATION_S`, tests only), `lib/offline` (tests).

## Contract impact
None.

## Definition of done
Tests for every AC pass, with the planted faults recorded · while working,
`scripts/locked.sh small npx vitest run <files>` · once before hand-back (D-0158, D-0169):
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`,
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check`,
`node .github/scripts/check-all.mjs`, and `scripts/locked.sh heavy` on the web `test:e2e` for
`uf-03-list-summary.spec.ts` and `uf-09-focus.spec.ts` (one feature folder: the whole e2e isn't
needed) · contracts unchanged · commits start `T-0418` and cite the screen (for example
`T-0418 UF-03.2: rest on the host's wall clock`).

## Notes
- **Flow:** `wl-build-web`.
- **Parallel.** The only UF-03 ticket to run now. T-0478 follows it; T-0464, T-0472, T-0473 (UF-03
  todo) wait too (all edit `ListView.tsx`). T-0468 (UF-09 e2e) shares no file. `flows/uf-03.ts`:
  added keys only.
- **T-0305a is done** when T-0415, T-0416, T-0417, T-0418 and T-0478 are.

## Build / accept log
