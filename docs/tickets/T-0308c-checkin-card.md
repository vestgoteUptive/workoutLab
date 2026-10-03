---
id: T-0308c
title: "UF-11.1 CheckinCard, read side: evaluate through the shared helper, one-period copy from the last period, before → after preview, no card on plan or at the clamp, actions disabled offline; exported, not yet mounted"
lane: web-feature:UF-11
screens: [UF-11.1]
decisions: [D-0018, D-0061, D-0070, D-0071, D-0075, D-0158, D-0166, D-0168]
deps: [T-0308b, T-0215, T-0223, T-0302a]
status: done
---
<!-- Groomed 2026-10-03 by product-owner. First of three children of the T-0308c board row (D-0168
§5): this ticket (read side), T-0470 (writes: first-shown insert, Accept, Keep), T-0471 (mounts on
UF-11.2 and UF-02.1, never-in-a-workout, e2e). Parent: docs/tickets/T-0308-routines-plan-checkin.md
AC-C1–C6, C12. Build flow: wl-build-web. About ½ day. All deps are on main. -->

## Why
Targets adapt, and never silently (principle 4, UF-11.1). When the last 14-day period was clearly
under or over the plan, the user sees one card that says what happened, what the engine proposes
and what the targets would become, and decides. This ticket builds that card's content from the
engine's evaluation (principle 3: the proposal and preview are `evaluateCheckin`'s, never UI
arithmetic). Its writes are T-0470 and its placement is T-0471, so `main` never shows buttons that
do nothing (D-0168 §5).

## Scope
- In:
  - **`CheckinCard`** in `features/UF-11` (for example `CheckinCard.tsx`), exported from
    `features/UF-11/index.tsx`. Props, all optional (the UF-02 slot renders it with none):
    `{ now?: Clock; timeZone?: string; locale?: string }`, defaulting like `Plan`.
  - **Data.** On mount it reads the cache once: `loadSessions()`, `loadEngineHistory()`,
    `loadLibrary()`, `loadProfile()`, `loadCheckins()`, and calls `evaluatePlanCheckin(…)` from
    `checkin-evaluation.ts` (the one place UF-11 evaluates rule 9, T-0308b) with `now` and the zone.
    It renders **nothing** until that resolves, nothing when `evaluation.proposal` is null, and
    nothing (with no `console.error`) when a loader rejects or the profile is missing.
  - **Content** (D-0070 §5), in a `section` with `data-part="checkin-card"` and an accessible name:
    - the line from the **last** entry of `evaluation.periods`: "You trained {n} time(s) in your
      last 14-day period ({d MMM}–{d MMM}). Your plan is {2·rhythmMin}–{2·rhythmMax}." followed by
      "Switch to {pMin}–{pMax} per week?" (down) or "Step up to {pMin}–{pMax} per week?" (up), where
      `pMin`/`pMax` = `proposal.rhythmMin`/`rhythmMax` and direction = the proposal compared with
      the current rhythm;
    - the before → after list: 9 rows in the fixed area order, "{Area} {current setsPer14d} →
      {proposal.previewTargets[area]}";
    - two buttons, "Accept" and "Keep current", and no close button.
  - **Offline** (D-0070 §7): with `navigator.onLine` false both buttons are `disabled` and
    "Connect to update your plan" shows; `online`/`offline` events toggle them with no remount.
  - **Buttons online** are enabled, but this ticket wires no write: a click makes no supabase call
    (T-0470 wires them). The card is mounted nowhere yet (T-0471).
  - **Strings** in `flows/uf-11.ts` under `checkin.*` (D-0075 shape, multi-line, added keys only).
    Dates use `Intl.DateTimeFormat(locale, {day: "numeric", month: "short", timeZone})`.
- Out:
  - Writes (T-0470). Mounting on UF-11.2 or UF-02.1, the router "never in a workout" test, the
    e2e (T-0471).
  - Any engine or contract change; editing `checkin-evaluation.ts`'s signature.

### Edge cases that are in scope
- **Offline:** the card renders from the cache with its actions disabled (AC-6).
- **Zero history:** no ended period yet → `periods` is empty and there is no proposal → nothing
  renders (AC-4).
- **Returning after 10 days off:** the last period is mostly empty, so the engine proposes "down";
  the card shows what the engine says (AC-1, AC-2); the UI never re-decides.
- **Time running out:** not applicable (never shown in a workout, T-0471).

## Acceptance criteria
Vitest + Testing Library with the UF-11 test helpers, `now` = 2026-09-27T12:00:00+02:00, zone
`Europe/Stockholm`, `locale` "en-GB". "P2 = 7, P3 = 3" means sessions seeded so the engine's last
two periods have 7 and 3 completed sessions; rhythm 3–4 (plan 6–8). Each new test title starts
with `T-0308c AC-n`.

