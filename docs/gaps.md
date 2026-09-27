# Gap analysis — 2026-09-27

What the docs in this repo cover, what is missing, and the **default** each gap gets so work never waits.
A default is a real decision, logged in `.squad/decisions/` and marked `revisit` where a human may want a say.
Close a gap by linking the ticket or decision that closed it.

## A. Contradictions (must be reconciled first)

| # | Gap | Default | Decision |
|---|---|---|---|
| A1 | Two sets of screen IDs. `docs/user-flows-v1.md` + `docs/PRD.md` + root `CLAUDE.md` use v1 (UF-06 = Logging, UF-09 = Plan). `Design-docs/docs/product/user-flows.md` is v2 (UF-06 = Progress, UF-09 = Focus mode) and says it supersedes v1. | v2 is the source of truth. PRD scope table gets rewritten to v2 IDs; v1 kept as history. v1-only features (UF-08 Balance, UF-09 adaptive-target check-in) get new v2 IDs (UF-10, UF-11). | D-0002 |
| A2 | Coverage colour: v1 says "deep teal = on target", root CLAUDE.md says pale→deep on lime, design system has no coverage tokens. | Coverage scale is a lime ramp (5 steps from `surface-2` to `accent`); "needs attention" = `warn` outline. Designer owns the token. | D-0003 (revisit) |
| A3 | UF-06.1 in the prototype shows *weekly* sets per muscle; the core model is rolling 14 days. | 14 days everywhere. Prototype is reference only. | D-0002 |
| A4 | Prototype plank screen (UF-09.7) is not in the 45-min plan; set counts differ between screens. | Engine output is the truth; screens show whatever the engine returns. Fixture workout in `packages/engine/test/fixtures` replaces prototype numbers. | D-0002 |
| A5 | Warm-up in time budget: open question in PRD/engine rules, but v2 UF-08.1 already specifies a toggle, default on. | Toggle, default on; warm-up estimated at 40 s × moves (UF-09.2). | D-0004 |

## B. Missing contracts

| # | Gap | Owner | Default |
|---|---|---|---|
| B1 | Stack undecided (ADR 0001). | orchestrator | React + Vite PWA, TypeScript, pnpm workspaces, Supabase, Cloudflare Pages. D-0001. |
| B2 | `api/openapi.yaml` has paths but no schemas, no auth, no errors. | data-modeler | Supabase-native: plain CRUD goes through supabase-js + RLS (typed from generated DB types); the OpenAPI file documents only Edge Functions (`/workouts/suggest`, `/sessions/{id}/finish`, `/balance`). D-0001. |
| B3 | `docs/data-model.md` has no types, keys, indexes, RLS policies, or the exercise-alternative/variant relation that UF-04.3, UF-05, UF-08.3 need. Routines (UF-07) have no tables. Reps-in-reserve (UF-09.4) has no column. Timed sets exist only as `duration_s`. | data-modeler | Add `routines`, `routine_items`, `exercise_variants`, `session_sets.rir`, `session_sets.kind (reps|timed)`, `plan_checkins`. |
| B4 | Engine rules lack: warm-up generation, swap ranking (UF-05, UF-08.3 "reason changes ranking"), energy modifiers (UF-08.1), progression / pre-fill of weights (principle 3), shuffle, main-lift concept, what "planned sessions" means for rule 9. | engine-dev + product-owner | Written into `docs/engine-rules.md` v1 as numbered rules with tests; numbers are tunable defaults. |
| B5 | No exercise library content or licence decision. | content-curator | Seed from wger (CC-BY-SA) data + own illustrations later; `license` column mandatory. D-0005 (revisit). |
| B6 | No design tokens as code; only a markdown table. | designer | `packages/design-tokens` (CSS variables + TS export) is the only place hex values live. |
| B7 | No non-functional requirements: offline behaviour, sync conflicts, performance budget, accessibility, i18n, analytics, privacy/GDPR (EU user, health-adjacent data). | product-owner + security-reviewer | Offline-first logging (IndexedDB queue, server wins on conflict except sets which are append-only); WCAG 2.2 AA; English only v1; no third-party analytics v1; account deletion + export in v1. |

## C. Missing process and infrastructure

| # | Gap | Default |
|---|---|---|
| C1 | `.claude/agents/` referenced but absent. `/plan-phase` referenced but absent. | Created: `agents/roles/` (single source) → generated `.claude/agents/` + `.agentlab/agents/`. `/plan-phase`, `/tick`, `/triage` commands. |
| C2 | No decision log, board, or state that a fresh agent can resume from. | `.squad/` (see its README). |
| C3 | No IaC, no environments, no CI. | Terraform for Supabase project + Cloudflare (DNS, Pages); Supabase CLI for migrations/functions; GitHub Actions CI. D-0006. |
| C4 | No domain plan. | Landing `workout.vestgote.com`, PWA `app.workout.vestgote.com`, both as Pages custom domains. D-0010 (supersedes D-0007, D-0009). |
| C5 | No git history, no remote. | First `/tick` makes a baseline commit locally. Creating the GitHub repo is a human gate (H-01). |
| C6 | Auth providers: "SSO-first" but no provider named. | Email magic link + Google in v1; Apple when there is an Apple developer account (H-05). |

## D. Product open questions (answered by default, all `revisit`)

| Question | Default |
|---|---|
| Guest mode before account? | No. Magic link is fast enough for the < 60 s goal; revisit after first user test. |
| Import history (Apple Health, Strava)? | Out of scope v1. |
| Hard-stop clock time vs minutes (UF-08.1)? | Both: hard stop converts to minutes at start. |
| Watch, live activity, voice cues? | Out of scope v1, except the 3-2-1 sound cue already in UF-08.4. |
| Carry weights between variants on swap? | Yes, when the variant shares a primary area and equipment type; otherwise use history or blank. |
| Commercial intent, platforms beyond PWA? | Free, PWA only v1. |
