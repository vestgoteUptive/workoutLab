---
id: T-0001
title: PRD on v2 IDs; UF-10 Balance and UF-11 Plan check-in specs; non-functional requirements (gaps A1, A3, B7)
lane: product
screens: [UF-01.5, UF-06.1, UF-10.1, UF-10.2, UF-11.1, UF-11.2, UF-11.3]
decisions: [D-0002, D-0003, D-0004, D-0017, D-0018, D-0013, D-0014]
deps: []
status: ready
---
## Why
The PRD still uses v1 screen IDs, so the same ID points to different screens in different docs (gap A1, D-0002). Two v1 features, Balance and the adaptive-target check-in, have no v2 screens yet. Without them, T-0307 and T-0308 can't be built and T-0202 has no product rules to follow. Nothing says how the app behaves offline, how fast it must be, or how it treats EU personal data (gap B7). This ticket fixes the product docs so every later ticket can cite one set of IDs and one list of non-functional requirements.

## Scope
- In:
  - `docs/PRD.md` rewritten on v2 IDs: scope table UF-01…UF-11 (incl. UF-01.5 Account), the core model, principles, open questions resolved with links to decisions, and measurable success metrics.
  - `Design-docs/docs/product/user-flows.md`: add UF-01.5, UF-10 and UF-11 to the flow index, with screen sections. Replace the "UF-06.1 weekly" gap note with the 14-day rule (A3). Answer the open questions with links to decisions.
  - `docs/specs/uf-10-balance.md`: UF-10.1 All areas, UF-10.2 Area detail, with testable ACs for the build ticket T-0307.
  - `docs/specs/uf-11-plan-checkin.md`: UF-11.1 Check-in, UF-11.2 Plan, UF-11.3 Edit plan, with testable ACs for T-0308 and T-0202.
  - `docs/specs/non-functional.md`: offline, sync conflicts, performance budget, accessibility, i18n, analytics, privacy/GDPR, timers.
  - Edge cases written into each spec: offline, time running out, zero history, returning after 10 days off.
  - Defaults recorded as decisions with `status: revisit`: D-0017 (NFR), D-0018 (check-in rules), D-0013 (balance window and coverage steps), D-0014 (UF-01.5 placement and how the 60 s is measured).
- Out:
  - Changing contracts. `docs/engine-rules.md` and `docs/data-model.md` get follow-ups (engine and data lanes) that point at D-0018/D-0013.
  - Specs for UF-01…UF-09 beyond what v2 already says (their build tickets carry the detail).
  - Manual per-area target overrides (`area_targets.source = manual`). Cut from v1 to keep UF-11 small.

## Acceptance criteria
This is a docs ticket. Each AC is a mechanical check (a file-exists check or a regex count) that `scripts/check-docs.mjs` will run in CI (follow-up, infra lane). Until then the product-owner runs the same checks with Grep.

- AC1 Given `docs/PRD.md`, When searched for the v1 labels `UF-02 Onboarding`, `UF-03 Today`, `UF-04 Start workout`, `UF-05 Exercise guide`, `UF-06 Logging`, `UF-07 Summary`, `UF-08 Balance` and `UF-09 Plan`, Then there are 0 matches.
- AC2 Given the scope table in `docs/PRD.md`, When its rows are read, Then it has exactly 11 flow rows, UF-01 through UF-11, and each flow name equals the name in the `Design-docs/docs/product/user-flows.md` flow index.
- AC3 Given every screen ID matching `UF-\d{2}(\.\d+)?` in `docs/PRD.md` and `docs/specs/*.md`, When each is looked up in `Design-docs/docs/product/user-flows.md`, Then each flow ID has a row in the flow index and each screen ID appears in its flow's row or section.
- AC4 Given `Design-docs/docs/product/user-flows.md`, When the flow index is read, Then it has rows for `UF-10 Balance` (screens .1, .2) and `UF-11 Plan check-in` (screens .1, .2, .3), the UF-01 row lists `.5 Account`, and the text `weekly` appears 0 times.
- AC5 Given `docs/specs/uf-10-balance.md`, When its ACs are read, Then there are at least 8, all in Given/When/Then form with concrete numbers, and at least one AC each covers zero history, offline, returning after 10 days off, and the 14-day window boundary.
- AC6 Given `docs/specs/uf-11-plan-checkin.md`, When its ACs are read, Then there are at least 8 in Given/When/Then form, and at least one AC each covers: under-rhythm proposal after two periods in a row, no proposal after one low period (10 days off), over-rhythm proposal, targets unchanged until Accept, offline, zero history, and never shown during a workout (UF-08, UF-09).
- AC7 Given `docs/specs/non-functional.md`, When its sections are read, Then it has sections for Offline, Sync conflicts, Performance, Accessibility, i18n, Analytics, Privacy/GDPR and Timers, and each section has at least one requirement with a number or a pass/fail check (ID `NFR-*`).
- AC8 Given the "Open questions" sections of `docs/PRD.md` and `user-flows.md`, When each item is read, Then each one either links a `D-NNNN` or names an owner and a ticket (or, for items out of scope in v1, an owner and "Phase 5 `wl-idea`").
- AC9 Given the decisions this ticket cites, When `.squad/decisions/` is listed, Then D-0013, D-0014, D-0017, D-0018 exist with `status: revisit` and a "Revisit when" section.
- AC10 Given `docs/PRD.md`, When the success metrics are read, Then each metric has a definition (start and stop events, or a formula) and a numeric target.

## Paths you may change
`docs/PRD.md`, `docs/specs/**`, `docs/tickets/**`, `Design-docs/docs/product/**`. Extra paths: `.squad/decisions/D-0013, D-0014, D-0017, D-0018` only. Under `.squad/README.md` rule 1, any agent may record a default decision.

## Contract impact
none. D-0018 and D-0013 describe product intent that `docs/engine-rules.md` has to encode in T-0101 (engine lane). D-0017 names the data fields that T-0100 needs (client-generated set IDs). Both are follow-ups, not edits in this ticket.

## Definition of done
All AC checks pass · no contract edits · commit messages start with `T-0001` and cite screen IDs · follow-ups filed for the engine, data, infra, security and orchestrator lanes.
