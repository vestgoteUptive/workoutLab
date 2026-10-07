---
id: T-0544
title: Self-hosted variable latin woff2 for Big Shoulders Display and DM Sans in @workoutlab/design-tokens (fonts/, OFL texts, SOURCES.md with sha256, a fonts.css export)
lane: design
screens: []
decisions: [D-0203, D-0204, D-0019, D-0031, D-0046]
deps: []
status: ready
---
<!-- Written by product-owner 2026-10-07 (groom, D-0203 §1; GitHub #37/#45). Flow: wl-design (agent designer). The woff2 files are fetched from the npm registry once; if the agent's shell can't fetch, the orchestrator runs the `npm pack` step and hands over the two files. About ¼ day. No contract change: tokens.json is unchanged. -->

## Why
GitHub #37 and #45: no `@font-face` exists anywhere, so `--wl-font-display` and `--wl-font-body` always fall back to the system font (spec `docs/specs/visual-foundation.md` §1, root cause 1). D-0203 §1 self-hosts one variable latin woff2 per family in `packages/design-tokens`, so the web app (T-0545) and the landing (T-0547) import the same `fonts.css`. D-0031's "revisit when the web fonts get self-hosted" trigger fires here.

## Scope
- In:
  - `packages/design-tokens/fonts/big-shoulders-display-latin-wght.woff2` and `packages/design-tokens/fonts/dm-sans-latin-wght.woff2`: the Fontsource `latin-wght-normal` woff2 builds (`@fontsource-variable/big-shoulders-display`, `@fontsource-variable/dm-sans`) at a pinned version, downloaded once (for example `npm pack <pkg>@<version>` into scratch, then copy the two files). Committed as binary files. No runtime npm dependency and no lockfile change.
  - `packages/design-tokens/fonts/OFL-BigShouldersDisplay.txt` and `OFL-DMSans.txt`: the upstream OFL 1.1 texts with their copyright lines.
  - `packages/design-tokens/fonts/SOURCES.md`: for each file, the package, version, upstream file name, sha256, byte size, and the result of the Reserved Font Name check of the OFL header ("none declared").
  - `packages/design-tokens/src/fonts.css`, static: two `@font-face` blocks per the spec (`src: url("../fonts/<file>.woff2") format("woff2")`, `font-weight: 100 900` for Big Shoulders Display and `100 1000` for DM Sans, `font-style: normal`, `font-display: swap`, the spec's latin `unicode-range`). Family names equal the first family in each `tokens.json` stack.
  - `packages/design-tokens/package.json`: `exports["./fonts.css"] = "./src/fonts.css"` and `exports["./fonts/*"] = "./fonts/*"`, so an app can import a woff2 URL directly (the landing's preload links, T-0547) as well as through the relative `url()` in `fonts.css`.
  - Tests in `packages/design-tokens/test/fonts.test.ts` (F-1, F-2).
  - Optional: one line in `Design-docs/docs/design/design-system.md` saying the fonts are self-hosted from `@workoutlab/design-tokens/fonts.css`.
- Out:
  - Importing the fonts anywhere (T-0545 web, T-0547 landing).
  - Any change to `tokens.json` (no new token groups, D-0203 §2).
  - Italic files, `latin-ext`, static per-weight files.

### Edge cases that are in scope
- **Package unavailable or renamed.** If `@fontsource-variable/big-shoulders-display` doesn't exist at a usable version, use the successor package per D-0204 §6 and record it in `SOURCES.md`.
- **Reserved Font Name.** If either OFL header declares an RFN, stop and return `needs-triage` with a TR file. Never rename the family silently.
- **Offline.** Nothing remote: no `http`, `data:` or `local()` in `fonts.css`, so the files can be precached (T-0545).
- **Glyphs outside latin** (`→`, `⅓`, `⅔`): fall back per glyph by design; not tested here.

## Acceptance criteria
- **AC1 (F-1, fonts.css shape)** Given `src/fonts.css` and `src/tokens.json`, When `fonts.test.ts` parses the CSS, Then:
  - there are exactly 2 `@font-face` blocks;
  - their `font-family` values are exactly `"Big Shoulders Display"` and `"DM Sans"`, each equal to the first family of `tokens.font.display.family` / `tokens.font.body.family` (read from `tokens.json`, never retyped in the test);
  - Big Shoulders Display's `font-weight` range covers 700 and 800, and DM Sans's covers 400, 500 and 700 (read from `tokens.font.*.weights`);
  - each block has `font-display: swap`, `font-style: normal`, a `unicode-range` that contains `U+0000-00FF` and `U+20AC`, and exactly one `src` matching `url("../fonts/<name>.woff2") format("woff2")`;
  - the file contains no `http`, no `data:` and no `local(`.
- **AC2 (F-1 fault)** Given a copy of `fonts.css` whose DM Sans `font-weight` is `400 600`, When the AC1 check runs on it, Then it fails on the weight 700 assertion. (A planted fault on a backup copy, restored with `cp`, recorded in the log; or a fixture string in the test itself.)
- **AC3 (F-2, files and budget)** Given `packages/design-tokens/fonts/`, Then:
  - both woff2 files exist and their first 4 bytes are `wOF2`;
  - each is ≤ 61 440 bytes (60 KB) and together they are ≤ 112 640 bytes (110 KB);
  - `OFL-BigShouldersDisplay.txt` and `OFL-DMSans.txt` exist and each contains `SIL OPEN FONT LICENSE Version 1.1`;
  - the sha256 of each woff2 equals the value written for it in `SOURCES.md`.
- **AC4 (F-2 fault)** Given `SOURCES.md` with one hex digit of the DM Sans sha256 changed, When AC3's check runs, Then it fails on the sha256 assertion. Recorded in the log, then restored.
- **AC5 (export resolves)** Given the package, When a test resolves `@workoutlab/design-tokens/fonts.css` through the package `exports` (for example `import.meta.resolve` or reading `package.json` exports and checking the file exists), Then it points at `src/fonts.css`, both `url()` targets exist relative to it, and `@workoutlab/design-tokens/fonts/dm-sans-latin-wght.woff2` and `…/fonts/big-shoulders-display-latin-wght.woff2` resolve through `exports["./fonts/*"]` to existing files.
- **AC6 (tokens unchanged)** `git diff main -- packages/design-tokens/src/tokens.json` is empty, and the existing `tokens.test.ts` / `css.test.ts` pass unchanged.

Checklist (D-0197 §7): the online/offline pair does not apply to a static package file; AC1's "no remote source" is what makes offline work downstream (T-0545 F-5).

## Paths you may change
- `packages/design-tokens/**` (lane)
- `Design-docs/docs/design/design-system.md` (lane, one line at most)

## Contract impact
None. `tokens.json` is unchanged (D-0203 §1, AC6).

## Definition of done
Every AC has a passing test · `pnpm --filter @workoutlab/design-tokens typecheck` green · `pnpm --filter @workoutlab/design-tokens lint` green · `pnpm --filter @workoutlab/design-tokens test` green · the cached full gate green · contracts unchanged · commits start with `T-0544:`.

## Build / accept log
Archived in `docs/tickets/log/T-0544.md` (D-0157).
