---
id: T-0302b
title: "UF-02.2 Workout preview at /?view=preview: the 45-min suggest() output as it is — summary chips, warm-up row, numbered items with sets × reps, rest, pre-fill weight and reason, links to UF-04.2, Start → UF-08.1"
lane: web-feature:UF-02
screens: [UF-02.2, UF-02.1, UF-04.2, UF-08.1]
decisions: [D-0065, D-0071, D-0079, D-0106, D-0109, D-0124, D-0158, D-0168]
deps: [T-0302c]
status: ready
---
<!-- Groomed 2026-10-03 by product-owner (D-0168 §3). Child of docs/tickets/T-0302-today-and-preview.md
(parent AC-B1–B5). Build flow: wl-build-web. About ⅓ day. T-0302c is on main; T-0303b is too, so
the old reason for waiting on it (lib/i18n/workout.ts keys) is gone, and this ticket doesn't list
workout.ts (it only imports it). -->

## Why
UF-02.1's card shows the first three exercises of the 45-min preview. "See all" (`/?view=preview`,
T-0302c) promises the whole list, with the engine's one-line "why" per exercise (user flows v2
principle 4), so the user knows what's coming and what equipment they need before they say how
long they have. Today `/?view=preview` still renders UF-02.1. Everything shown is the engine's
`suggest()` output as it is (principle 3); Start still goes through the time question (principle
2).

