---
id: T-0302
title: UF-02 Today + workout preview — compact C-01 as one link to /balance fed from BalanceResult.areas, attention areas, a 45-min suggestion preview, Start → UF-08.1
lane: web-feature:UF-02
screens: [UF-02.1, UF-02.2]
decisions: [D-0002, D-0003, D-0013, D-0017, D-0045, D-0060, D-0063, D-0065, D-0067, D-0071]
deps: [T-0300, T-0203b, T-0318]
status: split   # → T-0302a, T-0302b; T-0302a becomes ready when T-0318 is done
---
<!-- Reconciled by triage 2026-09-29 (TR-0030, D-0071 §4): the UF-11.1 card is mounted through features/UF-02/slots.tsx (AC-A11), not by T-0308c editing Today.tsx. -->
<!-- Groomed 2026-09-29 by product-owner. Split into T-0302a/b. ACs are tagged [a]/[b]. -->

## Why
UF-02.1 is the daily entry point (PRD): what's under target in the rolling 14 days, and a Start button that always goes through the time question (principle 2). It must open offline from the cache (NFR-OFF-1, T-0300c AC-C20 already renders its stub). The compact C-01 from `apps/web/src/components/body-map` (T-0300d, D-0060) is mounted here as **one link to `/balance`**, fed only from `BalanceResult.areas` (principle 3: fill = `coverageStep`, outline = `needsAttention`). UF-02.2 shows the whole suggested workout with the engine's one-line "why" per exercise (user flows v2 principle 4).

## Split (the orchestrator edits the board)
Parent `T-0302` → `split → T-0302a, T-0302b`.

| Child | Scope | Deps | Status | ~Size |
|---|---|---|---|---|
| T-0302a | UF-02.1 Today frame (C-01, attention line, slot, states, Start). Ticket: `docs/tickets/T-0302a-today.md` | T-0300, T-0203b, T-0318 | ready | ½ day |
| T-0302c | UF-02.1 suggestion card + `lib/i18n/workout.ts` formatters. Ticket: `docs/tickets/T-0302c-suggestion-card.md` | T-0302a | todo | ⅓–½ day |
| T-0302b | UF-02.2 Workout preview (`/?view=preview`) | T-0302c, T-0303b | todo | ¼ day |

<!-- 2026-10-02 (D-0106): T-0302a was re-split. The card and workout.ts moved to T-0302c. The child ticket files supersede the [a] ACs below where they differ, in particular the swap copy in AC-A9 (D-0106 §5). -->
T-0302b waits for T-0303b only because both render the reason copy in `lib/i18n/workout.ts`. T-0303b may add keys to that file, and T-0302b reuses them.

## Scope
- In:
  - [a] `features/UF-02` Today: date header, `<OfflineStatus variant="text">`, compact C-01, the attention line, the "Suggested for 45 min" card (D-0065 §1), Start → `/session/setup`, "See all" → `/?view=preview`, and the loading, zero-history and no-profile states. The on-device `balance()` and `suggest()` with a 3 s-capped `refreshAll` when online (D-0063 §3). `lib/i18n/workout.ts`: `itemSummary`, `restLabel`, `reasonLine`, `sessionReasonChips`, `areaName`.
  - [b] UF-02.2 at `/?view=preview`: Back → `/`, summary chips, warm-up row, numbered items linking to `/library/:id` (UF-04.2), per-item line and reason, Start.
- Out: UF-11.1 check-in card (T-0308c fills it through `features/UF-02/slots.tsx`, its only UF-02 grant, D-0071 §4. T-0302a creates `slots.tsx` exporting `todayCheckinSlot: ComponentType | null = null`, renders it after the C-01 compact region and the attention line and before the suggestion card, and adds no import of `features/UF-11`, AC-A11); split names, greeting, week counter, "This week"/"Latest PR" cards (D-0065 §1); the "empty or quick 20-min workout" link; Swap/Edit on UF-02.2 (swaps happen on UF-08.3 before the start; routines are T-0308); the full C-01 and UF-10 (T-0307); changing C-01 itself (web-shell); any contract change.

### Edge cases that are in scope
- **Offline:** cold start offline renders UF-02.1 from IndexedDB with "Offline · last synced HH:MM" (AC-A6). The balance includes queued sets (AC-A2). Start still works (UF-08 is offline-capable).
- **Time running out:** Start is always one tap to UF-08.1. The preview is labelled with its 45-min assumption, so it never promises a length the user hasn't chosen (AC-A4).
- **Zero history:** C-01 shows 9 × "0 / target", there is no attention line, the "No workouts yet" line shows, and the suggestion card still renders the engine's plan (AC-A5).
- **Returning after 10 days off:** R5-E1 history gives the attention line "Needs attention: Chest, Back, Shoulders +6 more" in the engine's order (AC-A3).

