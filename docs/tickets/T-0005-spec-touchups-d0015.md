---
id: T-0005
title: Spec touch-ups per D-0015 — NFR-SYNC-2 (edited_at / deleted_at), UF-11.1 clamped proposal copy, UF-10.2 "Recovering" = ≥ 6 weighted hard sets in 48 h
lane: product
screens: [UF-10.1, UF-10.2, UF-11.1, UF-02.1]
decisions: [D-0015, D-0013, D-0017, D-0018, D-0002]
deps: [T-0001]
status: ready
---
## Why
Triage TR-0001 found that NFR-SYNC-2 ("the newest `completed_at` wins") conflicts with D-0013 (a set is placed in the 14-day window by its `completed_at`) and with NFR-SYNC-1 (duplicates are ignored). D-0015 resolved it: one row per `(user_id, client_id)`, `completed_at` never changes, edits are ordered by `edited_at`, and deletes are `deleted_at` tombstones. It asks the product lane to reword NFR-SYNC-2. Two smaller spec bugs from T-0001 are fixed here too, so the build tickets (T-0100, T-0300, T-0200, T-0307, T-0308) read one consistent spec:
- The UF-11.1 copy template `{min−1}–{max−1}` renders "0–1" for rhythm 1–2, which contradicts D-0018's 1–7 clamp and UF-11 AC12 (proposes 1–1).
- The UF-10.2 "Recovering" explanation says "≥ 6 hard sets in the last 48 h", but engine rule 6 counts **weighted** hard sets. The copy has to say what the engine computes (principle 3).

## Scope
- In:
  - `docs/specs/non-functional.md`: reword NFR-SYNC-2 to match D-0015. Tighten NFR-SYNC-1 so "append-only" means "sync never loses or hard-deletes a set" (D-0015). Cite D-0015 in the header. List the D-0015 pgTAP cases as the check, and add T-0200 as an owner (tombstones add 0 load).
  - `docs/specs/uf-11-plan-checkin.md`: the UF-11.1 copy uses the clamped proposal `{newMin}–{newMax}` returned by the engine. Examples cover the floor and ceiling. AC12 asserts the exact card copy for rhythm 1–2. A new AC17 covers the ceiling (6–7 → 7–7; 7–7 → no card).
  - `docs/specs/uf-10-balance.md`: the UF-10.2 explanation becomes "≥ 6 weighted hard sets in the last 48 h". AC11 also covers the explanation on UF-10.2.
  - `Design-docs/docs/product/user-flows.md`: the UF-10.2 and UF-11.1 sections match the specs.
  - Edge cases, as they apply to these rules:
    - **Offline:** an edit or delete made offline is queued with a newer `edited_at` and applied on reconnect. A replay is a no-op (NFR-SYNC-2).
    - **Zero history:** 0 and 0 sessions on rhythm 1–2 gives "Switch to 1–1 per week?" (AC12).
    - **Returning after 10 days off:** editing a set from 10 days ago keeps it on that day and in the window until it is 14 local days old, because `completed_at` never changes.
    - **Time running out:** not applicable. None of these screens is shown during a workout.
- Out:
  - Contract edits. `docs/data-model.md` (the `client_id`, `edited_at` and `deleted_at` columns) belongs to T-0100. `docs/engine-rules.md` (rule 3 excludes tombstones, rule 9 clamp) belongs to T-0101. Both are already named by D-0015 and D-0018 and folded into those tickets on the board.
  - Any change to the rules themselves. This ticket only aligns wording with D-0015, D-0018 and rule 6.

## Acceptance criteria
This is a docs ticket. Each AC is a mechanical check (a regex count or a file read) that `scripts/check-docs.mjs` can run in CI (T-0004). Until then the product-owner runs the same checks with Grep.
- AC1 Given `docs/specs/non-functional.md`, When the NFR-SYNC-2 row is read, Then it contains `edited_at`, `deleted_at`, `D-0015` and the sentence "`completed_at` is written once, at "Done set", and never changes".
- AC2 Given `docs/PRD.md`, `docs/specs/**` and `Design-docs/docs/product/**`, When searched for `newest \`completed_at\`` and `soft delete`, Then there are 0 matches.
- AC3 Given the NFR-SYNC-2 check column, When it is read, Then it names all five D-0015 pgTAP cases: replay no-op, older `edited_at` ignored, newer `edited_at` applied, `completed_at` unchanged after an edit, tombstone excluded from the 14-day load.
- AC4 Given `docs/specs/uf-11-plan-checkin.md` and `Design-docs/docs/product/user-flows.md`, When searched for the raw templates `{min−1}`, `{max−1}`, `{min+1}` and `{max+1}`, Then there are 0 matches. The UF-11 spec contains `max(1, min−1)` and `min(7, max+1)`, and both files contain "Switch to 1–1 per week?".
- AC5 Given UF-11 AC12, When it is read, Then for rhythm 1–2 with P2 = 0 and P3 = 0 it expects the exact copy "… Your plan is 2–4. Switch to 1–1 per week?" and asserts that "0–1" is not in the card. Given UF-11 AC17, Then for rhythm 6–7 with P2 = P3 = 16 it expects "Step up to 7–7 per week?" with no "7–8", and for rhythm 7–7 it expects no card.
- AC6 Given `docs/specs/uf-10-balance.md` and `Design-docs/docs/product/user-flows.md`, When searched for "≥ 6 weighted hard sets in the last 48 h", Then each file has at least 1 match. When searched for "≥ 6 hard sets in the last 48 h" (unweighted), Then there are 0 matches.
- AC7 Given UF-10 AC11, When it is read, Then it asserts the explanation text on UF-10.2 when `recovering = true`, and asserts neither the tag nor the text when `recovering = false`.
- AC8 Given the T-0005 branch diff, When the changed paths are listed, Then every path is under `docs/specs/**`, `docs/tickets/**` or `Design-docs/docs/product/**`, and no contract file (`docs/data-model.md`, `docs/engine-rules.md`, `api/openapi.yaml`, `packages/design-tokens/src/tokens.json`) changed.

## Paths you may change
`docs/specs/non-functional.md`, `docs/specs/uf-10-balance.md`, `docs/specs/uf-11-plan-checkin.md`, `docs/tickets/T-0005-*.md`, `Design-docs/docs/product/user-flows.md`. No extras.

## Contract impact
none. D-0015 names the `docs/data-model.md` change (T-0100). D-0018 and D-0015 name the `docs/engine-rules.md` changes (T-0101). No new decision is needed: every change here restates D-0015, D-0018 or engine rule 6.

## Definition of done
AC1–AC8 checks pass · no contract edits · commit messages start with `T-0005` and cite UF-10.2 / UF-11.1 · `pnpm -w typecheck lint test` still green (docs only).
