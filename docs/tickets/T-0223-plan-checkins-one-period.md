---
id: T-0223
title: plan_checkins for one-period check-ins (UF-11.1) — `period_index >= 0`, nullable `completed_prev`, `PlanCheckin.periodIndex` / `CheckinPeriod.index` minimum 0, `completedPrev` nullable, regenerated shared types
lane: data
screens: [UF-11.1]
decisions: [D-0018, D-0021, D-0043, D-0053, D-0061, D-0070, D-0094]
deps: [T-0215]
status: todo
---
<!-- Groomed 2026-10-01 by product-owner (groom T-0223). Build flow: wl-build-data. About ¼ day. Becomes ready when T-0215 is done. It touches supabase/**, so it needs a green draft-PR run (AC-9). T-0308c depends on this ticket. -->

## Why
D-0061 §2 (human, `decided`) makes the rule 9 check-in propose after **one** ended 14-day period. T-0215 builds that in the engine (D-0094). Two consequences reach the schema:
- **Period 0 can now propose.** A new user with 0 sessions in period 0 gets a "down" proposal on the first day after it (D-0094 §3, T-0215 AC8, R9-E8: `{index 0, start 2026-09-20, end 2026-10-03, completed 0, under}`). Today `plan_checkins.period_index` has `check (period_index >= 1)`, and `PlanCheckin.periodIndex` / `CheckinPeriod.index` have `minimum: 1`, so T-0308c could never store or validate that row.
- **There is no earlier period.** `completed_prev` is `not null`, but a one-period evaluation has nothing to put in it.

D-0070 §6 names this exact contract change, and D-0094 §6 confirms it is unchanged. So this ticket needs no new decision. It changes the schema, the API description and the generated types to match, so that T-0308c can insert the UF-11.1 row with `completed_prev = null` (D-0070 §6, last bullet).

## Scope
- In:
  - **A new migration** `supabase/migrations/20261001090000_plan_checkins_one_period.sql`. It replaces the `period_index` check with `period_index >= 0` and drops `not null` from `completed_prev`, which keeps its `>= 0` check (a null passes it). `20260928090000_data_model_v1b.sql` isn't edited. The inline checks there carry Postgres's default names (`plan_checkins_period_index_check`, `plan_checkins_completed_prev_check`). Check the real names in a pgTAP test, and keep them.
  - **`docs/data-model.md` § plan_checkins:**
    - `period_index`: "Check `>= 0`. The evaluated (last ended) period; 0 is the first period after onboarding (D-0094)."
    - `completed_prev`: null = yes, "Check `>= 0`. Null for a one-period evaluation (D-0070 §6)."
    - `completed_last`: "Completed sessions in the evaluated period."
  - **`api/openapi.yaml`:**
    - `PlanCheckin.periodIndex` gets `minimum: 0`.
    - `PlanCheckin.completedPrev` becomes `anyOf: [{type: integer, minimum: 0}, {type: "null"}]`, the nullable style the file already uses for `answer`.
    - `PlanCheckin` keeps `completedPrev` in `required` (present, possibly null).
    - `CheckinPeriod.index` gets `minimum: 0` (the D-0050 follow-up).
    - The `PlanCheckin` description gains "`completedPrev` is null for a one-period evaluation (D-0070 §6, D-0094)".
    - Two examples are added: a `PlanCheckin` with `periodIndex: 0, completedPrev: null, completedLast: 0, rhythmMinBefore: 3, rhythmMaxBefore: 4, proposedMin: 2, proposedMax: 3`, and a `CheckinPeriod` with `index: 0`.
    - `info.version` stays `1.0.0` (pinned by `openapi.test.ts`). Nothing else in the file changes.
  - **Regenerated types in `packages/shared`:**
    - `src/api.gen.ts` is regenerated with `openapi-typescript`, so the AC13 drift test stays byte-identical.
    - `src/database.gen.ts`: `plan_checkins.completed_prev` becomes `number | null` on `Row` and `number | null` (optional) on `Insert` and `Update`, in the shape `supabase gen types typescript --local` (CLI 2.118.0) emits. This is a hand edit, as D-0043 allows, because Docker can't pull images on the orchestrator host. The real-stack check is AC-9.
  - **`toPlanCheckin`** passes `completed_prev: null` through as `completedPrev: null`, with tests.
  - **pgTAP tests** for the new constraints, plus the two existing assertions that encode the old ones (AC-3).
  - **The vendored copy** `supabase/functions/_shared/vendor/**`, regenerated with `node supabase/scripts/vendor.mjs`, so that `--check` passes in CI (D-0053 §1).
- Out:
  - The engine. T-0215 owns `evaluateCheckin` and already emits period 0 and a one-entry `periods`.
  - The web insert (T-0308c writes `completed_prev = null`, D-0070 §4 and §6).
  - `CheckinEvaluation.periods` `maxItems: 1`. D-0094 §1 says "at most one", but no decision names an openapi change for it. Raise it as a follow-up if wanted.
  - The UF-11 spec copy (a product follow-up from D-0070 and D-0094).
  - Any other column, constraint, RLS policy or index.

### Edge cases that are in scope
- **Zero history:** the new user's period-0 proposal row (R9-E8) is accepted (AC-1, AC-5).
- **Returning after 10 days off:** a one-period proposal for period 3 (R9-E2) is stored with `completed_prev` null and `completed_last` 2 (AC-1).
- **Offline / a second device:** the unique `(user_id, period_index)` still gives `23505` for period 0. That `23505` is what T-0308c relies on to read the existing row (AC-2).
- **Time running out:** none. No workout path touches `plan_checkins` (D-0070 §7).

## Acceptance criteria
pgTAP in `supabase/tests/database/` (run by the CI `supabase` job, AC-9). Vitest in `packages/shared/test/`. User A is `00000000-0000-0000-0000-00000000000a`, onboarded `2026-09-20T08:00Z` with rhythm 3–4, acting as `authenticated` with A's JWT claims, as in `009_plan_checkins.test.sql`.

- **AC-1 (period 0 and a null `completed_prev` are accepted, pgTAP)** Given A, When A inserts `(period_index 0, completed_prev null, completed_last 0, rhythm 3–4 before, proposed 2–3, proposed_at '2026-10-04T07:00Z')`, Then it succeeds. `select period_index, completed_prev, completed_last` returns `(0, null, 0)`. Given A inserts `(3, null, 2, 3–4, 2–3, '2026-11-15T07:00Z')`, Then it succeeds. This is a one-period proposal for period 3 (2026-11-01 to 11-14), shown on the first day after it, in the R9-E2 shape (back after 10 days off).
- **AC-2 (the old guarantees still hold, pgTAP)** Given AC-1's period-0 row, When A inserts a second row for period 0, Then it fails with `23505`. `period_index -1` → `23514`. `period_index null` → `23502`. The other check-violation cases use period 5, an index no other row in the file uses, so a `23505` can't mask the check under test:
  - `(5, completed_prev -1, …)` → `23514`;
  - `(5, completed_last null, …)` → `23502`;
  - `(5, …, answer 'accepted', answered_at null)` → `23514` (`plan_checkins_answer_pair`).

  Each case is one pgTAP assertion.
- **AC-3 (the schema file says so, pgTAP)** In `001_schema.test.sql`, the `completed_prev` assertion becomes `col_is_null('public', 'plan_checkins', 'completed_prev', …)`, and `period_index` stays `col_not_null`. A new assertion pins the check definition: `pg_get_constraintdef` of `plan_checkins_period_index_check` is `CHECK ((period_index >= 0))`. In `009_plan_checkins.test.sql`, the case "period_index 0 gives 23514" becomes "period_index -1 gives 23514", with the same row otherwise. D-0070 §6 requires both edits. They encode the new rule and aren't weakened: AC-2 still rejects every value the new check forbids. Every `plan(n)` count matches its assertions.
- **AC-4 (data-model doc matches, Vitest)** The `packages/shared` AC15 test (it parses `docs/data-model.md` against `database.gen.ts`) passes with `completed_prev` documented as null = yes and typed `number | null` on `Row`. `expectTypeOf<Tables<"plan_checkins">["completed_prev"]>()` is `number | null`. `TablesInsert<"plan_checkins">["completed_prev"]` accepts `null` and may be omitted. `period_index` stays `number` (not null).
- **AC-5 (OpenAPI, Vitest)**
  - Valid `PlanCheckin`: `{id: "P0", periodIndex: 0, completedPrev: null, completedLast: 0, rhythmMinBefore: 3, rhythmMaxBefore: 4, proposedMin: 2, proposedMax: 3, proposedAt: "2026-10-04T07:00:00Z", answer: null, answeredAt: null}`.
  - Still valid: the existing `P1` example (`periodIndex 3, completedPrev 4`).
  - Invalid `PlanCheckin`: `periodIndex -1`, `completedPrev -1`, `completedPrev "0"`, and `completedPrev` missing (it stays required).
  - Valid `CheckinEvaluation` (R9-E8): `{periods: [{index: 0, start: "2026-09-20", end: "2026-10-03", completed: 0, status: "under"}], proposal: {direction: "down", rhythmMin: 2, rhythmMax: 3, previewTargets: <the 2–3 preview: chest/back/glutes/quads 14, shoulders/hamstrings 11, arms/core/calves 9>}, nextCheckinDate: "2026-10-18"}`.
  - Invalid `CheckinEvaluation`: a period with `index: -1`.
  - The two-period UF-11 AC1 evaluation in `schemas.test.ts` stays valid.
  - Every example in the file validates against its schema (the existing examples test).
- **AC-6 (generated types, Vitest)** The AC13 drift test passes: `openapi-typescript` on the new `api/openapi.yaml` is byte-identical to the committed `api.gen.ts`. `expectTypeOf<PlanCheckin["completedPrev"]>()` is `number | null`, and `PlanCheckin["periodIndex"]` is `number`.
- **AC-7 (mapper round trip, Vitest)** Given the row `{id: "20000000-0000-4000-8000-000000000002", user_id: A, period_index: 0, completed_prev: null, completed_last: 0, rhythm_min_before: 3, rhythm_max_before: 4, proposed_min: 2, proposed_max: 3, proposed_at: "2026-10-04T07:00:00+00:00", answer: null, answered_at: null}`, Then `toPlanCheckin(row)` has `periodIndex: 0` and `completedPrev: null` (not `0`, not `undefined`), and `isValid("PlanCheckin", …)` is true. The existing AC18 row (`period_index 3, completed_prev 4`) still maps to `completedPrev: 4`.
- **AC-8 (consumers still compile)** `pnpm -w typecheck lint test --force --concurrency=1` is green with the widened types. That covers `packages/engine` (`housekeeping.test.ts` builds a `PlanCheckin` with `completedPrev: 4`) and `apps/web` (`lib/offline` tests use `completed_prev: 3`), with no edits outside this ticket's paths. `node supabase/scripts/vendor.mjs --check` exits 0.
- **AC-9 (real stack, draft PR)** Given a draft PR from `t/T-0223-plan-checkins-one-period` to `main`, When CI runs on `pull_request`, Then the `supabase` job (`supabase db reset && supabase test db`, plus `vendor.mjs --check` and `gen-seed.mjs --check`) and `checks` (including `check-lane-paths`) conclude `success`. Every migration applies, and every pgTAP file passes. Put the run URL in the result notes. The ticket can't be accepted without it (the T-0102b precedent: Docker can't pull images on the orchestrator host).

## Paths you may change
- `docs/data-model.md`, `api/openapi.yaml`, `supabase/migrations/**` and `packages/shared/**` (the lane: `data`).
- **Listed extras:**
  - `supabase/tests/database/014_plan_checkins_one_period.test.sql`: new pgTAP file for AC-1 and AC-2 (a backend-lane path).
  - `supabase/tests/database/009_plan_checkins.test.sql`: the period-index case moves to -1 (AC-3, D-0070 §6). Leave the rest of the file as it is.
  - `supabase/tests/database/001_schema.test.sql`: the `completed_prev` nullability assertion and the new check-definition assertion (AC-3). Leave the rest of the file as it is.
  - `supabase/functions/_shared/vendor/**`: the regenerated output of `node supabase/scripts/vendor.mjs`, unedited by hand (D-0053 §1).
  - `docs/tickets/T-0223-plan-checkins-one-period.md`: this file, for the accept log.

## Contract impact
- `docs/data-model.md` and `api/openapi.yaml` change as **D-0070 §6** names: `period_index >= 0`, nullable `completed_prev`, `PlanCheckin.periodIndex` and `CheckinPeriod.index` minimum 0, nullable `PlanCheckin.completedPrev`, regenerated shared types. D-0094 §6 confirms it. The data lane owns both contracts, so the change and its decision ship together.
- `docs/engine-rules.md` and `tokens.json`: unchanged.
- **Cost (D-0012):** none. The work is local and CI only.

## Definition of done
Tests for every AC pass (Vitest locally, plus `supabase test db` on the draft PR) · `pnpm -w typecheck lint test --force --concurrency=1` green · `vendor.mjs --check` green · draft-PR `supabase` and `checks` jobs green, URL recorded (AC-9) · contracts changed only as D-0070 §6 names · commits start `T-0223` and cite UF-11.1 (for example `T-0223 UF-11.1: plan_checkins period_index >= 0, nullable completed_prev`).

## Notes
- **Flow:** `wl-build-data`. Don't run it in parallel with another ticket that edits `supabase/tests/database/001_schema.test.sql` or regenerates `supabase/functions/_shared/vendor/**`.
- If T-0215's merge left `vendor/engine` stale on `main`, the vendor regeneration here picks it up too. That is the same command and the same granted path, and the result notes should say so.
