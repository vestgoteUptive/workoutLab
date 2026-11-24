---
id: T-0992
title: User flows v2 and PRD - UF-08 plans by area (UF-08.2 rewritten, UF-08.6 added, Reorder and Shuffle retired, Start empty folded in)
lane: product
screens: [UF-08.1, UF-08.2, UF-08.4, UF-08.5, UF-08.6]
decisions: [D-0274, D-0276, D-0279, D-0280]
deps: []
status: done
---
## Why
`Design-docs/docs/product/user-flows.md` still describes the exercise-list UF-08.2. The flow index already names UF-08.6 (this idea's commit); the prose and the PRD must follow the decisions so the build and the screen specs have one source (D-0002).

## Scope
- In: rewrite the UF-08.2 bullets (title, area rows, stepper, Add an area, Fill the rest, states, what was retired), add a UF-08.6 bullet, change the UF-08.1 "Start empty" line (opens UF-08.2 with no areas), mark the UF-08.5 Add as local, drop the Reorder, Shuffle and empty-mode Suggestions text, remove the "planned" marker paragraph, add a PRD row. **Ready folded in (D-0280):** UF-08.2 ends in "Start workout", shows "Done by HH:MM" and holds the collapsed "Focus mode" disclosure (explainer and three switches); replace the UF-08.4 bullet with a one-line retired note; the PRD's UF-08 row and its voice-cue line stop naming UF-08.4 as a screen. Keep the UF-09 text as is.
- Out: any screen spec file (T-0993), code, engine rules.

## Acceptance criteria
- AC1 Given the user flows file, When `node .github/scripts/check-all.mjs` runs, Then it passes (screen IDs valid, no v1 labels).
- AC2 Given the UF-08 section, Then it names UF-08.6, says exercise names are not on the area row, and contains none of "Reorder", "Shuffle picks", "Suggestions section", "mode" in the old empty-mode sense, except in a sentence that says it was retired (D-0274 §3).
- AC3 Given UF-08.1, Then "Start empty" is described as opening UF-08.2 with no areas, and the UF-08.1 minutes-first rule (principle 2) is unchanged. Sibling: "Suggest my workout" still opens UF-08.2 with the default plan.
- AC4 Given the PRD, Then one row cites D-0274 and D-0277.
- AC6 (Ready folded in) Given the UF-08 section, Then it describes Start workout (1 tap with no edit, 3 with two), the "Done by" line, the Focus mode disclosure and the disabled Start at no areas; the index row and one bullet say UF-08.4 is retired and its ID is never reused; no text says Start is on a Ready screen. Given the PRD, Then its UF-08 row lists .4 as retired.
- AC5 (zero and returning states) Given the UF-08.2 text, Then it states the zero-history, 10-days-off, time-running-out, offline and start-empty states in one line each.

## Paths you may change
`Design-docs/docs/product/**`, `docs/PRD.md`

## Contract impact
none.

## Definition of done
Tests for every AC pass · `node .github/scripts/check-all.mjs` green · contracts unchanged or decision linked · commit messages start with `T-0992` and cite UF-08.2.

## Build / accept log
- Build (product-owner, 2026-11-24): rewrote UF-08 in `Design-docs/docs/product/user-flows.md` (UF-08.1 Start empty, UF-08.2 Today's plan with Done by, Focus mode disclosure, Start workout and the five states, new UF-08.6, UF-08.5 Add local, UF-08.3 note, UF-08.4 one-line retired note, "planned" paragraph removed) and `docs/PRD.md` (UF-08 row lists .4 retired, new D-0274 and D-0277 row, Reorder and the voice-cue line no longer name a UF-08.4 screen). No test file added: the ticket's Paths allow only docs, so AC2 to AC6 were checked by a scratch script outside the repo (25 checks, fault planted and restored with cp and cmp); a committed docs-pin test needs a lane that may write `packages/design-tokens/test` (follow-up for the orchestrator). Ran `check-all.mjs` (only the expected `ticket-not-on-base`), `format:check`, `test:repo-checks` (4 failures, all that same error), design-tokens test (349 pass). `test:affected` does not exist yet.
