---
id: T-0306a
title: UF-04.1 / UF-04.2 / UF-04.3 Library (browse with search and filters in the URL, detail with D-0005 attribution, compare from data we have) plus the exported in-workout `ExerciseHowTo` dialog
lane: web-feature:UF-04
screens: [UF-04.1, UF-04.2, UF-04.3]
decisions: [D-0002, D-0005, D-0034, D-0045, D-0061, D-0067, D-0069, D-0071, D-0075, D-0079]
deps: [T-0318, T-0319, T-0334]
status: ready
---
<!-- Written by product-owner 2026-09-29 (groom mode) from T-0306's [a] ACs, D-0069 §1–§4, D-0071 §2/§3/§8/§9/§10, D-0075 and D-0079 §1–§6, over the merged T-0318/T-0319/T-0334. Build flow: wl-build-web. About ¾ day, so not split. If a build runs long, cut along this line: T-0306a1 = UF-04.1 plus ExerciseHowTo (AC-1…AC-6, AC-14…AC-16), T-0306a2 = UF-04.2 plus UF-04.3 (AC-7…AC-13), with AC-17's e2e split by page. Runs in parallel with T-0307a, T-0307b, T-0308a and T-0308b (no path overlap). -->

## Why
Every exercise gets its explanation (UF-04 purpose, user flows v2), and the text carries the attribution that D-0005 requires (confirmed in D-0061). Today `/library`, `/library/:exerciseId` and `/library/:exerciseId/compare/:otherId` are T-0300a/T-0318 stubs that render an `<h1>` and the raw id.

`ExerciseHowTo` is the one piece of UF-04 that renders **inside a workout**. T-0305a mounts it on UF-09.9 and UF-03.1 through `features/UF-09/seams.tsx` (D-0071 §4). Two principles carry the risk, and each gets a negative AC:
- **Principle 1 (one task on screen).** The dialog contains no link out of the session, and it can't start a network wait mid-set (AC-14, AC-15).
- **Principle 3 (deterministic engine).** "My equipment" is the engine's `isEligible`, and the time per set is the engine's `setCostS`. Neither is re-derived in the UI (AC-4, AC-12).

All three routes already exist (`protected`, tab bar on, lazily loading `Library`, `LibraryDetail` and `Compare` from `features/UF-04/index.tsx`). This ticket adds no route and edits no shared file.

## Scope
- In:
  - **Data (D-0071 §8, D-0067 §5).**
    - The screens read only the T-0319 read-only loaders from `lib/offline`: `loadLibrary()`, `loadExerciseDetail(id)`, `loadVariants(id)` and `loadProfile()`.
    - They render from the cache **first**. When online they run `refreshAll(now, tz)` with the D-0071 §8 3 s cap, then re-read and re-render.
    - They call no Edge Function. They make **no** direct IndexedDB access (`offlineDb()`, Dexie tables) and no write of any kind.
    - `ExerciseHowTo` never refreshes (D-0079 §6).
  - **UF-04.1 Browse** (`/library`):
    - Every `kind: "exercise"` entry, sorted by `name` with `localeCompare`. No warm-up move appears (D-0069 §1).
    - A search field: trimmed, case-insensitive substring match on `name`.
    - One chip row: `All`, the 9 areas in the fixed order (the exercise has weight 1 there), and `My equipment` (engine `isEligible(e, profile)`, empty `excludeIds`). An area chip is single-select, and `My equipment` toggles on top of it. Search AND area AND equipment all combine.
    - Filter state lives in the search params `q`, `area` and `mine=1`, updated with `replace` (D-0079 §1).
    - Each row: the name, the primary areas (engine `primaryAreas`), the secondary areas (weight 0.5, fixed order), the equipment (`Bodyweight` when none), and the whole row as one link to `/library/:id`.
    - Empty states: `No exercises match "{q}"` (when `q` is non-empty), `No exercises match these filters` (when `q` is empty), and the never-downloaded state (D-0079 §3).
    - `My equipment` is **absent** when `loadProfile()` is `null`.
  - **UF-04.2 Detail** (`/library/:exerciseId`):
    - The name, and the tag line `{Type} · {Level} · {equipment}`.
    - Primary pills (highlighted) and secondary pills (grey).
    - The instructions as an `<ol>` in stored order, the `Common mistakes` list (hidden when `[]`) and the cue (hidden when `null`).
    - `Variations`: one link per `loadVariants(id)` entry that is in the library, in loader order, to `/library/:id/compare/:variantId`. The section is hidden when no linkable variant remains.
    - A `My history` link to `/progress/:id`.
    - The D-0005 attribution block (D-0069 §2, D-0079 §5).
    - The detail-missing state (D-0079 §3).
    - An unknown id or a warm-up id redirects to `/library` (D-0079 §4).
  - **UF-04.3 Compare** (`/library/:exerciseId/compare/:otherId`):
    - Two columns, current | other: name (as the column header), primary areas, secondary areas, equipment, type, level, `{m:ss} per set` from engine `setCostS`, and the cue (`—` when `null` or when the detail is missing).
    - A link to the other exercise's `/library/:otherId`.
    - An `otherId` that is unknown, a warm-up or equal to `exerciseId` redirects to `/library/:exerciseId`. An unknown `exerciseId` redirects to `/library`.
  - **`ExerciseHowTo`** (D-0069 §4, D-0079 §6), props `{exerciseId: string; onClose(): void}`:
    - `role="dialog"`, `aria-modal="true"`, named `How to: {name}`, with the cue and the numbered instructions.
    - A single `Close` button. No `a[href]`.
    - Escape closes it, and focus is restored.
    - It is implemented in its own module (`features/UF-04/ExerciseHowTo.tsx`), so that the UF-09 chunk importing it through `index.tsx` needn't evaluate the screens' data code at first paint.
  - **`features/UF-04/index.tsx` exports exactly** `Library`, `LibraryDetail`, `Compare` and `ExerciseHowTo` (D-0071 §3). A test pins the key set.
  - **Strings** go in `apps/web/src/lib/i18n/flows/uf-04.ts` only (D-0071 §1, D-0075). Area names are reused from `en.bodyMap.areas` and not duplicated. `en.ts` is **not** edited.
  - **e2e:** `tests/e2e/uf-04-library.spec.ts`, one new file (D-0071 §10).
