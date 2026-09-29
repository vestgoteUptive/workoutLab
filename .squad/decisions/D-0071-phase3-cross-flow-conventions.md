---
id: D-0071
title: Phase 3 cross-flow conventions (reconciles the two parallel grooms) — one rule each for strings, routes, hand-offs, seams and slots, the focus-session seam, session writes, applySwap, import bans, e2e files and device-side computing
status: decided
date: 2026-09-29
by: triage (TR-0030)
area: web
supersedes: D-0063 §1, §2, §4, §5, §6 and D-0067 §2 (strings, routes, import bans), §4, §5 — in part; the rest of both stays in force
---
## Context
Two product-owners groomed Phase 3 in parallel (TR-0030). Groom A (T-0301–T-0304) wrote D-0063–D-0066. Groom B (T-0305–T-0308) wrote D-0067–D-0070. Both set cross-flow conventions, and neither saw the other's output. This is where they disagree or duplicate each other:

| # | Topic | D-0063 (A) | D-0067 (B) | Conflict |
|---|---|---|---|---|
| 1 | String modules | §1: `lib/i18n/flows/uf-NN.ts` from T-0318, plus a shared `lib/i18n/workout.ts` that a feature ticket creates | §2: per-flow files only; "each feature owns only its own flow file" | Duplicate. `workout.ts` is a feature write into web-shell's `lib/`, and B doesn't allow for it. T-0304 lists `lib/i18n/uf-09.ts`, not `flows/uf-09.ts` |
| 2 | Sub-screens and routes | §2: sub-screens are search-param views or machine states inside the parent route; §6: only UF-03.3 needs a new route | §2: a table of new path routes | Two conventions with no rule for choosing between them. T-0304 also asks for `/session/:id/list`, which contradicts D-0063 §2 and T-0305a AC-A1 |
| 3 | Hand-offs | §5: functions and types are exported through `index.tsx` (`readFocusPrefs`); T-0304 then imports `features/UF-08/focus-prefs.ts` directly | §4: "exported **component**" only, through `index.tsx` | Is a non-component export allowed? Is a deep import allowed? |
| 4 | Mounting in another flow's screen | D-0066 §12: the host flow owns a registry file (`features/UF-09/seams.tsx`) and the mounting ticket edits only that file. D-0065: T-0308c edits `features/UF-02/Today.tsx` | §4: the mounting ticket "lists the one file it edits" (Today.tsx, "UF-09.9/09.6 action wiring", "the host's mode switch") | Registry file or free edit of the host's screen file |
| 5 | Session-state seam | D-0066 §12: `useFocusSession()` with a defined shape | §5: "whatever hook T-0304 exposes" | Same intent, but B's tickets don't name the hook, `finish()` isn't defined, and `replaceItem` doesn't say who persists |
| 6 | Swap application | D-0065 §5: engine `applySwap` (T-0224), `(workout, currentExerciseId, candidateId, …) → Workout` | D-0069 §6 / T-0306b AC-B7: a UI `applySwap(plan, index, candidate, reason, deps) → SessionPlan` | Two functions. B's function puts the rule 7.2 rep slot and rule 14 carry into the UI (principle 3) |
| 7 | Session writes | D-0066 AC-D3/D6: `upsertSession({...row, …})` | D-0068 §2, D-0069 §6: `upsertSession({id, ended_at, effort_rating})`, `upsertSession({id, plan})` | `upsertSession` replaces the queued row by `id` (`lib/offline/queue.ts`). A partial row queued before the start row has flushed would overwrite it, and the flush would then insert a session with no `started_at`/budget |
| 8 | Import bans | §5 points to D-0067 §2 | §2: UF-03/08/09 ↛ UF-02/06/07/10/11 | Duplicate. UF-04 and UF-05 render inside UF-09, so they are a transitive gap |
| 9 | e2e files | §4: one new `tests/e2e/<flow>-<topic>.spec.ts` per ticket; children append | B's tickets: `list-view.spec.ts`, `library.spec.ts`, `balance.spec.ts`, `progress.spec.ts`, `plan.spec.ts`, `checkin.spec.ts` | Naming |
| 10 | Device-side engine | §3: UF-02/08 on the device, no `/balance` or `/workouts/suggest` | D-0068 §1: UF-03.3 on the device; §2: no `/finish` in v1 | Same rule, stated twice |
| 11 | Prerequisite tickets | Consequences: every web-feature ticket depends on T-0318 | Consequences: the product-owner writes T-0318/T-0319 at the next groom | The board rows for T-0301b, T-0302a and T-0303a lack T-0318. No ticket files exist |

