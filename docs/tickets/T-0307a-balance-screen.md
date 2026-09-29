---
id: T-0307a
title: UF-10.1 / UF-10.2 Balance — the full C-01 body map mounted, nine area rows from `balance()`, area → `/balance/:area`, and a real-keyboard e2e that navigates exactly once
lane: web-feature:UF-10
screens: [UF-10.1, UF-10.2]
decisions: [D-0002, D-0003, D-0013, D-0027, D-0034, D-0045, D-0060, D-0067, D-0068, D-0071]
deps: [T-0318]
status: ready
---
<!-- Written by product-owner 2026-09-29 (spec mode) from T-0307's [a] ACs, `docs/specs/uf-10-balance.md`, D-0071 §1/§2/§8/§9/§10/§11 and the merged T-0318/T-0319. Build flow: wl-build-web. About ½ day. Runs in parallel with T-0306a, T-0307b, T-0308a and T-0308b (no path overlap). -->

## Why
C-01 Body map was built in T-0300d and is mounted **nowhere**. UF-10 is the "why" behind it: nine areas against target over the rolling 14 days, and the reason for each (`docs/specs/uf-10-balance.md`, D-0013, D-0027). Today's compact map already links to `/balance`, and `/balance` currently renders a stub `<h1>`, so the app has a dead end on a path a user can reach.

Two principles are the real risk here, and both have a negative AC below:
- **Principle 3 (deterministic engine).** The screen renders `balance()`'s output and computes nothing from it — no sorting, no re-deriving a colour from `load / target`, no recomputed deficit. The only way to test that is to hand the UI an output that is *internally inconsistent* and assert it renders the inconsistency (AC-A13, AC-A5).
- **Principle 1 (one task on screen).** UF-10 is never reachable during a workout. T-0318's lint ban covers the static import; AC-A12 also asserts no `/balance` link exists in the DOM on a session route, because a lint rule cannot see a hard-coded `<a href="/balance">`.

Both routes already exist (`/balance` → UF-10.1, `/balance/:area` → UF-10.2, `protected`, tab bar on), so this ticket adds no route and edits no shared file.

## Scope
- In:
  - **Data, on the device (D-0071 §8, D-0034 §3).** `features/UF-10` computes
    `balance(await loadEngineHistory(), await loadTargets(), await loadLibrary(), now, tz)` from `@workoutlab/engine` over the `lib/offline` cache. It renders from the cache **first**, and when online runs `refreshAll(now, tz)` with the D-0071 §8 3 s cap and recomputes. It calls **no** Edge Function — not `/balance`, not any other (D-0071 §8).
  - **UF-10.1 All areas** (`/balance`):
    - Header `Last 14 days · {windowStart}–{windowEnd}` from `BalanceResult.windowStart`/`windowEnd` via Intl (e.g. `Last 14 days · 14–27 Sep`), plus a `Plan` link to `/plan`.
    - `<BodyMap variant="full" areas={result.areas} onSelectArea={…} />` from `components/body-map`, imported read-only through its `index.ts`.
    - Nine rows in `result.areas` order. Each: area name, `load / target` via `formatSetCount`, a bar at `min(load/target, 1)` width filled with `var(--wl-color-coverage-{coverageStep})`, the D-0003 attention outline when `needsAttention`, and a `Recovering` tag when `recovering`. Each row is a link to `/balance/:area`.
    - The zero-history empty state and its `Start workout` link to `/session/setup`.
    - `<OfflineStatus variant="text" />` (read-only, from `components/offline-status`).
  - **UF-10.2 Area detail** (`/balance/:area`):
    - Area name, `load / target`, and the deficit as a whole percent — `round(deficit × 100)`, half up, from the engine's `deficit`, never recomputed from `load`/`target`.
    - Target source from `targetSource`: `default` → `From your plan`; `adapted` → `Adapted {d MMM}` from `targetUpdatedAt`; `manual` → `Set by you`.
    - `Last trained …`: today / yesterday / `N days ago` from `lastTrainedDate`, or `Not trained yet` when it is `null`.
    - The 14-day strip from `days[0…13]` (D−13…D), a cell blank when the value is 0.
    - Contributors in **engine order** (`contributors` as returned): library name, `weightedSets`, `lastDate`.
    - `Recovering` plus `≥ 6 weighted hard sets in the last 48 h`, only when `recovering`.
    - `Start workout` → `/session/setup`.
    - An unknown area segment (`/balance/neck`) — see "Edge cases": the redirect is the **shell's** (`isArea` in `routes.ts`), so this ticket asserts the behaviour and does not implement it (AC-A19).
  - **Strings** go in `apps/web/src/lib/i18n/flows/uf-10.ts`, which T-0318 created empty and which **this ticket alone owns** (D-0071 §1). `en.ts` is **not** edited. Area names and the coverage/attention legend labels already exist (`en.bodyMap.areas`, `en.bodyMap`, `@workoutlab/design-tokens` `coverageLegend`/`attentionLegend`) and are reused, not duplicated.
  - **e2e** `tests/e2e/uf-10-balance.spec.ts`, one new file (D-0071 §10).