- Out:
  - **UF-05.1 Swap sheet** in every part (T-0306b, lane web-feature:UF-05).
  - **Mounting `ExerciseHowTo`** anywhere: the UF-09.9 `how-to` seam and UF-03.1 are T-0305a's. This ticket only exports it.
  - "Add to a routine" on UF-04.2 (D-0069 §2: UF-07.1 has its own picker).
  - Research notes, emphasis bars, stance diagrams, movement patterns, variant blurbs and "Swap it in for today only" (D-0069 §3).
  - Exercise images or illustrations (no `image_url` in v1, D-0029).
  - A shared equipment-label module (follow-up, D-0079 §5).
  - Any change to `lib/offline`, routes, the tab bar, lint config or any contract.

### Edge cases that are in scope
- **Offline.** Every screen renders from the cache with `fetch` rejecting, with no error screen and no `role="alert"` (AC-10). The first paint doesn't wait on the refresh (AC-11).
- **Never online on this device.** The library cache is empty, so UF-04.1 shows the download copy, not a "no match" message (AC-6).
- **Upgraded offline from Dexie v1.** The library rows are present but `exerciseDetails` is empty, so UF-04.2 renders what it has plus the "download next time" line, and doesn't redirect (AC-9).
- **Mid-workout (`ExerciseHowTo`).** No link out, no network, focus restored (AC-14, AC-15).
- **A bad URL.** An unknown id, a warm-up id, compare-with-self and compare-with-unknown each redirect to a defined place (AC-13).
- **No profile yet.** `My equipment` is absent, not a crash (AC-4).
- **Zero history, returning after 10 days off, time running out.** Not applicable: UF-04 reads no history and shows no budget. The `My history` link lands on UF-06.2, which handles zero history itself (T-0307b).

## Acceptance criteria
- **Test surfaces.**
  - Vitest + Testing Library + `fake-indexeddb` in `apps/web/src/features/UF-04/__tests__/*.test.tsx`, seeding the cache through `lib/offline`'s test helpers (`freshOfflineDb`, `signIn`) and the public refreshes, with Supabase spied by `createSelectSpy` (`lib/offline/__tests__/select-spy.ts`; the refreshes only `select`, and `createSupabaseSpy` has no `select`).
  - A partial-cache state that no refresh can produce (AC-9: `refreshLibrary` writes `libraryCache` and `exerciseDetails` in one transaction) is seeded with `offlineDb()` **in the test file**. The no-`offlineDb(` rule (AC-16) covers non-test code only.
  - Playwright in `tests/e2e/uf-04-library.spec.ts` where tagged **e2e**.
  - `ESLint.lintText` (the D-0060 §8 pattern) where tagged **lint**.
- **Fixture "L1+"**: the engine L1 table (`docs/engine-rules.md`, 22 exercises) plus `goblet-squat` (compound, beginner, `[dumbbell]`, quads 1, glutes 1) and `leg-press` (compound, beginner, `[machine]`, quads 1, glutes 1, hamstrings .5), so 24 exercises, plus the 8 warm-up moves.
  - Names are the ids in sentence case, with `db-` written out as `Dumbbell` (`Back squat`, `Barbell row`, `Dumbbell bench press`, `Dumbbell row`, `Pull-up`, `Straight-arm pulldown`, …). Warm-up moves drop the `wu-` prefix (`wu-cat-cow` → `Cat cow`). The rows are seeded in **reverse** alphabetical order, so an unsorted render fails.
  - Details: back-squat `{instructions: ["Brace", "Sit down between your heels", "Drive up"], mistakes: ["Knees caving in"], cue: "Chest up", source: "workoutlab", license: "LicenseRef-workoutLab", attribution: null, sourceUrl: null, variants: ["goblet-squat", "leg-press"]}`. wu-cat-cow `{instructions: ["Round your back", "Arch your back"], mistakes: [], cue: "Move slowly", source: "workoutlab", license: "LicenseRef-workoutLab", attribution: null, sourceUrl: null, variants: []}`.
  - Profile: F-profile (beginner, full equipment). Clock: tz `Europe/Stockholm`, now `2026-09-27T12:00:00+02:00`.

