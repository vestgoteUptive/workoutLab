---
id: T-0989
title: Design the UF-09.5 rest screen's "Next" block (exercise name, cue, per-side word) and write its screen spec
lane: design
screens: [UF-09.5, UF-09.3]
decisions: [D-0273, D-0261, D-0263, D-0208]
deps: []
status: ready
---
## Why
Owner request 2026-11-24 (spec `docs/specs/rest-next-exercise.md`, D-0273): the rest screen should name the next exercise and, when a new exercise follows, show a short cue. UF-09.5 has no screen spec file (only the prototype and the Cobalt README), and the UF-09.3/09.4 spec says the rest state shows no flagged label, which D-0273 reverses. The web ticket builds from this spec, so layout, type, contrast and wrapping are fixed first.

## Scope
- In:
  - Create `Design-docs/docs/design/screens/UF-09.5.md`: the Next block's four lines in order (caption, name, load or cue), their type roles and colours from the spec's table, the hierarchy rule (timer > load > name > caption and cue), the 320 px and 200 % zoom behaviour (wrap, no truncation, page scrolls, Skip rest reachable), contrast ratios computed from `tokens.json` (rest `ink` on rest `bg`, and on the lift `bg` the screen drains to), the copy table (including flagged, bodyweight and "Set weight" variants, hidden reading text), the state table (same exercise, new exercise, nothing next, timed, one-side, offline, 10 days off, zero history, at 0), and the first-frame note (name and word first, cue after).
  - Amend `Design-docs/docs/design/screens/UF-09.3-UF-09.4.md`: replace "The rest state shows no flagged label, so it has no row here" with a pointer to `UF-09.5.md`.
  - Check that the name size (1.5rem, 700) leaves a worst-case screen on one phone height: 320 × 568, longest library name, flagged load line wrapped, 45-character cue. Say in the spec whether it scrolls and what is visible without scrolling.
  - Add a follow-up for `web-feature:UF-09` only if the spec changes anything beyond T-0990's scope.
- Out: any code, `tokens.json` (no new token, role or font), UF-09.6, the prototype `.dc.html` files (history), the user-flows row (already reworded with D-0273).

## Acceptance criteria
- AC1 Given `UF-09.5.md`, When read, Then it gives the line order, type role, colour and wrapping rule for caption, name, load and cue, and states that no new token, role or font is used.
- AC2 Given `UF-09.5.md`, Then it states the contrast of white on rest `bg` and on lift `bg` as ratios of at least 4.5:1 computed from `tokens.json` (the test computes them), and states 320 px and 200 % zoom behaviour with no truncation.
- AC3 Given `UF-09.5.md`, Then its copy table has the flagged and not-flagged load lines ("27,5 kg × 10 per arm" and "27,5 kg × 10"), the hidden reading ("27,5 kg, 10 reps per arm"), the bodyweight and "Set weight" variants, and names `lib/i18n/per-side.ts` as the only source of the words.
- AC4 Given `UF-09.5.md`, Then its state table covers same exercise next, new exercise next, last set with nothing next, one-side, timed, offline, 10 days off and zero history, and each binary pair (flagged and not, cue present and absent) is stated.
- AC5 Given `UF-09.3-UF-09.4.md`, Then it no longer says the rest state shows no flagged label and points to `UF-09.5.md`; the T-0973 and T-0955 tests still pass.
- AC6 Given `node .github/scripts/check-all.mjs`, Then screen IDs and decision references pass and no hex colour or font is defined outside `tokens.json`.

Checklist (D-0197 §7): flagged and not flagged, cue present and absent, online and offline, same exercise and new exercise are all stated in the spec; no migration here.

## Paths you may change
Lane `design`: `Design-docs/docs/design/screens/UF-09.5.md` (new), `Design-docs/docs/design/screens/UF-09.3-UF-09.4.md`, and a new test `packages/design-tokens/test/t0989-rest-next-spec.test.ts` (same pattern as `t0973-one-side-specs.test.ts`).

## Contract impact
none. `tokens.json` unchanged (D-0273).

## Definition of done
Tests or checks for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0989` and cite screen IDs.

## Build / accept log
