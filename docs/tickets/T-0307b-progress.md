---
id: T-0307b
title: UF-06.1 / UF-06.2 Progress: current-month calendar from `checkinSessions`, the Balance card from `balance()`, recent exercises and one exercise's 8-week history, all pure in `stats.ts` (no PRs, e1RM, volume, streaks or charts in v1, D-0068)
lane: web-feature:UF-06
screens: [UF-06.1, UF-06.2]
decisions: [D-0002, D-0003, D-0013, D-0034, D-0040, D-0045, D-0067, D-0068, D-0071, D-0075, D-0079, D-0091]
deps: [T-0318, T-0319, T-0334]
status: done
---
<!-- Written by product-owner 2026-09-29 (groom mode) from T-0307's [b] ACs, D-0068 §5–§6, D-0071 §3/§8/§9/§10, D-0075 and D-0079 §7–§10, over the merged T-0318/T-0319/T-0334. Build flow: wl-build-web. About ¾ day, so not split. If a build runs long, cut along this line: T-0307b1 = `stats.ts` plus UF-06.1 (AC-1…AC-8, AC-12…AC-14), T-0307b2 = UF-06.2 (AC-9…AC-11), with AC-15's e2e split by page. Runs in parallel with T-0306a, T-0307a, T-0308a and T-0308b (no path overlap). -->

## Why
UF-06 is "consistency and exercise history" (user flows v2). Today `/progress` and `/progress/:exerciseId` are T-0300a/T-0318 stubs. `/library/:id`'s `My history` link (T-0306a) lands on the second one.

D-0068 §5 cut the prototype's PR card, e1RM, volume, streak and trend chart. Each of those is a number no engine rule defines, and a UI that computed one would break principle 3. What remains is three pieces of **engine output**, `checkinSessions` (rule 9's "completed session"), `balance()` (rule 11) and `isHardSet`/`normalizeHistory` (rules 0 and 2), plus display aggregations that D-0068 §5 puts in one pure, clock-free module, `features/UF-06/stats.ts`.

The risks, and the ACs that carry them:
- **Principle 3.** The calendar counts what `checkinSessions` counts (AC-1). The Balance card renders `balance().areas` in engine order and recomputes nothing. A stub that is internally inconsistent must render as given (AC-5).
- **The clock and the time zone.** Every date is local to `tz`, and `stats.ts` never reads the clock (AC-1, AC-8). The window is exactly the 56 cached local days (AC-8).
- **Principle 1.** UF-06 is never reachable in a workout (AC-13).

Both routes exist (`protected`, tab bar on). This ticket adds no route and edits no shared file.