- Out:
  - **UF-06 Progress** in every part, including the UF-06.1 Balance card — T-0307b, a different lane and a different flow file. Do not edit `features/UF-06/**` or `flows/uf-06.ts`.
  - **Any change to `components/body-map/**`** (web-shell). If C-01 needs a change to render UF-10.1 properly, **stop and raise a follow-up** rather than editing it — T-0321 already holds its open cosmetics. The same for `components/offline-status/**`.
  - **Any change to `apps/web/src/app/**`** (routes, guards, tab bar), `apps/web/src/lib/**` (including `lib/offline` and `lib/i18n/en.ts`) and `apps/web/eslint.config.mjs`. All web-shell, all already done for this ticket's needs.
  - The C-01 silhouette (T-0315) — the D-0060 tile grid is what ships.
  - PRs, e1RM, volume, streaks and charts (D-0068 §5, Phase 5).
  - Any `lib/offline` write, any new Dexie table (T-0319 shipped what is needed), and JSON export (T-0310).
  - Any contract change.

### Edge cases that are in scope
- **Zero history.** Every area at `0 / target`, `coverage-0`, the empty-state copy and `Start workout` (AC-A1). This is the state a brand-new user lands in from Today.
- **Offline.** Renders from the cache with queued sets included, `Offline · last synced HH:MM`, and **no** `role="alert"` and no error screen (AC-A8). The refresh is not awaited before the first paint (AC-A18).
- **Returning after 10 days off.** The 09-17 session still counts on 09-27 and shows `Last trained 10 days ago`; on 10-01 it has aged out and the strip is empty (AC-A7).
- **The window boundary.** A set at local 23:59 on D−13 counts; the day before does not; and it stops counting the moment the local day rolls over (AC-A6).
- **Over target.** `load > target` renders e.g. `24 / 20` with the bar capped at 100 % and `coverage-4` (AC-A4).
- **A bad URL.** `/balance/neck` → `/balance` (AC-A19).
- **An engine value out of range.** A `coverageStep` outside 0–4 is an engine bug; C-01 already falls back to `surface-2`. The row must not crash and must still print `load / target` (AC-A20).
- **Time running out / mid-workout.** Not applicable as a screen state — UF-10 is never shown during a workout, which is AC-A12's job.

## Acceptance criteria
- **Test surfaces.** Vitest + Testing Library + `fake-indexeddb` in `apps/web/src/features/UF-10/__tests__/*.test.tsx`; pure helpers in `apps/web/src/features/UF-10/__tests__/*.test.ts`; Playwright in `tests/e2e/uf-10-balance.spec.ts` where tagged **e2e**; `ESLint.lintText` (the D-0060 §8 pattern) where tagged **lint**.
- **Fixtures** (`docs/specs/uf-10-balance.md`): tz `Europe/Stockholm`, now `2026-09-27T12:00:00+02:00`, default targets chest/back/glutes/quads 20, shoulders/hamstrings 16, arms/core/calves 12, no priority areas. back squat = quads 1, glutes 1, hamstrings .5, core .5. Romanian deadlift = hamstrings 1, glutes .5.
- **"Through the engine"** means the real `@workoutlab/engine` with the `lib/offline` cache seeded — no stub. **"Stubbed"** means a fixed `BalanceResult` handed to the component. Every AC says which, because the two prove different things: the engine cases prove the wiring, the stubbed cases prove the UI computes nothing.

