---
id: T-0395
title: "UF-02.1 Resume workout: a UF-09 ResumeCard on Today for the newest unfinished, non-stale session on this device, mounted via features/UF-02/slots.tsx"
lane: web-feature:UF-09
screens: [UF-02.1, UF-09, UF-09.9]
decisions: [D-0139, D-0123, D-0111, D-0071, D-0106, D-0158, D-0168]
deps: [T-0304e, T-0302a]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-web. About ½ day. The product half is done in this groom: D-0139 picks Today only, and user flows v2 gained the "UF-02 Today" section. What is left is a build ticket, so the board row moves from lane product / wl-idea to lane web-feature:UF-09 / wl-build-web. Deps are done. It shares the UF-09 lane with T-0304c (doing) and T-0414, and `features/UF-02/slots.tsx` + `Today.tsx` with T-0308c, so the orchestrator runs it when those paths are free. -->

## Why
A PWA reopens at its start URL, `/` (UF-02.1 Today). The D-0111 §7 restore runs only when `/session/<id>` is opened. So after the app is killed mid-workout, the phone restarts, or the user presses Back on UF-09.9 (D-0123 §3), there is no way back into the workout, and starting again makes a second unfinished session (D-0123 §4). D-0139 adds one "Workout in progress" card on Today that links back to it.

