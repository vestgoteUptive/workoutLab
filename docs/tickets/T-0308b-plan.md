---
id: T-0308b
title: UF-11.2 Plan (goal, rhythm, priorities, 9 targets with source, engine next check-in date, last 3 check-ins, routine list) + UF-11.3 Edit plan (goal, rhythm steppers, ≤ 3 priorities, live engine preview, online-only Save in the D-0070 §3 order)
lane: web-feature:UF-11
screens: [UF-11.2, UF-11.3]
decisions: [D-0001, D-0002, D-0018, D-0027, D-0034, D-0041, D-0050, D-0061, D-0067, D-0070, D-0071, D-0075, D-0081]
deps: [T-0318, T-0319, T-0334]
status: ready
---
<!-- Written by product-owner 2026-09-29 (groom mode) from T-0308's [b] ACs, docs/specs/uf-11-plan-checkin.md §UF-11.2/§UF-11.3 and AC15, D-0070 §3/§7, D-0071 §1/§3/§8/§10, D-0075 and D-0081 §1–§3. All three deps are done (T-0334 merged as f057d58). It does NOT depend on T-0215 or T-0223: UF-11.2 reads only `nextCheckinDate` and whether `periods` is empty, and neither changes under one-period evaluation (the next-date formula is independent of COMPARED_PERIODS). Build flow: wl-build-web. About ¾–1 day, at the top of the one-day budget. If the build runs long, the natural split line is UF-11.2 (AC-B1–B6) / UF-11.3 (AC-B7–B14). Runs in parallel with T-0308a, T-0306a, T-0307a and T-0307b (no path overlap). T-0308c follows in the same lane. -->

## Why
Principle 4: targets adapt to what the user does, and **never silently**. UF-11.2 is where the user sees their plan and each target's origin (`From your plan`, `Adapted 27 Sep`, `Set by you`), and when the next check-in happens. UF-11.3 is the only place the plan changes on purpose.

Principle 3 is where this can go wrong. Targets depend on the rhythm as well as the priorities (rule 4: `S = clamp(2·(min+max), 7, 21)`), so a UI that "helpfully" computes the preview itself would drift from the engine the first time rule 4 changes. AC-B10 hands the UI a deliberately wrong engine output and checks that the UI renders it and saves it.

All three routes exist: `/plan` → `Plan` (UF-11.2, tab bar on) and `/plan/edit` → `EditPlan` (UF-11.3, no tab bar), both `protected` (T-0318). The routine links go to T-0308a's `/plan/routines/*`. So this ticket adds no route and edits no shared file. Writes are plain supabase-js calls under RLS (D-0001). `profiles`, `area_targets` (PK `(user_id, area_id)`, `source in ('default','adapted','manual')`) and `plan_checkins` (`answer`/`answered_at` pair check) exist with owner RLS and grants. `profiles_before_write` bumps `plan_changed_at` when goal, rhythm or priorities change, which is the rule 9 streak reset. **No endpoint or column is missing.**