## Acceptance criteria
Vitest + Testing Library in `apps/web/src/features/UF-02/**` and `apps/web/src/lib/i18n/**`, with `lib/offline` loaders mocked unless stated. Fixtures: F-tz (`now = 2026-09-27T12:00:00+02:00`, `Europe/Stockholm`, en-GB), F-targets. **W-R7E4** = the `Workout` example in `api/openapi.yaml` (bench-press × 4 6–8, inverted-row × 3 8–12, leg-extension × 2 10–15, `totalS` 1725, `sessionReasons` chest/back/quads).

### T-0302a UF-02.1 Today
- **AC-A1 (C-01 compact, D-0045 §4, D-0060)** Given a `BalanceResult` whose `areas` are in the engine's sorted order, Then `<BodyMap variant="compact">` from `components/body-map` receives exactly `result.areas` (reference-equal, spy). The screen has exactly one link to `/balance` for the map (accessible name `bodyMap.compactLink`), and none of the 9 areas is in the tab order. Clicking it lands on `[data-screen-id="UF-10.1"]`. A source test finds no `coverageStep` or `needsAttention` derivation in `features/UF-02` (no `load / target` arithmetic).
- **AC-A2 (on-device balance with queued sets, principle 3)** With the real `@workoutlab/engine` and a library containing romanian-deadlift, given 4 cached hard RDL sets on 2026-09-20 and 3 queued ones on 2026-09-26 (`loadEngineHistory` real, `fake-indexeddb`), Then the hamstrings tile reads "7 / 16" and glutes "3.5 / 20" (R11-E4 pattern). The screen calls `balance(history, targets, library, now, tz)` once per load, and makes no `GET /balance` or `POST /workouts/suggest` request (fetch spy).
- **AC-A3 (attention line, returning after 10 days off)** Given the R5-E1 history (4 RDL sets on 09-17 only) at F-tz, Then the line reads "Needs attention: Chest, Back, Shoulders +6 more", taking the first 3 `needsAttention` areas in `result.areas` order, and "+6 more" links to `/balance`. Given a history where no area needs attention, Then there is no attention line.
- **AC-A4 (suggestion card, D-0065 §1)** Given `suggest` (spy) returns W-R7E4, Then it was called with `{budgetMin: 45, warmupInBudget: true, energy: "normal", shuffle: 0, mainLiftId: null, pinnedIds: [], excludeIds: []}`, and the card shows "Suggested for 45 min", "3 exercises · ~29 min" (`ceil(1725 / 60)`), the rows "Bench press 4 × 6–8", "Inverted row 3 × 8–12", "Leg extension 2 × 10–15" in plan order, and the chips from `sessionReasons` ("Chest", "Back", "Quads"). With 5 items, only the first 3 rows show plus "+2 more" and "See all" → `/?view=preview`. A timed item renders "3 × 45 s" from `item.durationS`. The primary "Start workout" navigates to `/session/setup` (UF-08.1). Given `plan.items` = `[]`, Then the card reads "Nothing suggested yet" and Start is still enabled.
- **AC-A5 (zero history)** Given empty history and F-targets, Then all 9 tiles read "0 / <target>", there is no attention line, "No workouts yet. Start your first one." shows above Start, and the card renders whatever `suggest` returns.
- **AC-A6 (offline cold start, NFR-OFF-1/OFF-6, e2e)** Extends the T-0300c pattern in a new spec: after one online load with mocked Supabase (12 exercises, 9 targets, 5 sets), going offline and reloading `/` shows `UF-02.1` within 3 s, the text "Offline · last synced HH:MM", 9 C-01 tiles with numeric labels, and the suggestion card. Every request goes to the preview or Supabase origin (NFR-AN-1).
- **AC-A7 (loading and refresh)** Before the loaders resolve, C-01 renders `loading` and the card shows a skeleton, with no layout jump bigger than the reserved card height (CLS: the card has a fixed min-height). When online, `refreshAll` runs once per mount, and the screen recomputes after it resolves or after 3 s, whichever comes first (fake timers). A rejected `refreshAll` keeps the cached render with no `role="alert"`.
- **AC-A8 (no profile / targets)** Given `loadProfile()` null or fewer than 9 targets, and the gate status `unknown` (offline), Then the screen shows "Connect to finish setting up your plan" and no suggestion card, and `suggest`/`balance` aren't called (they would throw on a missing profile).
- **AC-A9 (formatters, `lib/i18n/workout.ts`)** `itemSummary({sets: 4, repsMin: 6, repsMax: 8, durationS: null})` = "4 × 6–8". `repsMin === repsMax === 5` → "4 × 5". `{sets: 3, repsMin: null, durationS: 45}` → "3 × 45 s". `restLabel(120)` = "2:00", `restLabel(60)` = "1:00". `reasonLine`: `main_lift` → "Main lift"; `area_deficit {hamstrings, 0.625}` → "Hamstrings 63 % below target" (the UI rounds %, rule 5: half up); `days_since {quads, null}` → "Quads not trained yet"; `days_since {quads, 1}` → "Quads last trained 1 day ago" and `…, 12` → "… 12 days ago"; `recovering_skipped {quads}` → "Quads recovering, skipped"; `energy_low_trim` → "Trimmed for low energy"; `energy_high_backoff` → "Back-off set added"; `swap {variety}` → "Swapped for variety" and `swap {null}` → "Shuffled"; `prefill` codes → "" (not a "why" line). The line for an item joins its non-empty codes in `reasons` order with " · ", at most 2. Every string lives in the file (the jsx-no-literals lint is green).
- **AC-A10 (a11y + perf, e2e)** axe on `/` reports 0 serious/critical (NFR-A11Y-1). Start and "See all" are ≥ 44 × 44 px (NFR-A11Y-2). `check:size` keeps the UF-02 chunk ≤ 100 KB gzip (NFR-PERF-2). The engine runs after the first paint (the h1 is in the DOM before `balance` is called: spy order).

