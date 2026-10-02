---
id: D-0115
title: "Groom defaults for the small follow-ups (T-0379, T-0380a/b, T-0383, T-0384, T-0386, T-0388): per-test lint budgets, what each guarded read falls back to, the late signed-in refresh on UF-04, DST fall-back, finish-time focus, formatKg's shape"
status: revisit
date: 2026-10-02
by: product-owner (groom small follow-ups)
area: web
builds-on: D-0104, D-0113, D-0107 §6, D-0114 §3, D-0071 §8
---
## Context
Seven small board rows from QA and review need values that a builder would otherwise guess, and
each guess changes what a test asserts. T-0380 also spans four lanes and has to be split.

## Decision
1. **T-0379: lint-in-vitest tests get a per-test runtime budget.** The ESLint-driven tests
   (`app/__tests__/import-bans.test.ts` "apps/web/src/features lints clean", and
   `features/UF-10/__tests__/strings.test.ts` "react/jsx-no-literals is green across
   features/UF-10") pass an explicit timeout of **30 000 ms** as Vitest's per-test option. The
   global `testTimeout` stays at the default, so a real hang elsewhere still fails at 5 s. The
   tests stay in Vitest, because they pin ACs. Assertions don't change.
2. **T-0380 is split by lane.** T-0380a covers web-shell (`OfflineStatus.tsx`) and T-0380b covers
   UF-01 (`AuthCallback`). The UF-10 site (`index.tsx` `useExerciseNames`) is folded into T-0383,
   and the UF-04 site (`data.ts` cache read) into T-0384. Those two tickets already hold the same
   lane, so folding avoids a second ticket on the same paths. Every site uses the D-0104 pattern:
   catch at the call site, no unhandled rejection, no `console.error`, no new copy.
   - **OfflineStatus:** a rejected `lastSyncedAt()` read leaves the stored value `null`. The text
     variant therefore reads "Offline · not synced yet".
   - **AuthCallback:** a rejected `exchangeCodeForSession` (for example a network `TypeError`)
     gets the same handling as a resolved `{ error }`: the expired state ("link expired", the
     plan-kept line when it applies, and the link to `/account`). There is no navigation, and the
     screen doesn't keep showing "Signing you in" forever.
   - **UF-10 `useExerciseNames`:** a rejected `loadLibrary()` keeps the empty map. Contributor rows
     use their existing fallback (the exercise id).
   - **UF-10 `useBalance` `run()`:** a rejection anywhere in the cache read or the re-read is
     caught. The state that is already published stays.
   - **UF-04 `useScreenData`:** a rejected `read()` publishes nothing and keeps the current render
     (the previous value for that key, or `undefined`). The post-refresh re-read (`tick + 1`)
     tries again.
3. **T-0384: a refresh that starts late sets `pending` again.** UF-04 `useScreenData` with
   `refresh: true` treats a `stale` or `signed-out` mount like an offline mount: `refreshed: true`
   at once, so `pending` is false after the first read. If the status later turns `signed-in` in
   the same mount (D-0113 §2), `pending` is true again from the moment that refresh starts. It
   stays true until the re-read that follows that refresh, or the 3 s cap measured from that
   start, has landed. That matches `pending`'s documented meaning.
4. **T-0386: DST fall-back uses the earliest occurrence after `now`.** When a picked `HH:MM` occurs
   twice on `now`'s local day (the repeated hour), `finishToBudget` uses the earliest of the two
   instants that is strictly after `now`. If both are at or before `now`, the result is
   `rejected`. A spring-forward gap (a wall time that doesn't exist that day) is out of scope and
   keeps today's behaviour.
5. **T-0386: focus on the finish-time input (WCAG 2.4.3).**
   - Activating "Set a finish time" moves focus to the "Finish by" input.
   - A valid conversion closes the input and moves focus to the re-rendered "Set a finish time"
     button.
   - A rejected or partial value keeps focus in the input.
   - The first mount moves no focus.
6. **T-0388: `formatKg(value, locale?)`.**
   - The number goes through `Intl.NumberFormat(locale, { minimumFractionDigits: 0,
     maximumFractionDigits: 2, useGrouping: false })`, followed by U+00A0 and `kg`. `kg` is the SI
     symbol, the same in every language, so it isn't a catalogue key.
   - Rounding is Intl's default half-expand. An absent `locale` means the runtime default, as with
     `formatSetCount`.
   - A volume total (which can pass 1000) is not a weight and gets its own helper when a screen
     needs one.

## Consequences
- The tickets above encode §1 to §6 as ACs. No contract changes.
- The other lint-in-vitest tests (UF-01 `source.test.ts`, UF-04 and UF-08
  `exports-and-lint.test.ts`) get the same §1 budget in their own lanes, but only if they flake.

## Revisit when
- Lint-in-vitest runs regularly take more than 15 s. Then move those checks to `pnpm lint` and
  keep one Vitest canary.
- A spring-forward finish time is reported as wrong.
- A UI language other than English, or a lb unit setting, enters scope.
