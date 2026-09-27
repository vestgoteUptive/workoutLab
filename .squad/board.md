# Board

Status: `todo` → `ready` (deps done, spec clear) → `doing` → `review` → `done`. Also `blocked:H-xx`, `triage:TR-xxxx`.
A ticket's detail lives in `docs/tickets/T-NNNN-*.md`; the product-owner writes it when the ticket becomes `ready`.
Flow = the AgentLab flow (or sub-agent chain) that runs it.

## Phase 0 — Foundation
| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0001 | PRD on v2 IDs; UF-10 Balance and UF-11 Plan check-in specs; non-functional requirements (gaps A1, B7) | product | — | ready | wl-spec |
| T-0002 | Monorepo scaffold: pnpm + turbo, TS strict, ESLint/Prettier, Vitest, remove `apps/api`, CI workflow | infra | — | ready | wl-build-infra |
| T-0003 | `packages/design-tokens` from the design system + coverage ramp (D-0003); lint rule: no hex values outside tokens | design | T-0002 | todo | wl-design |

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

## Phase 4 — Ship
| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0400 | Terraform: Supabase staging + prod projects, auth config | infra | T-0203 | todo (needs H-02) | wl-build-infra |
| T-0401 | Terraform: Cloudflare Pages projects, custom domains, DNS (D-0010) | infra | T-0309 | todo (needs H-03) | wl-build-infra |
| T-0402 | Deploy pipelines: branch previews → staging, `main` → prod | infra | T-0400, T-0401 | todo | wl-build-infra |
| T-0403 | Release check: security review, e2e happy path, go/no-go | qa | T-0301…T-0309, T-0402 | todo (needs H-06) | wl-release |

## Phase 5 — Iterate
The product-owner adds tickets from `revisit` decisions, triage outcomes and QA findings, using the `wl-idea` flow.