## Scope
- In:
  - **Data (D-0071 §8, D-0067 §5).**
    - The screens read the read-only loaders `loadSessions()`, `loadEngineHistory()`, `loadLibrary()` and `loadTargets()` from `lib/offline`.
    - They render from the cache **first**. When online they run `refreshAll(now, tz)` with the 3 s cap, then re-read and recompute.
    - They call no Edge Function. They make no direct IndexedDB access and no write.
    - `now` is injected (a clock prop or module), and `tz` comes from `Intl.DateTimeFormat().resolvedOptions().timeZone` (D-0063 §3).
    - Both screens take optional `timeZone` and `locale` overrides, the way `OfflineStatus` does. Tests pass `Europe/Stockholm` and `en-GB` through them (D-0079 §10), so no AC depends on the host's time zone.
  - **`features/UF-06/stats.ts`** holds pure functions only, each taking what it needs plus `now, tz`. None reads the clock. The exact shapes are the builder's, but these four exist and are unit-tested:
    - `monthCalendar(checkinSessions, now, tz)` gives the current local month's weeks (Monday-first), the marked local dates, and the count of completed sessions (D-0079 §7).
    - `bestSet(sets, exercise)` applies the D-0068 §5 rule and the D-0079 §8 kind. It ignores warm-up and tombstoned rows (via `normalizeHistory` + `isHardSet`), and returns `null` when there is no hard set.
    - `recentExercises(history, library, now, tz)` gives every exercise with a hard set in the 56-day window: its last local date, its best set from its latest session (D-0079 §9), and the order last date desc, then `name` by `localeCompare`.
    - `exerciseHistory(exerciseId, history, library, now, tz)` gives the D-0079 §9 rows plus Best set, Heaviest and Sessions over the same window.
  - **UF-06.1 Overview** (`/progress`):
    - **Calendar.** The title `{Month yyyy}` and a Monday-first grid of the current local month. The days holding a completed session are marked, and today has `aria-current="date"` and a visible outline (D-0068 §5). Below it, `{n} workouts this month` (`1 workout this month` for n = 1).
    - **Balance card.** The header `Last 14 days`, and the first 4 entries of `balance(history, targets, library, now, tz).areas` **in engine order**. Each shows the area name (`en.bodyMap.areas`), `load / target` via `formatSetCount`, and a bar at `min(load/target, 1)` width filled with `var(--wl-color-coverage-{coverageStep})`. The whole card is **one** link to `/balance` (UF-10.1).
    - **Recent exercises.** One row per `recentExercises` entry: the name, `{d MMM}` and the best-set label. Each row is a link to `/progress/:id`.
    - `<OfflineStatus variant="text" />` (read-only import).
    - The zero-history copy.
  - **UF-06.2 Exercise history** (`/progress/:exerciseId`):
    - The heading is the exercise name, with the caption `Last 8 weeks`.
    - Three stat cards: `Best set`, `Heaviest`, `Sessions`.
    - Rows `{EEE d MMM} · {set}, {set}, …`, newest first.
    - A `How to` link to `/library/:exerciseId` (UF-04.2).
    - The no-sets state `No sets in the last 8 weeks`.
    - An unknown id or a warm-up id redirects to `/progress` (D-0079 §4).
  - **The Balance card's rows are UF-06's own component.** UF-06 does **not** import `features/UF-10` (T-0307a exports nothing for it, and the two tickets run in parallel). A presentational `BalanceCard({areas})` takes the four `AreaBalance` values, so "stubbed" ACs can hand it a fixed array.
  - **Strings** go in `apps/web/src/lib/i18n/flows/uf-06.ts` only (D-0071 §1, D-0075). `en.ts` is **not** edited. Area names are reused from `en.bodyMap.areas`.
  - **e2e:** `tests/e2e/uf-06-progress.spec.ts`, one new file (D-0071 §10).
- Out:
  - **Personal records, estimated 1RM, volume, streaks, "weekly sets per muscle" and the trend chart** (D-0068 §5: cut to Phase 5, and if they return they belong in `packages/engine`). There is no "New record" text anywhere.
  - **Month navigation** (previous and next month) and any data older than the 56 cached days (D-0068 §6, D-0079 §7). This is a Phase 5 idea.
  - **Tapping a calendar day.** Days are not interactive in v1.
  - **UF-10 Balance** in every part (T-0307a). Don't edit `features/UF-10/**` or `flows/uf-10.ts`.
  - Effort ratings, session durations, the per-session summary (UF-03.3, T-0305b), and JSON export (T-0310).
  - Any change to `lib/offline`, routes, `components/**`, lint config or any contract.

### Edge cases that are in scope
- **Zero history.** `0 workouts this month`, the Balance card at `0 / target` for its 4 areas, `No exercises logged yet`, and on UF-06.2 `No sets in the last 8 weeks` (AC-7).
- **Offline.** Everything renders from the cache, and **queued sets are included** (a set logged offline a minute ago shows up). There is no error state and no `role="alert"` (AC-12).
- **Returning after 10 days off.** The only session is 10 days old. The calendar still marks it, the count reads `1 workout this month`, and Recent exercises lists it (AC-6).
- **Month rollover.** On 2026-10-01 the calendar is October with `0 workouts this month`, while Recent exercises still lists the September sets (AC-6). A session at 00:30 local on the 1st belongs to the new month, even though its UTC date is the previous day (AC-1).
- **The window boundary.** A set at local 00:30 on today − 55 shows. One at 23:30 on today − 56 does not (AC-8).
- **An unfinished session with hard sets** counts as a workout (rule 9, D-0079 §7). A session with only warm-up sets does not (AC-1).
- **An exercise missing from the library** (stale cache) adds nothing, because `isHardSet` returns false for it. It is not listed and doesn't crash (AC-3).
- **A bad URL.** `/progress/nope` and `/progress/wu-cat-cow` redirect to `/progress` (AC-10).
- **Time running out / mid-workout.** Not applicable as a screen state: UF-06 is never shown in a workout (AC-13).

