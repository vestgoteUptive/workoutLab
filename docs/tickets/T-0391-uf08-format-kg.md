---
id: T-0391
title: "UF-08.2: row and back-off weights through lib/format formatKg; rows.ts weightText and en.uf08.weightKg removed (D-0114 §3, D-0124)"
lane: web-feature:UF-08
screens: [UF-08.2]
decisions: [D-0114, D-0115, D-0124]
deps: [T-0388, T-0303b, T-0386]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-web. About ⅛ day. Follow-up from the T-0303b review. T-0388 and T-0303b are done. T-0386 holds the UF-08 lane now; this ticket runs after it merges. -->

## Why
D-0114 §3 puts every kg value through a locale-aware `lib/format/*` helper. `formatKg` (T-0388, D-0115 §6) now exists. UF-08.2 still formats weights itself: `features/UF-08/rows.ts` `weightText` uses `Intl.NumberFormat(locale, { maximumFractionDigits: 2 })` with grouping on, and `en.uf08.weightKg` adds " kg" with a plain space. So 1250 kg shows as "1,250 kg", and the space can wrap. The back-off line "+ 1 back-off 70 × 6" has no unit, unlike UF-09.3's "70 kg × 6". D-0124 fixes the copy.

## Scope
- In:
  - `Suggested.tsx`: the detail weight is `formatKg(item.prefill.weightKg, locale)`. The back-off line is `en.uf08.backoff(formatKg(item.backoff.weightKg, locale), item.backoff.reps)`. The `locale` prop's JSDoc names `formatKg` (D-0124) in place of `Intl.NumberFormat`.
  - `rows.ts`: delete `weightText` and update the file header comment.
  - `lib/i18n/flows/uf-08.ts`: delete the `weightKg` key, and update the `backoff` JSDoc example to "+ 1 back-off 70 kg × 6".
  - Tests in `features/UF-08/__tests__/suggested-view.test.tsx`.
  - `tests/e2e/uf-08-setup.spec.ts` `DETAIL_PATTERN`: ` kg` becomes ` kg`.
- Out:
  - `formatKg` itself and `lib/format/number.ts` (D-0118 §6: T-0391 only imports it).
  - Bodyweight and null-weight rules (D-0109 §4 stands for those).
  - UF-08.4 Ready and UF-09.
  - `lib/i18n/workout.ts`.
  - The e2e fixture (T-0393).

## Acceptance criteria
Each new or edited test title starts with `T-0391 ACn`. U+00A0 is written ` ` in test sources. `LOCALE` is the existing fixture locale (en-GB).
- AC1 (detail weight, red on unfixed code) **Given** the bench-press row of `wR7E4()` with `prefill.weightKg` set to each left-hand value, **When** `Suggested` renders with `LOCALE`, **Then** `detail(0)` is exactly the right-hand value:
  - 80 → `"4 × 6–8 · 80 kg · 12 min"`;
  - 77.5 → `"4 × 6–8 · 77.5 kg · 12 min"`;
  - 100 (`hold_after_break`) → `"4 × 6–8 · 100 kg · 12 min"`;
  - 0 (bench-press is `externalLoad: true`) → `"4 × 6–8 · 0 kg · 12 min"`;
  - 1250 → `"4 × 6–8 · 1250 kg · 12 min"` (no grouping);
  - 2.125 → `"4 × 6–8 · 2.13 kg · 12 min"`.
  - Main renders a plain space (and "1,250"), so every row is red there.
- AC2 (locale) **Given** `prefill.weightKg` 77.5 and `locale: "sv-SE"`, **Then** `detail(0)` is `"4 × 6–8 · 77,5 kg · 12 min"`. **And** with 1250 and `"de-DE"` it is `"4 × 6–8 · 1250 kg · 12 min"` (main gives "1.250 kg").
- AC3 (back-off, red on unfixed code) **Given** bench-press `backoff`, **Then** the `row-backoff` element's text is exactly:
  - `{ weightKg: 70, reps: 6 }` → `"+ 1 back-off 70 kg × 6"`;
  - `{ weightKg: 72.5, reps: 5 }` with `locale: "sv-SE"` → `"+ 1 back-off 72,5 kg × 5"`;
  - `{ weightKg: null, reps: 6 }` → `"+ 1 back-off set"` (unchanged);
  - `null` → no `row-backoff` element (unchanged).
- AC4 (one helper) **Given** the UF-08 sources outside `__tests__/`, **Then**:
  - `Suggested.tsx` imports `formatKg` from `../../lib/format/number.js`;
  - no source matches `/weightText|Intl\.NumberFormat|en\.uf08\.weightKg/`;
  - `Object.keys(en.uf08)` has no `weightKg` key.

  Main fails all three.
- AC5 (sanctioned test edits) The only existing assertions that change are the five plain-space "kg" cases in `suggested-view.test.tsx` (the 80 and 77.5 rows of the `it.each`, the 100 kg case, the 0 kg line and the sv-SE case), and the "+ 1 back-off 70 × 6" row. They are replaced by the AC1–AC3 values. Every other UF-08 test passes unedited, including `exports-and-lint.test.ts` (its `keys.size > 15` check included; if it drops to 15 or below, stop and raise triage instead of editing it).
- AC6 (e2e) `DETAIL_PATTERN` in `tests/e2e/uf-08-setup.spec.ts` accepts ` kg` and no longer accepts a plain space before `kg`. A table check in the same spec file (no browser needed) shows that `"4 × 6–8 · 80 kg · 12 min"` matches and `"4 × 6–8 · 80 kg · 12 min"` doesn't. `uf-08-setup.spec.ts` passes in the local Playwright run.
- **Red proof:** run the AC1–AC4 tests against main's `Suggested.tsx`, `rows.ts` and `flows/uf-08.ts`. Record the failing count in the build log.

## Paths you may change
- `apps/web/src/features/UF-08/**` (the lane: `web-feature:UF-08`). The edits go in `Suggested.tsx`, `rows.ts` and `__tests__/suggested-view.test.tsx`.
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-08.ts`: delete the `weightKg` key and update the `backoff` JSDoc (D-0124 §4).
  - `tests/e2e/uf-08-setup.spec.ts`: the `DETAIL_PATTERN` line and the AC6 table check.
  - `docs/tickets/T-0391-uf08-format-kg.md`: this file, for the accept log.

## Contract impact
none

## Coordination
- Same lane as T-0386 (doing) and T-0397 (ready). Run after T-0386 merges, and not in parallel with T-0397.
- `lib/i18n/flows/uf-08.ts` is listed by no other ready or doing ticket. T-0385 and T-0396 (web-shell) touch `lib/offline` and `lib/auth`, which are disjoint.
- T-0393 (qa, ready) seeds `external_load` values so a kg weight renders in e2e. Whichever lands second checks that its kg assertions use U+00A0.
- Stagger verification runs (one vitest per machine, state.md).

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` green · e2e green (it touches `apps/web/src/**`) · contracts unchanged · commit messages start with `T-0391` and cite UF-08.2 (e.g. `T-0391 UF-08.2: weights through formatKg (D-0124)`).

## Build / accept log
Archived in `docs/tickets/log/T-0391.md` (D-0157).
