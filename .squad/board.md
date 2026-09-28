# Board

Status: `todo` → `ready` (deps done, spec clear) → `doing` → `review` → `done`. Also `blocked:H-xx`, `triage:TR-xxxx`.
A ticket's detail lives in `docs/tickets/T-NNNN-*.md`; the product-owner writes it when the ticket becomes `ready`.
Flow = the AgentLab flow (or sub-agent chain) that runs it.

## Phase 0 — Foundation
| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0001 | PRD on v2 IDs; UF-10 Balance and UF-11 Plan check-in specs; non-functional requirements (gaps A1, B7) | product | — | done | wl-spec |
| T-0002 | Monorepo scaffold: pnpm + turbo, TS strict, ESLint/Prettier, Vitest, remove `apps/api`, CI workflow | infra | — | done | wl-build-infra |
| T-0003 | `packages/design-tokens` from the design system + coverage ramp (D-0003); lint rule: no hex values outside tokens | design | T-0002 | done | wl-design |
| T-0004 | CI checks: docs check (UF IDs exist in v2 flows, no v1 labels), duplicate D-NNNN id check, placeholder-test check | infra | T-0002 | done | wl-build-infra |
| T-0005 | Spec touch-ups per D-0015: NFR-SYNC-2 wording (edited_at/deleted_at), UF-11.1 clamped proposal copy, UF-10.2 "Recovering" = ≥ 6 weighted hard sets in 48 h | product | T-0001 | done | wl-spec |
| T-0006 | CI hygiene follow-ups: check turbo hash inputs include untracked data/exercises files and no cross-worktree cache replay; gen:api drift job (`pnpm --filter @workoutlab/shared gen:api` + git diff); regenerate packages/shared/src/database.gen.ts via supabase gen types in the supabase job and fail on drift (D-0037 §10); pgTAP column-drift check vs docs/data-model.md; root ESLint over .github/scripts in CI; v1-label regex word boundary; resolveBranch honours root; flag D-NNNN.md without slug; fix D-0032 context + D-0023 pointer | infra | T-0004 | todo | wl-build-infra |
| T-0007 | CI flakes: serial turbo unit tests in checks job; pnpm install in supabase job (PR #4, built by orchestrator) | infra | T-0004 | done | orchestrator |

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
- T-0202 (from T-0201 groom): the all-chest history's main lift is inverted-row (rule 7.2, D-0040 §11). T-0205: replace T-0201's first-time pre-fill stand-in with rule 14.
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
- Data (from T-0202, D-0050 §1): api/openapi.yaml CheckinPeriod.index minimum 0 (period 0 starts at onboarding); regenerate api.gen.ts.
- UF-09.8 web ticket (from T-0201b, D-0047): show minutesBehind only when show is true; save the Trim / Skip next items as the new plan. T-0205: reuse floorInc from packages/engine/src/energy.ts.
- T-0203 groom follow-ups: openapi finishSession text 'last write wins' → 'the latest endedAt wins (D-0053 §7)' (data); the offline queue never replays a sessions upsert with ended_at null after a finish (T-0300c); a draft PR for each T-0203 part (real-stack CI).

## Phase 1 — Contracts
| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0100a | Data model v1 part a: contract doc, config.toml, migration 1 (library, profiles, targets, sessions, sets, triggers, RLS), ACs tagged [a] incl. D-0029 exercises columns | data | T-0002 | done | wl-build-data |
| T-0100b | Data model v1 part b: migration 2 (routines, routine_items, plan_checkins, analytics schema), ACs tagged [b] | data | T-0100a | done | wl-build-data |
| T-0101 | Engine rules v1 (gap B4): warm-up, energy, swap ranking, progression/pre-fill, shuffle, main lift, "planned session" | engine | T-0001 | done | wl-spec |
| T-0102 | OpenAPI for Edge Functions with full schemas, auth and errors; generate `packages/shared` types | data | T-0100a, T-0101 | done | wl-build-data |
| T-0102a | OpenAPI v1 (3 Edge Function paths) + API/engine types in packages/shared (D-0037, AC1–14) | data | T-0100a, T-0101 | done | wl-build-data |
| T-0102b | DB types, parseSessionPlan, row mappers, migration 3 (priority_areas array_lower = 1) (AC15–20) | data | T-0102a, T-0100b | done | wl-build-data |
| T-0103a | Exercise library part a: @workoutlab/exercises package, schema + tests, bodyweight exercises (D-0022) | content | T-0002 | done | wl-build-content |
| T-0103b | Exercise library part b: dumbbell + full-gym exercises to 72–96 total (AC10–13 for all options) | content | T-0103a | done | wl-build-content |
| T-0103c | Library test hardening: invalid fixture timed-without-duration → required/missingProperty default_duration_s; optional warm-up id rename to engine-rules §7 wu-* ids (D-0033 §9) | content | T-0103b | todo | wl-build-content |

## Phase 2 — Core
| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0200 | Engine: rules 1–6 (mapping, hard sets, window, targets, deficit, recovery) + balance | engine | T-0101, T-0004 | done | wl-build-engine |
| T-0201 | Engine: time-budget selection, warm-up, energy, time check (rules 7, 8, 10) | engine | T-0200 | done | wl-build-engine |
| T-0201a | Engine: eligibility, selection + main lift, warm-up, reasons, output shape (rule 7.1–7.3, 10; AC1–24) | engine | T-0200 | done | wl-build-engine |
| T-0201b | Engine: energy Low/High + time check UF-09.8 (rules 7.4, 8; AC25–36) | engine | T-0201a | done | wl-build-engine |
| T-0202 | Engine: adaptive targets (rule 9) + simulated 14-day history suite | engine | T-0200 | done | wl-build-engine |
| T-0203 | Supabase local stack, seed from `data/exercises`, Edge Functions suggest/finish/balance | backend | T-0100a, T-0103b, T-0201a | split → T-0203a, T-0203b, T-0203c (D-0053) | wl-build-backend |
| T-0203a | Supabase stack + generated seed from data/exercises (external_load = NOT bodyweight, D-0044) | backend | T-0100a, T-0100b, T-0103b | doing | wl-build-backend |
| T-0203b | Edge Function setup (vendored engine/shared, D-0053 §1) + suggest + balance | backend | T-0203a, T-0201a, T-0102b | todo | wl-build-backend |
| T-0203c | Edge Function finish (latest endedAt wins, D-0053 §7–8) | backend | T-0203b | todo | wl-build-backend |
| T-0204 | Engine: swap ranking + deterministic shuffle (rules 12–13) | engine | T-0200 | todo | wl-build-engine |
| T-0205 | Engine: progression + pre-fill (rule 14) | engine | T-0200 | todo | wl-build-engine |

## Phase 3 — App
| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0300 | PWA shell: routing, auth (magic link), offline set queue, C-01 body map, C-02 tab bar | web-shell | T-0002, T-0003, T-0100a | split → T-0300a, T-0300b, T-0300c, T-0300d (D-0045) | wl-build-web |
| T-0300a | PWA shell: routes, tab bar C-02, tokens.css, manifest/icons from tokens, placeholder removed (AC-A*) | web-shell | T-0002, T-0003, T-0102a | done | wl-build-web |
| T-0300b | Auth: magic link + 6-digit code, guard (/welcome/* public, D-0014), callback (AC-B*) | web-shell | T-0300a | doing | wl-build-web |
| T-0300c | Offline set queue (Dexie per D-0001/TR-0022), sync, engine input with pending rows (AC-C*) | web-shell | T-0300b, T-0102b | todo | wl-build-web |
| T-0300d | C-01 body map + legend (compact on Today, full on Balance) (AC-D*) | web-shell | T-0300a | ready | wl-build-web |
| T-0301 | UF-01 Onboarding (< 60 s to first plan) incl. UF-01.5 Account | web-feature:UF-01 | T-0300, T-0201a | todo | wl-build-web |
| T-0302 | UF-02 Today + workout preview | web-feature:UF-02 | T-0300, T-0203b | todo | wl-build-web |
| T-0303 | UF-08 Session setup (time, energy, suggested, swap, ready) | web-feature:UF-08 | T-0300, T-0203b | todo | wl-build-web |
| T-0304 | UF-09 Focus mode: state machine, timers, auto-save, time check, pause | web-feature:UF-09 | T-0303, T-0205 | todo | wl-build-web |
| T-0305 | UF-03 List view + summary | web-feature:UF-03 | T-0304 | todo | wl-build-web |
| T-0306 | UF-04 Library + UF-05 in-workout swap | web-feature:UF-04 | T-0300, T-0203b, T-0204 | todo | wl-build-web |
| T-0307 | UF-06 Progress + UF-10 Balance | web-feature:UF-06 | T-0300, T-0203b | todo | wl-build-web |
| T-0308 | UF-07 Routine builder + UF-11 Plan check-in | web-feature:UF-07 | T-0300, T-0202, T-0100b | todo | wl-build-web |
| T-0309 | Landing page "workout LAB by Uptive" | landing | T-0003 | split → T-0309a, T-0309b (D-0046) | wl-design → wl-build-web |
| T-0309a | Landing copy: typed content modules in apps/landing/src/content (AC1–7) | design | T-0003 | done | wl-design |
| T-0309b | Landing build: static Astro page, no JS, tokens, privacy + 404 pages, placeholder removed (AC8–24) | landing | T-0309a | ready | wl-build-web |
| T-0310 | Account settings: JSON export (NFR-PRIV-4) and in-app account deletion (NFR-PRIV-5) | web-shell | T-0300 | todo | wl-build-web |

## Phase 4 — Ship
| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0400 | Terraform: import prod Supabase project (D-0011), create staging, codify auth config | infra | T-0203a | todo | wl-build-infra |
| T-0401 | Terraform: Cloudflare Pages projects, custom domains, DNS (D-0010) | infra | T-0309 | todo | wl-build-infra |
| T-0402 | Deploy pipelines: branch previews → staging, `main` → prod | infra | T-0400, T-0401 | todo | wl-build-infra |
| T-0404 | Custom SMTP: Resend as Supabase auth mailer, DNS records for `workout.vestgote.com`, branded magic-link template (D-0012) | infra | T-0401 | todo | wl-build-infra |
| T-0405 | Cost guard: Supabase spend cap verified on, usage alerts at 80 % of quotas, `docs/infra-costs.md` updated from real usage monthly | infra | T-0400 | todo | wl-build-infra |
| T-0403 | Release check: security review, e2e happy path, go/no-go | qa | T-0301…T-0309, T-0402, T-0404 | todo (needs H-06) | wl-release |
| T-0406 | Privacy requirements NFR-PRIV-* in docs/security (EU region, minimisation, export, deletion, notice, no PII in logs) | security | T-0001 | todo | security-reviewer (sub-agent) |

## CI fixes (any phase)
Found by the `/tick` CI watch or the `wl-ci-investigate` flow. Diagnosis in `docs/ci/CI-T-09NN-*.md`. Built with the owning lane's flow; merged only after a green draft-PR run.

| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|

## Phase 5 — Iterate
The product-owner adds tickets from `revisit` decisions, triage outcomes and QA findings, using the `wl-idea` flow.