- **AC-1 (browse order, no warm-ups)** Given L1+, UF-04.1 lists exactly 24 rows. The first three are `Back squat`, `Barbell row`, `Bench press`, and the last two are `Seated cable row`, `Straight-arm pulldown`. No row links to an `href` containing `/library/wu-`. **Contrast:** with the fixture seeded in reverse order, the rendered order is unchanged, so the UI sorts and doesn't just echo the cache.
- **AC-2 (search)**
  - Typing `  ROW ` shows exactly `Barbell row`, `Dumbbell row`, `Inverted row`, `Seated cable row` (asserted as the exact set). `Straight-arm pulldown` is absent.
  - Typing `zzz` shows exactly `No exercises match "zzz"` and no rows.
  - Clearing the field restores all 24 rows.
- **AC-3 (area chip, weight 1 only)** The `Hamstrings` chip shows exactly `Leg curl` and `Romanian deadlift`. **Contrast:** `Back squat` (hamstrings .5) and `Leg press` (hamstrings .5) are absent. The chips are exactly `All`, then the 9 area names in the fixed order, then `My equipment`, and they are exposed with `aria-pressed`.
- **AC-4 (My equipment = engine `isEligible`)**
  - With profile `{level: "beginner", equipment: ["dumbbell"]}`, `My equipment` shows exactly `Biceps curl`, `Dead bug`, `Goblet squat`, `Lateral raise`, `Plank`, `Push-up`. The test pins these literals **and** checks they equal the L1+ entries for which the real engine `isEligible(e, profile)` is true. A `vi.spyOn` on the engine module shows the component calls `isEligible`.
  - **Contrast:** `Dumbbell row` (needs a bench) is absent.
  - With full equipment, `Pull-up` (intermediate) is absent at `beginner` and present at `intermediate`.
  - Combined with `Core`, it shows exactly `Dead bug`, `Plank`.
  - With `loadProfile()` → `null`, no `My equipment` chip is in the DOM, and the other 10 chips still work.
- **AC-5 (filters in the URL, D-0079 §1)**
  - With profile `{level: "beginner", equipment: ["dumbbell", "bench"]}`, cold renders show that each of the three params is read:
    - `/library?q=row&area=back&mine=1` shows exactly `Dumbbell row`, with the `Back` and `My equipment` chips pressed and the field reading `row`.
    - `/library?q=row&area=back` shows the 4 AC-2 rows.
    - `/library?q=row&area=chest` shows exactly `No exercises match "row"`.
  - At `/library?area=back`, typing `pull` updates the location to `?area=back&q=pull` **without** adding a history entry (the history length is unchanged).
  - Clicking `Lat pulldown` and then going Back renders UF-04.1 with the search field reading `pull` and the `Back` chip pressed.
  - `/library?area=neck` renders all 24 rows with `All` pressed.
- **AC-6 (never downloaded)** With an empty library cache and `navigator.onLine = false`, UF-04.1 shows `The exercise library downloads the first time you're online.` **Contrast:** it does **not** show `No exercises match`, and no chip row is rendered.
- **AC-7 (detail content)** `/library/back-squat` shows:
  - the heading `Back squat`, and the tag line exactly `Compound · Beginner · Barbell, Rack`;
  - primary pills `Glutes`, `Quads` and secondary pills `Core`, `Hamstrings`, each in that order (fixed area order, D-0079 §2), with primary and secondary distinguishable by a `data-weight="primary|secondary"` attribute;
  - an `<ol>` of 3 items in stored order, the `Common mistakes` heading with 1 item, and `Chest up`;
  - a `My history` link with `href="/progress/back-squat"`.

  **Contrast:** with `mistakes: []`, the `Common mistakes` heading is absent from the DOM. With `cue: null`, no cue element is rendered. The push-up tag line reads `Compound · Beginner · Bodyweight`. An equipment value `trx` (not in the vocabulary) prints as `trx`, with no crash.
- **AC-8 (attribution, D-0005, D-0069 §2, D-0079 §5)**
  - `{source: "wger", license: "CC-BY-SA-4.0", attribution: "wger.de contributors", sourceUrl: "https://wger.de/exercise/1"}` shows exactly `Text: wger.de contributors · CC-BY-SA-4.0 · Source`. The licence link's `href` is `https://creativecommons.org/licenses/by-sa/4.0/`, and `Source`'s `href` is `https://wger.de/exercise/1`. Both have `target="_blank"` and `rel="noopener noreferrer"`.
  - `{source: "workoutlab", license: "LicenseRef-workoutLab"}` shows exactly `Text: workoutLab`, and there is no `a[href*="creativecommons"]`.
  - A wger row with `sourceUrl: null` hides **only** `Source` (the attribution and licence stay). One with `attribution: null` hides only the attribution part.
  - A wger row with `license: "CC0-1.0"` prints `CC0-1.0` as text, with no link.
