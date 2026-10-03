---
id: T-0308c
title: "UF-11.1 CheckinCard, read side: evaluate through the shared helper, one-period copy from the last period, before → after preview, no card on plan or at the clamp, actions disabled offline; exported, not yet mounted"
lane: web-feature:UF-11
screens: [UF-11.1]
decisions: [D-0018, D-0061, D-0070, D-0071, D-0075, D-0158, D-0166, D-0168]
deps: [T-0308b, T-0215, T-0223, T-0302a]
status: ready
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
