---
id: T-0318
title: Phase 3 plumbing — new sub-routes with stubs (UF-03.3, UF-04.3, UF-06.2, UF-07.1, UF-11.3), C-02 active tab by prefix, per-flow i18n modules, cross-feature import bans
lane: web-shell
screens: [UF-03.3, UF-04.3, UF-06.2, UF-07.1, UF-11.3, C-02]
decisions: [D-0018, D-0045, D-0060, D-0063, D-0067, D-0071]
deps: [T-0300a, T-0300b]
status: ready
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