## Acceptance criteria
- **Test surfaces.**
  - Pure `stats.ts` tests in `apps/web/src/features/UF-06/__tests__/stats.test.ts`.
  - Vitest + Testing Library + `fake-indexeddb` in `apps/web/src/features/UF-06/__tests__/*.test.tsx`, seeding through `lib/offline`'s test helpers (`freshOfflineDb`, `signIn`, `recordSet`) and public refreshes, with Supabase spied by `createSelectSpy` (`lib/offline/__tests__/select-spy.ts`; it ignores `.gte`, so the window filter under test is the screen's own).
  - Rows a refresh would drop (AC-8's today − 56 set) are seeded with `offlineDb()` **in the test file**, with `navigator.onLine = false` so no refresh replaces them. The no-`offlineDb(` rule (AC-14) covers non-test code only.
  - Every "through the engine" AC runs with `navigator.onLine = false` unless it says otherwise, so each engine call is made once per render and no refresh rewrites the seed.
  - Playwright in `tests/e2e/uf-06-progress.spec.ts` where tagged **e2e**.
  - `ESLint.lintText` where tagged **lint**.
- **Fixtures.**
  - tz `Europe/Stockholm`, now `2026-09-27T12:00:00+02:00` (a Sunday), locale `en-GB` (D-0079 §10).
  - The L1 library (`docs/engine-rules.md`) with sentence-case names. `push-up` is bodyweight (`externalLoad: false`). `plank` is `timed`, `defaultDurationS` 45. Default targets: chest/back/glutes/quads 20, shoulders/hamstrings 16, arms/core/calves 12.
  - **"Through the engine"** means the real `@workoutlab/engine` over a seeded cache. **"Stubbed"** means a fixed array handed to the presentational component. Each AC says which.
  - **History H** (all hard unless marked; times are local):

    | Session | Sets |
    |---|---|
    | A | back squat on 09-20 at 10:00 100 × 8, at 10:05 100 × 6 |
    | B | back squat on 09-25 at 10:00 102.5 × 5, at 10:05 100 × 8 |
    | C | RDL on 09-22 80 × 10 |
    | D | push-up on 09-24 0 × 15 at 18:00, 0 × 12 at 18:05; plank on 09-24 40 s at 18:10, 45 s at 18:15 |
    | E | RDL on 09-26 60 × 10, a **warm-up** set (`isWarmup: true`) |
    | F | back squat on 09-26 200 × 1, **tombstoned** (`deletedAt` set) |

- **AC-1 (calendar = rule 9 completed sessions, local dates)** Through the engine, `loadSessions()` returns:

  | Session | `startedAt` | Local | Sets | Expected |
  |---|---|---|---|---|
  | S1 | `2026-09-01T07:00Z` | 09-01 | 3 hard | marked |
  | S2 | `2026-09-14T08:00Z` | 09-14 | warm-up sets only | not marked |
  | S3 | `2026-09-26T22:30Z` | **09-27 00:30** | 4 hard | marked |
  | S4 | `2026-08-31T21:59Z` | 08-31 23:59 | 5 hard | not in September |
  | S5 | `2026-09-20T09:00Z` | 09-20 | 2 hard, `endedAt: null` | marked |
  | S6 | `2026-08-31T22:30Z` | **09-01 00:30** | 2 hard | marked |

  - The title reads `September 2026`.
  - The marked days are exactly {1, 20, 27}. **Contrast:** 26 is not marked, which catches a UTC-date bug that would place S3 there, and 14 is not marked.
  - The count reads exactly `4 workouts this month` (S1, S3, S5, S6: two sessions on the 1st count twice and mark once).
  - Only the 27 cell has `aria-current="date"`.
  - The first grid row's first cell (Monday 31 Aug) is blank, and `1` sits in the second column (Tuesday).
  - `checkinSessions` (spied on the real engine module) is called **once**, with the `loadSessions()` rows.
  - With only S1: `1 workout this month`.
- **AC-2 (`bestSet`, unit)** Each of these is asserted:

  | Input | Result |
  |---|---|
  | back squat `[{100, 8}, {102.5, 5}, {102.5, 6}]` | weighted 102.5 × 6, label `102.5 kg × 6` |
  | push-up `[{0, 12}, {0, 15}]` | reps 15, label `15 reps` |
  | plank `[{d 40}, {d 45}]` | timed 45, label `45 s` |
  | a warm-up 150 × 5 plus a tombstoned 140 × 5 plus 100 × 5 | `100 kg × 5` |
  | only warm-up or tombstoned rows | `null` |
  | back squat `[{101.25, 3}]` | label `101.25 kg × 3` (2 fraction digits, D-0079 §8) |

- **AC-3 (recent exercises)** Through the engine with H, UF-06.1 lists exactly 4 rows in this order. Each row is written below as name · date · best-set label, which are three separately asserted text parts; the `·` separators aren't asserted.
  1. `Back squat · 25 Sep · 102.5 kg × 5` (B is the latest session, so A's 100 × 8 isn't its best set)
  2. `Plank · 24 Sep · 45 s`
  3. `Push-up · 24 Sep · 15 reps` (after Plank: the same date, so by name)
  4. `Romanian deadlift · 22 Sep · 80 kg × 10`

  Each row is a link with `href="/progress/<id>"`.

  **Contrast:**
  - RDL reads `22 Sep`, not `26 Sep`, because E's warm-up set doesn't count.
  - Back squat reads `25 Sep` and `102.5 kg × 5`, not `26 Sep` or `200 kg × 1`, because F is tombstoned.
  - A hard set whose `exerciseId` is `ghost` (not in the library) adds no row and doesn't throw.
- **AC-4 (Balance card, through the engine)** With H, the card's 4 rows equal `balance(history, targets, library, now, tz).areas.slice(0, 4)` computed by the test with the real engine, compared on area name, `load / target` text and the `coverage-{step}` fill. The card is exactly one `a[href="/balance"]`, with **no** nested `a` elements inside it and the accessible name `Balance, last 14 days`.
- **AC-5 (Balance card, stubbed: the UI sorts nothing and computes nothing)**
  - Stubbed areas in the order calves, hamstrings, chest, back, shoulders, arms, core, glutes, quads show exactly `Calves`, `Hamstrings`, `Chest`, `Back`, in that order.
  - **Contrast:** the same array reversed shows `Quads`, `Glutes`, `Core`, `Arms`.
  - A stubbed first entry `{area: "quads", load: 3, target: 20, coverageStep: 4}` renders `3 / 20` with a `var(--wl-color-coverage-4)` fill. One of `{load: 19, target: 20, coverageStep: 0}` renders `19 / 20` with `coverage-0`. A UI deriving the step from `load/target` fails both.
  - `{load: 2.5, target: 16}` renders exactly `2.5 / 16`, and `{load: 5}` renders `5 / 20`, not `5.0 / 20`.
  - `{load: 0, target: 0}` renders no `NaN` or `Infinity` and a 0 % bar.
- **AC-6 (returning after 10 days off; month rollover)**
  - Through the engine, the only session is `2026-09-17T08:00Z`, with 4 hard RDL sets. On 09-27, the calendar marks 17, reads `1 workout this month`, and Recent exercises shows `Romanian deadlift · 17 Sep · …`.
  - With the clock at `2026-10-01T09:00:00+02:00` and the screen remounted, the title reads `October 2026`, with the same sessions fixture, the count `0 workouts this month`, and no day is marked. Recent exercises **still** shows the RDL row (09-17 is inside the 56-day window).
  - October 2026 starts on a Thursday, so the first grid row has 3 blank cells.
- **AC-7 (zero history)** Through the engine with the L1 library and default targets cached, and **no** sessions or sets (an empty library would make `leg-curl` unknown, so it would redirect):
  - UF-06.1 reads `0 workouts this month` and `No exercises logged yet`. The Balance card shows 4 rows, each `0 / {target}` with a `coverage-0` fill, and equal to the engine's first 4.
  - `/progress/leg-curl` renders UF-06.2 with the heading `Leg curl`, exactly `No sets in the last 8 weeks`, and the `How to` link. **Contrast:** the `Best set`, `Heaviest` and `Sessions` cards are absent from the DOM.
  - With H seeded, `No exercises logged yet` is absent from UF-06.1, which catches a screen that always renders it.
- **AC-8 (window = the 56 cached local days; `stats.ts` is clock-free)**
  - Through the engine with H plus back squat 90 × 5 at local `2026-08-03 00:30` (today − 55, session G) and back squat 95 × 5 at local `2026-08-02 23:30` (today − 56, session G′), both seeded directly into the history cache:
    - `/progress/back-squat` shows the 08-03 set as a row `Mon 3 Aug · 90 × 5`, and shows no `2 Aug` row.
    - `Sessions` reads `3`.
    - Neither screen shows `95`.
  - A source test finds no `Date.now`, no `new Date()` with zero arguments and no `Math.random` in `features/UF-06/stats.ts`.
  - Calling each `stats.ts` function twice with the same inputs gives deep-equal results.
- **AC-9 (UF-06.2 content)** Through the engine with H, `/progress/back-squat` shows:
  - the heading `Back squat` and the caption `Last 8 weeks`;
  - exactly two rows, in this order: `Fri 25 Sep · 102.5 × 5, 100 × 8`, then `Sun 20 Sep · 100 × 8, 100 × 6` (sets in `completedAt` order, D-0079 §9);
  - the cards `Best set` `102.5 kg × 5`, `Heaviest` `102.5 kg` and `Sessions` `2`;
  - `How to` with `href="/library/back-squat"`.

  **Contrast:** the tombstoned F set appears in no row, and there is no `26 Sep` row.
- **AC-10 (other kinds and bad ids)**
  - `/progress/push-up` shows `Thu 24 Sep · 15, 12`, `Best set` `15 reps`, `Heaviest` `—` and `Sessions` `1`.
  - `/progress/plank` shows `Thu 24 Sep · 40 s, 45 s`, `Best set` `45 s` and `Heaviest` `—`.
  - `/progress/nope` → location `/progress`, rendering `[data-screen-id="UF-06.1"]`. `/progress/wu-cat-cow` → the same.
  - Each redirect is a `replace` (history length unchanged).
  - **Contrast:** `/progress/leg-curl` stays and renders UF-06.2.
- **AC-11 (no PR, e1RM, volume or streak text, D-0068 §5)** With H rendered on both screens, the document text contains none of these (case-insensitive): `record`, `PR`, `1RM`, `e1RM`, `volume`, `streak`, `per week`. `PR` is matched as a whole word. **Contrast:** the same matcher run on a probe string `New PR!` does match, so the regex isn't vacuous.
- **AC-12 (offline, queued sets count; renders before the network)**
  - With H cached, `lastSyncedAt` = `08:10` local, `navigator.onLine = false`, and a **queued** hard back-squat set 110 × 3 recorded through `recordSet` at 11:30 today in a new session Q:
    - Recent exercises' first row reads `Back squat · 27 Sep · 110 kg × 3`.
    - `/progress/back-squat` has a new first row `Sun 27 Sep · 110 × 3`, `Heaviest` `110 kg`, and `Sessions` `3`.
    - The header shows `Offline · last synced 08:10`.
    - There is no element with `role="alert"`, and the `supabase.from` spy was never called.
  - **Wait-free:** with the cache seeded, `navigator.onLine = true` and `refreshAll` spied to return a promise that never resolves, the calendar and the Recent rows are in the DOM without waiting on the refresh. (Stub `refreshAll`, not `fetch`: with Supabase spied, a `fetch` stub is never reached.) **Contrast:** the `refreshAll` spy *was* called.
  - No `fetch` URL made by either screen contains `/functions/v1/` (D-0071 §8).
- **AC-13 (never reachable in a workout, principle 1)**
  - **lint:** `ESLint.lintText` of `import { Progress } from "../UF-06/index.js";` reports `no-restricted-imports` as `src/features/UF-09/x.tsx`, as `src/features/UF-08/x.tsx` and as `src/features/UF-04/x.tsx` (D-0071 §9). **Contrast:** the same import as `src/features/UF-02/x.tsx` reports nothing, with a `fatal` filter.
  - **render:** rendering the router signed in at `/session/<id>` and at `/session/<id>/summary` finds **no** `a[href^="/progress"]` in the DOM.
- **AC-14 (exports, imports and strings)**
  - `Object.keys(await import("../index.tsx"))` sorted equals exactly `["ExerciseHistory", "Progress"]`.
  - A source test finds no `offlineDb(`, no `from "dexie"` and no import of `features/UF-10` under `features/UF-06/**`, excluding `__tests__/**` (test files may seed the cache directly).
  - `react/jsx-no-literals` stays green. Every key used is reachable as `en.uf06.*`.
  - `lib/i18n/__tests__/flows.test.ts` stays green, which requires `flows/uf-06.ts` to stay multi-line with the closing `} as const;` at column 0 (D-0075).
- **AC-15 (a11y, e2e, NFR-A11Y-1/-2)** In the preview build with an injected session and the mocked Supabase:
  - `@axe-core/playwright` finds 0 serious or critical violations on `/progress` with the zero-history fixture, on `/progress` with H, and on `/progress/back-squat`.
  - The Balance card link and every Recent exercises row have a `boundingBox()` of ≥ 44 × 44 CSS px.
  - Keyboard: Tab to the Balance card, press Enter, then the URL is `/balance`. Go Back, Tab to the `Back squat` row, press Enter, then the URL is `/progress/back-squat`.
- **AC-16 (e2e: the UF-06.2 offline row leaves the loop and asserts built content, D-0091 §1, §4)** In `tests/e2e/shell.spec.ts` (AC-6 offline describe):
  - **The loop.** `OTHER_SUB_ROUTES` no longer contains `/progress/back-squat`. Its other three rows (`/plan/edit`, `/plan/routines/new`, `/plan/routines/R1`) and the loop body are byte-identical to `main`.
  - **The dedicated test.**
    - It seeds the library the way T-0905 AC-1 seeds UF-04.3: one online visit with `mockSupabaseData`, so `back-squat` is in the IndexedDB cache.
    - It then goes offline and makes a cold `goto("/progress/back-squat")`.
    - It asserts that `[data-screen-id="UF-06.2"]` is visible, that the heading `Back squat` is visible, and that the `How to` link with `href="/library/back-squat"` is visible. These are built content that the stub never renders.
    - Only then does it assert `toHaveURL(/\/progress\/back-squat$/)`.
    - The URL check alone is not the guard: it narrows the redirect race but does not close it (D-0091 §2). The content assertions are the guard.
  - **The contrast.** With the existing 501 setup (empty cache, a warm-up on `/` only), the same offline `goto` lands on `/progress` with `[data-screen-id="UF-06.1"]` visible. This pins the D-0079 §4 redirect instead of racing it.
  - **The comment.** The D-0091 paragraph above the describe says:
    - the loop's URL check narrows the race for stub rows;
    - built screens get their own seeded content tests;
    - UF-06.2 is now one of them.
  - **Fault proof.** In `features/UF-06`, make the exercise lookup always miss, and run the dedicated test with `--repeat-each=3 --workers=1`. It fails 3 of 3, on the `Back squat` heading or the URL, not on a timeout of the wrapper. Report this in the result. It is not committed.

## Paths you may change
- `apps/web/src/features/UF-06/**` (the lane: `web-feature:UF-06`).
- **Listed extras:**
  - `docs/tickets/T-0307b-progress.md`: this file, for the build, QA and accept logs (added 2026-10-02 by the orchestrator after the H-13 catch-up).
  - `apps/web/src/lib/i18n/flows/uf-06.ts`: this ticket's own flow file and no other (D-0071 §1, D-0075). You may add keys only. The file stays `export const uf06 = {` … a newline, then `} as const;` at column 0.
  - `tests/e2e/uf-06-progress.spec.ts`: a **new** file only (qa lane grant, D-0071 §10).
  - `tests/e2e/shell.spec.ts`: the `/progress/back-squat` (UF-06.2) row of the AC-6 offline describe, moved out of `OTHER_SUB_ROUTES` into its own seeded test that asserts UF-06.2's built content (AC-16), plus the D-0091 paragraph of the comment above that describe (D-0091 §4–§5, granted 2026-10-01).
  - `tests/e2e/fixtures/uf-06-progress-data.ts`: a **new** fixture file for the history, sessions and targets the e2e mock serves. Existing fixture files are not edited, which keeps this ticket clear of the other parallel lanes' fixture additions. `mockSupabaseData` always answers `sessions*` with `[]` and takes no sessions fixture, so if the spec needs session rows it registers its own `page.route` for `rest/v1/sessions*` **after** `mockSupabaseData` (Playwright runs the latest matching handler first). AC-15 as written needs none: Recent exercises and the Balance card read history only.
  - `.squad/decisions/D-0084-progress-date-abbreviation-and-unsynced-balance.md`: a **new** decision file only (orchestrator grant, 2026-09-30). `.squad/decisions/**` belongs to the **process** lane per `.squad/ownership.yaml:53`, and T-0320's `check-lane-paths` correctly flagged the build for writing there without a grant. The content is sound and already implemented, commented and test-covered (Sept→Sep in `format.ts`, the `AREA_COUNT` guard in `Progress.tsx`, `tabIndex={-1}` on today's cell), so granting the path is cheaper than re-filing it and leaves the decision where a reader expects it. This grant covers that one file, not the directory.
  - Three web-shell test files, **for your own routes' rows only**, per **D-0088** (which names this ticket, and whose point 4 requires the orchestrator to add them here because T-0320 reads grants from the base): `apps/web/src/app/__tests__/routes.phase3.render.test.tsx`, `apps/web/src/app/__tests__/auth-guard.phase3.test.tsx`, `apps/web/src/app/__tests__/profile-gate.test.tsx`. T-0318 pinned the **stub** state of `/progress` and `/progress/:exerciseId` — a stub `<h1>` title, a source scan for `<h1>{en.screens.exerciseHistory}</h1>`, and mocks shaped to what a stub loaded. Those are not invariants once the real screen exists. Per D-0088 §2 **keep every guarantee**: seed the library cache so `/progress/back-squat` renders (rather than switching to a route where nothing can fail), point the source scan at the built heading, and leave route ranking and the C-02 active tab asserted. Per D-0088 §3 touch **only** rows naming your own routes; every other row stays byte-identical.
