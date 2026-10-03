---
id: D-0166
title: "UF-11.3 Save and UF-11.1 Accept keep the D-0070 §3 write order in v1: the split state after a step-2 failure is accepted, healed by the idempotent retry; one transactional write waits for a partial-failure report (T-0362)"
status: revisit
date: 2026-10-03
by: product-owner (groom T-0362)
area: product
builds-on: D-0070 §3, D-0081 §2, D-0001
---
## Context
D-0070 §3 writes UF-11.3 Save as three sequential supabase-js calls: (1) upsert the 9
`area_targets` from `previewTargets(...)` with `source 'default'`, (2) update `profiles`
goal/rhythm/priority_areas, (3) withdraw the unanswered `plan_checkins`. There is no transaction.
On "(1) ok, (2) fails", `area_targets` hold the new numbers, labelled `From your plan` on UF-11.2,
while `profiles` still holds the old inputs (T-0308b review). UF-11.1 Accept has the same shape:
(1) adapted targets, (2) the profile rhythm.

What `main` does today (`features/UF-11/save-plan.ts`, `__tests__/save-plan.test.tsx` AC-B12):
the error "Couldn't update your plan. Try again." shows, the draft stays on `/plan/edit`, Save
stays enabled, and a retry re-runs from step (1). Every step writes absolute values, so the retry
is idempotent and one tap heals the split.

Options considered:
- **Reorder** (profile first). Moves the window, doesn't close it: new inputs with old targets is
  the same mismatch in the other direction. Step (3) must stay last either way (D-0070 §3: never
  withdraw a proposal for a plan that didn't change).
- **A local "your last save didn't finish" marker.** Adds client state that a second device
  can't see, for a case nobody has reported. Rejected.
- **One RPC or Edge Function per save** (a Postgres function in one transaction). The real fix,
  but it changes `api/openapi.yaml` or adds a migration-backed function (data + api lanes), and it
  should cover Accept and Save together. That is D-0070's own revisit trigger.

## Decision
1. **No change in v1.** UF-11.3 Save and UF-11.1 Accept keep the D-0070 §3 order and their
   failure behaviour. The split state is a known, accepted window, not a defect.
2. **Why it's acceptable.** The window needs step (2) to fail right after step (1) succeeded,
   both online. The user sees the failure and the draft, and one retry heals it. If they leave
   instead, the targets are still valid engine output (principle 3), the next Save, Accept or
   adaptation (UF-11) rewrites them, and nothing is lost.
3. **The existing tests stay as they are.** AC-B12 pins the split state and the re-run from
   step (1). They are the contract for this decision. Don't weaken them.
4. **T-0362 closes with this decision.** There is no implementation ticket.

## Consequences
- The board row T-0362 moves to `done` (decision only, no build).
- No contract change. `docs/specs/uf-11-plan-checkin.md` needs no edit: the error copy and the
  retry are already specified.
- If the trigger below fires: one ticket in the data lane adds a `save_plan` / `accept_plan`
  transactional function (migration, `docs/data-model.md`), plus api-lane wiring if it goes
  through an Edge Function, plus one UF-11 ticket to call it. That needs its own decision naming
  the contract change.

## Revisit when
- Any partial-failure report, or error telemetry showing step (2) or (3) failures after step (1).
- UF-11.3 or Accept gains a fourth write, or a write that isn't idempotent on retry.
- The engine starts reading targets and profile inputs together in a way where a split state
  changes a suggestion beyond the next save.