## Decision
1. **Strings.** `apps/web/src/lib/i18n/` stays the one catalogue (NFR-I18N-1, D-0045 §12).
   - T-0318 creates `lib/i18n/flows/uf-01.ts` … `uf-11.ts`, each an empty `as const` object, and composes them in `en.ts` as `en.uf01` … `en.uf11`. After T-0318, no feature ticket edits `en.ts`.
   - Each web-feature ticket owns exactly its own `flows/uf-NN.ts` as a listed extra path (T-0304 → `flows/uf-09.ts`, not `lib/i18n/uf-09.ts`).
   - **One shared module, `lib/i18n/workout.ts`** (the item summary, rest label, reason lines and area names used by UF-02, UF-03, UF-08 and UF-09). T-0302a creates it. T-0303b may **add** keys. Every other ticket imports it read-only. Any other addition needs that ticket to list the file, and two tickets that list it never run in parallel.
2. **Routes: one rule.** A screen gets its own shell route (a web-shell ticket, `app/routes.ts`) only when it is a standalone page addressable by id or reached from outside its flow: UF-03.3, UF-04.3, UF-06.2, UF-07.1 and UF-11.3, which is the D-0067 §2 table, built by T-0318. Every other sub-screen stays inside its existing route:
   - a step in a linear flow → a search param (`/?view=preview`; `/session/setup?step=…`, where a cold load of any step other than `time` shows UF-08.1, principle 2);
   - onboarding → nested paths under the existing `/welcome/*` splat;
   - UF-09.1–.9 → states of the focus machine inside `/session/:sessionId`;
   - **UF-03.1/.2 List view and UF-05.1 Swap → overlays inside `/session/:sessionId`, with no URL change.** There is **no** `/session/:sessionId/list` route.
   - A's follow-up "web-shell: routes /session/:id/summary and /session/:id/list" is folded into T-0318: the summary route is the same work, and the list route is dropped.
   - `/session/:sessionId/summary` uses the `session` guard, has no tab bar and is never gated by the profile gate (T-0301a).
3. **Hand-offs.** A feature imports another feature **only through that feature's `index.tsx`**. Components, hooks, pure functions and types may all be exported there. A deep import (`features/UF-08/focus-prefs.ts`) is a lint error (T-0318). An exporting ticket lists exactly what its `index.tsx` exports, and a test pins the export keys.
4. **Seams and slots: the host owns one registry file.** When flow X's screen shows something built by flow Y, the X ticket creates one registry file in `features/X/`, and the Y ticket's only grant in X is that file.
   - `features/UF-09/seams.tsx` (T-0304a) holds `pauseSeamActions` and `nextSeamActions`, each an array of `{id, label, render(ctx), keepsClockRunning}`, empty in T-0304. The host renders the UF-09.9 actions in user flows v2 order: Resume · `swap` · Skip to next exercise · `how-to` · `list-view` · End workout. A missing seam id renders nothing. On UF-09.6: I'm ready · `swap`.
     - T-0306b adds `swap` to both arrays.
     - T-0305a adds `how-to` (the `ExerciseHowTo` dialog from `features/UF-04`) and `list-view` (`ListView` from `features/UF-03`) to `pauseSeamActions`.
     - `render(ctx)` returns an overlay that the host shows **in place of** the current screen (one task on screen, principle 1). `ctx` is the `useFocusSession()` value plus `close()`.
     - `keepsClockRunning: false` (swap, how-to): the machine stays or becomes `paused` while the overlay is open. On UF-09.6, opening a `nextSeamActions` overlay dispatches `PAUSE` and closing it dispatches `RESUME`, so the 60 s countdown doesn't run underneath.
     - `keepsClockRunning: true` (list-view): opening dispatches `RESUME`, and the workout clock and the rest timer keep running. While it is open, the host never shows UF-09.8, and `betweenItems` resolves straight to `next` with no `timeCheck` call (the time check stays in focus mode).
   - `features/UF-02/slots.tsx` (T-0302a) exports `todayCheckinSlot: ComponentType | null = null`. Today renders it after the C-01 compact region and the attention line, and before the suggestion card. T-0308c's only UF-02 grant is to set it to a lazily loaded `CheckinCard` from `features/UF-11/index.tsx`. UF-02 may import UF-11, because the ban applies only to UF-03/08/09.
   - Seam components get their session state through props (`ctx`). They never import the host flow, so there are no import cycles: UF-03 and UF-05 never import `features/UF-09`.
   - The earlier "the mounting ticket lists the one file it edits in the other flow" (D-0067 §4) is replaced by this rule. The free edits of `Today.tsx` (D-0065 Consequences, T-0308c) and of "UF-09.9/09.6 action wiring" or "the host's mode switch" (T-0305a, T-0306b) are withdrawn.