- **Not yours, and each is already done for you:**
  - `apps/web/src/app/**`: both routes exist.
  - `apps/web/src/components/**`: OfflineStatus is a read-only import.
  - `apps/web/src/lib/**`, including `lib/i18n/en.ts`, `lib/offline/**` and `lib/format/**` (read-only imports of `formatSetCount`, `localDate` and `windowStartInstant` are fine).
  - `apps/web/eslint.config.mjs`.
  - `apps/web/src/features/UF-10/**` and every other feature.
  - Every other flow file.
  - `tests/e2e/fixtures/supabase-mock.ts`.
  - `packages/**`.
  - Every contract file.

  If you believe you need one of these, stop and put it in your result as a follow-up. Don't edit it.

## Contract impact
None. The screens read the T-0319 `OfflineSession`, `HistorySet`, `LibraryExercise` and `AreaTarget` as cached. They call only the engine's public `checkinSessions`, `balance`, `normalizeHistory` and `isHardSet`. There is no schema, API, engine-rule or token change. The new defaults are in D-0079 (`revisit`). D-0068 is `revisit`, and nothing here depends on the part D-0071 amended (§2).

## Ambiguity resolved (state it, do not stall)
- **Two best-set formats.** T-0307's parent wrote `102.5 kg × 5` on UF-06.1 but `102.5 × 5` for UF-06.2's Best set card. **Default: a "Best set" label always carries the unit (`102.5 kg × 5`), and a session row lists bare sets (`102.5 × 5, 100 × 8`)** (D-0079 §8). The card and the Recent row now read the same.
- **Calendar layout and count.** The parent gave neither the week start nor what an unfinished session counts as. The defaults are Monday-first and "rule 9 completed, ended or not" (D-0079 §7).
- **"Rolling 14 days everywhere, including UF-06.1" (D-0002).** The Balance card is the 14-day number, captioned `Last 14 days`. The month calendar is a consistency view of days trained, not a load metric, which is why D-0068 §5 could choose it without contradicting D-0002. There is no conflict with a `decided` decision, so no triage is needed.

## Definition of done
- Every AC has a passing test.
- `pnpm -w typecheck lint test --force --concurrency=1` is green (the **`--force`** prevents a cross-worktree cache replay).
- `pnpm --filter @workoutlab/web test:e2e` is green, including the new `uf-06-progress.spec.ts` (AC-15).
- Contracts are unchanged.
- **No file outside "Paths you may change" is touched.** Check `git diff --name-only main...HEAD` against that list. T-0320's `check:repo` gives the same answer mechanically once merged.
- Commits start `T-0307b:` and cite screen IDs (e.g. `T-0307b UF-06.1: calendar from checkinSessions`).

**Bundle claims:** make one only after a fresh `pnpm --filter @workoutlab/web build`, with measured gzip numbers (T-0322). The UF-06 chunk budget is 100 KB.

## Build / accept log
Archived in `docs/tickets/log/T-0307b.md` (D-0157).