## Scope
- In:
  - **Data, on the device (D-0071 §8).**
    - Both screens read `loadProfile()`, `loadTargets()`, `loadCheckins()`, `loadRoutines()`, `loadSessions()`, `loadEngineHistory()` and `loadLibrary()` from `lib/offline`.
    - They render from the cache **first**. When online, they run `refreshAll(now, tz)` with the 3 s cap and re-render.
    - No Edge Function call. No direct IndexedDB access (no `offlineDb()`, no Dexie import).
    - `now` is injected (a clock prop or module), and `tz` comes from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - **The check-in evaluation** is built in **one** module-private function in `features/UF-11` (for example `checkin-evaluation.ts`), so T-0308c reuses it rather than building a second one: `evaluateCheckin(checkinSessions(sessions.map(({id, startedAt}) => ({id, startedAt})), history, library), profile, checkins, now, tz)`.
  - **UF-11.2 Plan** (`[data-screen-id="UF-11.2"]`, `<h1>` from `en.screens.plan`):
    - Goal: `build_muscle` → `Build muscle`, `get_stronger` → `Get stronger`, `general_fitness` → `General fitness`.
    - Rhythm: `{min}–{max} per week · {2·min}–{2·max} per 14 days`.
    - Priority areas: the area names in the **stored** order, joined by `, `, or `No priority areas`.
    - Targets: one row per `loadTargets()` entry, in the fixed area order, reading `{Area} {setsPer14d} · {source}`. The sources are `default` → `From your plan`, `adapted` → `Adapted {d MMM}` (the **local** date of `updatedAt` in `tz`), and `manual` → `Set by you`.
    - The check-in line (D-0081 §1): `First check-in on {d MMM}` when `evaluation.periods` is empty **and** `loadCheckins()` is empty. Otherwise `Next check-in: {d MMM}`. The date is always `evaluation.nextCheckinDate`.
    - Last check-ins: the first 3 of `loadCheckins()` (already newest `proposedAt` first). Each reads `{d MMM of proposedAt} · {completedLast} session(s) · {rhythmMinBefore}–{rhythmMaxBefore} → {proposedMin}–{proposedMax} per week · {Accepted | Kept | Withdrawn | Waiting for you}`. With none: `No check-ins yet`.
    - Routines: one link per `loadRoutines()` entry, in loader order, reading `{name} · {n} exercise(s)` with `href="/plan/routines/{id}"`. With none: `No routines yet`. There is always a `New routine` link to `/plan/routines/new`.
    - An `Edit plan` link to `/plan/edit`.
    - `<OfflineStatus variant="text" />`, a read-only import from `components/offline-status/OfflineStatus.tsx`.
  - **Shell tests you can't edit** (web-shell's `app/**`), which stay green unmodified:
    - `app/__tests__/routes.phase3.render.test.tsx:65-76` scans `features/UF-11/index.tsx`. The body of `export function EditPlan(` (up to its first line that starts with `}`) must contain the literal `<h1>{en.screens.editPlan}</h1>`, so `EditPlan` renders its heading itself, not through a child component.
    - That file, `auth-guard.phase3.test.tsx` and `App.test.tsx` render `/plan` and `/plan/edit` with no cached profile, no user id in the session, and in one case a `supabase` mock with no `from`. `auth-guard.phase3.test.tsx:156-173` also fires `SIGNED_OUT` on `/plan/edit`. So on both screens, the `[data-screen-id]` host and its `<h1>` are in the DOM on the **first** render, before any `await`, and in every state, including loading and cold cache. A missing `from` or a failed refresh never throws out of the component.
  - **UF-11.3 Edit plan** (`[data-screen-id="UF-11.3"]`, `<h1>` from `en.screens.editPlan`):
    - The draft is initialised once, from the first read that finds a profile. That's the cache read, or the re-read after `refreshAll` on a cold cache online. A later refresh never overwrites it. The **baseline** that D-0081 §2 compares the draft against is that same snapshot. It doesn't change after a failed or partly failed Save, so a retry after "(2) ok, (3) failed" stays enabled and re-runs from (1) (AC-B12).
    - Goal: a radio group `Goal` with the 3 labels.
    - Rhythm: a group `Sessions per week` with `Decrease minimum` / `Increase minimum` / `Decrease maximum` / `Increase maximum` buttons.
      - Each bound stays within 1–7.
      - Raising min above max raises max with it, and lowering max below min lowers min with it.
      - A button that can't move is `disabled`.
      - The readout is `{min}–{max} per week · {2·min}–{2·max} per 14 days`.
    - Priority areas: a group `Priority areas` of 9 toggle chips in the fixed order, each with `aria-pressed`, allowing 0–3 selected.
      - A 4th tap is refused and shows `Pick up to 3` in a polite `role="status"`.
      - The hint disappears once fewer than 3 are selected.
    - Preview: `New targets per 14 days`, 9 rows `{Area} {setsPer14d}` from engine `previewTargets({rhythmMin, rhythmMax, priorityAreas})`. It's recomputed on every draft change, and the UI does no arithmetic on it.
    - `Save` is disabled until the draft differs from the loaded profile (D-0081 §2), disabled offline with `Connect to save` (D-0070 §7), and disabled while a Save is in flight.
    - `Cancel` → `/plan`, with no writes and no confirm.
  - **Save (D-0070 §3).** Each step runs only if the previous one succeeded:
    - (1) `from("area_targets").upsert(<9 rows {area_id, sets_per_14d, source: "default"}>, {onConflict: "user_id,area_id"})`, with `sets_per_14d` taken from the **same** `previewTargets` result the screen shows.
    - (2) `from("profiles").update({goal, rhythm_min, rhythm_max, priority_areas}).eq("user_id", <currentUserId()>)`, with `priority_areas` in the fixed area order (D-0081 §3).
    - (3) `from("plan_checkins").update({answer: "withdrawn", answered_at: <now ISO>}).is("answer", null)`.
    - Then `refreshAll(now, tz)`, then navigate to `/plan`. A rejected `refreshAll` after the writes doesn't block the navigation.
    - Any failure shows `Couldn't update your plan. Try again.`, keeps the draft and stays on `/plan/edit`.
  - **Strings:** in `apps/web/src/lib/i18n/flows/uf-11.ts`, this ticket's own file (D-0071 §1, D-0075). It's written multi-line, with the closing `} as const;` at column 0. `en.ts` isn't edited. The area names are reused from `en.bodyMap.areas`, and the screen titles from `en.screens`.
  - **Exports:** `features/UF-11/index.tsx` exports exactly `Plan` and `EditPlan` (D-0071 §3). T-0308c adds `CheckinCard` later.
  - **e2e:** `tests/e2e/uf-11-plan.spec.ts`, a new file (D-0071 §10). T-0308c appends to it.
- Out:
  - **UF-11.1 `CheckinCard`** in every part: evaluation copy, the first-shown insert, Accept/Keep, its offline state, its mount at the top of UF-11.2 and on UF-02.1. That's T-0308c, which follows in this lane. **Don't** leave a placeholder card or a "pending proposal" banner on UF-11.2. The `Waiting for you` label in the check-in history is the only trace of a pending row here.
  - The one-period engine change (T-0215) and the `plan_checkins` schema change (T-0223).
  - Manual per-area targets (PRD: out of scope v1). `manual` is only **displayed**.
  - Level and equipment editing (T-0216, account settings), and account settings in general (T-0310).
  - The period dates of each past check-in. The spec's "period dates" would need UI date arithmetic from `periodIndex` plus `onboardedAt`, which breaks principle 3, so the row shows the proposal date and `completedLast` instead. A later engine helper could expose them (not filed; name it if a user asks).
  - The routine editor (T-0308a) and "start from routine" (a UF-08 follow-up, D-0070 §1).
  - Any change to `lib/**`, `components/**`, `app/**`, `apps/web/eslint.config.mjs`, `features/UF-02/**`, and any contract.