5. **The focus-session seam is `useFocusSession()`** (D-0066 §12), exported from `features/UF-09/index.tsx`, with these clarifications:
   - `recordSet`, `editSet` and `deleteSet` wrap `lib/offline` and update `loggedSets` and the machine. After a List view log, the focus machine's next set is the first set index of the current item that has no live logged set.
   - `replaceItem(index, item, mainLiftId?)` replaces a not-started or the current item and persists the plan (§6). Callers never call `upsertSession` for the plan themselves. Sets already logged keep their `exerciseId`, and logging continues at the next set index (D-0069 §6).
   - `finish()` has no UI. It calls `upsertSession({...row, ended_at: now})`, removes `wl-focus:<id>`, and navigates to `/session/<id>/summary` after the write resolves. Confirm dialogs belong to the caller (UF-09.9 "End workout?", UF-03.1 "Finish workout?"). The `done` state calls it with no confirm.
   - T-0305a and T-0306b fixtures build a `ctx` object directly, so their tests don't depend on T-0304 internals (D-0067 §5 stays in that sense).
6. **Session writes always send the whole row.** Every `upsertSession` call after the start spreads the current stored row: `const {row} = await offlineDb().sessions.get(id); upsertSession({...row, <changes>})`. This applies to the plan after a time check or a swap (`{...row, plan}`), the finish (`{...row, ended_at}`) and the summary save (`{...row, ended_at, effort_rating}`). A partial row is never queued. This amends the partial forms in D-0068 §2 and D-0069 §6 §Storage.
7. **One `applySwap`, in the engine (T-0224).** The signature is D-0065 §5's, `applySwap(workout, currentExerciseId, candidateId, reason, history, profile, library, now, tz): Workout`, and it is pure. It combines D-0065 §5 and D-0069 §6:
   - The item keeps its position, `sets` and `isMain`.
   - The rep slot is rule 7.2's for the new exercise in that slot (main → 6–8, other compound → 8–12, isolation → 10–15; timed → the new exercise's `defaultDurationS`).
   - `prefill` is rule 14 with `previous = {exerciseId: current, weightKg: current prefill.weightKg}` (carry).
   - `reasons` gets `swap {reason}` inserted after `days_since` (else after `area_deficit`). The reason is null for Best match.
   - `costS`, `itemsTotalS`, `totalS` and `unusedS` are recomputed by rule 7.1. `plan.mainLiftId` follows a swapped main slot.
   - The input isn't mutated, and the output passes `parseSessionPlan`.
   - T-0306b's AC-B7–B9 cases become T-0224 worked examples (engine lane, with the rule 12 addendum decision it writes itself). The UI never builds a swapped item.
   - **There is one swap sheet.** `SwapSheet` (UF-05.1, T-0306b, exported from `features/UF-05/index.tsx`) takes `{workout, itemIndex, onApply(result: Workout), onClose}`. It calls `rankSwaps` and then `applySwap` itself, using data from `lib/offline` loaders, and hands back the engine's `Workout`. UF-09 seams call `replaceItem(index, result.plan.items[index], result.plan.mainLiftId)`. UF-08.3 (T-0303c) renders `result` as its new `Workout`. UF-03.1 goes through the same `replaceItem`. The copy is D-0069 §5's for every mount: the chips Best match / Equipment taken / Discomfort / Variety / Short on time, "{n} % muscle match", "Over your time", "No alternatives fit your equipment", and the dialog "Replace {exercise}". T-0303c's own sheet and copy (AC-C1/C2/C5) are withdrawn.
