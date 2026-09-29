---
id: T-0308
title: UF-07.1 Routine builder, UF-11.2 Plan + UF-11.3 Edit plan, UF-11.1 Plan check-in card
lane: split → web-feature:UF-07 (T-0308a), web-feature:UF-11 (T-0308b, T-0308c)
screens: [UF-07.1, UF-11.1, UF-11.2, UF-11.3, UF-02.1]
decisions: [D-0018, D-0021, D-0027, D-0041, D-0050, D-0061, D-0067, D-0070]
deps: [T-0300, T-0202, T-0100b, T-0215, T-0223, T-0302, T-0318, T-0319]
status: ready
---
<!-- Groomed 2026-09-29 by product-owner. Build flow: wl-build-web. Split per flow (D-0067 §1); ACs tagged [a]/[b]/[c]. -->

## Why
- **Principle 4:** targets adapt to what the user actually does, and never silently. UF-11.1 renders `evaluateCheckin` (rule 9, now one period per D-0061 / T-0215) and asks before anything changes. UF-11.2 shows the plan, and UF-11.3 edits it.
- **Principle 1:** the card never shows on UF-03, UF-08 or UF-09 (D-0018).
- **Principle 3:** every number (proposal, preview targets, next check-in date) comes from the engine.
- **UF-07.1:** saved routines, cut to what the engine honours: ordered exercise lists (D-0070 §1).

## Split (D-0067 §1): the orchestrator edits the board
| Child | Lane | Scope | Deps | ~Size |
|---|---|---|---|---|
| T-0308a | web-feature:UF-07 | UF-07.1 routine editor at `/plan/routines/new` and `/plan/routines/:id` | T-0318, T-0319 (T-0100b done) | ½ day |
| T-0308b | web-feature:UF-11 | UF-11.2 Plan (incl. the routine list) + UF-11.3 Edit plan | T-0318, T-0319 (T-0202 done) | ½ day |
| T-0308c | web-feature:UF-11 | UF-11.1 `CheckinCard`: evaluate, insert row, Accept/Keep, offline, mounted on UF-11.2 and UF-02.1 | T-0308b, T-0215, T-0223, T-0302 | ½ day |

T-0308a can run in parallel with T-0308b. T-0308c follows T-0308b, because they share `features/UF-11`.

## Scope
- In:
  - [a] **UF-07.1:** name, the exercise list (add through an in-screen search picker over `kind: exercise`, remove, move up/down, 1–8 distinct), the read-only progression card, and Save/Delete online only (D-0070 §1–§2). "Cancel" returns to `/plan`.
  - [b] **UF-11.2:**
    - goal, rhythm ("{min}–{max} per week · {2·min}–{2·max} per 14 days"), priority areas
    - the 9 targets from `loadTargets()` with their source ("From your plan" / "Adapted {d MMM}" / "Set by you")
    - "First check-in on {date}" (when `periods` is empty) or "Next check-in: {date}", from `evaluateCheckin().nextCheckinDate`
    - the last 3 `plan_checkins` rows by `proposed_at` desc
    - "Routines": `loadRoutines()` linking to UF-07.1, and "New routine"
    - "Edit plan" → `/plan/edit`, and `<OfflineStatus variant="text">`
  - [b] **UF-11.3:**
    - goal (3 options), rhythm min/max steppers 1–7 with min ≤ max, priority chips (0–3, "Pick up to 3")
    - a live target preview from engine `previewTargets`
    - Save, online only, in the D-0070 §3 order
  - [c] **`CheckinCard`** (exported from `features/UF-11`):
    - evaluation: `evaluateCheckin(checkinSessions(loadSessions(), loadEngineHistory(), loadLibrary()), profile, loadCheckins(), now, tz)`
    - copy and preview per D-0070 §5
    - inserts the row on first show (D-0070 §4)
    - Accept/Keep (D-0070 §3), disabled offline (D-0070 §7)
    - mounted at the top of UF-11.2 and on UF-02.1 below C-01 (extra: the one mount line in `features/UF-02`)
- Out:
  - Starting a workout from a routine (a UF-08 follow-up).
  - Per-routine sets, reps or progression (D-0070 §1).
  - Manual per-area targets (PRD: out of scope v1).
  - Level/equipment editing (T-0216).
  - Account settings (T-0310).
  - The engine change (T-0215) and the schema change (T-0223).
  - Contracts.

