---
id: T-0318
title: Phase 3 plumbing — new sub-routes with stubs (UF-03.3, UF-04.3, UF-06.2, UF-07.1, UF-11.3), C-02 active tab by prefix, per-flow i18n modules, cross-feature import bans
lane: web-shell
screens: [UF-03.3, UF-04.3, UF-06.2, UF-07.1, UF-11.3, C-02]
decisions: [D-0018, D-0045, D-0060, D-0063, D-0067, D-0071]
deps: [T-0300a, T-0300b]
status: done
---
<!-- Written by triage 2026-09-29 (TR-0030) from D-0067 §2 and D-0071 §1, §2, §9, §11. Build flow: wl-build-web. About 2 h. Web-shell: never in parallel with T-0319, T-0301a, T-0310 or T-0313. -->

## Why
Every Phase 3 feature ticket depends on this one (D-0071 §11). Features own only `apps/web/src/features/<flow>/**`. Routes, the string catalogue and the lint config belong to web-shell. Without this ticket, the features can't add a route or a string without editing shared files, and then they can't run in parallel. It also puts principle 1 into lint: check-in, Balance, Progress, Routines and Today content can't be imported into anything that renders during a workout (D-0018, D-0071 §9).

The former UF-09 follow-up "web-shell: routes /session/:id/summary and /session/:id/list" is folded in here: the summary route is AC-1, and the list route is **not** built (UF-03.1 is an overlay inside `/session/:sessionId`, D-0071 §2).

## Scope
- In:
  - **Routes** in `app/routes.ts`, each lazy, with a stub export in the feature's `index.tsx`. Each stub renders an `<h1>` with the screen title from `en.screens` and a `data-screen-id`:

    | Path | Screen | Guard | Tab bar | Export |
    |---|---|---|---|---|
    | `/session/:sessionId/summary` | UF-03.3 | session | no | `features/UF-03` `Summary` |
    | `/library/:exerciseId/compare/:otherId` | UF-04.3 | protected | yes | `features/UF-04` `Compare` |
    | `/progress/:exerciseId` | UF-06.2 | protected | yes | `features/UF-06` `ExerciseHistory` |
    | `/plan/edit` | UF-11.3 | protected | no | `features/UF-11` `EditPlan` |
    | `/plan/routines/new` | UF-07.1 | protected | no | `features/UF-07` `RoutineEditor` |
    | `/plan/routines/:routineId` | UF-07.1 | protected | no | `features/UF-07` `RoutineEditor` |

  - **C-02**: the active tab follows the path prefix. `/` exactly → Today, `/library` and `/library/*` → Library, `/progress` and `/progress/*` → Progress, `/plan` → Plan. `/plan/*` routes hide the tab bar (table), so they need no tab state. `/balance*` keeps the tab it has today (unchanged, not in scope).
  - **Per-flow string modules**: `lib/i18n/flows/uf-01.ts` … `uf-11.ts`, each `export const ufNN = {} as const`. `en.ts` composes them as `en.uf01` … `en.uf11`. The stub titles go in `en.screens`. Existing keys don't change.
  - **Import bans** in `apps/web/eslint.config.mjs` (D-0071 §9):
    1. `src/features/UF-03|UF-04|UF-05|UF-08|UF-09/**` ↛ `features/UF-02`, `UF-06`, `UF-07`, `UF-10`, `UF-11` (principle 1)
    2. The existing `components/body-map` ban extended from UF-03/08/09 to UF-04 and UF-05 as well
    3. `src/features/**` ↛ another feature's module other than its `index` (for example `features/UF-08/focus-prefs`), while imports inside a feature's own folder stay allowed
- Out:
  - `/session/:sessionId/list` (dropped, D-0071 §2).
  - Screen content beyond the stubs (the feature tickets).
  - The dynamic-`import()` loophole (T-0313, which extends to these patterns).
  - `lib/offline` (T-0319).
  - The profile gate (T-0301a).
  - `features/UF-09/seams.tsx` and `features/UF-02/slots.tsx`, which the host features create (T-0304a, T-0302a).
  - Any contract change.