### Edge cases that are in scope
- **Zero history / new user:** onboarded 2026-09-20, with no sessions and no check-ins, sees `First check-in on 4 Oct`, `No check-ins yet` and `No routines yet` (AC-B3, AC-B4, AC-B5).
- **Right after a plan edit:** `periods` is empty because of the reset, but the user has check-in history, so the line reads `Next check-in`, not `First` (AC-B3, D-0081 §1).
- **Returning after 10 days off:** the engine decides the date. On 2026-10-07, with no sessions since 26 Sep, the line still reads `Next check-in: 11 Oct`. On 10-11 it reads `25 Oct` (AC-B3). The UI never counts periods.
- **Offline:** both screens render from the cache. UF-11.3 Save is disabled with `Connect to save` and enables on `online` without a reload (AC-B6, AC-B13).
- **Cold cache offline** (no profile cached): a message and no crash (AC-B6).
- **Partial failure:** the later steps don't run, the draft stays, and a retry re-runs from step (1) (AC-B12).
- **A no-op Save:** impossible, because Save is disabled while unchanged. So a pending proposal is never withdrawn, and `Adapted` never flips to `From your plan`, without a real plan change (AC-B7).
- **Time running out / mid-workout:** not applicable. T-0318's import ban stops UF-03/04/05/08/09 from importing `features/UF-11`, and T-0308c adds the route-level assertion for the card.

## Acceptance criteria
- **Test surfaces.** Vitest + Testing Library + `fake-indexeddb` in `apps/web/src/features/UF-11/__tests__/*.test.tsx`, with pure helpers in `*.test.ts`. Supabase is spied at `from(table)` and records the method, payload, options and filters (`eq`/`is`) in call order. A feature-local spy is fine, and `lib/offline/__tests__/supabase-spy.ts` may be imported read-only. Playwright in `tests/e2e/uf-11-plan.spec.ts` where tagged **e2e**.
  - **`refreshAll` is a stub by default.** Use `vi.mock` of `lib/offline`, passing every other export through, so that `refreshAll` (and `refreshRoutines`) is a resolved `vi.fn()`. The real `refreshAll` calls `from("sessions")`, `from("routines")`, `from("session_sets_live")` and others to `select`. Those calls would land in the spy's log and contradict AC-B6's "`from` never called", AC-B11's exact call list and AC-B11's "no call to `sessions` … `routines`". Only AC-B6's cache-first case uses the real `refreshAll` (pass-through), with `fetch` never resolving.
  - **What counts as a failed step.** A step fails when its promise rejects **or** when it resolves with a non-null `error`. supabase-js resolves `{data, error}` on a 4xx/5xx and doesn't throw. Every failure case in AC-B12 runs in both forms.
- **Fixture F** (after `docs/specs/uf-11-plan-checkin.md`):
  - tz `Europe/Stockholm`, now `2026-09-27T12:00:00+02:00`.
  - Profile: `{goal: "build_muscle", level: "intermediate", equipment: [], rhythmMin: 3, rhythmMax: 4, priorityAreas: [], onboardedAt: "2026-08-02T08:00:00Z", planUpdatedAt: "2026-08-02T08:00:00Z"}`.
  - Targets 20/20/16/12/12/20/20/16/12 (chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves), each `source: "default"`, `updatedAt: "2026-08-02T08:00:00Z"`.
  - No sessions, no check-ins, no routines.
- **"Through the engine"** means the real `@workoutlab/engine` over the seeded cache. **"Stubbed"** means `vi.mock` of the engine returning a fixed value. Each AC says which.

### UF-11.2 Plan
- **AC-B1 (plan summary)** With F, through the engine:
  - `/plan` shows `Build muscle`, `3–4 per week · 6–8 per 14 days` and `No priority areas`.
  - It shows exactly 9 target rows reading, in order, `Chest 20 · From your plan`, `Back 20 · From your plan`, `Shoulders 16 · From your plan`, `Arms 12 · From your plan`, `Core 12 · From your plan`, `Glutes 20 · From your plan`, `Quads 20 · From your plan`, `Hamstrings 16 · From your plan`, `Calves 12 · From your plan`.
  - **Contrast:**
    - With the targets inserted into the cache in **reverse** area order, the rows still read in the fixed order.
    - With `goal: "get_stronger"` and `priorityAreas: ["hamstrings", "back"]`, the screen shows `Get stronger` and `Hamstrings, Back` (stored order, not sorted), and `Build muscle` and `No priority areas` are **absent** from the DOM.
    - Rhythm 1–1 reads `1–1 per week · 2–2 per 14 days`.
- **AC-B2 (target source)**
  - A back target `{source: "adapted", updatedAt: "2026-09-26T22:30:00Z"}` reads `Back 20 · Adapted 27 Sep`. That's 00:30 local on 27 Sep, so a UTC-date bug would print `26 Sep` and fail.
  - A calves target `{source: "manual"}` reads `Calves 12 · Set by you`.
  - In each of those rows, the other two source strings are **absent**.