### Edge cases that are in scope
- **Offline:**
  - The card renders from the cache, but Accept/Keep are disabled with "Connect to update your plan" and re-enable on `online` without a reload.
  - UF-11.3 Save and the UF-07.1 Save/Delete are disabled with "Connect to save".
  - The first-shown insert waits until online.
- **Zero history:** a new user sees "First check-in on {date}" and no card. After the first period ends with 0 sessions, a proposal appears (one period, D-0061).
- **Returning after 10 days off:** the engine decides. The card shows whatever `evaluateCheckin` returns for the last ended period, and the UI never counts.
- **Long absence:** exactly one card, from the last ended period.
- **Time running out:** not applicable. The card is never on `/session/*`.
- **Partial failure:** a failed step shows "Couldn't update your plan. Try again.", and later steps don't run (D-0070 §3).
- **Two devices:** a `23505` on the insert reads the existing row (D-0021).

## Acceptance criteria
- **Tests:** Vitest + Testing Library + `fake-indexeddb`, with Supabase spied, and Playwright where tagged **e2e**.
- **Fixtures** (from `docs/specs/uf-11-plan-checkin.md`, adapted to one period by D-0061):
  - Clock: tz Europe/Stockholm, onboarded `2026-08-02`, `plan_changed_at` 2026-08-02, no check-ins, rhythm 3–4, no priorities, targets 20/16/12 (`source default`).
  - Periods: P2 = 30 Aug–12 Sep, P3 = 13–26 Sep, P4 = 27 Sep–10 Oct. "Under" means < 4.2 completed sessions, "over" > 8.8.
- "Through the engine" means the real `@workoutlab/engine` after T-0215. "Stubbed" means a fixed `CheckinEvaluation`.

### T-0308a UF-07.1
- **AC-A1 (create)** Online at `/plan/routines/new`, with the name "Lower A", adding back-squat then romanian-deadlift, Save:
  - upserts `routines {id: <uuid v4>, name: "Lower A"}`
  - then deletes `routine_items` where `routine_id = id` and `position >= 2`
  - then upserts `[{routine_id: id, position: 0, exercise_id: "back-squat", sets: 3, reps_min: null, reps_max: null, duration_s: null, progression: "double_progression"}, {…position 1, "romanian-deadlift"…}]` `onConflict: "routine_id,position"`
  - in that order (spy), then navigates to `/plan`
- **AC-A2 (edit, reorder, remove)** Loading routine R [back-squat, rdl, leg-curl], moving leg-curl up once, removing back-squat and saving writes the positions [0: leg-curl, 1: rdl] and deletes `position >= 2`. The move buttons are named "Move leg-curl up" / "… down". They're disabled at the ends, and they work with the keyboard.
- **AC-A3 (limits)** The name is trimmed. An empty name or one over 40 chars disables Save with "Name your routine (up to 40 characters)". With 0 exercises, Save is disabled. An exercise already in the list shows "Added" in the picker and can't be added twice. With 8 items, the picker's add buttons are disabled with "Up to 8 exercises".
- **AC-A4 (no sets/reps/progression editing, D-0070 §1)** The screen has no input for sets, reps or progression. The progression card reads the D-0070 §1 text, with no "Change" control.
- **AC-A5 (delete)** On an existing routine, "Delete routine" → confirm → `from("routines").delete().eq("id", R)`, then `/plan`. `session_sets` is never touched (spy).
- **AC-A6 (offline)** With `navigator.onLine = false`, Save and Delete are disabled and "Connect to save" is shown. The routine loads from `loadRoutines()` with no network call awaited. When `online` fires, Save is enabled.
- **AC-A7 (errors)** A rejected item upsert shows "Couldn't save your routine. Try again.", keeps the edits on screen, and doesn't navigate. An unknown `:routineId` redirects to `/plan`.
- **AC-A8 (a11y)** Every control is ≥ 44 × 44 px, and the vitest axe helper finds 0 violations.