- **AC-9 (detail missing, D-0079 §3)** With back-squat in `libraryCache` and `exerciseDetails` empty, `/library/back-squat` stays at that URL and renders the heading, tag line and pills, plus exactly `Instructions download the next time you're online.` **Contrast:** there is no `<ol>`, no `Variations` section and no `Text:` attribution line.
- **AC-10 (offline)** After one online `refreshAll()`, with `fetch` rejecting and `navigator.onLine = false`, AC-1, AC-7 and AC-11's variant links render identically to online (the rows' text and `href`s deep-equal). There is no `role="alert"`, the supabase spy count is unchanged, and `<OfflineStatus variant="text" />` reads `Offline · last synced HH:MM` on UF-04.1.
- **AC-11 (variants → compare; renders before the network)**
  - `loadVariants("back-squat")` = `["goblet-squat", "leg-press"]` gives exactly two `Variations` links, in that order, with `href` `/library/back-squat/compare/goblet-squat` and `/library/back-squat/compare/leg-press`.
  - Variants `["goblet-squat", "nope"]` give one link, so an unknown variant id is skipped. `[]` gives no `Variations` heading in the DOM.
  - **Wait-free:** with the cache seeded, `navigator.onLine = true` and `refreshAll` spied to return a promise that never resolves, the 24 UF-04.1 rows are in the DOM without waiting on the refresh. (Stub `refreshAll`, not `fetch`: with Supabase spied, a `fetch` stub is never reached and the refresh would resolve at once.) **Contrast:** the refresh spy *was* called.
- **AC-12 (compare, D-0069 §3)** `/library/back-squat/compare/leg-extension` shows column headers `Back squat` | `Leg extension`, and these rows:

  | Row | Back squat | Leg extension |
  |---|---|---|
  | Primary | `Glutes, Quads` | `Quads` |
  | Secondary | `Core, Hamstrings` | `—` |
  | Equipment | `Barbell, Rack` | `Machine` |
  | Type | `Compound` | `Isolation` |
  | Level | `Beginner` | `Beginner` |
  | Time per set | `2:45 per set` | `1:45 per set` |

  There is a link to `/library/leg-extension`. The time strings come from the engine: with `setCostS` spied, it is called with both exercises. **Contrast:** plank (timed, `defaultDurationS` 45, isolation) reads `1:45 per set`, and a timed fixture with `defaultDurationS` 60 reads `2:00 per set`, so a UI hard-coding 45 s of work fails.
- **AC-13 (bad URLs, D-0079 §4)**
  - These redirect (the location and the rendered `data-screen-id` are asserted):
    - `/library/nope` → `/library` (UF-04.1)
    - `/library/wu-cat-cow` → `/library` (UF-04.1)
    - `/library/back-squat/compare/back-squat` → `/library/back-squat` (UF-04.2)
    - `/library/back-squat/compare/nope` → `/library/back-squat` (UF-04.2)
    - `/library/back-squat/compare/wu-cat-cow` → `/library/back-squat` (UF-04.2)
    - `/library/nope/compare/leg-press` → `/library` (UF-04.1)
  - **Contrast:** `/library/leg-press` stays and renders UF-04.2.
  - Each redirect is a `replace` (history length unchanged), so Back doesn't loop.
- **AC-14 (`ExerciseHowTo`, principle 1)**
  - Rendered after a click on an opener `<button>Open</button>`, `<ExerciseHowTo exerciseId="back-squat" onClose={spy} />` gives exactly one `role="dialog"` with `aria-modal="true"`, accessible name exactly `How to: Back squat`. It contains `Chest up`, an `<ol>` of the 3 instructions, and **zero** `a[href]` elements. Its only button is `Close`.
  - Escape calls `onClose` once. `Close` calls it once.
  - When the caller then unmounts it, `document.activeElement` is the opener.
  - With the opener removed from the DOM before close, closing doesn't throw.
  - `exerciseId="wu-cat-cow"` renders the warm-up's how-to, named `How to: Cat cow`, with `Move slowly` and an `<ol>` of 2 items (warm-ups are allowed here, D-0079 §4).
  - `exerciseId="nope"` renders a dialog named `How to` with `Instructions download the next time you're online.` and `Close`, with no throw.
  - The vitest axe helper (D-0060 §7) finds 0 violations on the open dialog.
