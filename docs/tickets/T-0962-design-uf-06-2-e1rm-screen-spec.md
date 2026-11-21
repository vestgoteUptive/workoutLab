---
id: T-0962
title: Screen spec for the Exercise history estimate card, chart and table
lane: design
screens: [UF-06.2]
decisions: [D-0256, D-0258, D-0211, D-0208, D-0079]
deps: []
status: ready
---
## Why
UF-06.2 (Exercise history) has no screen spec file yet and gains the app's first chart. The web ticket (T-0963) needs one written source for layout, tokens, contrast, states and table, so the chart rules become the pattern for later charts (D-0258 §15).

## Scope
- In: create `Design-docs/docs/design/screens/UF-06.2.md` (plan state, `[data-wl-state="plan"]`) covering: page order (title, caption, offline line, stat cards Best set / Heaviest / Sessions / Est. 1RM, delta line, chart, table toggle, explanation, session rows, how-to link); the Est. 1RM card and delta wording ("Up 3 kg since 12 Oct", "Down 2 kg since 12 Oct", "Same as 12 Oct"); the chart (160 px, line 2 px, dots 6 px with 2 px `--wl-bg` ring, 1 px gridlines, y from rounded floor to ceiling with 2 or 3 gridlines, x time-proportional with first and last date "d MMM", latest label `text-anchor: end` flipping below on collision, 320 px reserve 36 px left and 16 px right, `vector-effect: non-scaling-stroke`); tokens `--wl-action`, `--wl-bg`, `--wl-line`, `--wl-ink-muted` only; contrast line (gridlines decorative 2.1:1, text at least 4.5:1, line and dots at least 3:1); a11y (SVG `role="img"` and `aria-label`, inner text `aria-hidden`, delta a plain paragraph); the table toggle and table (44 px, `aria-expanded`, `aria-controls`, caption "Estimated 1RM per session", columns Date `scope="row"` / Best set / Est. 1RM, oldest first, rendered only when expanded, focus stays on toggle); all states (zero history, none valid, bodyweight or timed, one point, two or more, returning after 10 days off, offline, partial cache, same-day sessions as a vertical step); explanation copy; note that prototype `UF06-2-History.dc.html` (Brzycki, "+19 kg in 12 weeks") is superseded.
- Out: any code in `apps/web`, any new token, colour or font, changes to UF-04.2, UF-02.1 or UF-03.3.

## Acceptance criteria
Each criterion becomes at least one automated test (the design-tokens package test, or the repo checks).
- AC1 Given `Design-docs/docs/design/screens/UF-06.2.md`, When the repo checks run (`node .github/scripts/check-all.mjs`), Then it passes: screen IDs valid, no legacy v1 labels.
- AC2 Given the spec file, When a test scans it for token names, Then every `--wl-*` name it uses exists in `packages/design-tokens/src/tokens.json` generated output, and it names none of the legacy accent, line or text-muted names (D-0258 §6).
- AC3 Given the tokens file, When the contrast test computes `--wl-action` against `--wl-bg` and `--wl-ink-muted` against `--wl-bg` in plan state, Then the first is at least 3:1 and the second at least 4.5:1, matching the spec's contrast line. If either fails, the ticket stops with triage; it must not change a token (token changes need their own decision).
- AC4 Given the spec file, Then it contains each state row from the list above and the exact strings "No estimate yet. Estimates need a weighted set of 1–10 reps.", "Estimated 1RM is for weighted lifts." and "One session so far. Log it again to see a trend." (one test asserting the strings).
- AC5 Given the spec file, Then it states that the prototype `UF06-2-History.dc.html` is superseded.

Checklist (D-0197 §7): online/offline is covered by the offline row in the state table (the screen reads cache and queue, identical values); empty/non-empty by the states table. No migration.

## Paths you may change
- `Design-docs/docs/design/screens/UF-06.2.md` (new)
- `packages/design-tokens/**` limited to adding a test; `src/tokens.json` must not change.

## Contract impact
none (tokens read, not changed).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged · commit messages start with `T-0962` and cite UF-06.2.

Per-package commands: `pnpm --filter @workoutlab/design-tokens typecheck`, then a separate `… lint`, then a separate `… test` (confirm the package name).

## Build / accept log
- Clean tree, HEAD ce3f28ba (main-hzlbfc). Added `Design-docs/docs/design/screens/UF-06.2.md` and `packages/design-tokens/test/uf06-2-e1rm-spec.test.ts`. `tokens.json` untouched.
- Red run on unfixed code (spec absent): 24 of 27 new tests failed (only the 3 token-contrast checks passed, as they read tokens.json). The AC1 test also fails on a branch with no commit yet (`ticket-not-on-base`, because HEAD equals main), so it goes green only after the first commit; that is a check artefact, not a spec fault.
- Red run 2 (spec first draft): `aria-hidden` literal missing; fixed in the spec.
- AC1 -> test "the repo checks accept the spec" (runs check-all) + `check:repo`. AC2 -> "names only existing variables…" and "names none of the legacy…". AC3 -> three contrast tests (action/bg >= 3, ink-muted/bg >= 4.5, line/bg about 2.1); both pass, so no triage. AC4 -> state-row, exact-string and page-order/geometry/a11y tests. AC5 -> "says UF06-2-History.dc.html is superseded".
- Gate: design-tokens typecheck, lint, test (17 files, 287 tests) green; `-w format:check`, `-w check:repo`, `-w test:repo-checks` (395 pass) green. Full `-w` test and e2e not run: docs plus one text test, no code or token change.
- Follow-up: `web-feature:UF-06` (T-0963) builds from the spec.
