---
id: T-0973
title: Design the "per arm" labels on the set screen, history, summary and how-to
lane: design
screens: [UF-09.3, UF-09.4, UF-03.1, UF-03.3, UF-06.2, UF-04.2]
decisions: [D-0261, D-0263]
deps: []
status: done
---
## Why
No screen spec exists for UF-09.3, UF-09.4, UF-03 or UF-06; UF-04.2 has one. The label must sit inside the existing reps line so focus mode still shows one task (principle 1). The specs fix the exact formats before the web tickets build them (D-0263 §4-§8).

## Scope
- In: create `UF-09.3.md`, `UF-09.4.md`, `UF-03.1-UF-03.3.md`, `UF-06.2.md` and amend `UF-04.1-UF-04.2.md` in `Design-docs/docs/design/screens/`, with:
  - UF-09.3: weighted "12 kg" over "× 10 per arm" in the same `<p>`, suffix in `--wl-ink-muted`, contrast rechecked on lift and rest; bodyweight "10 reps per arm"; timed "40 s per side"; aria-label "12 kg, 10 reps per arm" (timed "40 seconds per side"); wraps at 320 px, never truncates; no extra row.
  - UF-09.4: stepper group aria-label "Reps per arm/leg/side" (timed "Seconds per side"), buttons stay "More reps" and "Less reps", visible caption under the number in the label size, number alone in the target, 44 px targets.
  - UF-03.1, UF-03.3, UF-06.2: "12 × 10 per arm", bodyweight "10 per arm", ListView "Set 2 reps per arm", Best set "12 kg × 10 per arm"; grouped "3 × 10 per arm · 12 kg" only where a grouped row exists.
  - UF-04.2: static `<p>` under the steps; non-timed "Do all reps on one arm, then switch. Log reps for one arm. One set covers both arms. Log RIR for your weaker side."; timed "Hold one side, then switch. Log seconds for one side."
  - The one shared `formatReps(reps, unilateral, timed)` and `perSide(word)` string table, as the single source of copy.
  - Not-flagged exercises look as today. No new token.
- Out: any code, `tokens.json`, plan-row labels (UF-08.2, UF-02.1), UF-09.9.

## Acceptance criteria
- AC1 Given the UF-09.3 spec, When read, Then it gives the weighted, bodyweight and timed lines with their aria-labels for arm, leg and side, and states that a non-flagged row is unchanged.
- AC2 Given the UF-09.3 and UF-09.4 specs, When checked, Then each states the contrast of `--wl-ink-muted` on the lift and rest states as a ratio of at least 4.5:1 (computed from `tokens.json`, a docs check or a test), and 320 px wrapping.
- AC3 Given the UF-09.4 spec, Then it names the group aria-label, the visible caption text per word, unchanged button names, and that pre-fill, RIR and the 5 s auto-save are unchanged.
- AC4 Given the UF-03 and UF-06 specs, Then each lists the weighted, bodyweight, ListView and Best set formats with a worked example (10, 10, 9 at 12 kg).
- AC5 Given the UF-04.2 spec, Then it has both how-to texts (non-timed with the RIR sentence, timed without) and says a bilateral row has no extra line.
- AC6 Given `node .github/scripts/check-all.mjs`, Then screen IDs, v1 labels and decision references in the new files pass, and no new colour or font is defined outside `tokens.json`.

Checklist (D-0197 §7): states covered for both flagged and not flagged; offline reads the same cached flag (stated in the specs); no migration here.

## Paths you may change
Lane `design`: `Design-docs/docs/design/**` (the five screen spec files above), `packages/design-tokens/**` only if a docs check needs it (no token change expected).

## Contract impact
none. `tokens.json` unchanged (D-0261, D-0263 §8).

## Definition of done
Tests or checks for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0973` and cite screen IDs.

## Build / accept log

- Start: worktree clean, HEAD b89bd35d. Used the existing `UF-09.3-UF-09.4.md` (T-0955) instead of separate UF-09.3.md and UF-09.4.md; `UF-03.1-UF-03.3.md` is new; `UF-04.1-UF-04.2.md` and `UF-06.2.md` amended. No decision file written. Shared `formatReps` and `perSide` table lives in the UF-09 file; the others point to it.
- Test: `packages/design-tokens/test/t0973-one-side-specs.test.ts` (text check, contrast computed from `tokens.json`).
- Red run on unfixed docs: fails at once, "missing UF-03.1-UF-03.3.md" (no spec text yet).
- AC1 hero lines, aria-labels, unchanged: "AC1" describe. AC2 contrast 4.8 / 6.1 / 4.9 and 320 px: "AC2" describe. AC3 stepper: "AC3". AC4 UF-03 and UF-06.2 formats and example: "AC4". AC5 how-to: "AC5". AC6 no hex or font in the new text: "AC6" plus check-all below.
- Green: t0973 and t0955 tests, 43 passed. One first-run failure ("number alone" wording) fixed in the doc.

- Round 2 (review rulings 1-10): timed hold suffix and no stepper for timed holds; nested `.wl-uf09__unit` span; hidden span instead of aria-label; helper at `apps/web/src/lib/i18n/per-side.ts` with a row table; ListView aria-label only and previous-session formats; PR lines and UF-02 Today (T-0975); grouped row dropped; UF-06.2 weightedBest, repsBest, timed best; T-0955 header reworded and the T-0955 test's one pinned sentence updated to match; rest-state contrast row dropped. The t0973 test now uses row-anchored table checks. Reworded the UF-03 file reference in the UF-09 file so the T-0955 ID check passes. Gate: design-tokens 335 passed, format:check green, check-all see handback.
