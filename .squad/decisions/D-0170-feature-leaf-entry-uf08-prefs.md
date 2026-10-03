---
id: D-0170
title: "A feature may publish a side-effect-free leaf entry `index.<topic>.ts` beside its `index.tsx` (amends D-0071 §3); UF-09 reads the focus prefs from `features/UF-08/index.prefs.ts`, so focus mode no longer evaluates SessionSetup; the fix is its own UF-09 ticket, T-0474, with two listed UF-08 extras"
status: decided
date: 2026-10-03
by: triage (TR-0044)
area: web
amends: D-0071 §3 (hand-offs, for pure-function and type exports only)
builds-on: D-0071 §9, D-0110 §6, D-0119 §6, D-0142 §8, D-0156 §3, D-0167
---
## Context
TR-0044 was raised by the T-0303c gate (branch `t/T-0303c-swap-before-starting`, build cfe3fff).
T-0303c puts a static `import { SwapSheet } from "../UF-05/index.js"` in
`features/UF-08/SessionSetup.tsx`, as its ticket requires. `features/UF-09/device.ts` imports
`readFocusPrefs` and `FocusPrefs` from the UF-08 barrel. Evaluating that barrel runs
`SessionSetup.tsx`, and now UF-05 as well. Three UF-09 test files (`t0422.lazy-reject`,
`t0451.next-open`, `t0451.next-entry`) mock `../../UF-05/index.js` with a throwing factory, to
simulate a stale chunk. With the change they collect 0 tests, and the full `-w test` run hangs.

The TR recommends option 1: `device.ts` imports `../UF-08/focus-prefs.js` directly. **That is a
lint error.** D-0071 §3 and §9 ban deep cross-feature imports. `apps/web/eslint.config.mjs`
`INDEX_ONLY_PATTERN` (`UF-\d\d/(?!index\b)`) enforces the ban, and
`app/__tests__/import-bans.test.ts` pins it with a test named exactly "UF-09 deep-importing
UF-08/focus-prefs.js reports no-restricted-imports". Option 1 as written would fail `-w lint` and
that test. Making it pass would mean weakening a decided rule and editing a test in web-shell's
lane.

The real fault is the coupling itself. Focus mode needs two pure functions that have no imports,
but the only legal way to reach them loads the whole UF-08 screen. Today that drags in SwapSheet,
and it will drag in whatever SessionSetup imports later. D-0071 §3 never meant this: it bans deep
imports to keep each feature's public surface explicit and pinned, not to force screen code into
every importer.

## Decision
1. **D-0071 §3 gains a clause:** "A feature may also publish **leaf entries** named
   `index.<topic>.ts` (lower-case letters only for `<topic>`). A leaf entry re-exports only pure
   functions and types. The modules behind it import no other feature, no component and nothing
   from `src/app`. A test pins a leaf entry's export keys, the same way `index.tsx` is pinned.
   `index.tsx` may re-export the same names. When a leaf entry covers every name an importer
   needs, another feature imports the leaf entry rather than `index.tsx`."
   - The lint rule already allows this. `index\b` matches `index.prefs.js`, so no
     `eslint.config.mjs` change is needed and every import-ban test stays as it is.
   - This is still an explicit public surface, so it is not a deep import. A feature lists and
     pins exactly what each entry exports. `focus-prefs.ts` itself stays banned.
   - Components and hooks stay in `index.tsx` only. A leaf entry is for code that a
     seam-mounted or lazy-loaded screen must not pull in.
2. **UF-08 gets `features/UF-08/index.prefs.ts`**. It exports exactly `readFocusPrefs`,
   `writeFocusPrefs` and the `FocusPrefs` type, all from `./focus-prefs.js`. `index.tsx` is
   unchanged, so T-0303c AC-8 ("exports exactly SessionSetup, readFocusPrefs, writeFocusPrefs")
   still holds.
3. **`features/UF-09/device.ts` imports from `../UF-08/index.prefs.js`.** Behaviour is unchanged:
   the same functions run, read once per machine mount (D-0119 §6). The comment on line 2 cites
   this decision in place of "through the UF-08 index".
4. **Where it lands: a new ticket, T-0474, in web-feature:UF-09**, with
   `features/UF-08/index.prefs.ts` and its pin test as listed extras (D-0167 lane-path rules).
   This differs from D-0156 §3, which folded the fix into the ticket that needed it. Here the
   cause predates T-0303c (T-0304g's barrel import), the fix belongs in another lane, and it is
   correct and testable on `main` alone. A test that mocks `UF-08/SessionSetup.js` with a throwing
   factory and imports `device.ts` fails on `main` today. That test is the red proof, and it does
   not depend on T-0303c.
   - T-0474 creates two new UF-08 files and edits nothing else in UF-08. T-0303c, the only active
     UF-08 ticket, touches neither, so the two can run in parallel.
   - Order: T-0474 merges to `main`. T-0303c then merges `main` into its branch and reruns the
     cached gate. **T-0303c needs no rework.** Its build, AC, fault and e2e proof stand, and its
     ticket text, including the static `SwapSheet` import, is unchanged.
5. **Options rejected.**
   - A lazy `SwapSheet` in UF-08 (TR option 2) changes a groomed product behaviour and leaves the
     coupling in place, so the next static import in SessionSetup would break the build the same
     way.
   - Changing the UF-09 mock factories (TR option 3) was already tried and ruled out. A second
     `vi.mock` of the UF-08 barrel in each UF-09 test would also edit tests that T-0463 AC-5 pins
     as unedited.
   - Moving the focus prefs to `lib/` would be clean but touches three lanes, including web-shell.

## Consequences
- web-feature:UF-09: T-0474 (one import line, one comment, one new regression test).
- web-feature:UF-08: two new files, granted to T-0474 only. A future UF-08 ticket that adds a
  name to `index.prefs.ts` updates its pin test, as it would for `index.tsx`.
- web-shell (optional, low priority): T-0475. Add a contrast row to `import-bans.test.ts` showing
  that `../UF-08/index.prefs.js` is allowed, and tighten `INDEX_ONLY_PATTERN` so only `index.js`
  and `index.<lower>.js` pass, not `index-x.js`. Not needed for T-0474.
- T-0303c: blocked on merge only, until T-0474 is on `main`.
- No contract change. No human gate.

## Revisit when
- A second feature needs a leaf entry. Then check whether a shared `lib/` module is the better
  home than a feature-owned leaf.
- T-0313 (dynamic `import()` bans) lands. Its pattern must allow `index.<topic>` the same way.