### T-0308b UF-11.2 / UF-11.3
- **AC-B1 (plan summary)** With the fixture, UF-11.2 shows "Build muscle" (goal), "3–4 per week · 6–8 per 14 days", "No priority areas", and 9 target rows reading "Chest 20 · From your plan" … "Calves 12 · From your plan". An adapted row with `updatedAt 2026-09-27T07:00:00Z` reads "Adapted 27 Sep".
- **AC-B2 (next / first check-in, engine date)**
  - Onboarded 2026-09-20 with no sessions, on 2026-09-27: "First check-in on 4 Oct", and no card.
  - Onboarded 2026-08-02, on 2026-09-27: "Next check-in: 11 Oct".
  - Both dates are `nextCheckinDate` through the engine, and a stubbed evaluation with `nextCheckinDate 2026-12-24` shows "24 Dec".
- **AC-B3 (last 3 check-ins)** Given 4 `plan_checkins` rows, UF-11.2 lists the 3 with the latest `proposed_at`, newest first. Each reads "{d MMM} · {before} → {proposed} per week · Accepted | Kept | Withdrawn | Waiting for you".
- **AC-B4 (routines list)** `loadRoutines()` = [Lower A, Upper B] → two links to `/plan/routines/<id>`, plus "New routine" → `/plan/routines/new`.
- **AC-B5 (edit plan + priorities, spec AC15)** On `/plan/edit`, selecting the priorities back, hamstrings and arms shows the preview "Back 25", "Hamstrings 20" and "Arms 15" (engine `previewTargets`, spied). Save:
  - (1) upserts 9 `area_targets` with those `sets_per_14d` and `source "default"`
  - (2) updates `profiles` `{goal, rhythm_min: 3, rhythm_max: 4, priority_areas: ["back","hamstrings","arms"]}`
  - (3) updates `plan_checkins` rows with `answer is null` to `answer "withdrawn"`, `answered_at = now`
  - in that order, then `refreshAll()`, then `/plan`
- **AC-B6 (4th priority blocked)** With 3 selected, tapping a 4th doesn't select it and shows "Pick up to 3". The selection stays at 3.
- **AC-B7 (rhythm bounds)** The min and max steppers stay within 1–7. Raising min above max raises max with it, and lowering max below min lowers min with it. The preview updates on each change.
- **AC-B8 (offline / failure)** Offline: Save is disabled and "Connect to save" is shown. If step (1) is rejected, steps (2) and (3) aren't called, and "Couldn't update your plan. Try again." is shown.
- **AC-B9 (a11y, e2e)** axe on `/plan` and `/plan/edit` finds 0 serious or critical violations. Every control is ≥ 44 × 44 px.

### T-0308c UF-11.1 CheckinCard
- **AC-C1 (one period → proposal, D-0061, through the engine)** P2 = 7 and P3 = 3. On 2026-09-27, UF-02.1 and the top of UF-11.2 show the card "You trained 3 times in your last 14-day period (13 Sep–26 Sep). Your plan is 6–8. Switch to 2–3 per week?", with Accept and Keep current and no close button.
- **AC-C2 (copy from the last period, engine proposal)**
  - A stubbed evaluation with `periods [{index 2, completed 4}, {index 3, completed 1}]` and proposal 2–3 uses the last period and the plural rule ("1 time", "{n} times"): "You trained 1 time in your last 14-day period (13 Sep–26 Sep)."
  - With one listed period, it reads the same from that period.
  - The proposed rhythm always comes from `proposal.rhythmMin/Max` (a stub with 5–6 shows "5–6", although the arithmetic would say 2–3).
- **AC-C3 (preview before → after)** For the AC-C1 proposal, the card lists 9 rows in the fixed order: "Chest 20 → 14", "Back 20 → 14", "Shoulders 16 → 11", "Arms 12 → 9", "Core 12 → 9", "Glutes 20 → 14", "Quads 20 → 14", "Hamstrings 16 → 11", "Calves 12 → 9" (`previewTargets`, R4-E3).
- **AC-C4 (on plan → no card)** P3 = 5 (5 ≥ 4.2 and ≤ 8.8): no card on 2026-09-27.
- **AC-C5 (over → step up)** P3 = 10 (> 8.8): "Step up to 4–5 per week?".
- **AC-C6 (floor and ceiling, spec AC12/AC17)**
  - Rhythm 1–2 with P3 = 0 reads "…Your plan is 2–4. Switch to 1–1 per week?", and "0–1" isn't in the DOM. Rhythm 1–1 with P3 = 0: no card.
  - Rhythm 6–7 with P3 = 16 reads "Step up to 7–7 per week?", and "7–8" isn't in the DOM. Rhythm 7–7: no card.