8. **Device-side computing (D-0063 §3 and D-0068 §1 stay in force, stated once).** Every Phase 3 screen computes from `@workoutlab/engine` on the device, over the `lib/offline` cache plus the queue. When online, it first runs `refreshAll` with a 3 s cap. In v1 the web calls **none** of the three Edge Functions (`/workouts/suggest`, `/balance`, `/sessions/{id}/finish`).
   - This is consistent with D-0001, which puts the engine in the browser and keeps server-side logic in Edge Functions without requiring the client to call them.
   - It is consistent with D-0053 §1, where the vendored engine is drift-checked, so server and device give the same answers.
   - It is consistent with T-0203c, and with `api/openapi.yaml`, which defines the endpoints but doesn't oblige a client to call them. The finish moves `ended_at` through the queued `sessions` upsert (T-0300c, the D-0053 consequence), and `analytics.finished_within_budget` is a view over `sessions`, so NFR-AN still holds.
   - The functions stay for other clients and server-side checks. There is no contract change.
9. **Import bans (T-0318, in `apps/web/eslint.config.mjs`, tested with `ESLint.lintText`):**
   - `src/features/UF-03|UF-04|UF-05|UF-08|UF-09/**` may not import `features/UF-02`, `UF-06`, `UF-07`, `UF-10` or `UF-11`. UF-04 and UF-05 are added because they render inside UF-09.
   - `src/features/UF-03|UF-04|UF-05|UF-08|UF-09/**` may not import `components/body-map`. This extends the existing rule to UF-04 and UF-05.
   - No file in `src/features/*` may import another feature's module other than its `index` (the pattern `features/UF-\d\d/(?!index)`).
   - The dynamic `import()` loophole stays T-0313, which extends to these patterns.
10. **e2e files.** Each child ticket with e2e ACs owns one new file, `tests/e2e/uf-NN-<topic>.spec.ts`, and later children of the same parent in the same lane append to it. Each also owns additions to `tests/e2e/fixtures/` that only add exports. The renames:
    - `list-view.spec.ts` → `uf-03-list-summary.spec.ts`
    - `library.spec.ts` → `uf-04-library.spec.ts`
    - `balance.spec.ts` → `uf-10-balance.spec.ts`
    - `progress.spec.ts` → `uf-06-progress.spec.ts`
    - `plan.spec.ts` → `uf-11-plan.spec.ts`, and T-0308c appends to it instead of creating `checkin.spec.ts`
11. **Prerequisites.** Every web-feature ticket in Phase 3 depends on T-0318. T-0301a, T-0318 and T-0319 are web-shell tickets and run one at a time, in this order: T-0318 (unblocks every feature), then T-0319, then T-0301a. The profile gate (T-0301a) redirects every `protected` route plus `/session/setup`, including the routes T-0318 adds, rather than a fixed list. It never gates `/session/:sessionId` or `/session/:sessionId/summary`. Triage wrote the T-0318 and T-0319 ticket files from D-0067 §2–§3 and this decision.

**What stays in force:** D-0063 §3 (device engine, restated in §8). D-0067 §1 (the split, one lane per flow) and §3 (offline caches v2, now in the T-0319 ticket). D-0064, D-0065, D-0066, D-0068, D-0069 and D-0070, except where §4–§7 above amend them.

## Consequences
- The ticket files T-0301…T-0308 are edited to match (TR-0030 lists them). docs/tickets/T-0318-phase3-plumbing.md and docs/tickets/T-0319-offline-caches-v2.md are new.
- engine (T-0224): implements §7 and writes the rule 12 addendum decision. The board dep T-0306b → T-0224 and T-0303c → T-0306b are added.
- web-shell (T-0313): extend the dynamic-import rule to the §9 patterns.
- product: T-0224 needs a ticket file with worked examples (the former T-0306b AC-B7–B9 cases plus a main-slot and a timed case).
- The reconciler's earlier notes "D-0067 wins where the two overlap" (D-0063 Consequences) and "the orchestrator reconciles" (D-0067 Consequences) are discharged by this decision.