### Edge cases that are in scope
- **Offline:** every new route is a lazy chunk precached with the shell. A cold offline load of `/session/S1/summary` renders its stub (AC-6).
- **Route ranking:** `/session/setup` still renders UF-08.1 and never the summary or the UF-09 host.
- **Bad ids:** stubs render for any id. The feature tickets own the redirects (T-0306a AC-A8/A9, T-0307b AC-B7, T-0308a AC-A7, T-0305b AC-B8).
- **Time running out / zero history / returning after 10 days off:** not applicable (no screen logic).

## Acceptance criteria
Vitest + Testing Library in `apps/web/src/app/**` and `apps/web/src/lib/i18n/**`, and `ESLint.lintText` for the lint rules (the D-0060 §8 pattern).

- **AC-1 (routes table)** `routes` contains the 6 new entries with exactly the path, `screenId`, guard and `showTabBar` values in the Scope table, and every existing entry is unchanged (a snapshot of the pre-existing entries). Each new `load` is a dynamic `import()` of the feature's `index.js` (a source test, as T-0300a AC-A6).
- **AC-2 (stubs render)** Rendering the router signed in at each new path (for example `/session/S1/summary`, `/library/back-squat/compare/leg-press`, `/progress/back-squat`, `/plan/edit`, `/plan/routines/new`, `/plan/routines/R1`) renders exactly one `[data-screen-id]` with the table's screen id and an `<h1>`. The tab bar is present exactly on the `yes` rows.
- **AC-3 (ranking)** `/session/setup` renders `UF-08.1`. `/session/S1` renders the UF-09 host. `/session/S1/summary` renders `UF-03.3`. `/library/back-squat` renders `UF-04.2`. `/progress` renders `UF-06.1`. `/plan` renders `UF-11.2`.
- **AC-4 (C-02 prefix)** On `/library/back-squat/compare/leg-press` the Library tab has `aria-current="page"`, and on `/progress/back-squat` the Progress tab does. On `/`, only Today has it.
- **AC-5 (guards)** Signed out, each new `protected` path redirects as T-0300b AC-B5 defines, and `/session/S1/summary` behaves like `/session/S1` (the `session` guard: decided once at mount, so no banner or redirect on a later token expiry). The existing `auth-guard.test.tsx` passes unchanged.
- **AC-6 (offline chunk)** In the preview build, after one online load, an offline reload of `/session/S1/summary` renders `UF-03.3` (the new chunks are precached). This is appended to the existing shell e2e spec as new tests only. `check:size`: every new chunk ≤ 100 KB gzip, and the initial bundle stays within NFR-PERF-2.
- **AC-7 (string modules)** `lib/i18n/flows/` holds exactly `uf-01.ts` … `uf-11.ts`, each exporting an empty `as const` object. `en.uf01` … `en.uf11` are reference-equal to those exports. Every pre-existing `en` key keeps its value (a snapshot). The `jsx-no-literals` test stays green.
- **AC-8 (principle-1 ban)** `lintText` of `import { CheckinCard } from "../UF-11/index.js";` as `src/features/UF-09/x.tsx` reports `no-restricted-imports`, and the same holds for each banned (importer, target) pair: importers UF-03, UF-04, UF-05, UF-08, UF-09 × targets UF-02, UF-06, UF-07, UF-10, UF-11. Imports of `features/UF-04` and `features/UF-05` from UF-03/UF-09, and of `features/UF-11` from UF-02, report nothing.
- **AC-9 (body-map ban extended)** `lintText` importing `components/body-map` from `src/features/UF-04/x.tsx` and `src/features/UF-05/x.tsx` reports `no-restricted-imports`, and so do UF-03/08/09 (the existing rule's tests pass unchanged). From UF-02 and UF-10 it reports nothing.
- **AC-10 (index-only cross-feature imports)** `lintText` of `import { readFocusPrefs } from "../UF-08/focus-prefs.js";` as `src/features/UF-09/x.tsx` reports `no-restricted-imports`. `from "../UF-08/index.js"` reports nothing, and `from "./focus-prefs.js"` inside `src/features/UF-08/` reports nothing.
- **AC-11 (repo stays green)** `pnpm -w lint` passes on the current tree, which has no violating import today.

## Paths you may change
- `apps/web/src/app/**`, `apps/web/src/components/tab-bar/**`, `apps/web/src/lib/i18n/**` (`en.ts` and the new `flows/`), `apps/web/eslint.config.mjs` (web-shell: `apps/web/*.*`).
- Extras (the T-0300a stub precedent, D-0067 §2): `apps/web/src/features/UF-03/index.tsx` (new, `Summary` stub), `apps/web/src/features/UF-07/index.tsx` (new, `RoutineEditor` stub), and **added** stub exports only in `apps/web/src/features/UF-04/index.tsx` (`Compare`), `UF-06/index.tsx` (`ExerciseHistory`) and `UF-11/index.tsx` (`EditPlan`). Existing exports stay unchanged.
- The e2e append for AC-6 in the existing shell spec under `tests/e2e/` (new tests only).

## Contract impact
None. No schema, API, engine or token change. The routes and lint rules are web-shell conventions (D-0045, D-0071).

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test --force --concurrency=1` green · e2e green for AC-6 · `check:size` green · contracts unchanged · commits start `T-0318:` and cite the screen ids (for example `T-0318 UF-03.3: summary route stub`).

## Accept log

**Accepted 2026-09-29** (product-owner, accept mode). Branch `t/T-0318-phase3-plumbing`, HEAD `e7feac1`, 5 commits from `35a1181`. Build done (frontend-dev), review approve (no must-fix), QA PASS. All 11 ACs met; I re-verified each against the worktree rather than taking the reports on trust.

| AC | Verdict | Evidence |
|---|---|---|
| AC-1 routes table | met | `apps/web/src/app/routes.ts` holds all 6 new entries with exactly the Scope-table path/`screenId`/guard/`showTabBar`. `src/app/__tests__/routes.phase3.test.ts` pins the 12 pre-existing entries as literals in the test file (not a `.snap`, so `vitest -u` cannot rewrite them), asserts the exact length, asserts no `/list` route, and the source test asserts each new `load` is `import("../features/<flow>/index.js")` with the right export plus no static feature import. |
| AC-2 stubs render | met | `routes.phase3.render.test.tsx` renders all 6 paths, asserts exactly one `[data-screen-id]`, the right id, a level-1 heading, and the tab bar only on the `yes` rows. **The hollow assertion the builder self-reported is genuinely fixed:** lines 65–76 now read each feature `index.tsx` and require the literal `<h1>{en.screens.KEY}</h1>` in the export's body, so a hard-coded title fails. QA proved this by rewriting a stub to a byte-identical rendered output — exactly one test failed, the right one. |
| AC-3 ranking | met | Same file: all 6 required path→screen assertions, plus `/session/setup` renders neither UF-03.3 nor UF-09. |
| AC-4 C-02 prefix | met | `TabBar.tsx` `isActive` uses `pathname === to \|\| pathname.startsWith(`${to}/`)`, with `/` exact-only. Test covers 9 paths and asserts the *exact set* of `aria-current="page"` links, so a second lit tab fails. |
| AC-5 guards | met | `auth-guard.phase3.test.tsx`. Both directions for all 5 new `protected` paths (signed out → UF-01.1; signed in → the real screen, which rules out a redirect that passes only because nothing rendered). Summary: stale token that fails to refresh keeps UF-03.3 with no `alert`/`banner`, `SIGNED_OUT` keeps it on screen, and the auth decision is retaken on leaving. The contrast case — `SIGNED_OUT` on `/plan/edit` *does* redirect — rules out every route being wired to the `session` guard by mistake. `auth-guard.test.tsx` unchanged. |
| AC-6 offline chunk | met | `tests/e2e/shell.spec.ts` appended as new tests only (7). Includes a genuine cold offline load warmed on `/` alone, so the chunk can only come from the precache manifest, and `navigator.serviceWorker.ready` before going offline so an HTTP-cache hit can't fake it. QA reproduced with a real `vite build` and self-computed gzip: initial 142.3 KB vs 200 KB (NFR-PERF-2), max chunk 35.3 KB vs 100 KB. |
| AC-7 string modules | met | `flows/uf-01.ts` … `uf-11.ts` all present. `__tests__/flows.test.ts` asserts the directory holds *exactly* those 11 files, each source contains `export const ufNN = {} as const;`, each `en.ufNN` is reference-equal (`toBe`) to its module export, no extra top-level `ufNN` key, and the pre-existing catalogue is pinned as literals (formatters compared by calling them). `jsx-no-literals` test green. |
| AC-8 principle-1 ban | met | `import-bans.test.ts` via `ESLint.lintText` against the shipped config: all 25 (importer, target) pairs, the ticket's own example, `.ts` as well as `.tsx`, and the evasion spellings (`../../features/…`, `../../UF-11/…`, `export … from`, extensionless). Negatives genuinely silent: UF-03/UF-09 → UF-04/UF-05, UF-02 → UF-11, and `lib/`/engine imports all report nothing. A `fatal` filter guards against a parse error making the negatives vacuous. |
| AC-9 body-map ban | met | All 5 workout flows × 4 import spellings (index, folder, deep file, re-export) report exactly 1 error; UF-02 and UF-10 report nothing; other `components/*` stay importable from UF-04. |
| AC-10 index-only | met | Deep `../UF-08/focus-prefs.js` errors; `../UF-08/index.js` clean; own-folder `./`, `./sub/`, `../` clean. Plus two cases the AC didn't require: deep UF-09 → UF-05 (banned even where the index is allowed) and deep UF-02 → UF-11. |
| AC-11 repo green | met | `import-bans.test.ts` lints `src/features` with `lintFiles` and asserts zero `no-restricted-imports` violations; full `pnpm -w lint` green. |

**Definition of done.** Every AC has a passing test (above). `pnpm -w typecheck lint test --force --concurrency=1` green, run twice by QA: 19/19 tasks, `0 cached` (the T-0006 cache-replay false green avoided), 421/421 web tests. e2e green: 24 passed incl. the 7 new AC-6 tests. Contracts unchanged — zero contract files touched (`docs/data-model.md`, `api/openapi.yaml`, `docs/engine-rules.md`, `packages/design-tokens/src/tokens.json`). Commits start `T-0318:` and cite screen ids. Lane respected: only `src/app/**`, `components/tab-bar/**`, `lib/i18n/**`, `eslint.config.mjs`, the permitted feature stub exports and the e2e append.

**Review/QA rigour, for the record.** The review verified the import bans empirically (17 evasion spellings through `ESLint.lintText`, plus `calculateConfigForFile` to confirm the flat-config replace-not-merge hazard is mitigated) rather than by reading, which is the right call for a rule whose failure mode is silent. QA planted 14 faults and every AC failed when it should, and searched for the same class of hollow assertion elsewhere, finding none.

**The two `check:size` findings are follow-ups, not blockers.** Explicitly decided:
1. `check:size` is not a root script — `pnpm -w check:size` fails with `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`; it exists only in `apps/web/package.json`. Confirmed against the root `package.json` (no `check:size` key).
2. `check:size` exits 0 against a stale or missing `dist/`, so "check:size green" is satisfiable without a current build.

Both are defects in the *check*, not in this ticket's work, and neither is in scope here (the script predates T-0318; wiring it into CI after a build is already T-0006). The substance the DoD line exists to protect was verified directly: the budgets pass on a fresh `vite build` with independently computed gzip sizes. Accepting on that evidence. Filed as T-0322 (fail on a stale/absent `dist/`, and either add a root `check:size` or fix the DoD wording to name the filtered command).

**Follow-ups already on the board:** T-0320 (no lint/`check:repo` rule enforces the D-0071 §1 shared-file convention, so the parallel-lane guarantee for the 10 Phase 3 children rests on convention alone), T-0321 (three cosmetic review nice-to-haves), T-0313 (the dynamic-`import()` loophole, explicitly out of scope here). T-0318 unblocks the Phase 3 feature tickets; web-shell order continues T-0319 → T-0301a.
