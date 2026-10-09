---
id: TR-0048
status: resolved
raised_by: designer on T-0614
date: 2026-10-09
---
# TR-0048 T-0614: repointing the legend `token` fields breaks apps/web typecheck and tests

## Finding
T-0614 scope says `coverageLegend[n].token` → `"plan-coverage-N"` and `attentionLegend.token` → `"plan-attention"` in `packages/design-tokens/src/index.ts` (AC2), and T-0615 (which depends on T-0614) consumes them. But `apps/web` reads those fields today as a flat `ColorName` and turns them into `var(--wl-color-<token>)`:

- `apps/web/src/components/body-map/BodyMap.tsx` (`fillToken`, `ATTENTION_OUTLINE`, the legend swatches);
- `apps/web/src/features/UF-10/format.ts` (`fillToken`), used by the UF-10.1 rows. This file isn't in T-0615's paths either.

With the change applied (tried, then restored from a backup), `tsc -p apps/web` fails with 4 errors (TS2322/TS2345: `"plan-coverage-0"` / `"plan-attention"` not assignable to `ColorName`). Widening `ColorName` would make it compile but would turn the C-01 tiles, legend and UF-10 bars cobalt on screens that have no state yet, which D-0210 §2 and §4 (decided) rule out, and it would break web tests that pin `var(--wl-color-coverage-N)` and `var(--wl-color-warn)` (`BodyMap.test.tsx`, `BodyMap.qa.test.tsx`, `BodyMap.silhouette.test.tsx`, UF-10 tests). Those are web-lane files. So T-0614 can't land AC2 with a green `-w typecheck lint test` without a cross-lane change.

## Options
1. **(Recommended)** Move the `index.ts` repoint and its `tokens.test.ts` AC6 update into T-0615 (add `packages/design-tokens/src/index.ts` and `packages/design-tokens/test/tokens.test.ts` to its paths, and add `apps/web/src/features/UF-10/format.ts`). T-0615 changes the consumers to read `var(--wl-coverage-${entry.step})` / `var(--wl-attention)` and repoints the fields in the same commit, so `main` stays green. T-0614 ships everything else (docs, contrast, preview, check-figure).
2. Split: a tiny web ticket first makes BodyMap and UF-10 stop typing `.token` as `ColorName` (read the generic variables by step), then a design ticket repoints the fields.
3. Widen `ColorName` and accept the cobalt legend on unmigrated screens, which needs D-0210 amended.

T-0614 has done everything except AC2; the AC2 test isn't written, so nothing is weakened.

## Resolution (orchestrator, 2026-10-09)
Option 1. T-0614 AC2, the legend `token` repoint in `packages/design-tokens/src/index.ts` and tokens.test.ts AC6, moves into **T-0615**, which already changes the consumers (BodyMap.tsx, UF-10 format.ts). T-0614 merges without AC2. T-0615 also takes the follow-up that the highlight ring should draw above the body parts. No ColorName widening, since that would turn unmigrated screens cobalt (D-0210 §2, §4).