- **AC-C7 (first-shown insert, D-0070 §4)** When the AC-C1 card first renders online, `plan_checkins` gets one insert: `{period_index: 3, completed_last: 3, completed_prev: <7 if the engine lists P2 before P3, else null (T-0223)>, rhythm_min_before: 3, rhythm_max_before: 4, proposed_min: 2, proposed_max: 3, proposed_at: now, answer: null, answered_at: null}`. A second render doesn't insert again. A `23505` leads to a select of the existing row and no error UI. Offline, there's no insert until the next online render. A stubbed evaluation whose last period has `index: 0` inserts `period_index: 0` (valid after T-0223).
- **AC-C8 (accept, spec AC7)** Accept on 2026-09-27:
  - (1) upserts 9 `area_targets` with `sets_per_14d` from `proposal.previewTargets` and `source "adapted"`
  - (2) updates `profiles` `rhythm_min 2, rhythm_max 3`
  - (3) updates the row to `answer "accepted"`, `answered_at = now`
  - in that order (spy), then `refreshAll()`, and the card is gone
  - If (1) is rejected, (2) and (3) aren't called, "Couldn't update your plan. Try again." is shown, and the card stays.
- **AC-C9 (keep, spec AC8)** Keep current updates only the row, to `answer "kept"`, `answered_at = now`. `profiles` and `area_targets` get no writes (spy), and the card is gone.
- **AC-C10 (never silent, spec AC6)** With the AC-C1 proposal pending, 5 remounts of UF-02.1 on 5 different fake days (27 Sep–1 Oct) make no `profiles` or `area_targets` writes, and the card is shown each time.
- **AC-C11 (never in a workout, principle 1, spec AC9)** With the AC-C1 proposal cached, rendering the router at `/session/setup`, `/session/S1` and `/session/S1/summary` puts no element with the card's test id or text in the DOM. `/` shows it. ESLint on `features/UF-03|UF-08|UF-09` importing `features/UF-11` reports `no-restricted-imports` (T-0318).
- **AC-C12 (offline, spec AC10)** With `navigator.onLine = false`, the card is visible, Accept and Keep current are `disabled`, and "Connect to update your plan" is shown. Dispatching `online` (with `navigator.onLine` true) enables both without a remount.
- **AC-C13 (placement)** On UF-02.1, the card follows the C-01 compact region in DOM order. On UF-11.2, it's the first child of the main content.
- **AC-C14 (e2e)** Preview build, a mocked Supabase with the AC-C1 data: `/` shows the card, and Accept makes the three expected requests in order and removes the card. axe on `/` with the card finds 0 serious or critical violations.

## Paths you may change
- [a] `apps/web/src/features/UF-07/**`, `apps/web/src/lib/i18n/flows/uf-07.ts` (extra).
- [b] `apps/web/src/features/UF-11/**`, `apps/web/src/lib/i18n/flows/uf-11.ts` (extra), `tests/e2e/plan.spec.ts` (extra, new file).
- [c] `apps/web/src/features/UF-11/**`, `apps/web/src/lib/i18n/flows/uf-11.ts`, the one `CheckinCard` mount in `apps/web/src/features/UF-02/**` (extra, D-0067 §4; after T-0302), `tests/e2e/checkin.spec.ts` (extra, new file).

## Contract impact
- None in this ticket. Writes use `profiles`, `area_targets`, `plan_checkins`, `routines` and `routine_items` exactly as in `docs/data-model.md`.
- The one-period `plan_checkins` fields (`period_index >= 0`, nullable `completed_prev`) and `CheckinPeriod.index`/`PlanCheckin.periodIndex` with `minimum 0` are T-0223 (data lane, D-0070 §6). T-0308c depends on it.
- The UF-11 spec copy update is a product follow-up (D-0070 §5).

## Definition of done
Tests for every AC in the child pass · `pnpm -w typecheck lint test --force --concurrency=1` green · e2e green for tagged ACs · `check:size` green · contracts unchanged · commits start `T-0308a:`/`b:`/`c:` with screen IDs (e.g. `T-0308c UF-11.1: accept writes targets first`).
