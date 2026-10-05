---
id: T-0475
title: "import bans: only `index.js` and `index.<lower>.js` count as a feature entry; pin `../UF-08/index.prefs.js` as allowed (D-0170 §1)"
lane: web-shell
screens: [UF-08, UF-09]
decisions: [D-0170, D-0071, D-0074, D-0167, D-0158, D-0178, D-0169]
deps: [T-0474]
status: done
---
<!-- Groomed 2026-10-04 by product-owner. Build flow: wl-build-web. About 1-2 hours. D-0178 tier: small. Skip QA, but keep the code review: it changes a regex in shared lint config. -->

## Why
D-0170 §1 lets a feature publish leaf entries named `index.<topic>.ts`, where `<topic>` is
lower-case letters only. It says the lint rule "already allows this". It does, but too loosely.
`INDEX_ONLY_PATTERN` in `apps/web/eslint.config.mjs` is `(^|/)(features/)?UF-\d\d/(?!index\b)`,
and ESLint compiles a `no-restricted-imports` `regex` **case-insensitively** unless the pattern
sets `caseSensitive: true` (eslint 9.39 `no-restricted-imports.js`: `caseSensitive ? "u" : "iu"`).
So all of these pass today as if they were an entry, and none of them is one:
- `../UF-08/index-x.js` and `../UF-08/index.prefs.extra.js` (`\b` matches before `-` and `.`);
- `../UF-08/index.Prefs.js` and `../UF-08/Index.js` (the `i` flag);
- `../UF-08/index/focus-prefs.js` (a deep import through a folder named `index`);
- `../UF-08/index` with no extension.

Nothing in the tree uses any of these today: every cross-feature specifier is `UF-NN/index.js` or
`UF-08/index.prefs.js`. This ticket closes the gap before something does. It also adds the
contrast row D-0170's consequences ask for: `../UF-08/index.prefs.js` is allowed from UF-09.

## Scope
- In:
  - `apps/web/eslint.config.mjs`: tighten `INDEX_ONLY_PATTERN` so that, after the `UF-NN/`
    segment, the only allowed rest of the specifier is exactly `index.js` or
    `index.<topic>.js`, where `<topic>` is one or more of `a-z`. The match is case-sensitive for
    the entry name. One way to do it: `caseSensitive: true` with
    `(^|/)(features/)?[Uu][Ff]-\d\d/(?!index(\.[a-z]+)?\.js$)`. The `[Uu][Ff]` keeps a
    lower-case `uf-08/` banned, as it is today. Any equivalent is fine as long as every AC holds.
  - Keep the allowed-entry rule **in one place** (one constant or one regex source) and update
    the header comment that mentions T-0313. When T-0313 adds its `ImportExpression` rule, it
    reuses that source and allows `index.<topic>.js` the same way (D-0170, "Revisit when").
    Update the `INDEX_ONLY_PATTERN` doc comment to name `index.<topic>.js` and cite D-0170.
  - `apps/web/src/app/__tests__/import-bans.test.ts`: append a new describe block,
    `T-0475 feature entries (D-0170 §1)`, with the rows below. Existing tests stay unedited.
- Out:
  - **T-0313's dynamic-`import()` ban.** That is its own ticket, still `todo`. This ticket adds
    no `no-restricted-syntax` rule and no `ImportExpression` handling. It must not contradict
    T-0313's pattern either: same entry rule, one source, as described above.
  - `BODY_MAP_PATTERN` and `OUT_OF_WORKOUT_FEATURE_PATTERN`: unchanged, and so is their
    case-insensitivity.
  - The bare-folder form `../UF-08` (no `/`). `INDEX_ONLY_PATTERN` never matched it and still
    doesn't (it resolves to the index).
  - Any file under `apps/web/src/features/**`, including `t0474.prefs-leaf.test.ts` and
    `UF-03/__tests__/exports-and-lint.test.ts`.
  - D-0170 and the other decisions: the rule only gets stricter, within D-0170 §1's own wording,
    so no decision is needed.

### Edge cases that are in scope
- **Both config blocks:** the `src/features/**` block and the workout-flow block
  (UF-03/04/05/08/09) both use `INDEX_ONLY_PATTERN`. The rows cover an importer in each.
- **Specifier forms:** relative sibling (`../UF-08/…`), nested (`../../UF-08/…`), spelled out
  (`../../features/UF-08/…`), and `export … from`.
- **Case:** the entry name is case-sensitive. The `UF` token stays case-insensitive, so
  `../uf-08/focus-prefs.js` stays banned.
- Offline, time budget, zero history: not applicable (a lint rule, no runtime behaviour).

## Acceptance criteria
**Test setup.** The existing `restricted(relPath, code)` helper in `import-bans.test.ts`
(`ESLint.lintText` through the real `apps/web/eslint.config.mjs`, with its fatal-message guard).
Each row is a one-line `import { X } from "<specifier>";\nexport const Y = X;\n` unless it says
otherwise.