- **AC-B3 (first / next check-in: the engine's date, D-0081 §1)**
  - Through the engine, with F but onboarded `2026-09-20T08:00:00Z` (planUpdatedAt the same): `First check-in on 4 Oct`, and `Next check-in` is **absent**.
  - With F: `Next check-in: 11 Oct`. With the clock at 2026-10-07T12:00+02:00 (10 days off, no sessions): still `Next check-in: 11 Oct`. At 2026-10-11T12:00+02:00: `Next check-in: 25 Oct`.
  - With F but `planUpdatedAt: "2026-09-27T08:00:00Z"` (just edited, so `periods` is empty), on 09-27:
    - with **no** check-in rows: `First check-in on 11 Oct`
    - with one row `{answer: "kept", answeredAt: "2026-09-13T08:00:00Z", proposedAt: "2026-09-13T08:00:00Z"}`: `Next check-in: 11 Oct`
  - **Stubbed:** an evaluation `{periods: [{index: 3, …}], proposal: null, nextCheckinDate: "2026-12-24"}` shows `Next check-in: 24 Dec`. A UI that computed the date itself would show 11 Oct.
  - **Contrast:** stubbing `nextCheckinDate: "2026-12-24"` with `periods: []` and no rows shows `First check-in on 24 Dec`.
  - **Contrast (the date is a local date, not an instant):** with the same stub and `tz` resolved as `America/Los_Angeles` (spy `Intl.DateTimeFormat().resolvedOptions`), the line still reads `24 Dec`. Formatting `new Date("2026-12-24")` in `tz` would print `23 Dec`.
- **AC-B4 (last 3 check-ins)** Given 4 rows put into the cache in the order K2, K4, K1, K3:
  - K1 `{proposedAt: "2026-08-16T08:00:00Z", completedLast: 3, before 4–5, proposed 3–4, answer: "accepted"}`
  - K2 `{"2026-08-30T08:00:00Z", 2, 3–4, 2–3, "withdrawn"}`
  - K3 `{"2026-09-13T08:00:00Z", 10, 3–4, 4–5, "kept"}`
  - K4 `{"2026-09-27T09:00:00Z", 1, 3–4, 2–3, null}`

  UF-11.2 lists exactly 3 rows, in this order:
  - `27 Sep · 1 session · 3–4 → 2–3 per week · Waiting for you`
  - `13 Sep · 10 sessions · 3–4 → 4–5 per week · Kept`
  - `30 Aug · 2 sessions · 3–4 → 2–3 per week · Withdrawn`

  `16 Aug` is **absent** from the DOM. A separate case with K1 alone renders `Accepted`. With no rows: `No check-ins yet`, and **no** row element.
- **AC-B5 (routines list)** `loadRoutines()` = [Lower A (2 items), Upper B (1 item)] renders:
  - two links in that order, `Lower A · 2 exercises` → `/plan/routines/<idA>` and `Upper B · 1 exercise` → `/plan/routines/<idB>` (the singular is asserted exactly)
  - plus `New routine` → `/plan/routines/new`

  With no routines: `No routines yet`, and `New routine` is still present.
- **AC-B6 (cache first, offline, cold cache)**
  - **Cache first:** with F seeded, `navigator.onLine = true` and `fetch` stubbed to a promise that never resolves, the 9 target rows are in the DOM after the cache read, asserted **without** waiting on the refresh. **Contrast:** the `refreshAll` spy **was** called.
  - **Offline:** with `navigator.onLine = false` and `lastSyncedAt` 08:10 local, the screen renders from the cache with `Offline · last synced 08:10`. There's no `role="alert"`, the `supabase.from` spy is **never** called, and `Edit plan` is still a link (UF-11.3 handles offline itself).
  - **Cold cache:** offline, with no cached profile, both `/plan` and `/plan/edit` show `Your plan isn't on this device yet. Connect to load it.`. There are no target rows, `/plan` has no `Edit plan` link, `/plan/edit` has no `Save`, and nothing throws.

### UF-11.3 Edit plan
- **AC-B7 (initial state; Save disabled while unchanged, D-0081 §2)** With F, `/plan/edit`:
  - `Build muscle` is checked, the readout is `3–4 per week · 6–8 per 14 days`, and no chip has `aria-pressed="true"`.
  - The preview reads the 9 F values.
  - `Save` is `disabled`.
  - Selecting `Get stronger` enables Save. Selecting `Build muscle` again disables it.
  - Selecting then deselecting `Back` leaves Save disabled.
  - **Contrast:** priorities `[back, arms]` loaded, tapped off and back on in the order arms, back, is unchanged (set comparison), so Save stays disabled.
- **AC-B8 (priorities, preview and the limit — spec AC15)** Through the engine, with F:
  - Tapping `Arms`, `Back`, `Hamstrings` (in that order) shows `Back 25`, `Hamstrings 20` and `Arms 15`. **Contrast:** `Chest 20` and `Calves 12` are unchanged.
  - The last `previewTargets` call received `{rhythmMin: 3, rhythmMax: 4, priorityAreas: ["back", "arms", "hamstrings"]}` in the fixed order.
  - With 3 selected, tapping `Quads` leaves it `aria-pressed="false"`, shows `Pick up to 3`, keeps exactly 3 pressed, and makes **no** `previewTargets` call with 4 areas.
  - **Contrast:** `Pick up to 3` is **absent** before that tap, and absent again after `Arms` is deselected, when `Quads` can then be selected.
- **AC-B9 (rhythm steppers)** Through the engine, from F's 3–4:
  - `Increase minimum` → `4–4 per week · 8–8 per 14 days`, preview `Chest 23`.
  - Again → `5–5` (max raised with min), `Chest 29`.
  - `Decrease maximum` → `4–4` (min lowered with max), `Chest 23`.
  - At 1–1, `Decrease minimum` and `Decrease maximum` are `disabled`. At 7–7, `Increase minimum` and `Increase maximum` are `disabled`, and the preview reads `Chest 30`.
  - The readout never shows a value outside 1–7 or a min above max, asserted after each of 20 alternating random presses with a fixed seed.
  - Each button is reachable and activatable with Tab + Enter/Space.
- **AC-B10 (the engine's numbers, verbatim — principle 3)** Stubbed: `previewTargets` returns the real rule 4 values except `back: 99`.
  - The preview shows `Back 99`.
  - After a change and a Save, the `area_targets` upsert row for `back` has `sets_per_14d: 99`.
  - **Contrast:** change the draft rhythm after the priorities, so the stub is called with the new input and returns `back: 98`. The upsert then carries `98`, never `99`, so the Save uses the **last** preview and not a stale one or a UI recomputation.
- **AC-B11 (Save: order and exact payloads — D-0070 §3)** With F, select `Back`, `Hamstrings` and `Arms`, then Save, online. The spy records exactly these calls, in order:
  - (1) `area_targets.upsert(rows, {onConflict: "user_id,area_id"})`, where `rows` is 9 objects with exactly the keys `area_id`, `sets_per_14d` and `source`. Back is 25, hamstrings 20, arms 15, the rest as F, and all `source: "default"`.
  - (2) `profiles.update({goal: "build_muscle", rhythm_min: 3, rhythm_max: 4, priority_areas: ["back", "arms", "hamstrings"]})` with `eq("user_id", <the signed-in id>)`. The payload has **exactly** those four keys: no `level`, `equipment`, `onboarded_at` or `plan_changed_at`.
  - (3) `plan_checkins.update({answer: "withdrawn", answered_at: "2026-09-27T10:00:00.000Z"})` with `is("answer", null)`.
  - Then `refreshAll` is called, then the location is `/plan`.
  - **Contrast:** no `insert` or `delete` on any table, and no call to `sessions`, `session_sets` or `routines`.
- **AC-B12 (partial failure and double submit)**
  - If (1) rejects, (2) and (3) aren't called, `Couldn't update your plan. Try again.` is shown, the draft (the 3 chips pressed) is intact, and the location stays `/plan/edit`.
  - If (2) rejects, (3) isn't called.
  - If (3) rejects, the message is shown and there's no navigation.
  - A retry after any of these re-runs from (1).
  - A double click on Save gives exactly one call of each step.
  - A rejected `refreshAll` after three successful writes still navigates to `/plan`, with no error message.
- **AC-B13 (offline — D-0070 §7)**
  - With `navigator.onLine = false` and a changed draft, Save is `disabled` and `Connect to save` is shown.
  - Dispatching `online` (with `navigator.onLine` true) enables Save **without a remount**.
  - Dispatching `offline` mid-edit disables it again.
  - Offline, the chips, steppers and preview still work. The preview is on the device, so its values match the online case.
- **AC-B14 (cancel)** After changing all three controls, `Cancel` navigates to `/plan` and the spy records **no** call. Reopening `/plan/edit` shows the F values again.

### Both
- **AC-B15 (a11y — e2e, NFR-A11Y-1/-2)** In the preview build, with an injected session and the mocked Supabase (`mockSupabaseData` fed F plus the AC-B4 rows and two routines):
  - `@axe-core/playwright` reports 0 serious or critical violations on `/plan` and on `/plan/edit`.
  - Every `button`, `input`, `[role=radio]` and `a` on both has a `boundingBox()` of at least 44 × 44 CSS px. A native `input[type=radio]` is measured by its `<label>`, which is the hit target and must wrap it or point to it with `for`. So a visually hidden radio with a 44 px label passes, and a bare 13 px radio fails.
  - With the real keyboard on `/plan/edit`, Tab to the `Back` chip and press Space gives `aria-pressed="true"`.
  - `Edit plan` on `/plan` lands on `[data-screen-id="UF-11.3"]`, and `Cancel` returns to `[data-screen-id="UF-11.2"]`.
- **AC-B16 (strings, exports and the shared-file boundary)**
  - Every user-facing string comes from `en.uf11`, `en.screens`, `en.bodyMap.areas` or `OfflineStatus`. `react/jsx-no-literals` stays green.
  - `flows/uf-11.ts` is filled multi-line with `} as const;` at column 0, so `lib/i18n/__tests__/flows.test.ts` (D-0075) stays green **unmodified**.
  - A test pins `Object.keys(await import("../index.js")).sort()` to exactly `["EditPlan", "Plan"]`.
  - `apps/web/src/app/__tests__/routes.phase3.render.test.tsx`, `auth-guard.phase3.test.tsx` and `App.test.tsx` stay green **unmodified** (see "Shell tests you can't edit" in Scope).
  - `git diff --name-only main...HEAD` lists no path outside "Paths you may change".
  - `pnpm -w lint` is green.

## Paths you may change
- `apps/web/src/features/UF-11/**` (the lane: `web-feature:UF-11`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-11.ts`: this ticket's own flow file, and no other (D-0071 §1, D-0075). Add keys only. The `export const uf11 = {…} as const;` shape stays, written multi-line.
  - `tests/e2e/uf-11-plan.spec.ts`: a new file (D-0071 §10). T-0308c appends to it later.
  - `tests/e2e/fixtures/uf-11-plan.ts`: an optional new file with this spec's fixture data, passed to the existing `mockSupabaseData(page, fixtures)`.
- **Not yours, and each is already done for you:**
  - `apps/web/src/app/**`: both routes exist.
  - `apps/web/src/components/**`: OfflineStatus is a read-only import.
  - `apps/web/src/lib/**`, including `lib/i18n/en.ts`, every other `lib/i18n/flows/*.ts` and `lib/offline/**`.
  - `apps/web/eslint.config.mjs`.
  - `tests/e2e/fixtures/supabase-mock.ts`: read-only, shared by every lane's spec.
  - `apps/web/src/features/UF-07/**`: T-0308a's.
  - `apps/web/src/features/UF-02/**`: T-0308c's single `slots.tsx` grant, not this ticket's.
  - Any file under `packages/**`, and every contract file.
  - If you believe you need one of these, stop and put it in your result as a follow-up.

<!-- Correction 2026-09-30 (orchestrator, from the T-0308b build): AC-B8/AC-B11 originally wrote this array as
     ["back", "hamstrings", "arms"], which is neither tap order nor fixed order. `AREAS` in packages/shared/src/index.ts:76
     is [chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves], so `arms` (index 3) precedes `hamstrings`
     (index 7) and the fixed order is ["back", "arms", "hamstrings"]. A transcription slip in the ticket, not a code defect:
     the product code was already correct and its test derives the order from AREAS so it cannot drift. Do NOT "fix" the
     code to match an older copy of this AC. -->

## Contract impact
None. The reads are the T-0319 loaders and the engine's public `evaluateCheckin`, `checkinSessions` and `previewTargets` (shapes as in `api/openapi.yaml` `CheckinEvaluation`/`PreviewTarget`). The writes use `area_targets {area_id, sets_per_14d, source}`, `profiles {goal, rhythm_min, rhythm_max, priority_areas}` and `plan_checkins {answer, answered_at}` exactly as in `docs/data-model.md`.
- `user_id` comes from its default, and `updated_at`/`plan_changed_at` from the triggers.
- The upsert target `user_id,area_id` is the table's PK.
- `priority_areas` in fixed order satisfies `profiles_priority_areas_valid` (≤ 3, distinct, known ids, lower bound 1).
- The `withdrawn` update satisfies `plan_checkins_answer_pair`.

T-0223's `period_index >= 0` / nullable `completed_prev` affect only T-0308c's insert. D-0070 and D-0081 are `status: revisit`.

## Ambiguity resolved (state it, do not stall)
- The spec's AC11 "Next check-in: 4 Oct" versus T-0308 AC-B2 "First check-in on 4 Oct": D-0081 §1 (First only while there are no periods **and** no check-in rows).
- A no-op Save: D-0081 §2. The order of `priority_areas`: D-0081 §3.
- The spec's "period dates, sessions completed" for past check-ins: `completedLast` is shown. The period dates are cut (see Out) rather than computed in the UI.
- The rhythm readout keeps the `{min}–{max}` form even when min = max (`1–1 per week`), matching the D-0070 §5 card copy (`Switch to 1–1 per week?`), so the two screens never disagree.

## Definition of done
- Every AC has a passing test.
- `pnpm -w typecheck lint test --force --concurrency=1` is green. The **`--force`** matters: without it, turbo replays another worktree's cache and reports a false green.
- `pnpm --filter @workoutlab/web test:e2e` is green, including `uf-11-plan.spec.ts`.
- Contracts are unchanged.
- No file outside "Paths you may change" is touched. Check your own `git diff --name-only` before you hand back.
- Commits start `T-0308b:` and cite the screen ids (e.g. `T-0308b UF-11.3: save writes targets before profile`).
- Make no bundle-size claim unless you ran a fresh `pnpm --filter @workoutlab/web build` and report the measured gzip numbers (T-0322).

## Accept log

**Verdict: `done` (accepted 2026-09-30, product-owner, accept mode).** All 16 ACs met, Definition of done confirmed, no rework required. Read against the branch `t/T-0308b-plan` (20 files in its three-dot diff, all in lane).

### AC-by-AC

| AC | Verdict | Evidence |
| --- | --- | --- |
| AC-B1 plan summary | met | `__tests__/plan.render.test.tsx:52-122` — 9 rows in fixed order, plus all three contrasts (reverse-order cache, stored-order priorities with `Build muscle`/`No priority areas` asserted **absent**, rhythm 1–1). |
| AC-B2 target source | met | `plan.render.test.tsx:123-153`. The `adapted` case is the real false-green trap: `2026-09-26T22:30:00Z` is 00:30 local on 27 Sep, and `format.ts` builds the date from `YYYY-MM-DD` parts via `localDate(iso, tz)` rather than `new Date(ymd)`. Review confirmed no sibling instances of the UTC bug. |
| AC-B3 first/next check-in | met | `plan.render.test.tsx:154-268`. All six through-the-engine cases (incl. 10-days-off and the 11 Oct roll), the stubbed `2026-12-24` case that a self-computing UI would fail, and the `America/Los_Angeles` contrast that catches instant-vs-local-date. `PlanBody.tsx:26-27` reads only `periods.length` and `nextCheckinDate`: the UI never counts periods (principle 3). |
| AC-B4 last 3 check-ins | met | `plan.render.test.tsx:270-310` — exactly 3 newest-first regardless of insertion order, `16 Aug` absent, the `Accepted` single-row case, and the empty case with no row element. |
| AC-B5 routines list | met | `plan.render.test.tsx:311-368`, including the exact singular (`Upper B · 1 exercise`) and `New routine` surviving the empty case. |
| AC-B6 cache first / offline / cold cache | met | `__tests__/offline.test.tsx:65-180`. Cache-first uses the real pass-through `refreshAll` with a never-resolving `fetch` and still contrasts that the refresh **was** called; offline asserts `supabase.from` never called and `Edit plan` still a link; cold cache covers both routes. `offline.test.tsx:150-180` also pins the shell contract: host + `<h1>` on the first render, and `/plan` survives a supabase client with no `from`. |
| AC-B7 initial state / Save disabled while unchanged | met | `__tests__/edit-plan.test.tsx:129-180`. The set-comparison contrast is present in **both** directions: same set re-ordered keeps Save disabled, and a different set of the same size enables it — so `differs()` cannot be trivially satisfied. |
| AC-B8 priorities, preview, ≤ 3 limit | met | `edit-plan.test.tsx:182-269`. Fixed order is derived from `AREAS` (`:214`) so it cannot drift, and is contrasted against tap order. The 4th tap asserts no `previewTargets` call ever received 4 areas, and the hint is pinned as polite `role="status"`, not an alert. Priority-order note: the ticket's inline correction stands — `["back","arms","hamstrings"]` is right; no code change was made or needed. |
| AC-B9 rhythm steppers | met | `edit-plan.test.tsx:271-361`, including the 20-press seeded fuzz that re-asserts the invariant *and* the doubling of the 14-day half after every press, plus real Tab/Enter/Space activation. |
| AC-B10 engine numbers verbatim (principle 3) | met, **after QA** | Shipped `edit-plan.test.tsx:363-400` proved only the stale-preview half; its call-count contrast passes under a value-identical recompute. QA added `:408-418` (no extra `previewTargets` call at save time) and `:420-443` (a per-call-divergent engine probe: the written value must identify the last *render-time* call). See "Unfalsifiable as delivered" below. |
| AC-B11 Save order and exact payloads | met | `__tests__/save-plan.test.tsx:126-221`. Exact ordered call list, the 9-row key set, `onConflict`, the four-key `profiles` payload with the key set asserted (no `level`/`equipment`/`plan_changed_at`), `eq(user_id)`, `is(answer, null)` with the injected `now`, and the contrast that no `insert`/`delete`/`select` and no `sessions`/`session_sets`/`routines` call occurs. |
| AC-B12 partial failure and double submit | met | `save-plan.test.tsx:232-379`, every case run in **both** failure forms via `describe.each(["reject","error"])`. This is load-bearing, not ceremony: planting `ok()` → bare `await step` gives exactly 5 failures, all from the `error` form, and supabase-js resolves `{data,error}` on 4xx/5xx — a throw-only suite would have shipped that green. Each case asserts *observable* state (which tables were written, which were not, draft intact, location, `refreshAll` not reached), not merely that a message appeared. The retry case pins the D-0081 §2 baseline: Save stays enabled and re-runs from (1). Verified independently: moving the withdraw to step (1) → 12 failures. |
| AC-B13 offline | met | `save-plan.test.tsx:385-450`. The `online` event enables Save without a remount (`useOnline` is a listener, not a mount-time read), and the offline/online preview rows are compared row-for-row *and* pinned to real engine values (`Back 29`, `Chest 23`), so a placeholder could not pass. |
| AC-B14 cancel | met | `save-plan.test.tsx:456-504` — no spy call at all, reopening shows the F values, and one tap navigates (no confirm). |
| AC-B15 a11y (e2e) | met | `tests/e2e/uf-11-plan.spec.ts:37-173`. Axe scoped to the screen host but gated on real content (`:45`) so an empty screen cannot trivially pass; the 44 px check measures a native radio by its `<label>`; real-keyboard Space on the `Back` chip; the Edit/Cancel round trip asserts the *old* screen id is gone (`toHaveCount(0)`), not just that the new one appeared. |
| AC-B16 strings, exports, lane boundary | met | `__tests__/strings.test.ts`. Goes beyond the AC: `en.uf11` is pinned by reference, the D-0075 flow-shape regex is duplicated locally so a failure points here rather than at the shared test, exports pinned to exactly `["EditPlan","Plan"]`, both `<h1>` literals verified inside their own function bodies (the shell-test contract), a **shadow-catalogue** scan with a justified allowlist, an import-boundary scan (no other feature, no `lib/offline` internals, no Dexie, no `offlineDb(`, no `functions.invoke`, no `fetch`), a raw-colour/font scan on `plan.css`, and the three-dot `git diff` path check. |

### Definition of done
- Every AC has a passing test: **confirmed** (table above).
- Full web suite on the branch **857/857**; web 787 → 792, e2e 51 → 53.
- Contracts unchanged: `savePlan` writes exactly `area_targets {area_id, sets_per_14d, source}`, `profiles {goal, rhythm_min, rhythm_max, priority_areas}` and `plan_checkins {answer, answered_at}` as in `docs/data-model.md`; no Edge Function, no engine or token change. `checkin-evaluation.ts` is the single module-private evaluation, as Scope required, and is deliberately *not* exported (`strings.test.ts:55-62`) so T-0308c reuses it.
- Paths: all 20 files in lane. `check:repo`'s three `lane-path-not-owned` findings are the **known false positive** (files arrived via `git merge main`; the check derives paths from a stale `origin/main` because a push is blocked by a GitHub account issue). Filed as **T-0364**. Not counted against this ticket.
- Bundle: measured on a fresh build — entry **144.7 KB / 200 KB**, UF-11 chunk **3.9 KB / 100 KB** (T-0322 satisfied: a real build, not a claim).
- Principles held: one-task-on-screen is not implicated (UF-11 is out of `/session/*`, enforced by the T-0318 import ban); **principle 3** is pinned by AC-B3's stubbed date, AC-B10's three tests and the verified hard fault where the UI calls the engine then does its own rule-4 arithmetic (**12 failures**); **principle 4** is the whole point of the target-source labels and the withdraw-last ordering; D-0018's clamp filter is pinned.

### Unfalsifiable as delivered — recorded per the accept brief
Three of this ticket's own requirements had **no test that could fail** when the build handed back, each proven by a fault that passed the shipped suite **96/96**. The coverage came from **QA, not the build**:
- **AC-B10** ("not a UI recomputation") was half-proven: the contrast was call-count based, so a Save recomputing `previewTargets` with the same input returned the same value and passed — while the test's own comment claimed both halves. Independently reproduced: the value-identical recompute now fails exactly QA's two new tests and nothing else.
- **Scope/D-0081 §2** ("a later refresh never overwrites the draft/baseline") was untested — no test had ever mutated the cached profile under a mounted `EditPlan`. Two *real* faults passed 96/96: a per-render baseline (**Save would go dead the moment another device's plan landed**) and a remount-per-refresh (**would discard a half-finished edit mid-typing**). Now closed by `edit-plan.test.tsx:456-543`, which lands another device's plan through a real `refreshAll` seam and asserts the draft, the baseline in both directions, and non-remount via surviving transient hint state.
- **The render-loop guard** was jsdom-only; QA added the e2e mirror (`uf-11-plan.spec.ts:239-267`), which counts real `/rest/v1/profiles` requests — 51 instead of 4 under the fault.

Context, weighed explicitly: the interrupted run left **9 production files with no tests at all**, and they were not reviewed until after the fact. That is a process failure worth naming, and it is exactly how the three holes above survived. It is **not** grounds to reject this ticket: the implementation needed no change (code review read all 9 files as new code and found no must-fix and no hollow assertions), the resumed build found and fixed one real defect (the T-0307a trap in `use-plan-data.ts` — clock read at read time and a ref assigned during render, now pinned at mount and guarded by `__tests__/mount-stability.test.tsx`, which deliberately passes **no** `now` and a fresh clock identity per render), and all three gaps are now closed and fault-proven. The lesson belongs in the process, not in a rework loop on green, fault-proven code.

Residual, non-blocking: **T-0362** (ruled below), **T-0363** (`savingRef` never resets on success — safe only because `navigate()` unmounts; a latent footgun if a future ticket keeps the component mounted).

### Ruling on T-0362 (product question, not just a filed row)
**The window is acceptable for v1 as-is. T-0362 blocks nothing.**

The exposure is real but bounded and correctly chosen. On "(1) ok, (2) fails" the user's `area_targets` hold the new preview numbers labelled `From your plan` while `profiles` still holds the old goal/rhythm/priorities, so UF-11.2 briefly shows targets that don't match the inputs they were derived from. Three reasons that is the right trade for v1:

1. **The reverse order is strictly worse for principle 4.** If `profiles` were written first and the targets failed, the plan inputs would change while the numbers stayed old — still labelled `From your plan`, i.e. claiming to be derived from inputs they were *not* derived from, with no user-visible trace. The shipped order keeps the wrong-looking state on the side the user can see and fix.
2. **Step (3) never runs.** The withdraw-last order means a partial failure can never record an answer against a plan that didn't change — verified by test (moving the withdraw first → 12 failures). That is the invariant D-0070 §3 exists to protect, and it holds.
3. **The window is short and self-announcing.** The user sees `Couldn't update your plan. Try again.`, stays on `/plan/edit` with the draft intact, and the retry is stateless: it re-runs from (1) and converges. There is no silent state and no data loss. Targets are advisory inputs to a suggestion, not a log of what the user did, so a brief mismatch mis-suggests at worst — it never corrupts history.

The code follows D-0070 §3 exactly and its tests pin the split state honestly rather than papering over it, which is the right behaviour for a documented non-atomic sequence. D-0070's own "Revisit when" already names the trigger: **"Partial-failure reports appear. Then move the Accept writes into one Edge Function or RPC."** T-0362 is that follow-up and inherits that trigger — it is **not** a prerequisite for T-0308c or any other Phase 3 ticket. T-0362 should stay open at low priority, keep `lane: data` or `api` (it needs an RPC/Edge Function, which T-0308b's lane does not own), and be pulled forward only if telemetry or a user report shows the window actually biting. No decision change is needed: D-0070 is already `status: revisit` and anticipates exactly this.