- **AC-15 (`ExerciseHowTo` reads the cache only, D-0079 §6)** With `navigator.onLine = true` and the cache seeded, opening and closing `ExerciseHowTo` makes **zero** calls to `refreshAll`, the supabase spy and `fetch`. **Contrast, same file:** `LibraryDetail` under the same conditions **does** call `refreshAll` once. That proves the spy is wired, so the zero is real.
- **AC-16 (exports, imports and strings)**
  - `Object.keys(await import("../index.tsx"))` sorted equals exactly `["Compare", "ExerciseHowTo", "Library", "LibraryDetail"]`.
  - **lint:** `ESLint.lintText` as `src/features/UF-04/x.tsx` of `import { Progress } from "../UF-06/index.js";` and of `import { BodyMap } from "../../components/body-map/index.js";` each reports `no-restricted-imports` (D-0071 §9: UF-04 renders inside UF-09). **Contrast:** `import { loadLibrary } from "../../lib/offline/index.js";` reports nothing, and a `fatal` filter guards against a parse error passing as "nothing".
  - A source test finds no `offlineDb(` and no `from "dexie"` under `features/UF-04/**`, excluding `__tests__/**` (D-0067 §5; test files may seed the cache directly).
  - `react/jsx-no-literals` stays green over `features/UF-04/**`. Every key the feature uses is reachable as `en.uf04.*`.
  - `lib/i18n/__tests__/flows.test.ts` stays green, which requires `flows/uf-04.ts` to stay multi-line with its closing `} as const;` at column 0 (D-0075).
- **AC-17 (a11y, e2e, NFR-A11Y-1/-2)** In the preview build with an injected session and the mocked Supabase:
  - `@axe-core/playwright` finds 0 serious or critical violations on `/library`, `/library/back-squat` and `/library/back-squat/compare/leg-extension`.
  - Every chip and every list row has a `boundingBox()` of ≥ 44 × 44 CSS px.
  - Keyboard: Tab to the `Hamstrings` chip, press Space, then the list shows 2 rows. Tab to `Leg curl`, press Enter, then the URL is `/library/leg-curl`.

