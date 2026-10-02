---
id: T-0303a
title: UF-08.1 Time & energy — the /session/setup host and ?step routing, minutes stepper, chips, done-by, finish time, warm-up toggle, energy, and a live fit line from the on-device suggest()
lane: web-feature:UF-08
screens: [UF-08.1]
decisions: [D-0002, D-0004, D-0024, D-0045, D-0063, D-0065, D-0071, D-0086, D-0091, D-0095, D-0103, D-0104, D-0107, D-0108, D-0113]
deps: [T-0300, T-0203b, T-0318]
status: done
---
<!-- Groomed 2026-10-02 by product-owner. Child of docs/tickets/T-0303-session-setup.md (ACs A1–A8 there, refined by D-0107). Build flow: wl-build-web. About ½ day, the upper end. Runs in parallel with T-0302a and T-0302c (D-0108: no shared file). -->

## Why
Principle 2: every workout start asks how long the user has. UF-08.1 is where that question is asked, and the answer shapes the selection. It isn't just a display: the live fit line is the real `suggest()` output for the current inputs (principle 3). Everything runs on the device over the `lib/offline` cache plus the queue, so setup works offline and gives the same answer as online (NFR-OFF-3, D-0071 §8). This ticket also builds the `/session/setup` host that T-0303b, T-0303c and T-0303d hang their steps on.

## Scope
- In:
  - **The host and loading.** `features/UF-08/SessionSetup.tsx` (the host, replacing the T-0300a stub in `index.tsx`) with the D-0107 §1 step routing. Data loading through `loadEngineHistory`, `loadLibrary`, `loadTargets` and `loadProfile`, plus `refreshAll` when online **and signed in** (`useAuth().status === "signed-in"`, D-0113), at most once per mount, capped at 3 s.
  - **The UF-08.1 controls:**
    - minutes stepper (±5, 15–120);
    - chips 20/30/45/60/90;
    - "done by HH:MM";
    - "Set a finish time" (D-0065 §2, D-0107 §6);
    - "Warm-up counts in this time (3 min)" toggle (default on, D-0004);
    - energy Low/Normal/High with hints;
    - the live fit line;
    - "Suggest my workout";
    - Close (×) → `/`.
  - **States and hand-off.** The loading, no-profile and offline-icon states (D-0107 §7-§9). The UF-08.2 placeholder (D-0107 §2), which carries the `Workout` to T-0303b.
  - **Strings and e2e.** Strings go in `lib/i18n/flows/uf-08.ts`. e2e goes in `tests/e2e/uf-08-setup.spec.ts` (new; T-0303b–d append).
- Out:
  - The UF-08.2 body: bar, rows, remove, shuffle (T-0303b).
  - Swap (T-0303c).
  - Ready and Start (T-0303d).
  - Remembering the last budget (D-0065 revisit).
  - Calling any Edge Function.
  - `lib/i18n/workout.ts`. This ticket neither reads nor edits it.
  - C-01 or any import of `features/UF-02|06|07|10|11` (D-0071 §9).
  - Any change to `routes.ts`, `en.ts`, `lib/**` other than `lib/i18n/flows/uf-08.ts`, `components/**`, `tests/e2e/fixtures/**` (D-0108 §2) or the shell tests (D-0108 §3).
  - Any contract change.

### Edge cases that are in scope
- **Offline:** the same fit line and `Workout` offline as online for the same cache (AC-9). Queued sets count (AC-9). Cold-start offline in the e2e (AC-12).
- **Time running out:** the 15-minute floor gives one exercise (R7-E2, AC-6). The finish time converts to minutes once and is clamped (AC-4). A plan that fits nothing is still valid, and "Suggest my workout" stays enabled (AC-6).
- **Zero history:** the fit line comes from the zero-history engine examples (AC-6).
- **Returning after 10 days off:** recovering areas and queued sets feed `suggest` through the real `loadEngineHistory` (AC-9, R7-E3). The pre-fill display is T-0303b.

