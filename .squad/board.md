# Board

Done, split and folded rows are archived in `board-done.md` (D-0157). A ticket ID that is not on this board is done: look it up there.

Status: `todo` → `ready` (deps done, spec clear) → `doing` → `review` → `done`. Also `blocked:H-xx`, `triage:TR-xxxx`.
A ticket's detail lives in `docs/tickets/T-NNNN-*.md`; the product-owner writes it when the ticket becomes `ready`.
Flow = the AgentLab flow (or sub-agent chain) that runs it.

## Phase 0 — Foundation
| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|

**Follow-ups folded into existing tickets (from T-0001/T-0002, 2026-09-27)** — the groomer copies these into the ticket files:
- T-0003: C-01 legend + coverage tokens on the D-0013 steps (0 / <0.33 / <0.66 / <1 / ≥1).
- T-0100a/b (groomed; ticket file has these): `session_sets.client_id` unique per user, `edited_at`, `deleted_at` + upsert rule (D-0015); `plan_checkins` table (D-0018); `profiles.onboarded_at`, `profiles.onboarding_timing_ms`; pgTAP for replay no-op, older edit ignored, tombstone excluded, cascade delete.
- T-0101 / T-0200: encode D-0018 in rule 9 and D-0013 in rule 3; rule 3 excludes `deleted_at` sets; balance() output adds coverageStep, needsAttention, recovering, days[14], contributors; v2 IDs in rules 8/9 (UF-09.8, UF-11). Engine lint rule banning Date.now()/Math.random()/new Date() in src.
- T-0102: `/balance` response schema per `docs/specs/uf-10-balance.md`; check-in evaluation response.
- T-0203: CI supabase job runs `pnpm install --frozen-lockfile` before `supabase start`.
- T-0300: queued sets carry `client_id` + `edited_at`; deletes are tombstones through the same upsert (D-0015).
- T-0100a/b (from T-0101, D-0024/26/27): `profiles.plan_updated_at`; `exercises.kind` (exercise|warmup), `increment_kg`, `default_duration_s`, bodyweight flag; `sessions.warmup_in_budget` + stored session plan with start deficits; `session_sets.backoff`. Keep TR-0003/D-0029 on exercises columns.
- T-0103a/b (from T-0101): warm-up moves (kind warmup, ≥ 2 general), increment_kg, default_duration_s for timed holds, bodyweight flag, equipment vocab [barbell, rack, bench, dumbbell, cable, machine, pullup-bar]. Content-curator has no shell: the orchestrator runs `pnpm install` / tests for its branch.
- T-0102 (from T-0101): sessionInput, Workout/reason codes, swap reason enum + rankSwaps, timeCheck, balance() incl. targetSource/targetUpdatedAt, evaluateCheckin; fix the v1 'UF-04' in the /suggest summary → UF-08.1.
- T-0300 (from T-0003 groom): PWA manifest/favicon colours generated from tokens; C-01 legend from coverageLegend/attentionLegend with numeric labels (NFR-A11Y-3).
- Design follow-up: self-hosted woff2 fonts via design-tokens (no CDN).
- T-0100b (from T-0100a review): `profiles_priority_areas_valid` must reject multi-dimensional arrays (array_ndims = 1). UF-03.3 effort scale assumed 1–5 (D-0030), product to confirm.
- T-0004 (from T-0100a): CI check that regenerates the AC1 pgTAP column block from docs/data-model.md and fails on drift.
- T-0100b (from T-0200 groom, D-0034): CHECK (sets_per_14d > 0) on area_targets.
- T-0102 (from T-0200 groom): mirror engine types from D-0034 §1 (history set with clientId/editedAt/deletedAt/pending, library exercise, area target, balance result); ISO-8601 instants, YYYY-MM-DD local dates.
- T-0201 (from T-0200 groom): eligible-exercise rule + R0-E1 determinism test against suggest (D-0034 §7); reconcile equipment names pullup-bar/'—' (engine L1) vs pull-up-bar/none (D-0022); reuse test/fixtures/histories.ts (also T-0202).
- T-0300 (from T-0200 groom): pass queued offline sets to the engine with pending: true after server rows, covering ≥ 56 local days (D-0034 §3).
- T-0203 (from T-0100a): enable Google in supabase/config.toml via env(); seed exercises 1:1 onto D-0029 columns.
- T-0102 (from T-0100b): mirror D-0035 columns (exercises.kind/increment_kg/default_duration_s/external_load, sessions.warmup_in_budget/plan, session_sets.backoff) and routines/routine_items/plan_checkins; define SessionPlan JSON (items + startDeficits).
- Engine (T-0200/T-0202): engine-rules.md rule 9 / F-profile: plan_updated_at → plan_changed_at (D-0035). → absorbed by T-0202 (D-0041). bodyweight = external_load false.
- T-0103b (from T-0102 groom, D-0037 §11): validator requires default_duration_s when timed = true. (T-0201a review: a timed row with null duration is costed 45 s — T-0103c must add the invalid fixture.)
- T-0103b (from T-0103a accept/review): positive schema fixture for a valid source:wger row; schema.test missing-license asserts params.missingProperty; D-0033 §7 wording (AC11–14 exercise-only; AC10/15/16/17 whole library); align warm-up ids/weights with engine-rules §7 (wu-cat-cow core 1/back .5, wu-arm-circle shoulders) or amend via decision; remove the barbell-back-squat skip guard in areas.test.ts.
- Engine (from T-0200): fast-check devDependency for invariant tests (D-0036 §5, lockfile → infra); purity lint also catches globalThis.Date/Math; engine types move to @workoutlab/shared after T-0102a.
- T-0102b (from T-0201 groom, D-0040 §4): WorkoutItem.backoff.weightKg nullable (first-time main lift has no weight). Engine reads only PlanCheckin.answeredAt and a CheckinProfile subset (D-0041 §2).
- T-0202 (from T-0201 groom): the all-chest history's main lift is inverted-row (rule 7.2, D-0040 §11). T-0205: replace T-0201's first-time pre-fill stand-in with rule 14. → **folded into `docs/tickets/T-0205-*.md` (AC16), 2026-09-28.**
- UF-08/UF-09 web tickets (from T-0201 groom): timeCheck elapsedS excludes paused time and the warm-up when warmupInBudget is off; an empty items plan is valid on UF-08.1; show itemsTotalS vs budget.
- T-0308 (from T-0202 groom): build CheckinSession[] with checkinSessions(sessions ∪ offline queue); 'First check-in on {nextCheckinDate}' when periods is empty.
- T-0102b (from T-0102a review): gen:api must run on all Node 22 (--experimental-strip-types or tsx); declare prettier as a devDependency of packages/shared or record hoisting in D-0039 §6.
- Engine (from T-0102a): switch packages/engine/src/types.ts to @workoutlab/shared types (coverageStep number vs 0–4 literal; equipment string[]; D-0039).
- T-0203 (TR-0016 → D-0044): seed exercises.external_load = !bodyweight on every row (never the column default); tests after db reset: every file's external_load = !bodyweight, push-up/plank false, barbell-back-squat true, all warm-ups false, count(false) = count(bodyweight:true).
- T-0102b or a data follow-up (D-0044 §5): mapper case external_load:false → externalLoad:false (no inversion); note 'Seeded as NOT bodyweight (D-0044)' on the external_load row in docs/data-model.md.
- T-0300 (from TR-0022): ticket text still says `idb` — D-0045 §13 wins: Dexie; AC-C1 'a new Dexie instance on the same database name'; AC-B5: signed out, /welcome/goal renders without redirect. T-0301: nest UF-01.2–01.4 under /welcome/*.
- T-0300 groom follow-ups: CI job for apps/web test:e2e + check:size (→ T-0006); Lighthouse CI on UF-02.1 (→ T-0402); T-0404 magic-link email includes the 6-digit {{ .Token }}; T-0310 clears IndexedDB queue + caches on account deletion; C-02 tab bar spec (design); rejected-set review UX (Phase 5 idea).
- T-0309 groom follow-ups: CI job for landing test:browser (→ T-0006/T-0402); UF-01.5 links to /privacy/; T-0406 reviews privacy.ts (security text wins).
- T-0300b (from T-0300a accept): use or remove the unused hidesTabBar() in apps/web/src/app/routes.ts. e2e: a real Supabase page.route mock + session-injection helper in tests/e2e/fixtures. CI: build apps/web before check:size, test:e2e and Lighthouse (→ T-0006).
- web-shell hardening (from T-0300b accept): the AC-B7 test asserts wl-return-to === "/" and no role=dialog on /session/*; classify invalid_grant with isAuthApiError/isAuthRetryableFetchError instead of error.message; add has/ownKeys traps to the lazy supabase Proxy.
- Data (from T-0202, D-0050 §1): api/openapi.yaml CheckinPeriod.index minimum 0 (period 0 starts at onboarding); regenerate api.gen.ts.
- UF-09.8 web ticket (from T-0201b, D-0047): show minutesBehind only when show is true; save the Trim / Skip next items as the new plan. T-0205: reuse floorInc from packages/engine/src/energy.ts → **folded into `docs/tickets/T-0205-*.md` (Scope, AC24), 2026-09-28.**
- T-0204/T-0205 groom follow-ups (2026-09-28): rule 0's `rankSwaps(current, reason, session, profile, library, history, tz, now)` argument order is inconsistent with every other engine function (`now, tz` last) — a one-line doc fix (engine, D-0056 §2); writing D-0057 §2/§4/§6 (bodyweight step 4, the `floorInc` floor, the timed edges) into rule 14's text (engine/product doc edit, D-0057 §10); `packages/shared/test/schemas.test.ts` still uses `muscleMatch 0.667` for all five R12-E1 entries — harmless (schema validity only) but worth aligning when the shared lane next touches it (data).
- T-0203 groom follow-ups: openapi finishSession text 'last write wins' → 'the latest endedAt wins (D-0053 §7)' (data); the offline queue never replays a sessions upsert with ended_at null after a finish (T-0300c); a draft PR for each T-0203 part (real-stack CI).

## Phase 1 — Contracts
| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|

## Phase 2 — Core
| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0206 | Page the exercises/exercise_areas library reads through pageAll (or guard as the library nears PostgREST max_rows = 1000) — T-0203b review follow-up | backend | T-0203b | todo (parked, checked 2026-10-08: 95 exercises and 177 exercise_areas rows vs max_rows 1000; the web's lib/offline/history.ts reads both tables unpaged too, so include it. Revisit near 300 exercises or 800 area rows) | wl-build-backend |
| T-0209 | Close the non-atomic read-modify-write race on concurrent finishes (conditional update or trigger) — T-0203c review follow-up | backend | T-0203c | todo (parked, checked 2026-10-08: still no client; the web app calls only DELETE /functions/v1/account and finishes through the queued sessions upsert, so no user reaches this race. Take it with T-0217/T-0218 if a client ever calls POST /sessions/{id}/finish) | wl-build-backend |
| T-0207 | Attach x-request-id to OPTIONS preflight responses (D-0053 §5 says every response) — T-0203b review follow-up | backend | T-0203b | todo (parked: a preflight has no body or log line, so the id helps no one; a 3-line fix for whenever the backend lane is next in http.ts) | wl-build-backend |
| T-0213 | api/openapi.yaml SwapCandidate/SwapCandidateList examples: db-row muscleMatch 0.667 → 1.0 (D-0056 §1), and align `packages/shared/test/schemas.test.ts` R12-E1 entries (board line 57) — T-0204 follow-up | data | T-0204 | todo (parked: example values in the contract only, no runtime or generated-type effect; fold into the next data-lane openapi change) | wl-spec |
| T-0217 | Needs a decision (amends D-0058): tie-break for two different ratings at the same winning endedAt. Default proposal: the higher rating wins (order-independent), which changes AC29's correction meaning; alternative: document last-arrival-wins as an exception. Then a unit test with two ratings at one endedAt — T-0208 follow-up | backend | T-0208 | todo (parked: default recorded in D-0198, higher rating wins, revisit; the finish endpoint has no client today) | wl-triage → wl-build-backend |
| T-0218 | Sub-millisecond endedAt: core.ts instantMs truncates to ms while the Instant pattern accepts any fraction and Postgres stores µs, so finishes < 1 ms apart are order-dependent. Default: compare at µs precision (SQL or a µs parse), no contract change — T-0208 follow-up | backend | T-0208 | todo (parked: same cluster as T-0217 and D-0198; the finish endpoint has no client today) | wl-build-backend |
| T-0239 | Close the remaining AC6 service-role fence gaps (T-0310b re-review, LOW): ban bare `toObject` and restrict `env` in _shared/cors.ts to `env.get("ALLOWED_ORIGINS")`/call args; token/AST-based Deno-use check instead of regex comment stripping; ban `\u` identifier escapes, `self`/`window`/`Reflect`, `Function(` with or without new, `new Worker(`, data:/blob: specifiers; a positive fixture each | backend | T-0310b | todo (parked, checked 2026-10-08: LOW per the re-review; the fence lints our own code against obfuscated service-role use, and the account function verifies the JWT with verify_jwt pinned in the prod release (T-0513). Groom it if a second function needs the service role) | wl-build-backend |

**T-0204 and T-0205 must not run in parallel:** both change `packages/engine/src/session.ts`. One engine worktree at a time; whichever lands second rebases.

## Phase 3 — App
| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0313 | AC-D11 hardening: dynamic `import()` of components/body-map from UF-03/08/09 bypasses no-restricted-imports; add a no-restricted-syntax rule on ImportExpression + test — T-0300d follow-up Also cover the D-0071 §9 patterns (UF-02/06/07/10/11 from UF-03/04/05/08/09; deep feature imports). | web-shell | T-0300d | todo (parked: lint hardening against our own code; the static bans and e2e cover the real cases) | wl-build-web |
| T-0327 **Also fold in (T-0306a accept): when an AC names one value of a binary condition** (online/offline, empty/non-empty, first-launch/returning), **the build owes the other value a test too, or an explicit note saying why it cannot exist.** T-0306a's AC-6 Given fixed `navigator.onLine = false`, which invited a test that only ever mounted offline — so the online path had no test at all and shipped a user-facing bug. Same lesson as the T-0319 fixture rule already in this row: the AC's own wording created the blind spot. | Build-lane checklist for schema migrations (T-0319 accept follow-up): a v1 test fixture must carry **every terminal row state** (`deletedAt` set, `status: "rejected"`), not just the happy path. T-0319's fixture held only `{deletedAt: null, status: "queued"}` rows, so two T-0300c-class upgrade faults — resurrecting an offline-deleted set and re-queueing a rejected one — passed the build's own 17 fault injections and were only caught by QA. Fold into the build-lane brief so the next builder plants these itself. Also: if the e2e Supabase fixture hits a **third** unmocked-table failure, default unmocked `/rest/v1` **reads** to `200 []` and 501 only writes (D-0072 "Revisit when"; 2 occurrences so far) | process | — | done (closed: both rules are now a checklist in docs/tickets/_template.md, D-0197 §7, so every spec carries them; the unmocked-reads default stays conditional on D-0072's third occurrence) | wl-spec |
| T-0338 | check-lane-paths: flag symlinks (mode 120000) added under a feature lane that point into shared paths — also sidesteps specifier-based import bans — T-0320 review | infra | T-0320 | todo (parked: agent-process tooling; no ticket has added a symlink. check-lane-paths cluster, one at a time) | wl-build-infra |
| T-0340 | Structured lane grants: a front-matter `paths:` list (or fenced block) in tickets, read instead of prose; revisit D-0074. The prose heuristic failed open on "Don't touch `x`" in 6 real tickets (T-0320 review) | product | T-0320 | todo (parked: agent-process tooling, about a day across product and infra; the prose grants work with care) | wl-spec |
| T-0341 | Move equipment labels (Bodyweight, Pull-up bar, …) from `flows/uf-04.ts` to a shared `lib/i18n` module once UF-01.3 or UF-05 needs them (D-0079 §5) | web-shell | T-0306a | todo (parked: flows/uf-05.ts now has an identical copy; drift risk only, no user-visible difference) | wl-build-web |
| T-0347 | check-lane-paths: read `.squad/ownership.yaml` from the diff base too — a branch that widens its own lane in ownership.yaml gets a finding only on ownership.yaml while the newly covered paths pass silently (T-0320 final review) | infra | T-0320 | todo (parked: agent-process tooling; the ownership.yaml finding itself still fires and the orchestrator reviews every merge) | wl-build-infra |
| T-0348 | check-lane-paths: a heading nested under a negative `###` must inherit its denial (`### Not yours` → `#### Strings` → `- en.ts` grants today); fold into T-0340 if that lands first (T-0320 final review) | infra | T-0320 | todo (parked: agent-process tooling; fold into T-0340) | wl-build-infra |
| T-0363 | UF-11 polish (T-0308b review nice-to-haves, none blocking): `EditPlanBody.tsx:89/103` resets `savingRef` only on the failure path, so on success it stays `true` forever — **safe today only because `navigate("/plan")` unmounts the component** (verified), but it would silently wedge Save if this screen ever showed an inline confirmation instead; reset in a `finally` so the invariant is local. Also: `mount-stability.test.tsx:67,83` allows `<= 2` cache reads where the true value is 1 (both run offline, so `run()` does exactly one `safeRead`); `test-helpers.tsx:252-254` records the supabase spy at **builder construction**, so AC-B11's "in that order" verifies construction order and is equivalent to await order only because `savePlan` builds each inside its own `await ok(...)`; and AC-B12's retry case name over-claims ("whichever step failed") while the body only exercises a step-2 failure | web-feature:UF-11 | T-0308b | todo (parked, checked 2026-10-08: still latent; EditPlanBody.tsx resets savingRef only on failure and Save still navigates to /plan on success, and the mount-stability `<= 2` asserts are still there (lines 86, 102). Not worth a ticket alone; fold into the next ticket that changes EditPlanBody's save flow, which T-0569 and T-0912 do not) | wl-build-web |
| T-0369 | e2e axe check of UF-09.9 how-to with a wger row (jsdom axe missed an aria-hidden+tabIndex fault in T-0364 QA), once the first wger row ships | qa | T-0364 | todo (parked: the library has no wger row, 0 of 87, D-0192 original text) | wl-build-qa |
| T-0389 | Real-browser 24-hour `<input type=time>` probe for UF-08.1 (cut from T-0386); also a Playwright check of the D-0115 §5 finish-time focus order (T-0386 QA) | qa | T-0303a | todo (parked: the native time input follows the device locale; no user report. Take it if a 12-hour report comes in) | wl-build-qa |
| T-0455 | e2e guard polish (T-0436 review): check backstop hits after in-flight requests settle in the supabaseGuard auto fixture (a late read is missed today); source-rules match any `.allowBackstop(`/`.allow(` receiver, not only the guard names; make the test.fail() backstop tests assert the failure is a backstop hit ; guard-source-check should also flag `export … from` and dynamic `import("@playwright/test")` value use (T-0356 review) | qa | T-0436 | todo (parked: e2e-guard tooling polish; the guard catches every case a real spec has hit) | wl-build-qa |

## Phase 4 — Ship
| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0513 | Per-user rate limit on Edge Functions, or a decision accepting the risk on Free (F-3) → D-0190 §3 accepts the risk on Free; ticket adds function invocations to the cost guard + pins verify_jwt in the prod release (folds T-0238) | infra | T-0403, T-0405, T-0402b | merged (AC-4 live verify_jwt read pending: blocked for agents) | wl-build-infra |

## CI fixes (any phase)
Found by the `/tick` CI watch or the `wl-ci-investigate` flow. Diagnosis in `docs/ci/CI-T-09NN-*.md`. Built with the owning lane's flow; merged only after a green draft-PR run.

| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0914 | UF-02 card.test.tsx mocks ../slots.js (real check-in card raced the no-button assertion; main red since 28719f5), Today forwards now/tz/locale to CheckinSlot | web-feature:UF-02 | — | doing | wl-build-web |
| T-0915 | lib/pwa/update.ts adopts installing worker in watch(), re-adopts on check() (pwa-update.spec.ts:109 flake) | web-shell | — | todo | wl-build-web |
| T-0916 | pwa-update.spec.ts:118 lazy-chunk console-guard flake: root-cause it | qa | T-0915 | todo | wl-build-web |
| T-0495 | Share retryableLazy between features/UF-03/lazy-retry.ts and features/UF-09/lazy-retry.ts (byte-identical copies, D-0142 §5) instead of duplicating — low priority, drift risk only (T-0478 review finding) | web-shell | T-0478 | todo (parked: drift risk only, and the copies' code is still identical) | wl-build-web |

## Phase 5 — Iterate
The product-owner adds tickets from `revisit` decisions, triage outcomes and QA findings, using the `wl-idea` flow.

| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|

### D-0199 excluded exercises
User request "exclude exercises and manage the list" (spec `docs/specs/excluded-exercises.md`, D-0199, grooming defaults D-0200). **Release order:** T-0535 merges into the local `main` and `main` is not pushed or deployed until H-27 (prod release of its migration) is done; T-0536, T-0538, T-0539, T-0540, T-0541 merge only after H-27. T-0533 → T-0534 run serially (same engine files). en.ts (T-0537) and routes.ts (T-0540) are shared files.

| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|

### GitHub #37/#45 visual foundation (D-0203)
GitHub #37 (Plan is confusing) and #45 (Account looks bad). Specs: `docs/specs/visual-foundation.md`, `Design-docs/docs/design/screens/UF-11.2.md`, `UF-11.4.md`. Grooming defaults and splits: D-0204. **T-0552 is high priority** (installed apps run stale builds). T-0548 → T-0549 → T-0550 run serially (same UF-11 folder), and T-0540 rebases on T-0548. T-0545 and T-0546 may run in parallel; both run the full web e2e suite.

| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|

### GitHub #48 body figure (D-0207)
GitHub #48 (muscle-group figure like ExerciseDB). Spec `docs/specs/body-map-silhouette.md`, decision D-0207 (original art; supersedes D-0060 §1 only). The e2e, axe, 320/390 screenshots and forced-colours checks are ACs inside T-0557 and T-0558 (no separate qa ticket). **UF-04 order (same folder, never parallel):** T-0558 first, then T-0541, then the D-0202 favorites toggle (T-0568, depends on T-0558 and T-0541). T-0557 and T-0558 may run in parallel after T-0556.

| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|

### GitHub #46 favorites (D-0202)
GitHub #46 (favorite exercises). Spec `docs/specs/favorite-exercises.md`, decision D-0202 (amends D-0199 §1 §4, D-0136 §2). Reuses the D-0199 pattern (T-0535 table, T-0536 cache generalised by T-0567, T-0540 screen, T-0541 button). **Release is automatic on merge (D-0201):** T-0564's migration carries `-- release: destructive-approved D-0202` for the guard; no human step. Engine T-0562 → T-0563 run serially (same files); T-0562 checks R7-E21…E27 against the code first and raises triage on any mismatch. **UF-04 order:** T-0541 → T-0568. **UF-02 order:** T-0542 → T-0570. **UF-08:** T-0571 is the last ticket of the D-0205 UF-08 chain below. T-0569 edits routes.ts (shared). T-0564 touches `tests/e2e/fixtures/**` (full e2e).

| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|

### Add and reorder (D-0205)
Owner request 2026-10-07. Spec `docs/specs/uf-08-add-and-reorder.md`, decision D-0205 (no engine, API or data-model change). Items A–G: A = T-0572, B = T-0573 + T-0574 (split for size), C = T-0575, D = T-0576, E = T-0577, F = T-0578, G = T-0579. **UF-08 folder, strictly serial after T-0538 (done):** T-0573 → T-0574 → T-0575 → T-0576 → T-0577 → T-0571 (favorites). T-0572 runs after T-0561 (both edit `screens/UF-08.2.md`). T-0578 (UF-09 machine) has no deps; T-0579 follows it in the same folder.

| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0580 | Show the failed-exclusion message on the host screen after the swap sheet closes (T-0539 follow-up) | web-feature:UF-09 | T-0539 | todo | wl-build-web |
| T-0582 | UF-11.5/11.6 re-read when the library cache arrives (cold direct load shows no groups) | web-feature:UF-11 | — | todo | wl-build-web |

### Groomed from parked (2026-10-08)
Owner request: groom 10 parked tickets and put the ones worth doing at the back of the backlog. Run after the favorites (D-0202) and add/reorder (D-0205) work. The three touch disjoint files (turbo.json + check-decision-ids; one new web-shell test; package.json/lockfile), so any order works; T-0525 changes the lockfile, so it runs the forced gate.

| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0006 | Turbo test hashes cover the repo files package tests read (engine library + engine-rules, shared contracts, web inventory); check-decision-ids flags a slugless D-NNNN.md. Narrowed: pgTAP column drift and D-0032/D-0023 text dropped | infra | T-0004 | todo | wl-build-infra |
| T-0332 | UF-01.1/UF-01.5: fast mocked-status test of the /welcome/* stand-down in RedirectIfSignedIn, so breaking it fails in ms instead of hanging the routing suite | web-shell | T-0301a | todo | wl-build-web |
| T-0525 | One vitest variant across the workspace (engine/shared/design-tokens/exercises on vite 8, web/landing on vite 6 today) + a lockfile repo-check | infra | T-0512 | todo | wl-build-infra |

## Cobalt + state colour redesign (D-0208): phase 1, tokens and landing

| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0583 | Design tokens: Cobalt state groups, OKLCH coverage ramp, radius and space; self-hosted Familjen Grotesk and Bricolage Grotesque (additive; contract change, --force gate) | design | — | doing | wl-design |
| T-0584 | Landing page: Cobalt option 1b, plus 404 and Privacy restyle (copy unchanged; security sign-off on _headers) | landing | T-0583 | todo | wl-build-web |