- **AC-A1 (zero history)** Through the engine with an empty cache, UF-10.1 renders 9 rows: `0 / 20` for chest, back, glutes, quads; `0 / 16` for shoulders, hamstrings; `0 / 12` for arms, core, calves. Every bar's fill is `var(--wl-color-coverage-0)`. The copy `Nothing logged in the last 14 days. Your first workout fills this in.` is present and a `Start workout` link with `href="/session/setup"` is present. **Contrast:** with the AC-A2 history seeded, that empty-state copy is **absent from the DOM** (not merely hidden) — otherwise a screen that always renders it passes.
- **AC-A2 (weighted load, warm-ups excluded)** Through the engine: 6 hard and 2 warm-up back-squat sets on 2026-09-25 → quads `6 / 20`, glutes `6 / 20`, hamstrings `3 / 16`, core `3 / 12`. **Contrast:** chest, back, shoulders, arms and calves all still read `0 / target` — so a bug that credited every area would fail.
- **AC-A3 (fractional display)** Through the engine: 5 hard back-squat sets on 2026-09-25 → hamstrings `2.5 / 16`, quads `5 / 20`. The quads string is asserted as exactly `5 / 20`, **not** `5.0 / 20` (an exact-text assertion, so a stray `toFixed(1)` fails).
- **AC-A4 (coverage steps, incl. over target)** Through the engine, quads loads 0, 6, 7, 14, 20 and 24 give the quads row fill `coverage-0`, `-1`, `-2`, `-3`, `-4`, `-4` respectively. At 24 the row reads `24 / 20` and the bar's computed width is exactly 100 % (`min(r,1)`), not 120 %.
- **AC-A5 (engine order — the UI does not sort)** Stubbed `areas` in the order calves (needsAttention, deficit .9), hamstrings (needsAttention, .8), chest (.5), back (.5), shoulders, arms, core, glutes, quads (.2 each) → the nine rows render in exactly that order, and **only** calves and hamstrings carry the attention outline (asserted as the exact set of outlined rows, so a tenth outlined row fails). **Contrast, same test file:** a second stub with the array **reversed** renders reversed. A UI that sorted by deficit, by area name, or by the fixed `AREAS` order would pass the first half and fail the second.
- **AC-A6 (window boundary)** Through the engine: hard sets at local 2026-09-14 23:59 and 2026-09-13 23:59, now 2026-09-27 12:00 → only the 09-14 set counts, and the header reads `Last 14 days · 14–27 Sep`. With the clock at 2026-09-28 00:00:30 local and the screen remounted, **neither** counts and the header reads `Last 14 days · 15–28 Sep`.
- **AC-A7 (returning after 10 days off)** Through the engine, the only session is 2026-09-17 with 4 hard RDL sets. On 09-27, `/balance/hamstrings` shows `4 / 16`, `75 %`, `Last trained 10 days ago`, and the strip cell for 17 Sep reads `4` while the other 13 cells are blank. On 2026-10-01 the same screen shows `0 / 16`, `Not trained yet` is **not** shown (the engine still returns a `lastTrainedDate` outside the window per rule 5 — assert whichever the engine actually returns and pin it), and every strip cell is blank.
- **AC-A8 (offline, queued sets count)** Given `lastSyncedAt` = `08:10` local, `navigator.onLine = false`, and 3 queued hard RDL sets completed at 09:00: hamstrings = the cached value **+ 3** and glutes = the cached value **+ 1.5** (both asserted against the same fixture rendered online, so the delta is measured, not assumed). The header shows `Offline · last synced 08:10`. There is **no** element with `role="alert"` and none with `role="banner"`, and the `supabase.from` spy was **never called**.
- **AC-A9 (contributors, engine order)** Through the engine: 4 RDL on 09-20 and 4 back squat on 09-25 → `/balance/hamstrings` shows `6 / 16`, `63 %`, `Last trained 2 days ago`; the contributor rows read `Romanian deadlift 4 · 20 Sep` then `Back squat 2 · 25 Sep`; strip cells 20 Sep = `4` and 25 Sep = `2`. **Contrast:** a stubbed `contributors` array in the opposite order renders in that opposite order (the UI does not re-sort by `weightedSets` or by name).
- **AC-A10 (target source, all three)** Stubbed: `{targetSource: "adapted", targetUpdatedAt: "2026-09-20T08:00:00Z"}` → `Adapted 20 Sep`. `"default"` → `From your plan`. `"manual"` → `Set by you`. Each asserted as the exact visible string, and in each case the other two strings are **absent** from the DOM.
- **AC-A11 (recovering)** Stubbed quads `recovering: true` → the UF-10.1 quads row shows `Recovering`, and `/balance/quads` shows `Recovering` **and** `≥ 6 weighted hard sets in the last 48 h`. With `recovering: false`, neither the tag nor the explanation is in the DOM (`queryBy…` returns null, not a hidden node). Also with `true` on quads only: **no other row** shows the tag.
- **AC-A12 (never reachable in a workout — principle 1)** Two halves, both required:
  - **lint:** `ESLint.lintText` of `import { Balance } from "../UF-10/index.js";` as `src/features/UF-09/x.tsx` reports `no-restricted-imports`, and the same as `src/features/UF-08/x.tsx`. **Contrast:** the same import as `src/features/UF-02/x.tsx` reports **nothing** (UF-02 may import UF-10, D-0071 §4) — which proves the rule is scoped and the positive result is not a blanket ban. A `fatal` filter guards the negative from passing on a parse error.
  - **render:** rendering the router signed in at `/session/<id>` and at `/session/<id>/summary` finds **no** `a[href^="/balance"]` anywhere in the DOM. This is the half the lint rule cannot give: a hard-coded `<a href="/balance">` in a UF-09 file imports nothing.