**Test rules.** Both values of every binary condition get a test. **Every AC-3 row must fail on
`main`.** The build log records that red run (each row reports 0 errors on unfixed code). Planted
faults go on a `cp` backup of `eslint.config.mjs` and are restored from it. Record each in the
log:
- **F1** puts the old regex back (`UF-\\d\\d/(?!index\\b)`): every AC-3 row turns red.
- **F2** keeps the new regex but drops `caseSensitive: true` (or the equivalent): the
  `index.Prefs.js` and `Index.js` rows turn red.
- **F3** (if `[Uu][Ff]` is used) narrows it to `UF`: AC-4's `../uf-08/focus-prefs.js` row turns
  red.

- **AC-1 (the contrast row: a leaf entry is allowed)** Given the importer
  `src/features/UF-09/x.ts`, When it imports `readFocusPrefs` from `"../UF-08/index.prefs.js"`,
  Then `no-restricted-imports` reports 0 messages. Also 0 for each of:
  - `src/features/UF-09/sub/x.ts` importing from `"../../UF-08/index.prefs.js"`;
  - `src/features/UF-09/sub/x.ts` importing from `"../../features/UF-08/index.prefs.js"`;
  - `src/features/UF-09/x.ts` with `export { readFocusPrefs } from "../UF-08/index.prefs.js";`;
  - `src/features/UF-02/x.ts` (the plain `src/features/**` block) importing from
    `"../UF-06/index.prefs.js"`.
- **AC-2 (the plain index is still allowed)** `../UF-08/index.js` from
  `src/features/UF-09/x.ts`, and `../UF-06/index.js` from `src/features/UF-02/x.ts`, each report
  0 messages. The existing "UF-09 importing UF-08/index.js reports nothing" test passes
  unedited.
- **AC-3 (a name that isn't an entry is banned)** From `src/features/UF-09/x.ts`, each of these
  specifiers reports **exactly one** `no-restricted-imports` message, with severity 2, whose
  text contains `D-0071 §3`:
  - `../UF-08/index-x.js` (hyphen, not a dot);
  - `../UF-08/index.Prefs.js` (topic not all lower-case);
  - `../UF-08/Index.js` (entry name not lower-case);
  - `../UF-08/index.prefs.extra.js` (two topic segments);
  - `../UF-08/index.prefs2.js` (a digit in the topic);
  - `../UF-08/index/focus-prefs.js` (deep through a folder named `index`);
  - `../UF-08/index` (no `.js`).

  Also `../UF-06/index-x.js` from `src/features/UF-02/x.ts` (the plain block) reports exactly
  one.
- **AC-4 (existing bans unchanged)** `../UF-08/focus-prefs.js` and `../uf-08/focus-prefs.js`
  from `src/features/UF-09/x.ts` each report at least one message. Every existing test in
  `import-bans.test.ts` passes unedited, AC-11 ("apps/web/src/features lints clean")
  included. So do `UF-09/__tests__/t0474.prefs-leaf.test.ts` and
  `UF-03/__tests__/exports-and-lint.test.ts`, unedited. `pnpm --filter @workoutlab/web lint` is
  green.

## Paths you may change
- `apps/web/**` top-level files and `apps/web/src/app/**` (the lane: `web-shell`). In practice
  only the two files below.
- **Listed extras** (required: `eslint.config.mjs` hits check-lane-paths'
  `shared-lint-config-edited` rule before lane paths are checked, D-0074):
  - `apps/web/eslint.config.mjs`: `INDEX_ONLY_PATTERN` and its comments only.
  - `apps/web/src/app/__tests__/import-bans.test.ts`: the new describe block, appended.
  - `docs/tickets/T-0475-import-bans-leaf-entry-regex.md`: this file, for the logs.

## Contract impact
None.

## Definition of done
Tests for every AC pass, with the red run on `main` and planted faults F1-F2 (F3 if it applies)
recorded · the cached gate (D-0158): `pnpm -w typecheck lint test --concurrency=1`,
`-w test:repo-checks`, `-w format:check` and `check-all` all green · contracts unchanged · commits
start `T-0475`.

## Notes
- **Flow:** `wl-build-web`. **D-0178 tier: small.** Skip QA. **Keep the code review**: a regex
  in shared ESLint config is easy to get subtly wrong (the default `i` flag is exactly that
  trap). The reviewer checks the AC-3 rows against the regex by hand, and checks that the entry
  rule lives in one place for T-0313 to reuse.
- **e2e: not needed.** The change is a lint rule plus its `lintText` test. No runtime code,
  route, service worker or fixture changes. Run the test file with
  `scripts/locked.sh small npx vitest run src/app/__tests__/import-bans.test.ts` from `apps/web`,
  then the cached gate once.
- **Parallel:** no shared file with T-0210 (backend) or T-0317 (README/infra). Don't run it in
  parallel with any other ticket that lists `apps/web/eslint.config.mjs`, T-0313 included
  (D-0071 §1).
- **Origin:** D-0170 "Consequences" (web-shell, optional, low priority) and the T-0474 review.

## Build / accept log
Archived in `docs/tickets/log/T-0475.md` (D-0157).