- **AC-1 (down, through the real engine, red on main)** **Given** P2 = 7, P3 = 3, rhythm 3–4,
  **Then** the card reads "You trained 3 times in your last 14-day period (13 Sep–26 Sep). Your plan
  is 6–8. Switch to 2–3 per week?", with "Accept" and "Keep current" and no close button. **Red:**
  `features/UF-11/index.tsx` has no `CheckinCard` on main.
- **AC-2 (copy rules, stubbed evaluation)** `periods [{index 2, completed 4}, {index 3, completed
  1}]` with proposal 2–3 → "You trained 1 time in your last 14-day period (13 Sep–26 Sep)." (the last
  period, singular). With one listed period the line reads from it. A stub proposal of 5–6 shows
  "5–6" (the engine's numbers, not UI arithmetic).
- **AC-3 (preview)** For AC-1 the list has 9 rows in this order: "Chest 20 → 14", "Back 20 → 14",
  "Shoulders 16 → 11", "Arms 12 → 9", "Core 12 → 9", "Glutes 20 → 14", "Quads 20 → 14", "Hamstrings 16
  → 11", "Calves 12 → 9" (`previewTargets`, R4-E3).
- **AC-4 (no card, both values)** P3 = 5 (≥ 4.2 and ≤ 8.8): no `[data-part="checkin-card"]`. Zero
  history: none. A rejected `loadCheckins` or a missing profile: none, and no `console.error`.
- **AC-5 (up, floor and ceiling)** P3 = 10 → "Step up to 4–5 per week?". Rhythm 1–2, P3 = 0 →
  "…Your plan is 2–4. Switch to 1–1 per week?", and "0–1" is not in the DOM; rhythm 1–1, P3 = 0 → no
  card. Rhythm 6–7, P3 = 16 → "Step up to 7–7 per week?", "7–8" not in the DOM; rhythm 7–7 → no card.
- **AC-6 (offline, both values)** With `navigator.onLine = false`: the card is visible, both buttons
  are `disabled`, and "Connect to update your plan" shows. Dispatching `online` (with `onLine` true)
  enables both and hides the line without a remount (same DOM node, checked by reference);
  dispatching `offline` disables them again.
- **AC-7 (no writes, exports, strings)** Clicking Accept or Keep current online makes no
  `supabase.from` call (spy). `features/UF-11/index.tsx` exports exactly the names on main at build
  time plus `CheckinCard` (`["CheckinCard", "EditPlan", "Plan"]`, plus `AccountSettings` if T-0310d
  has merged). `jsx-no-literals` is green, `flows/uf-11.ts` keeps its shape, and
  `checkin-evaluation.ts` is called, not copied (a source scan finds no `evaluateCheckin(` outside
  it).

**Red proof.** Run AC-1 on main: it fails. Plant one fault on a backup copy (read the **first**
period instead of the last): AC-2 must fail. Record both in the build log.

## Paths you may change
- `apps/web/src/features/UF-11/**` (the lane: `web-feature:UF-11`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-11.ts`
  - `docs/tickets/T-0308c-checkin-card.md`
- Notes on the extras: the strings file gets added keys only (D-0071 §1, D-0075); this ticket file
  is for the build and accept logs.

## Contract impact
None. It reads the existing caches and calls the engine's `evaluateCheckin` through the existing
helper.

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`,
`-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` green, each test
command inside `flock /tmp/workoutlab-tests.lock` · `uf-11-plan.spec.ts` green (nothing visible
changes, so not the whole web e2e, D-0158) · contracts unchanged · commits start `T-0308c` and cite
UF-11.1.

## Notes
- **Flow:** `wl-build-web`.
- **Parallel.** UF-11 lane: serial with T-0310d (both edit `index.tsx` and the exports pin), then
  T-0470, then T-0471. Parallel-safe by files with T-0303c, T-0302b, T-0395, T-0304h and T-0468.
- **Spec follow-up (product):** `docs/specs/uf-11-plan-checkin.md` and the UF-11.1 line in user
  flows v2 still say "two 14-day periods in a row"; D-0061 §2 and D-0070 §5 changed it to one.

## Build / accept log

### Build (frontend-dev, 2026-10-03)
**Start:** `git status` clean, HEAD `af4bfcf` (main), branch `t/T-0308c-checkin-card`.

**Changed:** new `features/UF-11/CheckinCard.tsx`, `use-checkin-data.ts`,
`__tests__/checkin-card.test.tsx`; edited `format.ts` (+`formatCalendarDay`, locale-aware,
`en-GB` "Sept"→"Sep" fix, same note as UF-10's), `index.tsx` (+`CheckinCard` export),
`lib/i18n/flows/uf-11.ts` (+`checkin.*` keys), `__tests__/strings.test.ts` (export pin now
`[AccountSettings, CheckinCard, EditPlan, Plan]`; allowlist +6 structural literals from the new
files). No contract touched.

**Design notes.** `useCheckinData` reads the cache ONCE (`loadProfile`, `loadSessions`,
`loadEngineHistory`, `loadLibrary`, `loadCheckins`, no `loadTargets`, no `refreshAll`) and calls
`evaluatePlanCheckin` (T-0308b's one evaluation helper). "Current" in the before→after list is
the engine's own `previewTargets` for the CURRENT profile rhythm/priorities (never a stored
target or UI arithmetic), so both sides of the list are engine output. `CheckinCard` is exported
from `index.tsx` but mounted nowhere (T-0471); clicking Accept/Keep makes no supabase call
(T-0470).

**AC → test map** (`apps/web/src/features/UF-11/__tests__/checkin-card.test.tsx`, all titled
`T-0308c AC-n`):
- AC-1 → "down, through the real engine" (real engine + real IndexedDB feed, P2=7/P3=3 seeded).
- AC-2 → "copy rules, stubbed evaluation" (stubbed `evaluatePlanCheckin` via a module mock toggle).
- AC-3 → "preview" (9-row before→after order).
- AC-4 → "no card, both values" (4 cases: on-plan P3=5, zero history/just-onboarded, rejected
  `loadCheckins`, missing profile — each asserts no `console.error`).
- AC-5 → "up, floor and ceiling" (5 cases: 3-4/P3=10, 1-2/P3=0 floor, 1-1/P3=0 clamp-null, 6-7/P3=16
  ceiling, 7-7 clamp-null).
- AC-6 → "offline, both values" (disabled buttons + connect line; online/offline toggle, same DOM
  node by reference).
- AC-7 → "no writes, exports, strings" (no `supabase.from` call on click; export pin).

**Red on main.** Stashed all changes (`git stash -u`), confirmed `CheckinCard.tsx` absent from
the worktree, ran a standalone import-and-assert test against `features/UF-11/index.tsx` on
main: failed (`expected undefined to be defined`), confirming no `CheckinCard` export exists on
main. Restored with `git stash pop`.

**Planted fault (AC-2).** Backed up `CheckinCard.tsx` (`cp`), changed `evaluation.periods[...length
- 1]` to `evaluation.periods[0]` (read the first period instead of the last). Ran AC-2: failed
(wrong completed count, wrong proposal numbers — "4" instead of "1", "4–5" style text absent).
Restored `CheckinCard.tsx` from the backup copy; re-ran the full `checkin-card.test.tsx`: 15/15
green.

**Other red runs hit and fixed while building** (not faults on finished code, found while
writing the feature itself): (1) `en-GB` `Intl.DateTimeFormat` month:"short" prints "Sept" for
September — fixed with the same `formatToParts` + 3-letter clip UF-10's `format.ts` already
documents. (2) `vi.doMock` + `vi.resetModules` handed a freshly re-imported `CheckinCard` a new
`lib/offline/db.js` module instance with its own `db` singleton, invisible to the
already-seeded cache from the test file's original import — switched AC-2/AC-4's stubs to
always-installed `vi.mock` toggles (the `offline.test.tsx` pattern) instead. (3) seeding 16
one-per-day sessions overran the 14-day period window — seeding now wraps extra sessions onto
the same days. (4) a naive "zero history" case (old `onboardedAt`, 0 sessions) actually yields an
ended, under-target period with a real proposal, not "no card" — the AC-4 case now onboards on
`now`'s own day so no period has ended yet.

**Gate (cached, one run before handback):**
- `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1` → green,
  243 test files / 3367 tests passed.
- `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w test:repo-checks` → green, 159/159.
- `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w format:check` → green (one prettier --write
  pass needed first, on the 3 new/edited files).
- `scripts/locked.sh heavy node .github/scripts/check-all.mjs` → exit 0.
- `uf-11-plan.spec.ts` e2e (`playwright test`, `TMPDIR=$HOME/.cache/wl-pw-tmp`) → green, 10/10,
  unmodified (nothing visible changed, D-0158). Not the whole web e2e suite.

**Lane check:** `git status --short` lists only `features/UF-11/**` and
`lib/i18n/flows/uf-11.ts` (the granted extra). No contract file touched.

**Verdict: done.** All 7 ACs pass with tests; red-on-main and the planted fault are both proven
and recorded above; full gate green.

### Code review (code-reviewer, 2026-10-03)
**Verdict: approve.**

Checked against the diff `git diff main...HEAD` (8 files, +651/-6):
- **Lane:** every changed path is under `apps/web/src/features/UF-11/**` or the two granted
  extras (`lib/i18n/flows/uf-11.ts`, this ticket file). `apps/web/src/features/UF-02/slots.tsx`
  mentions `CheckinCard` in a comment but is untouched by this branch (`git diff` on it is
  empty) and `todayCheckinSlot` is still hardcoded `null` on main — confirms the D-0168 §5 split
  is honored: `CheckinCard` is exported from `index.tsx` (and now also re-exported, per the
  updated header comment) but mounted nowhere.
- **Contracts:** none touched (`api/openapi.yaml`, `docs/data-model.md`, `docs/engine-rules.md`,
  `packages/design-tokens/src/tokens.json` all empty-diff). Matches "Contract impact: None."
- **Reuse, not reimplementation:** `evaluateCheckin(` appears exactly once outside
  `packages/engine`, inside `checkin-evaluation.ts` (T-0308b's wrapper); `use-checkin-data.ts`
  and `use-plan-data.ts` both call `evaluatePlanCheckin` from that one file. No copy of the rule.
- **Three noted fixes, verified:**
  1. `formatCalendarDay` in `features/UF-11/format.ts` uses the identical `formatToParts` +
     `shortMonth` (`/^[A-Za-z]{4,}$/` clip to 3 letters) as UF-10's `format.ts`
     (`formatDayMonth`/`formatPartsDayMonth`/`shortMonth`). Same established pattern, re-derived
     rather than imported because UF-11's own lane-boundary test
     (`strings.test.ts` "no source file imports another feature's directory") forbids a
     cross-feature import — legitimate, not a new one-off hack.
  2. The `vi.mock` toggle in `checkin-card.test.tsx` (always-installed mock + `importOriginal`
     passthrough + a mutable `{ current }` toggle) is the same shape as `offline.test.tsx`'s
     `refreshAll` mock. Consistent with the existing UF-11 test pattern, not a new mechanism.
  3. The 16-sessions-in-14-days fix is contained to the test file's own `sessionsFrom` helper
     (`dayOffset = i % 14`, wraps extra sessions onto the same day via an hour offset).
     `packages/engine`, `checkin-evaluation.ts` and `use-plan-data.ts` are all untouched
     (empty diff) — the fix never touched production code.
- **Strings/export pin:** `strings.test.ts` changes are additive only — 7 new structural
  allowlist entries, all justified as structural/prop values (`checkin-card`, `down`, `none`,
  `en-GB`, `numeric`, `short`, `month`); the export pin test now expects `CheckinCard` alongside
  the pre-existing names. No existing assertion weakened or removed.
- **Targeted rerun:** `scripts/locked.sh small` run of `checkin-card.test.tsx`,
  `strings.test.ts`, `offline.test.tsx` together → 3 files / 33 tests passed.

No findings. Static review plus a targeted vitest rerun; did not re-run the full gate (already
green per the build log, cached, one run before handback).

### QA (qa-tester, 2026-10-03)
**Verdict: done.**

**Branch/main:** HEAD `f2adadc` on `t/T-0308c-checkin-card`, behind `main` (`d111f4f`) by several
unrelated commits (T-0303c/T-0474/squad ticks). `git merge-tree --write-tree HEAD main` produced a
tree hash with no conflict markers — clean, non-conflicting behind-main, so per D-0168/qa-tester
§1 this needs no action from QA; the orchestrator's forced gate on `main` after merge covers it.
Did not merge `main` into the branch.

**AC → test map, independently checked against `checkin-card.test.tsx` (15/15 green):**
AC-1→"down, through the real engine" · AC-2→"copy rules, stubbed evaluation" ·
AC-3→"preview" · AC-4→4 cases ("on plan", "zero history", "rejected loadCheckins",
"missing profile") · AC-5→5 cases (floor/ceiling × up/clamp-null) · AC-6→"offline, both values"
· AC-7→"no writes" + "exports exactly". Every AC has a test that would fail without the real
engine behaviour behind it (confirmed by reading `checkin.ts`'s `proposalFor`/`clampRhythm`
against AC-5's floor/ceiling cases, and `CardBody`'s direction branch against AC-1/AC-2).

**Red-on-main, reproduced independently:** copied `checkin-card.test.tsx` into the separate
`main` worktree (`/home/henrik/dev/uptive/private/workoutLab`, HEAD `d111f4f`, clean) — import
of `../CheckinCard.js` fails to resolve (file doesn't exist on `main`), confirming no
`CheckinCard` export exists there. Temp file removed immediately after.

**Builder's planted fault, reproduced:** backed up `CheckinCard.tsx` (`cp`), changed
`evaluation.periods[evaluation.periods.length - 1]` to `evaluation.periods[0]` (first period
instead of last): AC-2 fails (wrong count, wrong proposal numbers). Restored from the backup
copy; full file back to 15/15.

**QA's own planted fault:** backed up `CheckinCard.tsx` again, swapped the direction branch
(`proposal.direction === "down"` → `=== "up"` while still calling `u.down(...)` on the true
branch): 4 tests fail (AC-1 and 3 of AC-5's cases — "Step up"/"Switch to" copy no longer matches
direction). Restored from the backup copy; full file back to 15/15.

**Three build-time fixes, checked against independent evidence, not just internal consistency:**
1. `en-GB` month clip — ran `Intl.DateTimeFormat("en-GB", {month:"short"}, tz: Europe/Stockholm)`
   for all 12 months directly in `node`: only September prints "Sept"; `formatCalendarDay`'s
   `shortMonth` regex (`/^[A-Za-z]{4,}$/` → slice 3) clips exactly that case and no other. Also
   confirmed `UF-10/format.ts`'s `shortMonth`/`formatPartsDayMonth` use the byte-identical regex
   and clip — a genuinely shared, re-derived pattern, not a one-off.
2. `vi.mock` toggle pattern — confirmed `offline.test.tsx` uses the identical shape
   (always-installed `vi.mock` + `importOriginal` passthrough + mutable `{ current }` toggle),
   not merely a similar-sounding one.
3. Test-seeding overrun fix — ran `sessionsFrom`'s wrap arithmetic standalone in `node` for
   `n=16` from `2026-09-13`: all 16 timestamps fall inside `[2026-09-13, 2026-09-27)`, matching
   the engine's real `PERIOD_DAYS = 14` window in `packages/engine/src/checkin.ts`. Sound, not
   just self-consistent.

**Other checks:** `evaluateCheckin(` appears exactly once outside `packages/engine` (in
`checkin-evaluation.ts`) — no copy. `index.tsx` exports exactly
`["AccountSettings", "CheckinCard", "EditPlan", "Plan"]`. `eslint` on the 4 touched/added source
files (`CheckinCard.tsx`, `use-checkin-data.ts`, `format.ts`, `index.tsx`) is clean (no
`jsx-no-literals` violations). `tsc --noEmit` on `apps/web` is clean. `git diff main...HEAD
--stat` matches the logged "8 files, +651/-6" exactly, all inside the lane/extras.

**Try-to-break-it, ad-hoc (not committed):** a scratch test rendering `CheckinCard`, then
unmounting immediately (before the async cache read resolves) — simulates a slow network /
navigate-away mid-load. No crash, no act() warning surfaced, card correctly shows nothing while
pending. Removed after confirming (not part of the ticket's deliverable).

**Offline (AC-6):** confirmed independently — `navigator.onLine=false` disables both buttons and
shows the connect line; `online`/`offline` events toggle without remount (same DOM node by
reference, as recorded).

**e2e:** `git diff main...HEAD -- tests/e2e/` is empty — `uf-11-plan.spec.ts` is byte-unmodified.
Started local Supabase (`supabase start`) and ran `scripts/locked.sh heavy npx playwright test
--config tests/e2e/playwright.config.ts uf-11-plan.spec.ts` (`TMPDIR=$HOME/.cache/wl-pw-tmp`):
10/10 green, including the "no console error / page error, no render loop" cases for both
`/plan` and `/plan/edit`. No `CheckinCard`-specific e2e exists yet, correctly: it isn't mounted
anywhere on this branch (T-0471's job), so there's nothing to probe in the DOM at `/plan` or
`/plan/edit` for this ticket. Did not run the whole web e2e suite (D-0158: only one feature
folder touched, no router/SW/fixtures changes).

**Not re-run:** the full `pnpm -w typecheck lint test` / repo-checks / format:check / check-all
gate (already green per the build and review logs; qa-tester doesn't rerun the builder's full
gate, §1).

**Verdict: done.** All 7 ACs are proven by tests that would fail without the real feature
behaviour; red-on-main and both the builder's and QA's planted faults reproduce and are restored
clean; the three fixes hold up to independent verification; e2e unmodified and green; offline
behaviour and console-error checks confirmed; branch behind main but cleanly mergeable, no
action needed from QA.