## Scope
- In:
  - `apps/web/src/features/UF-09/resume.ts` (new): `findResumable(now: Date, storage?: FocusStorage | null): Promise<Resumable | null>`, where `Resumable = { sessionId, startedAt, done, total }`, per D-0139 §2:
    - `offlineDb().sessions` rows with `userId === currentUserId()`, `row.ended_at` null, `now − started_at ≤ STALE_AFTER_MS`, `parseSessionPlan(row.plan)` ok and non-null, and `storage.getItem(focusKey(id))` non-null;
    - newest `started_at` wins, a tie goes to the smaller `id`;
    - `done` = `loggedSets.length` of the stored JSON (0 when it doesn't parse or has no array), `total` = the sum of `setsInItem(item)` over the plan;
    - any thrown or rejected IndexedDB or storage call resolves `null`.
  - `apps/web/src/features/UF-09/resume-card.tsx` (new): `ResumeCard({ now?, locale?, timeZone? })`. Renders nothing until `findResumable` resolves, and nothing for `null`. Otherwise a `section` with `data-part="resume"`, an `h2` `en.uf09.resumeTitle`, a `p` `en.uf09.resumeLine(time, done, total)` and a `Link` to `/session/<id>` with `en.uf09.resumeAction` (a PUSH). `time` is `started_at` as `HH:MM` in `locale`/`timeZone` (`formatTime` from `lib/format/intl.ts`, as `host.tsx` imports it). Styling uses tokens only (`packages/design-tokens`).
  - `features/UF-09/index.tsx`: export `ResumeCard`. The export pin in `__tests__/exports-and-lint.test.ts` becomes `["ResumeCard", "SessionHost", "useFocusSession"]`.
  - `apps/web/src/lib/i18n/flows/uf-09.ts`: `resumeTitle` = "Workout in progress", `resumeLine` = `` (time, done, total) => `Started ${time} · ${done} of ${total} sets` ``, `resumeAction` = "Resume workout".
  - `features/UF-02/slots.tsx`: `todayResumeSlot: ComponentType<{ now?: Date; locale?: string; timeZone?: string }> | null`, set to `lazy(() => import("../UF-09/index.js").then((m) => ({ default: m.ResumeCard })))`.
  - `features/UF-02/Today.tsx`: renders the slot inside `Suspense` with a `null` fallback, after the header and before the compact C-01 (or before the no-plan line). It shows in all three Today states: `loading`, `ready` and `no-plan`. It passes Today's `now`, `locale` and `timeZone`. "Start workout" is unchanged.
  - Tests: `features/UF-09/__tests__/resume.test.ts(x)` (fake-indexeddb + the real `upsertSession`, a signed-in user stubbed as T-0304a does, a storage stub), a Today test in `features/UF-02/__tests__/`, and an e2e row.
- Out:
  - UF-08.1 (D-0139 §1). A guard against a second session (D-0123 §4).
  - The stale state, the restore and the host (D-0111 §7 unchanged). "Resume anyway" for stale sessions.
  - Any change to what Start does.

### Edge cases that are in scope
- **Offline:** IndexedDB and `localStorage` only; the same card offline (AC5).
- **Returning after 10 days off:** a 10-day-old unfinished session is stale, so Today shows no card (AC2).
- **Zero history:** a first workout started and abandoned still shows (the card doesn't read the history).
- **Several unfinished sessions** (D-0123 §4): one card, the newest (AC3).
- **Another user signed in on the same device:** their rows never show (AC2).
- **Time running out:** not applicable; the card shows no budget.

## Acceptance criteria
Each new test title starts with `T-0395 ACn`. `now` = `2026-10-02T10:00:00Z`, `timeZone` "UTC", `locale` "en-GB". The plan is UF-09's P1 fixture (4 + 3 + 3 + 2 = 12 sets). "Seeded" = written with `upsertSession` for user `u1` (signed in) and a `wl-focus:<id>` value from `initialFocusState` with the given `loggedSets`.
- **AC1 (the card, red on unfixed code)** **Given** a seeded session `s1`, `started_at` 09:30, `ended_at` null, 3 logged sets, **When** `ResumeCard` renders, **Then** it shows "Workout in progress", "Started 09:30 · 3 of 12 sets", and one link "Resume workout" with `href` `/session/s1`. On main, `features/UF-09/index.tsx` has no `ResumeCard` and Today shows no `[data-part="resume"]`.
- **AC2 (when it shows, both values of each condition)** `findResumable(now)` is `null`, and the card renders nothing, for each of: `ended_at` set; `started_at` 12 h + 1 ms before `now`; `started_at` 10 days before; `userId` "u2"; no `wl-focus:s1` key; plan `null`; a plan that fails `parseSessionPlan`. With `started_at` exactly 12 h before `now`, it is `s1`.
- **AC3 (the newest wins)** **Given** seeded sessions `s1` (09:00) and `s2` (09:30), **Then** the card links to `/session/s2`. With both at 09:30, it links to `/session/s1`.
- **AC4 (the sets count)** A `wl-focus:s1` value that is not JSON, or has no `loggedSets` array, gives "0 of 12 sets". A plan with a back-off on item 0 gives `total` 13.
- **AC5 (offline and failure)** With `navigator.onLine` false and a `fetch` spy, the card is the same as AC1 and `fetch` is never called. When `offlineDb().sessions` rejects, or `storage.getItem` throws, the card renders nothing and there is no unhandled rejection and no `console.error`.
- **AC6 (Today mounts it)** **Given** Today with a resumable session, **Then** `[data-part="resume"]` comes after the header and before the compact C-01 in DOM order, and the "Start workout" link is still there. In the `no-plan` state the card still shows. With no resumable session, Today's DOM equals today's (the existing UF-02 tests pass unedited).
- **AC7 (Resume reopens the workout)** In a `MemoryRouter` at `/` with the `/session/:id` route, a click on "Resume workout" shows the UF-09 host for `s1`, restored from `wl-focus:s1` (the same phase, item and set). Back returns to `/`.
- **AC8 (export pin)** `features/UF-09/index.tsx` exports exactly `ResumeCard`, `SessionHost`, `useFocusSession`.
- **AC9 (e2e, the cold start)** In `tests/e2e/uf-02-today.spec.ts`: start a workout from UF-08.4, Done set once (UF-09.3 → UF-09.4 → saved), then `page.goto("/")`. Today shows "Workout in progress" with "1 of N sets". "Resume workout" lands on `/session/<id>` on the step it was left on. axe has no violations on Today with the card.
- **AC10 (no regression)** Every existing `features/UF-02/__tests__/*` and `features/UF-09/__tests__/*` test passes unedited, except the export-pin line (AC8).
- **Red proof:** run AC1 and AC6 against main. Both fail. Record this in the build log.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `apps/web/src/features/UF-02/slots.tsx`: the `todayResumeSlot` entry.
  - `apps/web/src/features/UF-02/Today.tsx`: mount the slot.
  - `apps/web/src/features/UF-02/__tests__/**`: the AC6 test.
  - `apps/web/src/lib/i18n/flows/uf-09.ts`: the three strings.
  - `tests/e2e/uf-02-today.spec.ts`: the AC9 row.
  - `docs/tickets/T-0395-resume-workout-on-today.md`: this file, for the build and accept log.

## Contract impact
none. It reads the existing IndexedDB `sessions` table and the D-0111 §6 `wl-focus:<id>` key. No schema, API, engine or token change.

## Coordination
- Product half done in the groom: D-0139, and the "UF-02 Today" section in `Design-docs/docs/product/user-flows.md`. **No human input is needed** (D-0168 §7): the board row's "needs a user-flows v2 addition + decision" is satisfied.
- Re-checked against main 2026-10-03 (D-0168 §7): T-0304c, T-0414 and T-0394 are on main. The UF-09 lane tickets that may run now are T-0304h, T-0468 and T-0463; this ticket shares `features/UF-09/index.tsx` and `__tests__/exports-and-lint.test.ts` only with whichever of them adds an export (none plans to), so it can run beside them; the second to merge rebases.
- `features/UF-02/__tests__/slot.test.tsx` mocks `../slots.js` with only `todayCheckinSlot`. A new `todayResumeSlot` export reads as `undefined` there, so Today must treat a missing slot like `null` (or the mock gains the key; `features/UF-02/__tests__/**` is granted). Say which in the build log.
- T-0471 (the check-in card mount, todo) also edits `features/UF-02/slots.tsx`. Run them one after the other; the second keeps the other's export.
- T-0302b (UF-02.2) appends to `tests/e2e/uf-02-today.spec.ts` too, but doesn't edit `Today.tsx` (D-0168 §3). Parallel is fine; the second to merge keeps both appended blocks.
- T-0394 (Back → Pause) is unaffected: Resume is a PUSH to `/session/<id>`, and the guard arms there as on any load.

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` green, each test command inside `flock /tmp/workoutlab-tests.lock` · because the ticket edits two feature folders (UF-09 and UF-02), the whole web e2e green once (D-0158) · contracts unchanged · commit messages start with `T-0395` and cite the screen (e.g. `T-0395 UF-02.1: Resume workout card for an unfinished session`).

## Build / accept log
Built by frontend-dev, 2026-10-03.

**Files:** `features/UF-09/resume.ts` (`findResumable`), `features/UF-09/resume-card.tsx` (`ResumeCard`), `features/UF-09/index.tsx` (+`ResumeCard`), `features/UF-09/uf-09.css` (`.wl-resume-card*`), `lib/i18n/flows/uf-09.ts` (+3 strings), `features/UF-02/slots.tsx` (+`todayResumeSlot`), `features/UF-02/Today.tsx` (mounts `ResumeSlot` after the header, before C-01/no-plan), `tests/e2e/uf-02-today.spec.ts` (+AC9 row). Tests: `features/UF-09/__tests__/resume.test.ts`, `features/UF-09/__tests__/resume-card.test.tsx`, `features/UF-02/__tests__/resume-slot.test.tsx`, plus edits to `features/UF-09/__tests__/exports-and-lint.test.ts` (export pin) and `features/UF-02/__tests__/slot.test.tsx` (mock gains `todayResumeSlot: null`, per the ticket's own fallback note).

**AC→test map:**
- AC1 → `resume.test.ts` "T-0395 AC1 the card's data" + `resume-card.test.tsx` "T-0395 AC1 the card" (rendered title/line/link).
- AC2 → `resume.test.ts` "T-0395 AC2 when it shows" (7 exclusion cases + the exact-12h inclusive case).
- AC3 → `resume.test.ts` + `resume-card.test.tsx` "T-0395 AC3 the newest wins" (newer wins; a tie goes to the smaller id).
- AC4 → `resume.test.ts` "T-0395 AC4 the sets count" (non-JSON, no-array, and a back-off item giving total 13).
- AC5 → `resume.test.ts` + `resume-card.test.tsx` "T-0395 AC5" (offline/no-fetch; `sessions.where` throws; `storage.getItem` throws — null, no unhandled rejection, no console.error).
- AC6 → `features/UF-02/__tests__/resume-slot.test.tsx` (ready/loading/no-plan states, DOM order, Start unaffected, no-regression case).
- AC7 → `resume-card.test.tsx` "T-0395 AC7" (click Resume workout restores the real `SessionHost` on the stored phase/item/set; Back-means-Pause then Back returns to Today).
- AC8 → `exports-and-lint.test.ts` "AC-10 exports" (updated to `["ResumeCard", "SessionHost", "useFocusSession"]`).
- AC9 → `tests/e2e/uf-02-today.spec.ts` "T-0395 AC9 resume on a cold start" (UF-08.4 Start → Done set → auto-save → `page.goto("/")` → card → Resume → same step; axe clean).
- AC10 → full `UF-02/__tests__` and `UF-09/__tests__` suites green (113 + 935 tests), export-pin line the only edited existing test.

**Red on main:** stashed the working tree (`git stash -u`) back to HEAD (`af4bfcf`, = main) and confirmed directly: no `apps/web/src/features/UF-09/resume-card.tsx`, no `ResumeCard` in `index.tsx`'s exports, no `data-part="resume"` in `Today.tsx`. Restored the stash (`git stash pop`), diff matched exactly.

**Planted faults** (on `resume.ts`, via a backup copy + `cp` restore, never `git checkout`):
1. `nowMs - startedAtMs > STALE_AFTER_MS` → `>=`: caught by AC2's "exactly 12h before now" case (expected `s1`, got `undefined`).
2. Tie-break `entry.id < best.id` → `entry.id > best.id`: caught by AC3's "a tie at 09:30 goes to the smaller id" case (expected `s1`, got `s2`).

**Coordination:** `features/UF-02/__tests__/slot.test.tsx`'s mock of `../slots.js` now also returns `todayResumeSlot: null` (the ticket's second option, not Today's `undefined` fallback) — chosen because `vi.mock`'s static-export validation throws when a named import the real module has isn't on the mock's returned object, so `Today.tsx`'s `import { todayCheckinSlot, todayResumeSlot }` would otherwise fail to resolve in that one file. `Today.tsx`'s `ResumeSlot` still falls back to `null` for a falsy slot either way (`if (!Slot) return null`), so a future mock that omits the key entirely (as this ticket's coordination note anticipated) still works.

**Gate (cached, no `--force`):** `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1` — 19/19 tasks, 3378 tests, green. `-w test:repo-checks` — 159/159, green. `-w format:check` — green (one file needed a `prettier --write`, re-verified). `node .github/scripts/check-all.mjs` — exit 0. Full web e2e (`playwright test`, D-0158: two feature folders touched) — 203/203 green, including the new AC9 row.

**Code review (code-reviewer, 2026-10-03): approve.**
- Cross-lane grant confirmed: D-0139 §4 explicitly names both paths — UF-09 owns `ResumeCard`/`index.tsx` export, UF-02's listed extras own `slots.tsx` + `Today.tsx` mount. Diff's changed-file set matches "Paths you may change" exactly; no overreach. No contract file touched.
- Flag 1 verified in code, not just asserted: `Today.tsx`'s `ResumeSlot` uses `if (!Slot) return null` (falsy check), which covers both `null` and a future mock that omits `todayResumeSlot` entirely (reads `undefined`). Confirmed by reading the line directly; the fallback is written broader than the current mock needs.
- Flag 2 verified: removing `| undefined` from `ResumeCardProps` (`now?: Date;` etc.) on a scratch copy breaks typecheck — `tsc` errors on `slots.tsx`'s `ComponentType<{ now: Date | undefined; ... }>` assignment, confirming `exactOptionalPropertyTypes` genuinely requires it here, not a style choice. One nuance: `host.tsx`'s `SessionHostProps.locale?: string` is a bare optional (not `X | undefined`); the `| undefined` union there appears only on the internal, non-optional `MachineProps.locale: string | undefined` field. So `resume-card.tsx`'s choice to put `X | undefined` directly on the *exported* optional prop is a different (still valid, still used elsewhere: auth-context.tsx, UF-02/format.ts, UF-06, UF-07, UF-03) application of the same general idiom, not an identical copy of `host.tsx`'s specific pattern. Not a blocker — restored file confirmed clean (`git status` clean, no stray diff).
- UF-09 export-pin collision check: branch's merge-base with `main` is `af4bfcf`, the same commit as this branch's parent (the T-0474 merge). No commit on `main` since then touches `UF-09/**`; `git merge-tree` against current `main` (`a1d74ef`) shows no conflicts outside `.squad/board*.md` bookkeeping. T-0463 and T-0474 are already ancestors of this branch — no merge of `main` needed before landing.
- Targeted rerun (`scripts/locked.sh small`, vitest on the 5 changed/added test files): 45/45 passed.
- `resume.ts` logic matches D-0139 §2 exactly: strict `>` for staleness (12h boundary inclusive), `entry.id < best.id` tie-break to the smaller id, try/catch around both DB and storage reads resolving `null` on any throw.

Verdict: **approve**.

**Merge main (frontend-dev, 2026-10-03):** branch had fallen behind `origin/main` (T-0458 and T-0302b both merged after the code review above). `git merge origin/main` produced exactly one conflict, in `tests/e2e/uf-02-today.spec.ts` — T-0302b's appended `T-0302b AC-7 preview e2e and a11y` describe block vs. this ticket's appended `T-0395 AC9 resume on a cold start` describe block, both anchored at the same end-of-file point (as the ticket's own coordination note anticipated: "the second to merge keeps both appended blocks"). T-0458 added no block to this file (its e2e rows are in `tests/e2e/uf-03-list-summary.spec.ts`, which merged clean). Resolved by keeping both full describe blocks intact and in sequence — T-0302b's block first (matching `origin/main`'s order), then this ticket's AC9 block appended after it, each test body made whole again (the merge had split my AC9 test's trailing assertions into a second conflict hunk after T-0302b's axe block; reassembled them in original order). No block dropped or rewritten; no other file had a real conflict (37 files changed, all auto-merged). Merge commit `6c98cb9`.
- `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint --concurrency=1` — 13/13 tasks green.
- `scripts/locked.sh heavy npx playwright test --config ../../tests/e2e/playwright.config.ts` (from `apps/web`) — full web e2e, 213/213 green, including T-0395's AC9 row, T-0302b's 4 preview rows, and T-0458's offline list-view rows (`uf-03-list-summary.spec.ts`).

