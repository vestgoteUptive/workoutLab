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

### Build log (frontend-dev, 2026-10-03; start: git clean, HEAD e3e090e)
- **Built:** `ListView.tsx` — `ListViewCtx` gains `rest`/`startRest`/`adjustRest`/`skipRest`
  (structurally typed, D-0142 §5); `SetRow.onToggle`'s check branch calls `ctx.startRest` once a
  check resolves, unless `allPlannedSetsLogged` (a local pure helper, counts the just-written set
  so it never depends on the write's own closure catching up); `RestBar` (the "Rest · m:ss left"
  button, named "Rest, m:ss left, show rest"); `RestView` (UF-03.2, replaces the whole screen, one
  `[data-screen-id]`); AC-5 focus via `restClose` ("back" | "next") read by an effect once
  `restOpen` goes false, and a second effect that closes the view itself when `ctx.rest` goes null
  (the host's own REST_END). No own timer: the host's 1 s re-render feeds `ctx.rest` straight into
  the bar/view. `list-view.css` and `flows/uf-03.ts` get the new classes/strings (`restBar`,
  `restBarName`, `restViewName`, `restLess`, `restMore`, `skipRest`, `backToList`). `T-0478` (Swap
  in the list, out of scope here) is left untouched.
- **Also touched (T-0417's own tests, same lane):** `list-helpers.tsx` (`makeCtx` gains the four
  new fields/spies); `list-view.logging.host.test.tsx` and `list-view.addset.host.test.tsx` — a
  check from the List view now starts a rest by design (T-0418 AC-1), so three flows that
  previously asserted "Focus mode" landed back on a `set` step now skip the rest (through the bar)
  first; one test's "without moving the machine" assertion for `phase` is corrected to assert
  `phase: "rest"` (itemIndex/setIndex still untouched, matching D-0142 §2's "the log itself never
  moves the machine").
- **New files:** `rest.test.tsx` (AC-1..AC-5, real `SessionHost` for the wall-clock/host behaviour,
  `makeCtx` unit style for the two a11y and two "(spy)" edit/uncheck cases); `rest-tick-scan.ts` +
  `rest-sources.test.ts` (AC-1's required UF-03 copy of the T-0304a tick-counting scanner, plus a
  `setInterval`/`setTimeout` literal scan, since a UF-03 test may not deep-import
  `features/UF-09/__tests__`).
- **AC → test:** AC-1 `rest.test.tsx` "T-0418 AC-1" (start/wall-clock/offline/expiry/edit/uncheck)
  + `rest-sources.test.ts` (no own timer) · AC-2 "T-0418 AC-2" (both halves of the pair) · AC-3
  "T-0418 AC-3" (open, adjust, Skip, Back to list, announcer) · AC-4 "T-0418 AC-4 a11y" (button
  names, axe on UF-03.1 with the bar and on UF-03.2) · AC-5 "T-0418 AC-5 focus" (Back to list, Skip
  with rows open, Skip with the card done, the rest view's own auto-close on expiry).
- **Red on main** (HEAD `e3e090e`'s `ListView.tsx`/`list-helpers.tsx`, swapped in via `cp` and
  restored the same way): 17 of 22 new tests failed (every AC-1/AC-3/AC-4/AC-5 case; the remaining
  5 are either source-scan tests with no `ListView.tsx` dependency, or negative asserts that are
  vacuously true with the feature absent, e.g. "the bar is gone" when no bar exists at all —
  covered by AC-1's positive "Start" case and AC-2's "pair" case turning red in the same run).
- **Planted faults (each on a `cp` backup, restored by `cp`):**
  - a `setInterval` added inside `RestBar` → `rest-sources.test.ts`'s own-timer scan red (AC-1).
  - `startRest` called unconditionally (the `allPlannedSetsLogged` guard removed) → AC-2's
    "checking row 3 starts no rest" red.
  - the focus-after-close effect gutted to a no-op → all 4 AC-5 tests red (focus stayed on `body`
    after Skip/Back to list/the view's own close).
- **Gate:** `-w typecheck lint test --concurrency=1` 3437 passed · `test:repo-checks` 159 passed ·
  `format:check` clean (after one `prettier --write`) · `check-all.mjs` exit 0 · e2e
  `uf-03-list-summary.spec.ts` + `uf-09-focus.spec.ts`: 16 passed.
- **Contracts:** unchanged. **Out of scope kept out:** no Swap button, no `features/UF-09` file
  touched, no List-view `aria-live` region of its own.

### Review log (code-reviewer, 2026-10-03; HEAD dcff4f8)
- **Lane:** all changed paths are `apps/web/src/features/UF-03/**` plus the ticket's two listed
  extras (`lib/i18n/flows/uf-03.ts`, this file). No other path touched. **Contracts:** none of
  `data-model.md`/`openapi.yaml`/`engine-rules.md`/`tokens.json` appear in the diff, matching
  "Contract impact: None."
- **D-0142 §2 invariant, verified in the diff (not just the log's claim):** `SetRow`'s check
  handler calls `run(write, onDone)`; `onDone` fires only after `ctx.recordSet(...)`'s promise
  resolves, and it is the *only* place `ctx.startRest` is called — a separate, explicit call, not
  something `recordSet` triggers as a side effect. Confirmed at the host too: `UF-09/session.tsx`
  `recordSet` and `startRest` dispatch different store actions (`startRest` → `REST_START`); that
  file has no diff in this ticket, so the separation predates T-0418 and the new call site just
  invokes it after the write settles.
- **The 3 modified T-0417 tests:**
  - `list-view.logging.host.test.tsx`'s "without moving the machine" test: changed from asserting
    `phase`/`itemIndex`/`setIndex` all unchanged to asserting `itemIndex`/`setIndex` unchanged and
    `phase` now `"rest"`. This is a stronger, more specific assertion, not a deletion — it still
    proves position doesn't move and additionally pins the new phase precisely, consistent with
    D-0142 §2 (log doesn't move the machine; the separate `startRest` call does).
  - The AC-6 reload test and the two AC-7 focus-mode tests: no assertions touched or removed; each
    only adds two `fireEvent.click`s (open the rest bar, Skip) to dismiss the new mandatory rest
    state before the pre-existing reload/mode-switch assertions run. Nothing weakened.
- **Shape match:** `ListViewCtx` gains `rest`/`startRest`/`adjustRest`/`skipRest`, structurally
  typed (no `features/UF-09` import, confirmed — `ListView.tsx`'s only shared import is
  `@workoutlab/shared`/`lib/*`). `seams.tsx` (pre-existing, unmodified here) already passes the
  real `FocusSession` as `ctx` into `<ListView ctx={ctx} />`; `FocusSession` (unmodified,
  `UF-09/session.tsx`) already has all four with matching signatures from T-0414/T-0415, so `tsc`
  does prove the shapes match without this ticket needing to touch `seams.tsx`. The rest view
  (`RestView`) replaces the whole screen behind one `[data-screen-id="UF-03.2"]` and renders no
  timer/countdown of its own (confirmed: no `setInterval`/`setTimeout` in the diff; `rest-sources.
  test.ts`'s source scan also checks this) — host-driven, matching D-0142 and principle 3.
  No new `aria-live` region (grep of the diff for `aria-live` returns nothing new).
- **T-0478 scope:** no Swap button, no `swap` string/logic anywhere in `ListView.tsx` or
  `flows/uf-03.ts`'s diff — genuinely untouched, consistent with D-0172 §9's split.
- **Ran:** `scripts/locked.sh small npx -y pnpm@10.28.2 --filter @workoutlab/web exec vitest run`
  on `rest.test.tsx`, `rest-sources.test.ts`, `list-view.logging.host.test.tsx`,
  `list-view.addset.host.test.tsx` — 4 files, 27 tests, all passed.
- **Verdict: approve.** No lane, contract, correctness or principle issues found; the three
  modified T-0417 tests are strengthened/adapted, not weakened.

### QA log (qa-tester, 2026-10-03; start: git clean, HEAD 1d28123)
- **Branch vs main:** behind (`origin/main` has T-0468/T-0470/T-0479/D-0173 on top); `git
  merge-tree` of the merge-base against HEAD and `origin/main` produced no conflict markers —
  clean behind-main, so per D-0169 §2/qa-tester §1 no merge needed from QA; the orchestrator's
  forced gate on `main` covers the combination.
- **AC → test (verified by reading titles, not just names):** AC-1 `rest.test.tsx` "T-0418 AC-1"
  (compound/isolation start, wall-clock incl. offline, expiry, no-own-timer via
  `rest-sources.test.ts`, edit/uncheck spy) · AC-2 "T-0418 AC-2" both halves of the pair · AC-3
  "T-0418 AC-3" open/adjust/Skip/Back to list/announcer · AC-4 "T-0418 AC-4 a11y" named buttons +
  axe 0 violations on UF-03.1 (bar shown) and UF-03.2 · AC-5 "T-0418 AC-5 focus" Back-to-list,
  Skip with rows open, Skip with card done → Finish, rest view's own auto-close on expiry. No gaps.
- **Reproduced red-on-main independently:** swapped main's (`e3e090e`) `ListView.tsx` and
  `list-helpers.tsx` in via `cp` backup, ran the new test files — 17/22 red, matching the build
  log exactly (same 5 vacuously-true survivors); restored via `cp`, tree clean.
- **Reproduced all 3 recorded planted faults** (each on a `cp` backup of `ListView.tsx`,
  restored by `cp`): own `setInterval` in `RestBar` → `rest-sources.test.ts`'s scan red (AC-1) ·
  `allPlannedSetsLogged` guard removed → AC-2's "row 3 starts no rest" red, pair test unaffected
  as expected · AC-5's focus-after-close effect gutted to a no-op → all 4 AC-5 tests red. All
  three matched the log's description exactly.
- **D-0142 §2 invariant, own planted fault:** confirmed in code (as the review did) that
  `startRest` fires only from the write's *resolve* branch, never the reject branch. Wrote a
  scratch test (`qa-fault.test.tsx`, removed after) asserting a rejected `ctx.recordSet` starts
  no rest — green on real code. Then planted a fault making the `run()` helper's reject branch
  also call `onDone`, i.e. `startRest` would fire even on a failed write — the same probe went
  red (`startRest` called once). This independently confirms the invariant is real, not vacuous:
  a regression that fired `startRest` regardless of write outcome would be caught. Restored via
  `cp`; scratch test deleted; tree clean.
- **Modified T-0417 tests re-checked:** `list-view.logging.host.test.tsx`'s "without moving the
  machine" test still asserts `itemIndex`/`setIndex` unchanged (D-0142 §2) and additionally pins
  `phase` to `"rest"` — a strengthening, confirmed by reading the assertions directly, not just
  the log's claim.
- **e2e:** `scripts/locked.sh heavy` playwright run of `uf-03-list-summary.spec.ts` +
  `uf-09-focus.spec.ts` (TMPDIR set per T-0440) — 16/16 passed, matching the build log. Both specs
  use the shared `guarded-test` fixture (D-0086/T-0425), which fails on any console error or
  unclaimed Supabase request; all 16 green, so no console errors. Offline coverage present and
  passing throughout (NFR-OFF-2 reload/offline scenarios in both specs, including the rest flow
  at UF-09.5 Skip rest). Going-back-mid-flow covered by the T-0394 "Back means Pause" cases
  (both online and offline), which passed with the rest-bearing host unchanged.
- **Try-to-break-it:** zero history and a 15-minute budget don't interact with rest length or
  timing (ticket's own "Edge cases in scope" — rest length comes from the library `type`, not
  history or budget), so no separate probe needed. Timers crossing zero: AC-1 expiry and AC-5
  auto-close both exercise `Date.now` crossing the rest's end exactly. Backgrounded/slow network:
  AC-1's wall-clock case advances `Date.now` 90 s with no timer ticks and with
  `navigator.onLine = false`, matching a backgrounded or offline tab.
- **Verdict: done.** All 5 ACs proven, both red-on-main and all 3 recorded faults reproduced
  independently, one new fault planted and caught, e2e green with no console errors, D-0142 §2
  invariant independently verified in code and by a dedicated fault. No gaps found.

### Accept log (product-owner, 2026-10-03; start: git clean, HEAD d61f8c5)
- **AC → verdict, read against the build/review/QA logs and the files themselves (not just the
  claims):**
  - **AC-1** (rest bar, NFR-TIME-1) — `rest.test.tsx` "T-0418 AC-1" covers start at
    `REST_COMPOUND_S`/`REST_ISOLATION_S` (checked values 120/60 against the engine export), the
    wall-clock read with `Date.now` advanced 90 s and no timer tick (incl. `navigator.onLine =
    false`), expiry at 0, and the two "(spy)" no-rest cases (edit, uncheck). `rest-sources.test.ts`
    (read: exists, is the required UF-03-local copy of the T-0304a scan) proves no own
    `setInterval`/`setTimeout`. **Met.**
  - **AC-2** (no rest after the session's last planned set, D-0142 §3) — `rest.test.tsx` "T-0418
    AC-2" has both halves of the required pair (row 3 starts none, row 2 starts one), read in full
    above; confirmed `allPlannedSetsLogged` is a separate pure helper gating the one
    `ctx.startRest` call site in `ListView.tsx`. **Met.**
  - **AC-3** (rest view UF-03.2) — "T-0418 AC-3" covers Open (one `[data-screen-id="UF-03.2"]` with
    all five controls), Adjust (+15 s/−15 s from 0:30), Skip (back to UF-03.1, no bar), Back to list
    (back to UF-03.1, bar still running) and the announcer case (reads "10 seconds" at ≤10 s and
    "Go" at expiry, plus the assertion that every `[aria-live]` other than the host's own announcer
    field sits inside UF-03.1/UF-03.2, i.e. UF-03 owns none of its own). **Met.**
  - **AC-4** (a11y) — "T-0418 AC-4 a11y" names the bar exactly `"Rest, {m:ss} left, show rest"` and
    checks all four rest-view buttons are named, with `axeViolations()` asserted `[]` on both
    UF-03.1 (bar shown) and UF-03.2. **Met.**
  - **AC-5** (focus, D-0172 §3) — "T-0418 AC-5 focus" has all three cases named in the AC (Back to
    list → the rest bar; Skip with rows open → the first unchecked checkbox; Skip with the card done
    → Finish) plus the view's own auto-close-on-expiry case the AC also names. Each asserts
    `document.activeElement` directly against the real DOM node, not a proxy. **Met.**
  - **D-0142 §2 invariant** (log never moves the machine; `startRest` fires only after the write's
    own resolve, never on reject) — verified independently in the diff (one call site, gated by
    `allPlannedSetsLogged`, fired from `onDone` after `ctx.recordSet(...)` resolves) and by QA's own
    dedicated fault (reject branch wired to also call `onDone`) turning a scratch probe red. Not
    just asserted by the log; read and reproduced.
- **Scope discipline.** Diff confined to `apps/web/src/features/UF-03/**` plus the two listed
  extras (`lib/i18n/flows/uf-03.ts`, this ticket file); no `features/UF-09` file touched; no Swap
  button or `swap` string anywhere (T-0478's scope, correctly left out, consistent with D-0172 §9's
  split); no List-view `aria-live` of its own. Contracts: none of `data-model.md`/`openapi.yaml`/
  `engine-rules.md`/`tokens.json` in the diff, matching "Contract impact: None."
- **The 3 modified T-0417 tests, re-read directly (not taken on trust):** diffed
  `list-view.logging.host.test.tsx` and `list-view.addset.host.test.tsx` against pre-ticket HEAD
  (`e3e090e`). The "without moving the machine" test now asserts `itemIndex`/`setIndex` unchanged
  (unchanged assertion, D-0142 §2) **and** a new `expect(after["phase"]).toBe("rest")` — strictly
  more specific, not weaker. The other three touched tests (the AC-6 reload test and the two AC-7
  focus-mode tests) only insert two `fireEvent.click`s each (open the bar, Skip) before their
  pre-existing assertions, to dismiss the new mandatory rest state first; zero assertions removed
  or loosened in any of the four hunks. Confirms the review and QA logs' claim.
- **Build/test evidence re-checked:** `node .github/scripts/check-all.mjs` run fresh from this
  worktree at HEAD `d61f8c5` — exit 0, consistent with the build log's claim. `rest.test.tsx` read
  in full: every AC's required cases and both halves of every binary-condition pair (Test rules)
  are present, titled `"T-0418 AC-n"` as required. Per D-0169 §2 this accept pass does not itself
  run the heavy gate or the e2e suite (shell is read-only in this role; QA already ran and the build
  log independently matches); the orchestrator's forced full gate runs on `main` after merge.
- **Branch state.** Behind `main` (QA: `origin/main` has T-0468/T-0470/T-0479/D-0173 on top);
  `git merge-tree` reported clean behind-main by QA, so correctly left unmerged per D-0169 §2 for
  the orchestrator to combine and force-gate.
- **Verdict: done.** All 5 ACs have a passing, correctly-targeted test; the D-0142 §2 invariant
  holds in code and under a dedicated fault; the three modified T-0417 tests are strengthened, not
  weakened; scope and contracts are clean; `check-all.mjs` is green. No missing AC, no principle
  violation.