- **AC-A11 (check-in slot, D-0071 §4)** `features/UF-02/slots.tsx` exports `todayCheckinSlot`, which is `null` in this ticket (a test pins it), and `features/UF-02` has no import of `features/UF-11` (source test). With a test component injected, it renders exactly once, after the C-01 compact region and the attention line (or right after C-01 when there's no attention line) and before the suggestion card in DOM order. With `null`, nothing renders there and there's no layout gap. Today renders the slot inside a `Suspense` with a `null` fallback, so a lazy component doesn't block the first paint (AC-A10).

### T-0302b UF-02.2 Workout preview
- **AC-B1 (route, D-0063 §2)** `/?view=preview` renders `[data-screen-id="UF-02.2"]` and not UF-02.1. Back (a 44 px link named "Back") returns to `/`. The browser Back from preview lands on UF-02.1. C-02 is visible (it is the `/` route).
- **AC-B2 (render W-R7E4 as is, principle 3)** The chips read "~29 min", "9 sets" (Σ `sets` + back-off sets) and the equipment union of the items in plan order with "none" dropped (library names, e.g. "Barbell · Bench · Rack · Machine"). A warm-up row lists the 4 `plan.warmup` moves by library name with "Warm-up · 3 min" when `warmupInBudget` is true, and "Warm-up · not counted" when it's false. Then 3 numbered rows in plan order: "Bench press" / "4 × 6–8 · rest 2:00" / "Main lift · Chest 100 % below target". "Leg extension" shows "rest 1:00" (`REST_ISOLATION_S` from the engine by library `type`). No row is re-sorted: a fixture with the items reversed renders reversed.
- **AC-B3 (pre-fill weight)** `prefill.weightKg` 80 → "· 80 kg". `null` → no weight text (never "0 kg" and never "null"). An `externalLoad: false` exercise → "· Bodyweight". A timed item shows "3 × 45 s" with no weight.
- **AC-B4 (links)** Each exercise name links to `/library/<exerciseId>` (UF-04.2). Start navigates to `/session/setup`. There is no Swap or Edit control.
- **AC-B5 (a11y, e2e)** axe on `/?view=preview` reports 0 serious/critical. The list is a `<ol>` with one `<li>` per item.

## Paths you may change
- `apps/web/src/features/UF-02/**`.
- Extras (D-0071 §1, §10): `apps/web/src/lib/i18n/flows/uf-02.ts` (created empty by T-0318), `apps/web/src/lib/i18n/workout.ts` (new, created by T-0302c per D-0106; T-0302b may add keys; never in parallel with T-0303b or T-0302c), `tests/e2e/uf-02-today.spec.ts` (new; T-0302b appends).
- `features/UF-02/slots.tsx` is the one UF-02 file T-0308c may edit later. Keep its export stable.
- Read-only imports: `components/body-map`, `components/offline-status`, `lib/offline`, `lib/format`, `lib/i18n/en.ts` (area names), `@workoutlab/engine`, `@workoutlab/shared`.

## Contract impact
none. It only renders `BalanceResult` and `Workout` (`api/openapi.yaml`) from the on-device engine. Defaults: D-0063, D-0065.

## NFRs owned
OFF-1 UF-02.1 content (AC-A6), OFF-6 on UF-02.1 (AC-A6), PERF-1 layout part (AC-A7; Lighthouse CI is T-0402), PERF-2 chunk (AC-A10), A11Y-1/2/3 on UF-02 (AC-A1, AC-A10, AC-B5), AN-1 (AC-A6).

## Definition of done
Tests for every AC in the child pass · `pnpm -w typecheck lint test --force --concurrency=1` green · e2e green for the child · `check:size` green · contracts unchanged · commits start with the child id and cite UF-02.1 / UF-02.2.
