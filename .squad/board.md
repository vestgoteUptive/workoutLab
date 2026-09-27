# Board

Status: `todo` → `ready` (deps done, spec clear) → `doing` → `review` → `done`. Also `blocked:H-xx`, `triage:TR-xxxx`.
A ticket's detail lives in `docs/tickets/T-NNNN-*.md`; the product-owner writes it when the ticket becomes `ready`.
Flow = the AgentLab flow (or sub-agent chain) that runs it.

## Phase 0 — Foundation
| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0001 | PRD on v2 IDs; UF-10 Balance and UF-11 Plan check-in specs; non-functional requirements (gaps A1, B7) | product | — | done | wl-spec |
| T-0002 | Monorepo scaffold: pnpm + turbo, TS strict, ESLint/Prettier, Vitest, remove `apps/api`, CI workflow | infra | — | done | wl-build-infra |
| T-0003 | `packages/design-tokens` from the design system + coverage ramp (D-0003); lint rule: no hex values outside tokens | design | T-0002 | todo | wl-design |
| T-0004 | CI checks: docs check (UF IDs exist in v2 flows, no v1 labels), duplicate D-NNNN id check, placeholder-test check | infra | T-0002 | todo | wl-build-infra |
| T-0005 | Spec touch-ups per D-0015: NFR-SYNC-2 wording (edited_at/deleted_at), UF-11.1 clamped proposal copy, UF-10.2 "Recovering" = ≥ 6 weighted hard sets in 48 h | product | T-0001 | todo | wl-spec |

**Follow-ups folded into existing tickets (from T-0001/T-0002, 2026-09-27)** — the groomer copies these into the ticket files:
- T-0003: C-01 legend + coverage tokens on the D-0013 steps (0 / <0.33 / <0.66 / <1 / ≥1).
- T-0100: `session_sets.client_id` unique per user, `edited_at`, `deleted_at` + upsert rule (D-0015); `plan_checkins` table (D-0018); `profiles.onboarded_at`, `profiles.onboarding_timing_ms`; pgTAP for replay no-op, older edit ignored, tombstone excluded, cascade delete.
- T-0101 / T-0200: encode D-0018 in rule 9 and D-0013 in rule 3; rule 3 excludes `deleted_at` sets; balance() output adds coverageStep, needsAttention, recovering, days[14], contributors; v2 IDs in rules 8/9 (UF-09.8, UF-11). Engine lint rule banning Date.now()/Math.random()/new Date() in src.
- T-0102: `/balance` response schema per `docs/specs/uf-10-balance.md`; check-in evaluation response.
- T-0203: CI supabase job runs `pnpm install --frozen-lockfile` before `supabase start`.
- T-0300: queued sets carry `client_id` + `edited_at`; deletes are tombstones through the same upsert (D-0015).

## Phase 1 — Contracts
| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0100 | Data model v1 (gap B3): tables, keys, indexes, RLS policies; first migration; pgTAP RLS tests | data | T-0002 | todo | wl-build-data |
| T-0101 | Engine rules v1 (gap B4): warm-up, energy, swap ranking, progression/pre-fill, shuffle, main lift, "planned session" | engine | T-0001 | todo | wl-spec |
| T-0102 | OpenAPI for Edge Functions with full schemas, auth and errors; generate `packages/shared` types | data | T-0100, T-0101 | todo | wl-build-data |
| T-0103 | Exercise library: ~80 exercises, area weights, equipment, level, cues, licence (D-0005) | content | T-0002 | todo | wl-build-content |

## Phase 2 — Core
| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0200 | Engine: rules 1–6 (mapping, hard sets, window, targets, deficit, recovery) + balance | engine | T-0101 | todo | wl-build-engine |
| T-0201 | Engine: time-budget selection, warm-up, energy, swap ranking, over-time cuts (rules 7–8+) | engine | T-0200 | todo | wl-build-engine |
| T-0202 | Engine: adaptive targets (rule 9) + simulated 14-day history suite | engine | T-0200 | todo | wl-build-engine |
| T-0203 | Supabase local stack, seed from `data/exercises`, Edge Functions suggest/finish/balance | backend | T-0100, T-0103, T-0201 | todo | wl-build-backend |

## Phase 3 — App
| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0300 | PWA shell: routing, auth (magic link), offline set queue, C-01 body map, C-02 tab bar | web-shell | T-0002, T-0003, T-0100 | todo | wl-build-web |
| T-0301 | UF-01 Onboarding (< 60 s to first plan) incl. UF-01.5 Account | web-feature:UF-01 | T-0300, T-0201 | todo | wl-build-web |
| T-0302 | UF-02 Today + workout preview | web-feature:UF-02 | T-0300, T-0203 | todo | wl-build-web |
| T-0303 | UF-08 Session setup (time, energy, suggested, swap, ready) | web-feature:UF-08 | T-0300, T-0203 | todo | wl-build-web |
| T-0304 | UF-09 Focus mode: state machine, timers, auto-save, time check, pause | web-feature:UF-09 | T-0303 | todo | wl-build-web |
| T-0305 | UF-03 List view + summary | web-feature:UF-03 | T-0304 | todo | wl-build-web |
| T-0306 | UF-04 Library + UF-05 in-workout swap | web-feature:UF-04 | T-0300, T-0203 | todo | wl-build-web |
| T-0307 | UF-06 Progress + UF-10 Balance | web-feature:UF-06 | T-0300, T-0203 | todo | wl-build-web |
| T-0308 | UF-07 Routine builder + UF-11 Plan check-in | web-feature:UF-07 | T-0300, T-0202 | todo | wl-build-web |
| T-0309 | Landing page "workout LAB by Uptive" | landing | T-0003 | todo | wl-design → wl-build-web |
| T-0310 | Account settings: JSON export (NFR-PRIV-4) and in-app account deletion (NFR-PRIV-5) | web-shell | T-0300 | todo | wl-build-web |

## Phase 4 — Ship
| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0400 | Terraform: Supabase staging + prod projects, auth config | infra | T-0203 | todo (needs H-02) | wl-build-infra |
| T-0401 | Terraform: Cloudflare Pages projects, custom domains, DNS (D-0010) | infra | T-0309 | todo (needs H-03) | wl-build-infra |
| T-0402 | Deploy pipelines: branch previews → staging, `main` → prod | infra | T-0400, T-0401 | todo | wl-build-infra |
| T-0403 | Release check: security review, e2e happy path, go/no-go | qa | T-0301…T-0309, T-0402 | todo (needs H-06) | wl-release |
| T-0406 | Privacy requirements NFR-PRIV-* in docs/security (EU region, minimisation, export, deletion, notice, no PII in logs) | security | T-0001 | todo | security-reviewer (sub-agent) |

## Phase 5 — Iterate
The product-owner adds tickets from `revisit` decisions, triage outcomes and QA findings, using the `wl-idea` flow.
