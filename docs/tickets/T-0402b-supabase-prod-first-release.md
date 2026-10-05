---
id: T-0402b
title: "First prod Supabase release as a human-run script: migrations + exercise library seed + the four Edge Functions, with a read-only plan mode first (gate 3 for the Supabase surface, H-19; D-0186 §1–2)"
lane: infra
screens: []
decisions: [D-0006, D-0011, D-0053, D-0135, D-0184, D-0185, D-0186]
deps: [T-0400]
status: ready
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main c378ddf (D-0186 §1: T-0402 split into
a/b/c/d). Build flow: wl-build-infra. About ½ day of agent work across run A (write the script,
stop) and the verify step after the human's run. The human runs both the plan and the apply,
since prod writes are blocked for agents. Raise H-19 at run A's handback. -->

## Why
Previews point at the prod Supabase project (D-0184 §5), but prod has never had a migration
pushed. It has auth and nothing else: no `public` tables, no exercise library, no Edge
Functions. A preview, and later the real app, can't show a plan until the schema, the library
(`supabase/seed.sql`) and the four functions (`workouts`, `balance`, `sessions`, `account`) are
in prod. T-0402c's RLS proof also needs prod's real policies to exist before it can compare them.

This is the first production deploy of the **Supabase surface**, so it's gate 3. It also can't be
an agent command: the session's permission mode blocks prod writes for agents. So the builder
writes a script with a read-only **plan** mode, a human runs the plan and reads it, then runs
**apply**, and an agent verifies read-only afterwards (D-0186 §2). The prod-guard test
(`supabase/tests/scripts/prod-guard.test.mjs`) stays as it is. Nothing under `supabase/` or in
`ci.yml` learns how to deploy to prod.

## Scope
- **In:**
  - `infra/scripts/supabase-prod-release.sh` (`bash`, `set -euo pipefail`):
    - **Inputs from the environment only:** `SUPABASE_ACCESS_TOKEN` (`.env.local`) and
      `PROD_DB_URL`, the session-pooler connection string with the DB password. The human
      exports it in their own shell, and the script never prints it. The prod ref is a constant
      in the script (`infra/` is outside the prod-guard scan). It is cross-checked against
      `infra/terraform/supabase-prod/main.tf`'s import ID, and the script aborts if they differ.
    - **`plan`** (the default when no argument is given) is read-only:
      - `supabase migration list --db-url "$PROD_DB_URL"`, local versus remote;
      - `supabase db push --db-url "$PROD_DB_URL" --include-seed --dry-run`, which lists what
        would be applied;
      - the function list from `GET /v1/projects/<ref>/functions`, names and status only;
      - a one-line summary of the form `would apply N migrations + seed; would deploy:
        workouts balance sessions account`.
    - **`apply`** runs only with the literal argument `apply` **and** the environment variable
      `CONFIRM_PROD_RELEASE=<prod ref>`:
      - `supabase db push --db-url "$PROD_DB_URL" --include-seed`;
      - then `supabase functions deploy <name> --project-ref <ref>` for each of the four
        functions. Each one's `verify_jwt` comes from `supabase/config.toml` (all `false`,
        D-0053 §4), not from a flag in the script;
      - then it runs `plan` again, which must report nothing pending.
    - **Pinned CLI:** `npx -y supabase@2.118.0`, the version CI uses.
    - **Masking:** any output line containing the DB URL's host or password is masked before it
      is printed. In practice, pass every CLI's output through a `sed` that replaces
      `$PROD_DB_URL`'s password with `***`.
  - `.github/scripts/supabase-prod-release.test.mjs`, node:test, static. It runs the script with
    a stub `supabase`/`npx` on `PATH` that records its arguments.
  - `infra/deploy/supabase-release.md`:
    - what the human runs, step by step;
    - where `PROD_DB_URL` comes from (Dashboard → Connect → Session pooler). If the password
      isn't known, resetting the DB password in the dashboard is safe here, because nothing
      else uses it yet (Terraform ignores it, T-0400);
    - the H-14 check.