## Acceptance criteria
**Test setup.**
- Vitest + Testing Library in `apps/web/src/features/UF-08/__tests__/`. `lib/offline` loaders are mocked unless an AC says "real" (then `fake-indexeddb`).
- `now`, `locale` and `timeZone` are injected props on `SessionSetup` (D-0107 §4). `timeZone` is the `tz` passed to `suggest` and `refreshAll`. `locale` and `timeZone` both go to `formatTime` and `OfflineStatus`.
- **The defaults must not depend on `navigator` beyond `onLine`.** `auth-guard.test.tsx` stubs `navigator` as `{onLine}` only.
  - `timeZone` defaults to `Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - `locale` defaults to `"en-GB"`. It may read `navigator.language` only behind a `typeof navigator.language === "string"` guard, and never reads `navigator.languages`.
  - A test renders `SessionSetup` with `navigator` stubbed as `{onLine: true}` and asserts no throw and "done by 12:45" at F-tz.
- **F-web**:
  - F-tz: `now = 2026-09-27T12:00:00+02:00`, `Europe/Stockholm`, en-GB.
  - F-targets and F-profile (`docs/engine-rules.md` §0, goal `build_muscle` unless stated).
  - A web fixture copy of the L1 library plus the `wu-*` moves in `features/UF-08/__tests__/fixtures.ts`. AC-6's engine values are the check that the copy is right.
- The real `@workoutlab/engine` is used unless a spy is named.

**Test rules** (state.md traps):
- **Both values of every binary condition get a test.** Each AC names its pair.
- **Waiting for a negative.** A negative timing assert waits a real 50 ms macrotask, not microtask flushes.
- **Timing ACs must fail on unfixed code.** The build log records a planted fault turning them red.
- **Positive asserts on lazy content wait.** Anything rendered through `Shell` uses `findBy…` or `waitFor` (D-0103 §1).

- **AC-1 (host and URLs, D-0107 §1, principle 2)**
  - **First commit.** With never-resolving loaders, the synchronous assert straight after `render` at `/session/setup` finds `[data-screen-id="UF-08.1"]` as the only `[data-screen-id]`, with an `<h1>` "How long do you have?".
  - **The time step.** `/session/setup?step=time` renders the same screen.
  - **Cold loads of other steps.** Of `?step=suggested`, `?step=swap`, `?step=ready` and `?step=bogus`, each renders UF-08.1. The location probe shows pathname `/session/setup` with an empty search, reached by a REPLACE navigation (`useNavigationType()` === "REPLACE").
  - **Close.** Named "Close", ≥ 44 × 44 px, it lands on `/`.
  - **No chrome.** No `navigation` role is rendered by the host (principle 1).
- **AC-2 (defaults and stepper, D-0065 §2)**
  - **Defaults.** 45 min, warm-up toggle on, energy Normal.
  - **Stepping.** `+` → 50. `−` ×7 from 45 → 15. At 15, `−` has `aria-disabled="true"`, stays at 15, and makes no `suggest` call (spy count unchanged after a 50 ms macrotask). Above 15 it isn't disabled. The same pair holds for `+` at 120 and below 120.
  - **Chips.** 20/30/45/60/90 set the value. Exactly the matching chip has `aria-pressed="true"`. At 50, no chip is pressed. Re-pressing the active chip makes no `suggest` call.
  - **Button names.** The stepper buttons are named "5 minutes less" / "5 minutes more".
- **AC-3 (done by, NFR-I18N-2)**
  - **en-GB.** At F-tz, 45 min reads "done by 12:45".
  - **en-US.** With locale en-US, `America/New_York`, `now = 2026-09-27T12:00:00-04:00` and 90 min, the line equals `"done by " + formatTime(…)` from `lib/format`. With U+202F normalised to a space, it reads "done by 1:30 PM".
  - **Tracks the minutes.** Changing the minutes updates the line in the same render (45 → 50 gives "done by 12:50").
- **AC-4 (finish time, D-0065 §2, D-0107 §6)**
  - **Opening.** "Set a finish time" shows an empty `type="time"` input labelled "Finish by".
  - **Valid pick.** "13:07" → 67 min. The input closes, "done by 13:07" shows, no chip is pressed, and then `+` → 72.
  - **Rejected.** "12:00" and "11:30" each show "Pick a time later today". The minutes stay unchanged, the input stays open, and there is no `suggest` call.
  - **Clamping.** "12:10" → 15 (10 < 15, clamped up). "23:59" → 120 (clamped), with "done by 14:00".
  - **Partial values.** A partial value ("1" or "13:") converts nothing and shows no error.
- **AC-5 (energy and the warm-up toggle, D-0024, D-0004)**
  - **Energy.** A radio group named "Energy" with Low / Normal / High. The hints are "Fewer sets, same weights." / "Your plan as written." / "Adds a back-off set to the main lift if time allows.", and only the selected option's hint shows.
  - **The toggle.** "Warm-up counts in this time (3 min)" is a switch or checkbox, on by default. Turning it off calls `suggest` with `warmupInBudget: false`, and turning it back on calls it with `true`.
- **AC-6 (live fit line from `suggest`, principle 3, D-0065 §3, D-0107 §3 §5)**
  - **The call.** Every input change calls `suggest(history, targets, profile, library, {budgetMin, warmupInBudget, energy, shuffle: 0, mainLiftId: null, pinnedIds: [], excludeIds: []}, now, tz)` exactly once, with `tz` = the `timeZone` prop (a test with `America/New_York` asserts the 7th argument) with `now` as an ISO instant (a spy wrapping the real function). The line renders that call's return.
  - **Real engine, F-web, zero history:**
    - 30 min → "Fits: 3 exercises, 9 sets + warm-up" (R7-E4).
    - 15 min → "Fits: 1 exercise, 4 sets + warm-up" (R7-E2, singular).
    - 30 min + Low → "Fits: 3 exercises, 8 sets + warm-up" (R7-E11).
    - 15 min + warm-up off + High → "Fits: 1 exercise, 5 sets + warm-up" (R7-E12: the back-off set counts). The same with Normal gives "4 sets".
  - **Nothing fits.** A stubbed `suggest` returning 0 items gives "Nothing fits in 15 min", and "Suggest my workout" stays enabled.
  - **The goal (D-0095).**
    - A cached profile with goal `get_stronger` reaches `suggest` as `profile.goal === "get_stronger"`, and the resulting 30-min `Workout` has bench-press `repsMin` 3 and `repsMax` 5 (R7-E14).
    - With `build_muscle` it has 6 and 8.
  - **A11y.** The line has `aria-live="polite"`.
- **AC-7 (loading, D-0107 §7)**
  - **Before data.** With never-resolving loaders, the stepper, chips, toggle and energy are rendered and operable. The fit line reads "Checking what fits…". "Suggest my workout" has `aria-disabled="true"`, and activating it leaves the location unchanged after a 50 ms macrotask.
  - **After data.** Once the loaders resolve, the button is enabled.
- **AC-8 (hand-off to `?step=suggested`, D-0107 §2)**
  - **Push.** "Suggest my workout" does a PUSH to `?step=suggested`. It renders `[data-screen-id="UF-08.2"]` (the placeholder, `<h1>` "Your workout"), whose `workout` prop is reference-equal to the last value the `suggest` spy returned.
  - **No extra call.** Navigating makes no extra `suggest` call.
  - **Back.** The placeholder's Back link goes to `?step=time`, and the earlier choices (30 min, Low, warm-up off) are still selected, without a remount (a mount-counter probe).
  - **One screen at a time.** At any moment there is exactly one `[data-screen-id]`.
- **AC-9 (offline = online, NFR-OFF-3)**
  - **Same result both ways.** For the same cached history, library, targets and profile, the rendered fit line and the `Workout` passed on are deep-equal in two runs:
    - `navigator.onLine` true and `status: "signed-in"` (D-0113), with a `refreshAll` that resolves without changing the cache;
    - `navigator.onLine` false, where `refreshAll` has 0 calls after 50 ms.
  - **Queued sets count.** With the real `loadEngineHistory` and 6 queued hard back-squat sets at `now − 24 h`, recorded through `recordSet`, the 30-min `Workout`'s `sessionReasons` contain `recovering_skipped` for quads and for glutes (R7-E3). Without the queued sets, they contain neither.
- **AC-10 (refresh cap, auth condition and missing data, D-0071 §8, D-0104, D-0107 §9, D-0113)** `useAuth` comes from `lib/auth/auth-context.js` (a read-only import). Tests `vi.mock` it. Unless a case says otherwise, "online" below means `navigator.onLine` true **and** `status: "signed-in"`.
  - **Auth condition (D-0113 §1–§3).**
    - Online and signed in: `refreshAll` is called exactly once per mount.
    - Online but `stale` (and, separately, `signed-out`): 0 `refreshAll` calls after a 50 ms macrotask. The fit line renders from the cache, and each loader is read once.
    - `stale` → `signed-in` during the mount (re-render with the changed mock): exactly 1 `refreshAll` call, and none after another 50 ms or a second `signed-in` re-render. The planted fault "no once-per-mount flag" must turn this red, and the build log records it.
  - **The cap: re-read after the refresh resolves or after 3 s, whichever comes first.** Online, with `refreshAll` never resolving (fake timers):
    - The fit line renders from the cache before 3 000 ms. At 2 999 ms each loader mock has been read once.
    - At 3 000 ms each loader is read a second time (mock count 1 → 2).
    - `suggest` gets no extra call, because the re-read content is deep-equal to the first read. The memo keys on content, not array identity (D-0107 §3): the mocks return new arrays with equal contents.
    - Another 10 000 ms adds no read and no call.
    - Each of two planted faults must turn this red: (a) "await `refreshAll` without the cap", which gives no second read at 3 000 ms; (b) "memoise on array identity", which gives an extra `suggest` call at 3 000 ms.
  - **Refresh with new data.** A refresh that resolves with changed cache data (one more target, or a new set) makes exactly one more `suggest` call.
  - **Rejected refresh.** It renders from the cache with no `role="alert"` and no unhandled rejection.
  - **Missing data.**
    - With no profile, or with 8 targets, the screen shows "Connect to finish setting up your plan" and a link to `/`. The time controls are absent and `suggest` has 0 calls.
    - With profile + 9 targets, the message is absent.
    - A rejecting loader gives the message with no uncaught error.
- **AC-11 (offline indicator, D-0107 §8)** Offline, the screen shows an element with `aria-label="Offline"` and no "Offline ·" text. Online, it shows neither.
- **AC-12 (e2e: offline cold start and a11y, D-0086, D-0091 §1, D-0108)** In `tests/e2e/uf-08-setup.spec.ts`, which imports `test`/`expect` from `fixtures/guarded-test.js`:
  - **Seed.**
    - Signed in, with `mockSupabaseAuth`, `mockSupabaseRest`, `mockSupabaseData` (its `profile` field = the profile row below) and then `mockProfilePresent(page, profileRow)`.
    - The `exercises` and `exerciseAreas` exports of `fixtures/uf-04-library-data.js` (read-only import).
    - `profileRow` = that file's `profile` (full equipment) plus `user_id: FAKE_USER_ID`. The full equipment matters: the default `mockProfilePresent` row has `equipment: []`, which would give the R7-E6 push-up plan instead.
    - 9 targets from F-targets.
    - No sets.
  - **Online.** `/session/setup` shows UF-08.1 at 45 min. The spec records the fit line text. Before going offline it waits for the library cache and the precache to settle (the `offline.spec.ts` pattern).
  - **Offline.** It goes offline and reloads.
    - Within 3 s UF-08.1 is visible.
    - The fit line equals the recorded online text and matches `/^Fits: [1-9]\d* exercises?, [1-9]\d* sets? \+ warm-up$/`.
    - After `−` ×6 (→ 15) it reads exactly "Fits: 1 exercise, 4 sets + warm-up". This is R7-E2: only the chest compounds compete for the main slot, so the L1+ extras can't change it.
  - **a11y.**
    - axe on UF-08.1 reports 0 serious or critical violations.
    - The two stepper buttons, the 5 chips, Close and "Suggest my workout" each measure ≥ 44 × 44 px.
    - The whole flow (chip 30 → toggle → Low → Suggest) works by keyboard only.
  - **Requests.** The guard reports no unclaimed Supabase request.
- **AC-13 (strings, exports, lint)**
  - **Strings.** Every UF-08.1 string comes from `en.uf08`, in the D-0075 multi-line shape. `react/jsx-no-literals` is green, and `en.ts` is unchanged.
  - **Exports.** A test pins `Object.keys` of `features/UF-08/index.tsx` to `["SessionSetup"]`.
  - **Import bans.** The D-0071 §9 bans are green: no `components/body-map` and no `features/UF-02|06|07|10|11` imports.
- **AC-14 (shell tests unchanged, D-0108 §3)**
  - **Byte-identical.** `git diff main...HEAD` lists nothing under `apps/web/src/app/**`, `tests/e2e/fixtures/**` or `tests/e2e/{offline,auth,shell}.spec.ts`.
  - **Green.** Those tests pass in the DoD run. The relevant cases are App.test `/session/setup` → UF-08.1 and "hides the tab bar on /session/setup", routes.phase3.render AC-3, and the profile-gate `/session/setup` cases.

## Paths you may change
- `apps/web/src/features/UF-08/**` (the lane: `web-feature:UF-08`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-08.ts`: this flow's strings file (D-0071 §1, D-0075); add keys only, multi-line shape.
  - `tests/e2e/uf-08-setup.spec.ts`: new, this ticket's e2e spec (D-0071 §10); T-0303b–d append later.
  - `docs/tickets/T-0303a-time-and-energy.md`: this file, for the accept log.
- Read-only imports (not grants): `lib/offline`, `lib/format`, `lib/i18n/en.ts`, `components/offline-status`, `@workoutlab/engine`, `@workoutlab/shared`, and the existing `tests/e2e/fixtures/*` exports.

## Contract impact
None. The screen only calls the engine `suggest` and renders its `Workout` (`api/openapi.yaml` shape). Nothing is written to Supabase or IndexedDB.

## NFRs owned
OFF-3 (AC-9, AC-12), I18N-2 (AC-3), A11Y-1/2/6 on UF-08.1 (AC-1, AC-2, AC-12).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green (the whole suite) · `format:check`, `check:repo` and `check:size` green · contracts unchanged · commits start `T-0303a` and cite UF-08.1 (for example `T-0303a UF-08.1: live fit line from suggest()`).

## Notes
- **Flow:** `wl-build-web`. Parallel-safe with T-0302a and T-0302c (D-0108 §1). Don't run two vitest processes on the machine at once (state.md); QA and review are staggered.
- **Size.** This is the upper end of ½ day. Spend the effort on the fit line (AC-6) and the routing (AC-1, AC-8); the finish time (AC-4) is one small pure function plus an input.

## Build / accept log
Archived in `docs/tickets/log/T-0303a.md` (D-0157).