## Scope
- In:
  - **The switch.** `features/UF-02/index.tsx` keeps exporting exactly `Today`, but it becomes a
    small component that renders `WorkoutPreview` when `useSearchParams().get("view") ===
    "preview"`, and the existing Today screen otherwise (D-0168 §3). `Today.tsx` itself isn't
    edited. The route row stays as it is.
  - **`WorkoutPreview`** (new, for example `Preview.tsx`), `[data-screen-id="UF-02.2"]`, `<h1>`
    `en.uf02.preview.title` ("Suggested for 45 min"). It calls `useToday(now, timeZone, signedIn)`
    with the same injected `now`/`locale`/`timeZone` seams as Today, so it shows the same
    `Workout` the card shows (`PREVIEW_INPUT`, one `suggest` call per mount).
    - A Back link (`en.uf02.preview.back` "Back", `href="/"`, ≥ 44 × 44 px).
    - Summary chips: `~{ceil(totalS / 60)} min` when `warmupInBudget`, else `~{ceil(itemsTotalS /
      60)} min`; `{n} sets` = Σ `sets` + one per item with a `backoff`; the equipment union of the
      items in plan order, first appearance wins, `none` dropped, each labelled from
      `en.uf04.equipment` (read-only; an unknown id prints raw, D-0079 §5), joined " · ". No
      equipment chip when the union is empty.
    - Warm-up row when `plan.warmup` isn't empty: "Warm-up", the move names (library names) joined
      ", ", and "3 min" (`WARMUP_COST_S / 60`) when `warmupInBudget`, "not counted" when it isn't.
    - `<ol>`, one `<li>` per item in plan order (never re-sorted). Each has: the exercise name as a
      link to `/library/<exerciseId>` (UF-04.2); a detail line `itemSummary(item)` · weight part ·
      `rest {restLabel(s)}`; a back-off line like UF-08.2's when `backoff` isn't null; and
      `itemReasonLine(item.reasons)` (left out when empty).
    - Weight part (D-0124, as UF-08.2): "Bodyweight" when the library says `externalLoad: false`;
      else `formatKg(prefill.weightKg, locale)` when it isn't null; else nothing. A timed item has
      no weight part.
    - Rest `s` = `REST_COMPOUND_S` when the library `type` is `compound`, else `REST_ISOLATION_S`
      (engine constants).
    - "Start workout" → `/session/setup` (UF-08.1).
    - States: `loading` → a skeleton (no rows); `ready` with `workout` null or `plan.items` `[]` →
      "Nothing suggested yet" (T-0302c's key, reused), the warm-up row if any, Start enabled;
      `no-plan` → Today's no-plan line, Start enabled.
  - **Strings** in `flows/uf-02.ts` (added keys only, multi-line): `preview.title`, `preview.back`,
    `preview.minutes(n)`, `preview.sets(n)`, `preview.warmup`, `preview.warmupMinutes(n)`,
    `preview.warmupNotCounted`, `preview.rest(label)`, `preview.listName`.
  - **e2e** appended to `tests/e2e/uf-02-today.spec.ts`.
- Out:
  - Swap or Edit on UF-02.2 (swaps are UF-08.3, T-0303c). A budget picker (UF-08.1 asks).
  - The check-in and resume slots (they belong on UF-02.1 only).
  - Editing `lib/i18n/workout.ts`, `flows/uf-04.ts`, `Today.tsx`, `slots.tsx` or the route row.
  - Any contract change.

### Edge cases that are in scope
- **Offline:** the preview reads only the device cache; offline after one online load it renders
  the same list (AC-6).
- **Zero history:** a new user's first plan has first-time pre-fills with `weightKg` null: no
  weight text, never "0 kg" or "null" (AC-3).
- **Time running out:** the heading names the 45-min assumption; Start always goes to UF-08.1
  (AC-1, AC-4).
- **Returning after 10 days off:** nothing special: the engine's plan is rendered as it is (rule 6
  recovery and deficits are the engine's).

## Acceptance criteria
Vitest + Testing Library with the UF-02 helpers (`__tests__/helpers.tsx`, `fixtures.ts`),
`now = 2026-09-27T10:00:00Z`, `timeZone` "UTC", `locale` "en-GB", and a `suggest` spy returning
W-R7E4 with `plan.warmup` set to four warm-up ids. Test library: bench-press (compound, equipment
`["barbell","bench","rack"]`, external load), inverted-row (compound, `["barbell","rack"]`,
`externalLoad: false`), leg-extension (isolation, `["machine"]`, external load), plus the four
warm-up moves. Each new test title starts with `T-0302b AC-n`.

- **AC-1 (route, red on main)** `/?view=preview` renders `[data-screen-id="UF-02.2"]` and no
  `UF-02.1`; the heading reads "Suggested for 45 min". The Back link (`href="/"`) leads to UF-02.1;
  so does the browser Back after arriving from "See all". C-02 is visible on both. `/` without
  `view`, and `/?view=other`, render UF-02.1 only. **Red:** on main `/?view=preview` renders UF-02.1.
- **AC-2 (W-R7E4 as it is, principle 3)** Chips: "~29 min" (`ceil(1725/60)`), "9 sets", "Barbell ·
  Bench · Rack · Machine". Warm-up row: "Warm-up", the four library names joined ", ", "3 min"; with
  `warmupInBudget` false, "not counted" and the minutes chip is `ceil(itemsTotalS/60)` = "~26 min".
  Rows, in order: "Bench press" / "4 × 6–8 · rest 2:00" / "Main lift · Chest 100 % below target";
  "Inverted row" / "3 × 8–12 · Bodyweight · rest 2:00"; "Leg extension" / "2 × 10–15 · rest 1:00".
  A fixture with the items reversed renders reversed.
- **AC-3 (weight part)** bench-press `prefill.weightKg` 80 → its detail contains `80 kg`
  (`formatKg`, with a no-break space); `null` → no kg text, and the row text contains neither
  "0 kg" nor "null"; `externalLoad: false` → "Bodyweight" even when `weightKg` is 0; a timed item
  (`durationS` 45, `repsMin` null) shows "3 × 45 s" and no weight. An item with `backoff` `{weightKg:
  70, reps: 6}` shows UF-08.2's back-off line, and the sets chip counts it (+1).
- **AC-4 (links)** Each exercise name is a link to `/library/<exerciseId>`. "Start workout" goes to
  `/session/setup`. There is no button or link named Swap, Remove, Edit or Shuffle.
- **AC-5 (states, both values)** `loading`: the skeleton, no `<li>`, no "Nothing suggested yet".
  `workout` null and `plan.items` `[]` each: "Nothing suggested yet" and Start enabled. `no-plan`:
  Today's no-plan line and Start. `suggest` is called exactly once per mount with `PREVIEW_INPUT`.
- **AC-6 (offline)** With `navigator.onLine = false` and a `fetch` spy over a seeded cache, AC-2's
  content renders and `fetch` isn't called.
- **AC-7 (e2e + a11y)** In `uf-02-today.spec.ts`: after one online load, "See all" opens UF-02.2
  with an `<ol>` whose `<li>` count equals the plan's item count and the first row equals the card's
  first row; axe reports 0 serious or critical violations on `/?view=preview`; Back and Start are
  each ≥ 44 × 44 px; offline, a reload of `/?view=preview` shows the same rows (D-0091 §1: assert
  built content).
- **AC-8 (exports, strings, boundaries, no regression)** `features/UF-02/index.tsx` exports exactly
  `Today`. `jsx-no-literals` is green; `flows/uf-02.ts` keeps its multi-line shape. The diff edits
  neither `Today.tsx` nor `slots.tsx` (build-log check, not a test). Every existing
  `features/UF-02/__tests__/*` test passes unedited.

**Red proof.** Run AC-1 on main before the fix: it fails. Plant one fault on a backup copy (sort the
rows by name): AC-2's reversed-fixture row must fail. Record both in the build log.

## Paths you may change
- `apps/web/src/features/UF-02/**` (the lane: `web-feature:UF-02`), except `Today.tsx` and
  `slots.tsx`, which this ticket leaves alone (D-0168 §3).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-02.ts`
  - `tests/e2e/uf-02-today.spec.ts`
  - `docs/tickets/T-0302b-workout-preview.md`
- Notes on the extras: the strings file gets added keys only (D-0071 §1); the e2e spec gets
  appended rows (D-0071 §10); this ticket file is for the build and accept logs.
- Read-only imports (not grants): `lib/i18n/workout.ts`, `lib/i18n/flows/uf-04.ts` (through `en`),
  `lib/format`, `lib/offline`, `@workoutlab/engine`, `@workoutlab/shared`.

## Contract impact
None. It renders `Workout` (`api/openapi.yaml`) from the on-device engine.

## NFRs owned
A11Y-1/2 on UF-02.2 (AC-7), OFF-1 for UF-02.2 (AC-6, AC-7).

## Definition of done
Tests for every AC pass · `uf-02-today.spec.ts` green (one feature folder, so not the whole web
e2e, D-0158) · `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
`-w format:check`, `node .github/scripts/check-all.mjs` and `check:size` (fresh build, numbers in
the log) green, each test command inside `flock /tmp/workoutlab-tests.lock` · contracts unchanged ·
commits start `T-0302b` and cite UF-02.2 (for example `T-0302b UF-02.2: workout preview`).

## Notes
- **Flow:** `wl-build-web`.
- **Parallel.** Runs beside T-0303c, T-0310d, T-0308c, T-0304h and T-0468 (no shared file). With
  T-0395 it shares only `tests/e2e/uf-02-today.spec.ts` (both append): parallel is fine, and the
  second to merge keeps both appended blocks. T-0471 later edits `slots.tsx`, which this ticket
  doesn't touch.

## Build / accept log
