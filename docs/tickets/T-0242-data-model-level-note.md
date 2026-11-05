---
id: T-0242
title: "docs/data-model.md: note on profiles.level: client-writable from UF-11.3 (D-0230), does not change plan_changed_at; no schema change"
lane: data
screens: [UF-11.3]
decisions: [D-0230, D-0020, D-0021]
deps: []
status: ready
---
<!-- Written by product-owner 2026-11-05 (groom, editable-level idea). Flow: wl-build-data (agent data-modeler). About 1 hour: one notes cell in a contract file, named by D-0230 §4. No migration, no generated types, no vendor regen. -->

## Why
`profiles.level` was written only by onboarding (UF-01.3). D-0230 makes it editable on UF-11.3 Edit plan. A level-only save relies on the trigger leaving `plan_changed_at` alone. The `bar_kg` and `plates_kg` rows already carry the note "Client-writable; does not change `plan_changed_at`", but the `level` row doesn't. D-0230 §4 names this clarifying note as the one allowed `docs/data-model.md` change. It changes no schema.

## Scope
- In: in `docs/data-model.md`, the `profiles` table's `level` row (the second `| level |` row, about line 105; the first is `exercises.level`). Its notes cell becomes "Check `in ('beginner','intermediate','advanced')`. Client-writable: UF-01.3 at onboarding, UF-11.3 Edit plan after it (D-0230). Does not change `plan_changed_at`." Add D-0230 to the `profiles` heading's decision list.
- Out:
  - Any column, type, default, check, trigger or RLS change.
  - `packages/shared/**` (`database.gen.ts` is unchanged).
  - `api/openapi.yaml`.
  - The `exercises.level` row.

## Acceptance criteria
- **AC1 (the note)** Given `docs/data-model.md`, Then:
  - the `profiles` `level` row's notes cell contains "Client-writable", "UF-11.3", "D-0230" and "Does not change `plan_changed_at`";
  - the `exercises` `level` row is byte-identical to main.
  - Checked by an exact-text diff in review. This is a prose-only change, so a dedicated test would add cost and no coverage; the schema checks below guard the table itself.
- **AC2 (no schema drift)** The T-0004 column-block drift check and pgTAP `001_schema` are green unchanged. The diff touches only `docs/data-model.md` and this ticket.

Binary-condition check (D-0197 §7): not applicable (no runtime behaviour).

## Paths you may change
- `docs/data-model.md` (lane; the `profiles` `level` notes cell and the `profiles` heading)
- `docs/tickets/T-0242-data-model-level-note.md` (log)

## Contract impact
`docs/data-model.md`: a clarifying note on one row, named by D-0230 §4. No schema change.

## Definition of done
- AC1 and AC2 hold.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` are green. A contract file changed, so the orchestrator decides on the forced gate.
- Commits start `T-0242 UF-11.3:`.

## Build / accept log
- 2026-11-05 build (data-modeler). Base `1d97e59e`, tree clean. `docs/data-model.md`: `profiles` `level` notes cell now reads "Check `in ('beginner','intermediate','advanced')`. Client-writable: UF-01.3 at onboarding, UF-11.3 Edit plan after it (D-0230). Does not change `plan_changed_at`."; D-0230 added to the `profiles` heading. `exercises.level` row untouched. No trigger-text note (out of scope). Note checked against `private.profiles_before_write` (v1a migration, unchanged by `20261011120000`): `plan_changed_at` moves only on `goal`, `rhythm_min`, `rhythm_max`, `priority_areas`; `level` is not among them.
  - AC1 → exact-text diff (only the two lines above change). AC2 → `packages/shared/test/database.test.ts` (the doc-parsed column drift check: name/type/null, notes ignored) 28/28 green; pgTAP `001_schema` AC1 block uses only name/type/null, which are unchanged; no local Docker here, so pgTAP was not run.
  - Gate: `-w format:check` green. `check-all.mjs` / 4 repo-checks red only for `ticket-not-on-base`: this clone has no local `main`, and the stale `origin/main` (2026-10-15) has no T-0242. Green in a scratch clone with `main` = `main-hzlbfc`.