- **Out:**
  - Any CI job that deploys to Supabase prod (D-0186 §1).
  - Any change under `supabase/`: migrations, functions, `config.toml`, the prod-guard test.
  - Auth settings. Function secrets beyond what the platform provides (`SUPABASE_URL`,
    `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform, H-14).
  - The Pro upgrade (T-0402d, gate 2).
  - The RLS proof and the allow-list (T-0402c).

### Edge cases that are in scope
- **Prod already has objects in `public`, or a migration history that doesn't match local.** The
  `plan` output shows it. The human stops, and the builder returns `needs-triage` with the
  filtered plan output. Never `db reset`, `--force` or `repair` on prod (gate 5).
- **`apply` fails halfway**, for example the migrations went in and one function failed. Rerun
  `apply`: `db push` skips the migrations that are already applied, `seed.sql` is idempotent (CI
  AC7), and `functions deploy` is repeatable. Log what happened. Never roll back by hand.
- **The account function and the service-role key (H-14, D-0135).** After the deploy, `supabase
  secrets list --project-ref <ref>` is read-only and shows names and digests, not values. It must
  list `SUPABASE_SERVICE_ROLE_KEY`. If the project uses the new secret API keys and the name is
  missing, follow H-14's instruction. It's the human's step, and the account function stays
  undeployable until then.
- **The human runs `apply` without `CONFIRM_PROD_RELEASE`.** The script exits 1 before any CLI
  call, with a message naming the variable.
- **A Supabase CLI flag has changed name in 2.118.0** (for example `--include-seed`). Find out
  with `supabase db push --help` (read-only), adapt the script, and record it.

## Acceptance criteria
`[static]` checks run in `-w test:repo-checks`. Node:test titles start with `T-0402b AC-n`.

- **AC-1 [static] Plan is the default and is read-only.**
  - **Given** the stub CLI, **when** the script runs with no argument, **then** the recorded
    calls are exactly `migration list …` and `db push … --dry-run`, plus a read-only `curl -X
    GET` (or no `-X`) to `/functions`.
  - **And** no recorded call is a `db push` without `--dry-run`, or a `functions deploy`.
- **AC-2 [static] Apply needs both locks.**
  - **Given** `apply` without `CONFIRM_PROD_RELEASE`, **then** exit 1 and zero CLI calls.
  - **Given** `CONFIRM_PROD_RELEASE=wrong`, **then** exit 1 and zero CLI calls.
  - **Given** both locks correct, **then** the calls are `db push --include-seed` (no
    `--dry-run`), then the four `functions deploy` calls in the order `workouts`, `balance`,
    `sessions`, `account`, then the plan calls again.
  - Planted fault, recorded: remove the `CONFIRM_PROD_RELEASE` check in a copy, and AC-2 goes
    red.
- **AC-3 [static] Nothing leaks.**
  - **Given** `PROD_DB_URL=postgresql://postgres.x:SENTINEL-PW@host:5432/postgres` and a stub
    that echoes its arguments, **then** `SENTINEL-PW` appears in neither stdout nor stderr.
  - **And** the script source contains no `--password`, `db reset`, `--force` or `repair`.
- **AC-4 [static] The ref is consistent.** The script's prod-ref constant equals the import ID in
  `infra/terraform/supabase-prod/main.tf`. The test reads both.
- **AC-5 [live, human-run, plan]** The human runs `bash infra/scripts/supabase-prod-release.sh`
  (plan) and pastes its masked output into the log. It's the H-19 review material.
  - Expected: remote migration history empty, 4 migrations would apply plus the seed, and no
    functions deployed.
  - Anything else is the first edge case.
- **AC-6 [live, after the human's apply, read-only verify by an agent]:**
  - **Given** `GET /v1/projects/<ref>/functions`, **then** exactly `workouts`, `balance`,
    `sessions` and `account` are listed with status `ACTIVE`, and `verify_jwt` is false.
  - **And** `GET <VITE_SUPABASE_URL>/rest/v1/exercises?select=id` with only the anon key
    returns 78 rows, and `/rest/v1/areas?select=id` returns 9. Those are the seed counts in
    `supabase/seed.sql` and the body areas.
  - **And** `GET /rest/v1/sessions?select=id` with only the anon key returns `[]`. Anon sees
    no owned rows. The full check is in T-0402c.
  - **And** the human's plan run after apply shows nothing pending (pasted).
  - **And** `supabase secrets list` shows `SUPABASE_SERVICE_ROLE_KEY` by name (H-14).
- **AC-7 [live] No cost.** `GET /v1/organizations/<org>` shows plan `free`.
  `docs/infra-costs.md` needs no change. State that in the log.

## Paths you may change
- `infra/scripts/supabase-prod-release.sh`, `infra/deploy/supabase-release.md` (new).
- `.github/scripts/supabase-prod-release.test.mjs`, `.github/scripts/fixtures/supabase-release/**`
  (new).
- **Listed extras:**
  - `docs/tickets/T-0402b-supabase-prod-first-release.md`, for the build and accept logs.

## Contract impact
None. The schema is deployed as it is in `supabase/migrations/**`, and no contract changes. No
recurring cost: prod stays on Free (Edge Functions and the database are within the free quota).

## Definition of done
- **Gate (D-0184 spirit, D-0186 §2):**
  - **Run A:** the builder writes the script, tests and doc, commits, and hands back `blocked`
    with `notes: "release script ready; H-19: human runs plan, reviews, runs apply"`.
  - The builder never runs the script against prod. The human runs `plan`, then `apply` (H-19).
  - **Verify run:** an agent runs AC-6/AC-7 read-only and records them.
- Every `[static]` AC has a passing node:test, and the planted fault is recorded.
- `node --test .github/scripts/supabase-prod-release.test.mjs` passes while you work. Before
  handing back, `npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check` and
  `node .github/scripts/check-all.mjs` pass.
- Nothing under `apps/`, `packages/` or `supabase/` changes, so the `-w typecheck lint test` gate
  and e2e aren't needed (D-0178).
- Commits start `T-0402b`.

## Notes
- **H-19 (the orchestrator raises it at run A's handback):** "Approve the first production deploy
  of the Supabase surface (gate 3): schema, exercise library and four Edge Functions to the prod
  project."
  - Steps: export `PROD_DB_URL`, run `plan`, read it, then `CONFIRM_PROD_RELEASE=<ref> bash
    infra/scripts/supabase-prod-release.sh apply`.
  - This also covers H-14's check and D-0135's approval.
  - It doesn't cover H-06: the app and landing prod deploys, and the Pro upgrade, wait for
    T-0402d.
- **Parallel:** shares no file with T-0402a, T-0500, T-0501 or T-0405.
- **Unblocks:** T-0402c.

## Build / accept log

### Run A (builder, 2026-10-05)
- Wrote `infra/scripts/supabase-prod-release.sh` (plan default, `apply` needs `CONFIRM_PROD_RELEASE=<ref>`, CLI pinned 2.118.0, password and host masked via sed), `infra/deploy/supabase-release.md`, `.github/scripts/supabase-prod-release.test.mjs`.
- AC-1..AC-4 [static]: node:test titles `T-0402b AC-1..4`, all pass. AC-2 planted fault (copy of script with the confirm check removed) is detected: the copy makes CLI calls where the real script makes zero.
- Plan mode NOT run: `PROD_DB_URL` (DB password) isn't available to the agent; the human supplies it. No write call, no prod call of any kind was made. AC-5 (plan output) is the human's, to be pasted here.
- AC-6, AC-7: pending the human's apply (H-19) and a read-only verify run. No cost change (Free plan), `docs/infra-costs.md` unchanged.
- Gate: `-w test:repo-checks` 198/198, `-w format:check`, `check-all.mjs` green. Nothing under apps/, packages/, supabase/ touched.

### Run B (2026-10-05, human-approved H-19) - done
- **Plan (human, read-only):** 4 migrations pending (`20260927210000_data_model_v1a`, `20260928090000_data_model_v1b`, `20260928120000_priority_areas_lower_bound`, `20261001090000_plan_checkins_one_period`), seed `supabase/seed.sql`, remote history empty, functions `(none)`. Orchestrator checked `seed.sql` beforehand: only `exercises` (78), `exercise_areas` (137), `exercise_variants` (162); no user/auth rows.
- **Apply (human):** all 4 migrations applied, seed applied, `workouts`/`balance`/`sessions`/`account` deployed. Plan after apply: remote history equals local, "Remote database is up to date", all 4 functions `ACTIVE`, `apply complete; nothing pending`. The `rootless netns: kill network process: permission denied` lines are local podman cleanup noise after bundling; each deploy succeeded.
- **Read-only verification (orchestrator):** REST counts with the anon key: exercises 78, exercise_areas 137, exercise_variants 162 (= seed). `profiles`, `sessions`, `session_sets`, `routines`, `plan_checkins`, `area_targets`: anon read → 401. Function secrets present (names only): `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`, `SUPABASE_JWKS`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS` → **H-14 satisfied**. All four functions have `verify_jwt = false` by design and enforce auth in code: `POST /workouts/suggest`, `GET /balance`, `POST /sessions/{id}/finish`, `DELETE /account` (no token and a garbage token) all → 401. Auth drift check: matches expected (6 keys), exit 0.
- Status: done.
