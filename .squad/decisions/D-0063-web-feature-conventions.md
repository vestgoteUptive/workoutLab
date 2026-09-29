---
id: D-0063
title: Phase 3 web-feature conventions — per-flow string catalogues, sub-screens inside one shell route, on-device engine, e2e file per ticket, read-only hand-off modules
status: revisit
date: 2026-09-29
by: product-owner (T-0301–T-0304 groom)
area: web
---
## Context
The feature tickets T-0301…T-0308 each own only `apps/web/src/features/<flow>/**` (`.squad/ownership.yaml`). Grooming T-0301–T-0304 turned up five things that no decision settles:
1. NFR-I18N-1 and D-0045 §12 put every string in "one catalogue (`apps/web/src/lib/i18n`)". `en.ts` belongs to web-shell, so feature tickets can't add strings to it, and if several parallel tickets edited one file they would always conflict.
2. D-0045 §2 has one route per flow entry point (`/`, `/session/setup`, `/session/:sessionId`, `/welcome/*`). UF-02.2, UF-08.2–.4 and UF-09.1–.9 have no route of their own, and `apps/web/src/app/routes.ts` belongs to web-shell.
3. UF-02.1, UF-02.2 and UF-08 could call the Edge Functions (`GET /balance`, `POST /workouts/suggest`) or the on-device engine. NFR-OFF-1/OFF-3 require offline, and the Edge Functions can't see queued sets.
4. Several tickets need Playwright specs in `tests/e2e/**` (qa lane).
5. UF-09 needs the focus settings chosen on UF-08.4 (sound, 3-2-1, keep awake).

## Decision
1. **String catalogues (aligned with D-0067 §2).** `apps/web/src/lib/i18n/` stays the one catalogue directory (NFR-I18N-1). The web-shell prerequisite **T-0318** creates `lib/i18n/flows/uf-NN.ts` for UF-01…UF-11, and `en.ts` composes them (`en.uf01` …). Each feature ticket owns only its own flow file, listed as an extra path, and depends on T-0318. `en.ts` is not edited by feature tickets. The shared workout formatters and "why" copy (item summary "4 × 6–8", rest "2:00", reason codes → one line) live in `lib/i18n/workout.ts`. T-0302a creates it, and later tickets import it and may *add* keys to it only when their ticket lists the file. The `react/jsx-no-literals` lint rule (D-0045 §12) applies unchanged.
2. **Sub-screens inside one shell route.** Screens with no D-0045 §2 route are views inside their flow's route, selected by a search param so that Back works and a reload lands somewhere sensible:
   - UF-02.2: `/?view=preview`.
   - UF-08.1–.4: `/session/setup?step=time|suggested|swap|ready`. Setup state lives in memory. A reload, or a direct load of any `step` other than `time`, shows UF-08.1 (principle 2: every start asks the time).
   - UF-01.2–.4 and the save step: nested paths under `/welcome/*` (`/welcome/goal`, `/welcome/level`, `/welcome/schedule`, `/welcome/save`), which D-0045 §13 already makes public.
   - UF-09.1–.9: states of the focus state machine inside `/session/:sessionId`. No URL change per screen.
   Each view still renders its own `data-screen-id`.
3. **On-device engine for these screens.** UF-02.1, UF-02.2 and UF-08.1–.4 call `@workoutlab/engine` (`balance`, `suggest`, `rankSwaps`) in the browser, with `loadEngineHistory()`, `loadLibrary()`, `loadTargets()` and `loadProfile()` from `lib/offline`. When online, they first run `refreshAll(now, tz)` with a 3 s cap and then compute from the cache. Online and offline give the same result for the same cache (NFR-OFF-3). These screens don't call `GET /balance` or `POST /workouts/suggest`. Those Edge Functions stay for other clients and for server-side checks. `now` is injected (a `clock` prop or module), and `tz` comes from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
4. **e2e.** Each ticket that has e2e ACs owns exactly one new spec file, `tests/e2e/<flow>-<topic>.spec.ts`, plus additions to `tests/e2e/fixtures/` that only add exports. Existing specs and existing fixture behaviour stay unchanged.
5. **Read-only hand-offs (aligned with D-0067 §4).** One feature imports from another only through that feature's `index.tsx` exports. T-0303d exports `readFocusPrefs()`, `writeFocusPrefs()` and `type FocusPrefs` (implemented in `features/UF-08/focus-prefs.ts`) from `features/UF-08/index.tsx`, and T-0304c imports them from there. The D-0067 §2 import bans (UF-03/08/09 may not import UF-02/06/07/10/11) apply.
6. **Sub-routes.** New shell routes come only from web-shell tickets (T-0318, D-0067 §2). Of these tickets' screens, only UF-03.3 `/session/:sessionId/summary` needs one, and T-0318 provides it. The UF-01, UF-02.2, UF-08 and UF-09 sub-screens stay inside their existing routes as in §2.

## Consequences
- Each groomed web-feature ticket lists its `lib/i18n/flows/uf-NN.ts` and its e2e spec as explicit extra paths, and depends on T-0318.
- Consistent with D-0067 (the T-0305–T-0308 groom), which wins where the two overlap.
- If a flow later needs its own shell route (for example UF-03.3 after a finish), that is a web-shell follow-up, not a feature-ticket edit.

## Revisit when
- The string files grow enough that a translation tool needs one file (then merge them into `en.ts` under the web-shell lane).
- A sub-screen needs a shareable deep link (then give it a shell route).
- The on-device engine is too slow on the NFR-PERF reference device.
