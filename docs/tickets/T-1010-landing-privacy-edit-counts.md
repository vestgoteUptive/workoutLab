---
id: T-1010
title: Privacy notice - say that counts of swapped and removed exercises are stored with the account, exported and deleted with it
lane: design
screens: [UF-11.4]
decisions: [D-0281, D-0188, D-0017]
deps: [T-1001]
status: ready
---
## Why
The notice must be true of the system (D-0188 §5). Once counts are saved with the account (D-0281), "What we store" and "Export or delete" should name them. The deploy that includes T-1003 or T-1004, the first code that records a count, is held until this is merged (D-0281 §5).

## Scope
- In: `apps/landing/src/content/privacy.ts` (one sentence in "What we store": which exercises you swap or remove and how often, used only to offer you a preference; one clause in "Export or delete your data": they are in the export and deleted with the account, and "Forget what was counted" in Plan → Account deletes them) and `updated`; `content.test.ts` pins.
- Out: the app, the data model, any other section.

## Acceptance criteria
- AC1 Given the notice, Then "What we store" says the counts are stored with the account, readable only by the user, and used only to offer a preference the user must accept.
- AC2 Given "Export or delete your data", Then the counts are named as part of the export and the deletion, and Forget is named.
- AC3 Given `content.test.ts`, Then the existing pins pass, `updated` is the merge date, and no `{{HUMAN:` marker or third-party analytics claim is added (sibling: "No tracking" is unchanged).

## Paths you may change
`apps/landing/src/content/**`

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-1010` and cite UF-11.4.

## Build / accept log
- Build (designer, 2026-11-24): privacy.ts "What we store" gains a paragraph (counts, random device id, timestamps, asked marks, why, opt-out); "Export or delete" names export, deletion and "Forget what was counted"; `updated` 2026-11-24 (set to the merge date if it differs). AC1/AC2/AC3 -> content.test.ts "T-1010 AC1/AC2/AC3". Planted fault (Forget renamed) failed AC2, restored with cp, cmp clean. Landing typecheck, lint, test (167) green; format:check green. check-all flags lane-path-not-owned for files outside this diff (stale local `main` base), none in my change.