- **AC-A13 (the UI computes nothing — principle 3)** Stubbed quads `{load: 3, target: 20, coverageStep: 4, deficit: 0.85, needsAttention: false}` — deliberately inconsistent. UF-10.1's quads row shows `3 / 20` with a `coverage-4` fill and **no** attention outline; `/balance/quads` shows `85 %`. A UI that derived the step from `3/20` would show `coverage-1`, and one that derived the deficit would show `85 %` only by coincidence — so also assert the reverse pairing in the same test: `{load: 19, target: 20, coverageStep: 0, deficit: 0.05}` renders `19 / 20`, `coverage-0`, `5 %`.
- **AC-A14 (row a11y)** Stubbed hamstrings `{load: 6, target: 16, needsAttention: true}` → the row link's accessible name is exactly `Hamstrings, 6 of 16 hard sets, needs attention`. With `needsAttention: false` the name omits `needs attention`. The row's computed `min-height` and `min-width` are each ≥ 44 CSS px (NFR-A11Y-2).
- **AC-A15 (the full C-01 is mounted, and fed the same data as the rows)** UF-10.1 contains **exactly one** `[data-component="C-01"][data-variant="full"]` region, with 9 `button[data-area]`. For a stub where hamstrings is `{load 6, target 16, coverageStep 2, needsAttention true}`, both the C-01 hamstrings button and the hamstrings row show `6 / 16` and a `coverage-2` fill; then the test **mutates that one area in the stub** to `{load 18, coverageStep 4, needsAttention false}`, re-renders, and asserts **both** updated — so a map fed a second, independent source would fail. The C-01 legend is present. Clicking the hamstrings button lands on `/balance/hamstrings` rendering `[data-screen-id="UF-10.2"]`. **Contrast:** UF-10.1 contains **no** `[data-variant="compact"]` region (the Today variant is not reused here).
- **AC-A16 (real keyboard, exactly once — e2e)** In the preview build with an injected session and the mocked Supabase (`tests/e2e/fixtures`): Tab to the C-01 hamstrings button, press **Enter** → the URL is `/balance/hamstrings`; **one** `page.goBack()` returns to `/balance` (so exactly one history entry was pushed, which is the defect D-0060 §5 exists to prevent). Repeat with **Space** on the calves button: the URL is `/balance/calves`, the keyup does **not** navigate a second time, and one `goBack()` returns to `/balance`. Also assert, as the contrast, that after Enter the URL is **not** `/balance` (i.e. the navigation happened at all) — a handler that no-op'd would otherwise pass the `goBack` half.
- **AC-A17 (axe — e2e, NFR-A11Y-1)** `@axe-core/playwright` reports 0 serious or critical violations on `/balance` with the zero-history fixture, on `/balance` with the mixed fixture, and on `/balance/hamstrings`.
- **AC-A18 (renders before the network)** Given a seeded cache and `fetch` stubbed to a promise that **never resolves**, with `navigator.onLine = true`: the 9 rows are on the DOM after the cache read, asserted **without** waiting on the refresh (the T-0300b AC-B6 / T-0301a AC-2 wait-free pattern). No `refreshAll` promise is awaited before the first paint. **Contrast:** the same test asserts the refresh *was* started (the spy was called) — so a screen that never refreshes at all does not pass by doing less.
- **AC-A19 (a bad area segment)** `/balance/neck` renders `[data-screen-id="UF-10.1"]` at location `/balance` (the shell's `isArea` redirect). **Contrast:** `/balance/calves` renders `[data-screen-id="UF-10.2"]` and stays at `/balance/calves`. If the shell does **not** currently redirect, do **not** add the redirect here (`app/routes.ts` is web-shell's) — record the actual behaviour, keep the `/balance/calves` half, and file a follow-up in your result.
- **AC-A20 (a bad engine value does not crash)** Stubbed quads `coverageStep: 7` (outside 0–4) → the row still renders `load / target`, the fill falls back to `var(--wl-color-surface-2)` (C-01's existing `fillToken` behaviour), and nothing throws. Stubbed `target: 0` with `load: 0` → the row renders without an `Infinity`/`NaN` string anywhere in its text and the bar width is 0 %.
- **AC-A21 (strings and the shared-file boundary)** Every user-facing string this screen renders comes from `en.uf10` (i.e. `lib/i18n/flows/uf-10.ts`) or from an existing `en.*`/design-token label. A source test asserts `apps/web/src/lib/i18n/en.ts` is **not** modified by this ticket — implemented as: no file under `features/UF-10/**` declares a user-facing literal (the existing `react/jsx-no-literals` rule, which must stay green) **and** `flows/uf-10.ts` is non-empty with every key this feature uses reachable as `en.uf10.*`. `pnpm -w lint` green is part of this AC.

## Paths you may change
- `apps/web/src/features/UF-10/**` (the lane: `web-feature:UF-10`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-10.ts` — this ticket's own flow file, and no other (D-0071 §1). Adding keys only; the `export const uf10 = {…} as const` shape stays.
  - `tests/e2e/uf-10-balance.spec.ts` — a **new** file only (qa lane grant, D-0071 §10). Additions to `tests/e2e/fixtures/**` are allowed **only** as new exports; changing an existing fixture export is not.
- **Not yours, and each is already done for you:** `apps/web/src/app/**` (both routes exist), `apps/web/src/components/**` (C-01 and OfflineStatus are read-only imports), `apps/web/src/lib/**` including `lib/i18n/en.ts` and `lib/offline/**`, `apps/web/eslint.config.mjs`, `apps/web/src/features/UF-06/**`, `apps/web/src/lib/i18n/flows/uf-06.ts`, any file under `packages/**`, and every contract file. If you believe you need one of these, stop and put it in your result as a follow-up — do not edit it.

## Contract impact
None. The screens read `BalanceResult`/`AreaBalance` exactly as `api/openapi.yaml` and `packages/shared` define them, and call only the engine's public `balance()`. No schema, API, engine-rule or token change. D-0067 and D-0068 are `status: revisit`; nothing here depends on a point of theirs that D-0071 amended.

## Ambiguity resolved (state it, do not stall)
`docs/specs/uf-10-balance.md` §"Target source" lists only `default` and `adapted`, while T-0307's [a] scope adds `manual` → `Set by you` and the engine's `TargetSource` has three members. **Default taken: three sources, `manual` → `Set by you`** (the superset, and the only one that is total over the type). This is an omission in the spec, not a conflict with a `decided` decision, so no triage. If the copy is wrong, it is a one-string fix in `flows/uf-10.ts`.

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test --force --concurrency=1` green — note the **`--force`**: without it turbo replays another worktree's cache and reports a false green · `pnpm --filter @workoutlab/web test:e2e` green, including the new `uf-10-balance.spec.ts` (AC-A16, AC-A17) · contracts unchanged · **no file outside "Paths you may change" touched** (check your own `git diff --name-only` against that list before you hand back; T-0320 will make this mechanical, but it is not merged yet) · commits start `T-0307a:` and cite the screen ids (e.g. `T-0307a UF-10.1: mount full C-01`).

Note on `check:size`: `check:size` lives **only** in `apps/web/package.json` (`pnpm -w check:size` errors), and it **exits 0 against a stale or absent `dist/`** (T-0322) — so "check:size green" proves nothing on its own. If you make a bundle claim, run a fresh `pnpm --filter @workoutlab/web build` first and report the **measured** gzip numbers: the UF-10 chunk against the 100 KB budget and the initial bundle against NFR-PERF-2 (200 KB). Otherwise make no size claim.
