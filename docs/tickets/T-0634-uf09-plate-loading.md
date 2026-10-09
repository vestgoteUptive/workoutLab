---
id: T-0634
title: "UF-09.3 plate loading: \"Each side 25 + 15 kg\" / \"Bar only\" under the weight line for barbell lifts, fewest-plates exact loading from the cached bar and plates, no line when no exact loading"
lane: web-feature:UF-09
screens: [UF-09.3]
decisions: [D-0217, D-0218, D-0066, D-0212, D-0208]
deps: [T-0621, T-0632]
status: todo
---
<!-- Written by product-owner 2026-10-09 (spec, D-0217 §1). Flow: wl-build-web (agent frontend-dev). About ½ day. Canvas: "In session · set" (#turn-3). Spec: docs/specs/cobalt-mock-behaviour.md §3.1. Last ticket of the UF-09 folder chain (after T-0621); never in parallel with T-0580. -->

## Why
At the rack the lifter has to turn "100 kg" into plates in their head. The mock shows the answer under the weight ("Each side 25 + 15 kg"), and the owner promoted it (H-34). It stays part of UF-09.3's one task (principle 1) and never changes the weight the engine chose (principle 3).

## Scope
- **In:**
  - `features/UF-09/plates.ts`: pure `plateLoading(weightKg, barbell): { kind: "bar" } | { kind: "plates"; perSide: number[] } | null`, the D-0217 rule (spec §3.1): per side `(W − bar) / 2` in whole hundredths; odd hundredths → null; 0 → bar; else the fewest plates summing exactly, ties to the lexicographically greatest largest-first list; none → null. No clock, no randomness.
  - `load.ts` adds `barbell` to `FocusCtx` from `loadBarbell()` (T-0632), read with the library; a read failure gives the default (that's `loadBarbell`'s contract).
  - `current-set.tsx` renders `<p className="wl-uf09__plates" data-part="plates">` directly after the weight × reps line and before the cue, only when the exercise's `equipment` includes `"barbell"`, `externalLoad` is true, `timed` is false, the shown weight (`prefill.weightKg`, including the back-off and in-session pre-fills) is not null and `plateLoading` isn't null.
  - Copy in `flows/uf-09.ts`: `platesLabel` "Each side", `platesValue(list)` "25 + 15 kg" (each size via `formatKg`, joined " + ", then " kg"), `barOnly` "Bar only".
  - Style: the plan/lift caption role under the load line, 1 px hairlines above and below as on the canvas, no new token.
- **Out:** UF-09.4, UF-09.5, UF-09.6, UF-03.1 and UF-08 (spec §3.1); a "closest load" hint; lb.

## Acceptance criteria
- **AC1 (rule, vitest).** `plateLoading` returns, for bar 20 and the default plates: 100 → [25, 15]; 60 → [20]; 102.5 → [25, 15, 1.25]; 140 → [25, 25, 10]; 20 → bar; 15 → null; 101 → null; 100.01 → null. Each is a case.
- **AC2 (fewest and ties).** Plates [20, 15, 10], W 80 → [20, 10] (not [15, 15]); plates [15, 10], W 60 → [10, 10]; plates [], W 60 → null and W 20 → bar; bar 15 with the defaults, W 55 → [20].
- **AC3 (bounds).** W 300 with the defaults returns a list summing to 140 per side within 50 ms in vitest; `plateLoading` reads no clock (source scan).
- **AC4 (render).** Given a back-squat item (barbell, external load) pre-filled at 100 kg and the default barbell, When UF-09.3 renders, Then the text "Each side 25 + 15 kg" is the element directly after the load line and before the cue.
- **AC5 (bar only and none).** At 20 kg the line reads "Bar only" with no "Each side"; at 101 kg no `data-part="plates"` exists and the load and cue are unchanged.
- **AC6 (not a barbell lift).** A dumbbell lift, a bodyweight lift, a timed hold and a barbell lift with a null weight ("Set weight") render no plate line. Four cases.
- **AC7 (follows the weight).** After UF-09.4 saves 105 kg for set 1, set 2's UF-09.3 shows "Each side 25 + 15 + 2.5 kg"; a back-off set at 85 kg shows "Each side 25 + 5 + 2.5 kg".
- **AC8 (settings).** With a cached barbell `{ barKg: 15, platesKg: [20, 10] }`, 75 kg shows "Each side 20 + 10 kg".
- **AC9 (only UF-09.3).** On UF-09.4 for the same set, no `data-part="plates"` exists.
- **AC10 (offline, e2e).** In `uf-09-offline.spec.ts`, with the network cut after the cache is warm, a 100 kg barbell set shows "Each side 25 + 15 kg"; with a cache written before T-0632 (no barbell field) it shows the default loading too.
- **AC11 (a11y and look).** Axe colour-contrast has 0 violations on UF-09.3 in the lift state with the line; the line isn't focusable and isn't a live region.
- **AC12 (no regressions).** The UF-09 vitest suite and `uf-09-focus.spec.ts` pass; any changed assertion is logged.

Checklist (D-0197 §7):
- Line and no line, bar only and plates, barbell and not, default and custom barbell, and online and offline are all covered.

## Paths you may change
- `apps/web/src/features/UF-09/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-09.ts` (own flow file)
- `tests/e2e/uf-09-offline.spec.ts`, `tests/e2e/uf-09-focus.spec.ts` (listed extras)
- `docs/tickets/T-0634-uf09-plate-loading.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `uf-09-focus.spec.ts` and `uf-09-offline.spec.ts` green · commit messages start with `T-0634` and cite UF-09.3.

## Build / accept log