## Paths you may change
- `apps/web/src/features/UF-04/**` (the lane: `web-feature:UF-04`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-04.ts`: this ticket's own flow file and no other (D-0071 §1, D-0075). You may add keys only. The file stays `export const uf04 = {` … a newline, then `} as const;` at column 0.
  - `tests/e2e/uf-04-library.spec.ts`: a **new** file only (qa lane grant, D-0071 §10).
  - `tests/e2e/fixtures/uf-04-library-data.ts`: a **new** fixture file for the L1+ rows the e2e mock serves. Existing fixture files are not edited, which keeps this ticket clear of the other parallel lanes' fixture additions.
- **Not yours, and each is already done for you:**
  - `apps/web/src/app/**`: all three routes exist.
  - `apps/web/src/components/**`: OfflineStatus is a read-only import, and body-map is banned here.
  - `apps/web/src/lib/**`, including `lib/i18n/en.ts` and `lib/offline/**`.
  - `apps/web/eslint.config.mjs`.
  - Every other `features/UF-NN/**`, including `features/UF-05/**` and `features/UF-09/seams.tsx`.
  - Every other flow file.
  - `tests/e2e/fixtures/supabase-mock.ts`.
  - `packages/**`.
  - Every contract file.

  If you believe you need one of these, stop and put it in your result as a follow-up. Don't edit it.

## Contract impact
None. The screens read `LibraryExercise` and the T-0319 `ExerciseDetail` exactly as cached, and call only the engine's public `isEligible`, `primaryAreas` and `setCostS`. There is no schema, API, engine-rule or token change. The new defaults are in D-0079 (`revisit`).

## Ambiguity resolved (state it, do not stall)
- **Area order.** T-0306's parent AC-A5/A8 wrote `Quads, Glutes`. The engine's `primaryAreas` returns the fixed order, `Glutes, Quads`. **The engine order wins** (D-0079 §2). This is a prose slip in the parent, not a conflict with a `decided` decision.
- **AC-A1 count.** The parent said 22 rows over L1. This ticket's L1+ fixture adds the two variants the compare ACs need, so the count is 24. Same rule, larger fixture.
- **Names.** The parent's `Db row` becomes `Dumbbell row` in the fixture. Only the fixture changes. The search and sort rules don't.

## Definition of done
- Every AC has a passing test.
- `pnpm -w typecheck lint test --force --concurrency=1` is green. Note the **`--force`**: without it, turbo replays another worktree's cache and reports a false green.
- `pnpm --filter @workoutlab/web test:e2e` is green, including the new `uf-04-library.spec.ts` (AC-17).
- Contracts are unchanged.
- **No file outside "Paths you may change" is touched.** Check `git diff --name-only main...HEAD` against that list. When T-0320 is merged, `pnpm check:repo` gives the same answer mechanically (it reads this section).
- Commits start `T-0306a:` and cite screen IDs (e.g. `T-0306a UF-04.2: D-0005 attribution block`).

**Bundle claims:** make one only after a fresh `pnpm --filter @workoutlab/web build`, with measured gzip numbers (T-0322: `check:size` exits 0 on a stale `dist/`). The UF-04 chunk budget is 100 KB.

## Accept log

**Verdict: `done`.** Accepted by product-owner 2026-09-30 (accept mode) at branch `t/T-0306a-library`, HEAD `237b410`, working tree clean, 23 files / +2823/−26. Build → review (request-changes) → QA (FAIL) → rework, all resolved.

### The 17 ACs

All 17 met. Evidence, by test file under `apps/web/src/features/UF-04/__tests__/`:

| AC | Evidence | Anti-vacuity contrast that is present |
|---|---|---|
| AC-1 browse order, no warm-ups | `browse.test.tsx:54-83` — 24 rows, first three and last two pinned, `L1_PLUS_NAMES_SORTED` deep-equal, zero `a[href*="/library/wu-"]` | `:65-69` asserts the *fixture* is in reverse id order, so an echo of the cache fails |
| AC-2 search | `:85-104` — `"  ROW "` → the exact 4-row set, `Straight-arm pulldown` absent, `zzz` → the literal empty-state string, clearing restores 24 | `BACK` → 1 row proves case-insensitivity is not a no-op |
| AC-3 area chip, weight 1 only | `:106-134` — `Hamstrings` → exactly `Leg curl`, `Romanian deadlift`; the 11 chip labels pinned as an ordered literal array; `aria-pressed` both ways | `Back squat` and `Leg press` (hamstrings .5) asserted absent; `Calves` click flips `Hamstrings` to `false` (single-select) |
| AC-4 My equipment = engine `isEligible` | `:136-194` — the 6 literals **and** an independent recomputation through `vi.importActual` of the real engine (`:148-155`); `hoisted.isEligible` proves the component calls it; `Core` combination; `profile: null` → 10 chips, no `My equipment`, others still filter | `Dumbbell row` absent (needs a bench); `Pull-up` absent at beginner, present at intermediate |
| AC-5 filters in the URL | `:196-248` — all three params read cold; `?area=back&q=pull` with `window.history.length` unchanged; Back from the detail restores text + chip; `area=neck` → 24 rows, `All` pressed | `q=row&area=chest` → the literal `No exercises match "row"` |
| **AC-6 never downloaded** | Offline half `:252-259`; **online half `:265-303`** — see the weighing below | The online test defers the refresh through a manually-resolved promise and probes at real timers `[0, 5, 50]` ms; I fault-proved it myself (below) |
| AC-7 detail content | `detail.test.tsx:33-93` — heading, tag line asserted as the exact string `Compound · Beginner · Barbell, Rack`, `data-weight` pills in fixed engine order, `<ol>` of 3 in stored order, mistakes scoped `within(section)`, cue, `href="/progress/back-squat"` | `mistakes: []` hides the heading; `cue: null` renders no `[data-field="cue"]`; push-up → `Bodyweight`; `trx` prints raw with no crash |
| AC-8 attribution (D-0005) | `:95-148` — all four rows asserted as **exact full-line strings**, not substrings; licence and `Source` hrefs, `target`, `rel` both checked | `CC0-1.0` prints as text and `line().querySelectorAll("a")` is **1**, which catches an anchor with a missing href rather than just "no link by name" |
| AC-9 detail missing | `:150-167` — URL stays `/library/back-squat`, heading + tag line + pills render, the literal download line | no `<ol>`, no `Variations`, no `[data-field="attribution"]`, no `/^Text:/` |
| AC-10 offline | `offline.test.tsx:66-115` — online snapshot vs offline snapshot **deep-equal** on rows, hrefs and full screen text; no `role="alert"`; supabase `from` call count unchanged; `fetch` never called | The clock defect the resume found is fixed at the root of its cause: the device zone is pinned (`:16-35`) and the string asserted as the literal `en.offline.lastSynced("9:30")` with the `hour: "numeric"` deviation documented in-line, plus a `not.toBe(notSyncedYet)` guard so the offline-with-time variant cannot pass as the generic one. **No clock or zone dependence survives** (QA: 64/64 across five zones incl. a half-hour and a DST zone) |
| AC-11 variants + wait-free | `detail.test.tsx:169-205` (order, unknown-variant skip, `[]` hides the heading) and `browse.test.tsx:306-315` (24 rows with `refreshAll` returning a never-resolving promise) | The wait-free test asserts `refreshAll` **was** called once, so the pass is not "refresh never started" |
| AC-12 compare | `compare.test.tsx:40-93` — all seven rows read out of the real `<tbody>`, `2:45` / `1:45`, the `/library/leg-extension` link, `setCostS` spy shows both ids | A `durationS: 60` fixture reads `2:00 per set`, so a UI hard-coding 45 s of work fails |
| AC-13 bad URLs | `detail.test.tsx:230-247` + `compare.test.tsx:95-113` — all six redirects assert **both** the location and the rendered `data-screen-id`, each with `history.length` unchanged | `/library/leg-press` and `/library/back-squat/compare/leg-press` asserted to **stay** |
| **AC-14 `ExerciseHowTo`, principle 1** | `howto.test.tsx:93-173` — exactly one `role="dialog"`, `aria-modal="true"`, accessible name `How to: Back squat`, cue, `<ol>` of 3, **zero `a[href]`**, only button `Close`; Escape and Close each once; focus restored to the opener; opener-removed close doesn't throw; warm-up id; unknown id; axe 0 violations | Scope caveat ruled on below |
| AC-15 cache only | `:175-194` — zero `refreshAll`, zero `spy.from`, zero `fetch` on open+close | **Same-file contrast**: `LibraryDetail` under identical conditions calls `refreshAll` exactly once, so the zero is a measurement and not a dead spy |
| AC-16 exports, imports, strings | `exports-and-lint.test.ts` — key set sorted deep-equal; two `no-restricted-imports` plants with a `fatal` filter so a parse error can't pass as "nothing"; no `offlineDb(` / `from "dexie"` in non-test source (verified independently by grep); `jsx-no-literals`; every `en.uf04.*` key reachable; the D-0075 anchored shape regex | Allowed-import contrast reports `[]`; also pins no inline `style=`, a `:focus-visible` ring and no hex colours |
| AC-17 a11y / e2e | `tests/e2e/uf-04-library.spec.ts` — axe 0 serious/critical on all three screens, each gated on real content being visible first; `boundingBox()` ≥ 44×44 on all 11 chips + 24 rows with the count pinned to `11 + 24`; real `Tab`/`Space`/`Enter` keyboard path | Imports `test` from `./fixtures/guarded-test.js` (line 11), so it is **inside** T-0904's unclaimed-request guard — the silent opt-out the resume found is fixed |

Cross-cutting, verified in the tree rather than inherited:
- **Principle 3.** `Library.tsx:58` calls the engine's `isEligible` and `CompareContent` the engine's `setCostS`; no re-derivation. Both spied to prove the call, and AC-4 recomputes the expected set from the real engine independently of the literals.
- **Principle 1, lint half.** UF-04 cannot import UF-06 or `components/body-map`, proven by `ESLint.lintText` plants.
- **No render loop.** `route.test.tsx` mounts all three screens through the real `Shell` and lazy routes with no injected props and bounds the loader call counts after a 150 ms settle — the class of defect the T-0307a injected-`now` unit tests hid.
- **D-0067 §5 / D-0071 §8 data boundary.** Grep over `features/UF-04/**` non-test source: `refreshAll` appears only in `data.ts`, `offlineDb(` and `fetch(` nowhere. `ExerciseHowTo.tsx:38` passes `{refresh: false}`.

### The weighing I was asked to do explicitly

**Verdict: `done`. I accept the orchestrator's recommendation, on the following reasoning — and record the pattern as a real cost, not a nil finding.**

What actually happened is bad on process and good on outcome:
1. Five commits were never reviewed until after the fact, because an org spend limit killed the run mid-build. The mitigation was correct: the whole diff went to review as new work, so nothing shipped on the strength of an unreviewed commit. The *only* thing lost was the early feedback, not the coverage.
2. **AC-6's online path had no test at all.** The original build's AC-6 test mounted offline, which is the easy half, and the AC's own prose (`navigator.onLine = false`) invited exactly that reading. The bug at `Library.tsx:30/92` lived in the half the AC never asked about, and it was a *user-visible lie* on the first-ever launch — the worst moment to lie. Found by review, reproduced by QA, not by the build.
3. **The first regression test written for that bug was vacuous.** It awaited two microtasks, the IndexedDB read had not resolved, the screen rendered `null` for an unrelated reason, and the assertion never reached the buggy state.

Point 3 is the one that would ordinarily make me reject, because a vacuous regression test is worse than no test: it is a standing false green, and it is the T-0319/T-0301a failure mode this squad has now hit three times. Two things make it acceptable here rather than owed:

- **It was caught inside the process, twice, independently.** QA found it without being asked (it was not in scope; QA went looking). Then the rework found it *again on its own, before being told* — it ran the buggy direction first, saw 18/18 green and treated that pass as the bug. That is the behaviour we want from a rework lane, and it is the opposite of a lane that patches what it is handed.
- **The replacement is fault-proven on a third party's tree — mine.** I did not inherit the both-ways proof. My first planted fault was *invalid* (it left `waitingForFirstDownload` referencing a removed `pending`, giving a `ReferenceError` and 17 failures — a broken build, not the product bug), and I am recording that because it is precisely how a weak proof passes for a strong one. Restoring the genuine pre-fix `Library.tsx` from `4fefe2a` gave **exactly 1 failure**, and its message is the literal user-facing string `The exercise library downloads the first time you're online.` — while the offline AC-6 case stayed green among the other 17. So the test fails for the product reason, on the product string, and is precisely targeted rather than broadly sensitive.

The test is also *defended against its own former failure mode*: `browse.test.tsx:261-264` and `:285` carry the reasoning in comments (a microtask flush passes vacuously; the refresh must be genuinely deferred), and `:286` probes at `[0, 5, 50]` ms — the rework went past the single 50 ms turn specified in order to pin the window's opening edge too. A future editor who "simplifies" it back to a microtask flush has been told in writing why that is wrong.

On the balance of the whole ticket: 20 fault injections all caught (including two where the fault *calls* the engine and then substitutes its own answer — the hard case for principle 3), no hollow assertions of the T-0319/T-0301a class found by review, the offline/clock defect fixed at the root of its cause, T-0904's guard confirmed to have no `/rest/v1/*` hole by a control the builder never ran, and the bundle measured on a fresh build (entry **144.0 KB / 200 KB**, largest lazy chunk **34.9 KB / 100 KB**) rather than claimed. The implementation is now correct and the coverage is real.

**So: `done`, with this recorded for the record —** AC-6's online path was previously untested, and its coverage came from **review and QA, not the original build**. The build's own fault injections did not reach it, because the build tested the half its AC named. That is a spec cost as much as a build cost: an AC that fixes `navigator.onLine = false` in its Given invites a test that only ever mounts offline. **Process follow-up, folded into T-0327's build-lane checklist rather than filed anew:** when an AC names one value of a binary condition (online/offline, empty/non-empty, first-launch/returning), the build owes the *other* value a test too, or an explicit note saying why it cannot exist. T-0327 already carries the sibling rule for terminal row states, which is the same lesson from T-0319.

### AC-14 scope caveat — ruled on

**Confirmed: filing T-0360 onto T-0305a is the right call, and AC-14 is met without the cross-screen assertion.**

The reasoning is that the missing assertion is not merely inconvenient to write here — it is **not writable here**. UF-09 is still the T-0300a stub (`SessionHost`, an `<h1>`) and `features/UF-09/seams.tsx` does not exist, so `a[href^="/library"]` on a session screen has no subject to be asserted about. A test written against a stub would assert that a stub has no library links, which is true of any stub and would go green while telling us nothing — a hollow assertion of exactly the class review checked for and QA has twice caught on this board. Adding it here would *lower* the quality of the evidence, not raise it.

What AC-14 actually asks for is what the ticket owns: the dialog is the one piece of UF-04 that renders inside a workout, and its principle-1 obligation is that **it** holds no way out of the session. `howto.test.tsx:106` measures that directly — zero `a[href]` inside the dialog, with its only control being `Close`. Combined with the AC-16 lint ban (UF-04 cannot import UF-06 or the body map) and AC-15 (no network mid-set), the risk this ticket can carry is carried. The narrower scope is a correct consequence of the dependency order, not a gap the builder chose.

T-0360 is correctly homed on T-0305a (`web-feature:UF-03`, deps `T-0304, T-0318`), which is where the session screen and its summary actually get built and where the assertion will have a real subject. Its board entry also generalises the lesson to any feature whose lint ban is currently its only cross-screen guard, which is the part worth keeping.

### Definition of done — confirmed

- **Every AC has a passing test.** Yes, 17/17, per the table. 19/19 turbo tasks with `0 cached`, so no cross-worktree replay (T-0006).
- **`pnpm -w typecheck lint test --force --concurrency=1` green**, run with the mandatory `--force`.
- **`pnpm --filter @workoutlab/web test:e2e` green**, including the new `uf-04-library.spec.ts`.
- **Contracts unchanged.** No contract file in the 23. Confirmed the equipment key `pullup-bar` in the code is **correct** against `api/openapi.yaml:752`, all 4 `data/exercises` rows and `api.gen.ts`; only D-0022's prose disagrees, and D-0033 §1 explicitly supersedes D-0022 §5 (QA's citation). The code must **not** be "corrected" to the prose — a wrong key silently filters exercises out rather than erroring. T-0358 amends the prose.
- **No file outside "Paths you may change" touched.** All 23 are `features/UF-04/**`, `lib/i18n/flows/uf-04.ts`, or the two **new** `tests/e2e/` files. `en.ts` not edited; no other flow file; no route, tab bar, `lib/offline` or lint-config change.
- **Commits** start `T-0306a:` and cite screen IDs.
- **Bundle:** measured on a fresh build, entry 144.0 KB / 200 KB and largest lazy chunk 34.9 KB / 100 KB — within the 100 KB UF-04 chunk budget. The builder declined to claim a number it had not measured, which is the correct behaviour under T-0322.

### Filed, out of scope for this ticket

T-0355 (`formatTime` not zero-padded — fix once at source in `lib/format/**`; two tickets have now worked around it separately), T-0356 (`fixture-guard.spec.ts` hard-codes three filenames, so a new spec can silently opt out of the T-0904 guard — glob it), T-0357 (`Library` passes no `timeZone` to `OfflineStatus`), T-0358 (D-0022 §5 prose → `pullup-bar`; contract is authoritative), T-0359 (the in-workout attribution licence question — **per-decision, not a build defect**: D-0005 scopes attribution to UF-04.2 and D-0069 §4 actively precludes a link out, so the builder followed the contract as written; not live while every seeded row is `source: workoutlab`, live the moment a real wger row ships), T-0360 (cross-screen principle-1 assertion → T-0305a), T-0361 (`exports-and-lint.test.ts` hardening, both minor: the `offlineDb(` regex lets a bare unused import through, and `sourceFiles()` is non-recursive).
