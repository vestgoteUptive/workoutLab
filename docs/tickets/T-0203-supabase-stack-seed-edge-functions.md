---
id: T-0203
title: Supabase local stack, seed from data/exercises, Edge Functions suggest/balance/finish (split a/b/c)
lane: backend
screens: [UF-08.1, UF-08.2, UF-10.1, UF-10.2, UF-03.3]
decisions: [D-0001, D-0011, D-0022, D-0029, D-0034, D-0035, D-0037, D-0039, D-0044, D-0053]
deps: [T-0100a, T-0100b, T-0103b, T-0201a, T-0102b]
status: ready
---
## Why
The PWA needs a server-side view of the rolling 14-day balance, a time-boxed suggestion and a
finish summary (PRD, gap B2, D-0001). D-0037 fixes the contract: three paths, bearer JWT, one
ApiError envelope with `requestId`, and 422 `profile_missing` before the engine runs. UF-08.1/08.2
(session setup), UF-10.1/10.2 (Balance) and UF-03.3 (finish summary) are blocked on these paths.
The paths also need a seeded exercise library: D-0022 and D-0029 map the library 1:1 onto columns,
with the single `bodyweight` inversion from D-0044. The server has to run **the same deterministic
engine** as the device. D-0053 picks the Deno import strategy for that and pins down the D-0037
§9 finish semantics as "the latest `endedAt` wins".

## Split (about 2 days total → three parts of ≤ 1 day each)
The same precedent as T-0100 and T-0102 applies: ACs are tagged by part, the `T-0203` board row stays as the parent
(`split → T-0203a, T-0203b, T-0203c`), and it's marked `done` only when all three are done.
- **T-0203a — stack + seed** (≈ 0.5 day): seed generator and `seed.sql`, Google auth config, prod guard,
  CI wiring for the real stack. ACs tagged [a]. Deps: T-0100a, T-0100b, T-0103b.
- **T-0203b — function platform + suggest + balance** (≈ 1 day): vendored engine and shared
  package, import map, auth, envelope, requestId, CORS, validation, `POST /workouts/suggest`,
  `GET /balance`. ACs tagged [b]. Deps: T-0203a, T-0201a, T-0102b.
- **T-0203c — finish** (≈ 0.5 day): `POST /sessions/{id}/finish`, idempotent with the latest
  `endedAt` winning, and the summary. ACs tagged [c]. Deps: T-0203b.

## Scope
- In:
  - `supabase/scripts/gen-seed.mjs` → committed `supabase/seed.sql` (D-0053 §2). It fills
    `exercises` 1:1 onto the D-0029 and D-0035 columns, plus `exercise_areas` and
    `exercise_variants`, with `external_load = NOT bodyweight` written on every row (D-0044).
  - `supabase/config.toml`: Google enabled through `env()` (D-0011). `[functions.workouts]`,
    `[functions.balance]` and `[functions.sessions]` get `verify_jwt = false` (D-0053 §4).
  - `supabase/scripts/vendor.mjs` → committed `supabase/functions/_shared/vendor/{engine,shared}`,
    plus `supabase/functions/deno.json` as the import map (D-0053 §1).
  - Functions `workouts`, `balance` and `sessions` (D-0053 §3), which implement D-0037 §§1, 3, 4, 9
    and D-0053 §§4–9.
  - Tests. `node:test` for the scripts and config (no Docker). `deno test` unit tests for the
    handler cores with injected deps and a fixed clock (no Docker). `deno test` integration tests
    against `supabase functions serve`. pgTAP `supabase/tests/database/013_seed.test.sql`.
  - The CI `supabase` job steps listed under each part. The job already runs
    `pnpm install --frozen-lockfile` before `supabase start` (T-0007), and it must keep doing so.
  - Edge cases: zero history, returning after 10 days off (the 14-day window edge), time running
    out (`budgetMin` 1, running over budget at finish), offline replay of finish out of order,
    tombstoned and warm-up sets, a caller with no profile or with 8 targets, another user's session.
- Out:
  - Deploying to any hosted project. **Never** touch the prod project `csgjsdwuxqtuqpuazzpz`
    (D-0011): no `supabase link`, `db push` or `functions deploy`. Staging and Terraform belong to T-0400.
  - Check-in, swap, time-check or pre-fill endpoints (device-side, D-0037 §2).
  - Changes to `api/openapi.yaml`, `docs/data-model.md` or migrations. Wording follow-ups go to the data lane.
  - Client code (T-0300+). Library content changes (content lane).

## Where the real-stack tests run
Docker on the orchestrator host can't pull images. The agent runs, locally:
`node --test supabase/tests/scripts/`, `node supabase/scripts/gen-seed.mjs --check`,
`node supabase/scripts/vendor.mjs --check`, and, if `deno` is installed,
`deno test supabase/tests/functions/unit/`. Every AC marked **(CI)** is proven only by the GitHub
Actions `supabase` job on a **draft PR** that the orchestrator opens from the part's branch. The
agent never pushes. That PR's green run URL goes in the acceptance input. An AC marked (CI) with
no green run counts as not passing.

## Acceptance criteria
Unless an AC says otherwise: fixture user `A` has a `profiles` row (goal `build_muscle`, level
`intermediate`, equipment `[barbell, rack, bench, dumbbell]`, rhythm 3–4) and 9 `area_targets`;
`tz = "Europe/Stockholm"`; unit tests use `now = 2026-09-28T08:00:00Z`. "Envelope" means the body
is exactly `{error: {code, message, requestId}}`, `requestId` matches `^req_[0-9a-f-]{36}$`, and
the same value is in the `x-request-id` header.

### [a] Stack + seed
- **AC1 [a]** Given the committed `data/exercises/library`, When `node supabase/scripts/gen-seed.mjs`
  runs twice, Then both runs produce a byte-identical `supabase/seed.sql`, and `--check` exits 0 on the
  committed tree. When `--library <tmpdir>` points at a copy with one file's `name` changed, Then
  `--check` exits 1 and prints `supabase/seed.sql`. (node:test)
- **AC2 [a]** Given a 3-file fixture library (`fx-bw` with `bodyweight: true`, `fx-loaded` with
  `bodyweight: false, increment_kg: 1.25`, `fx-wu` with `kind: "warmup", bodyweight: true`), When the
  generator runs, Then the `exercises` column list contains `external_load` and `increment_kg`,
  and the literal values are `false`, `true`, `false` and `2.5`, `1.25`, `2.5` respectively. When
  a fixture file lacks `bodyweight`, Then the generator exits non-zero, naming the file and
  writing no output. It never falls back to the column default (D-0044 §3). (node:test)
- **AC3 [a]** Given a fixture exercise named `Farmer's "carry"` with an instruction containing `'`, `,`,
  `"`, `\` and `{}`, When the generator runs and the output is loaded with `psql` (CI), Then
  the `name` and `instructions` read back equal the JSON exactly. The node:test also asserts
  that `'` is emitted as `''`. **(CI for the round-trip)**
- **AC4 [a]** Given `supabase db reset` has run, When the Deno integration test reads every
  `data/exercises/library/*.json` directly (not through the generator), Then `count(exercises)` =
  the file count. For each file, `id, name, kind, type, level, equipment, instructions, mistakes` (absent →
  `{}`), `cue` (absent → null), `timed, source, license, attribution` (absent → null),
  `source_url` (absent → null), `increment_kg` (absent → 2.5) and `default_duration_s` (absent → null)
  equal the JSON. `exercise_areas` equals the `areas` map (the same keys, weights 1.0 or 0.5), and
  `exercise_variants` equals `variants`. **(CI)**
- **AC5 [a]** (D-0044 a, d) Given the same reset DB, Then for **every** file
  `external_load = !bodyweight`, and `count(external_load = false)` = the count of files with
  `bodyweight: true`, and both counts are ≥ 1. **(CI)**
- **AC6 [a]** (D-0044 b, c) pgTAP `013_seed.test.sql`: `push-up` and `plank` have
  `external_load = false`. `barbell-back-squat` has `external_load = true`. Every
  `kind = 'warmup'` row has `external_load = false`, and there are ≥ 2 such rows. Every `kind = 'exercise'` row
  has ≥ 1 `exercise_areas` row with weight 1.0. **(CI, `supabase test db`)**
- **AC7 [a]** Given a seeded DB, When `seed.sql` is applied a second time with `psql -f`, Then it exits 0 and
  the row counts of `exercises`, `exercise_areas` and `exercise_variants` are unchanged. **(CI)**
- **AC8 [a]** (D-0011) Given `supabase/config.toml`, Then `[auth.external.google]` has `enabled = true`,
  `client_id = "env(GOOGLE_OAUTH_CLIENT_ID)"` and `secret = "env(GOOGLE_OAUTH_CLIENT_SECRET)"`, and no file under
  `supabase/` matches `GOCSPX-` or `[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com`. (node:test)
  And `supabase start` succeeds in the CI `supabase` job with no Google secret configured. If the CLI
  requires the variables, the job's `env:` sets them to the non-secret literal `ci-placeholder`.
  **(CI)**
- **AC9 [a]** (prod guard) Given the repo, Then no file under `supabase/` and no step of the CI
  `supabase` job contains `csgjsdwuxqtuqpuazzpz`, `supabase link`, `db push` or `functions deploy`.
  (node:test over `supabase/**` and `.github/workflows/ci.yml`)
- **AC10 [a]** Given the CI `supabase` job, Then its steps run in this order: `pnpm install --frozen-lockfile`,
  `node supabase/scripts/gen-seed.mjs --check`, `supabase start`, `supabase test db`, then Deno setup and
  `deno test --allow-net --allow-env --allow-read supabase/tests/functions/`. The job reads local keys
  from `supabase status -o env` into the step env and prints no key. It's green on the part's draft
  PR. (node:test asserts the order; **CI** for green)

### [b] Function platform, suggest, balance
- **AC11 [b]** (D-0053 §1) Given the committed tree, When `node supabase/scripts/vendor.mjs --check`
  runs, Then it exits 0. When it runs with `--root <tmp copy>` where one line in
  `packages/engine/src/time.ts` is changed, Then it exits 1 and names the differing vendor file.
  The CI `supabase` job runs `vendor.mjs --check` after `pnpm install`. (node:test; **CI**)
- **AC12 [b]** Given `supabase/functions/*/**/*.ts` excluding `_shared/vendor/**`, Then no import specifier
  contains `packages/` or `_shared/vendor`, and no file reads `SUPABASE_SERVICE_ROLE_KEY`. Engine calls
  import from `@workoutlab/engine`, and row mapping uses `toHistorySet`, `toLibraryExercise`,
  `toAreaTargets` and `toEngineProfile` from `@workoutlab/shared`. `deno.json` maps both names to
  the vendor copy and pins `ajv` to the `pnpm-lock.yaml` version. (node:test)
- **AC13 [b]** (determinism, R0-E1) Given fixture rows: A's profile, 9 targets, 20 sets over the last
  12 days, and a 12-exercise library snapshot, When the suggest handler core runs twice with injected deps
  and the fixed `now`, and `sessionInput = {budgetMin: 30, warmupInBudget: true, energy: "normal",
  shuffle: 0, mainLiftId: null, pinnedIds: [], excludeIds: []}`, Then both bodies are deep-equal
  to each other and to the vendored `suggest(mapped history, mapped targets, profile, mapped library,
  sessionInput, now, tz)`. (Deno unit)
- **AC14 [b]** For each of the three functions: Given no `Authorization` header, or `Bearer garbage`, or
  an expired token, When called, Then the response is 401 with the envelope and `code: "unauthorized"`,
  never the gateway's own 401 body. **(CI)**
- **AC15 [b]** Given `OPTIONS /workouts/suggest` with `Origin: http://localhost:5173`, Then 204 with
  `Access-Control-Allow-Origin: http://localhost:5173` and allowed headers including `authorization`
  and `content-type`. With `Origin: https://evil.example`, Then no `Access-Control-Allow-Origin` header.
  (Deno unit)
- **AC16 [b]** Given `GET /workouts/suggest`, `POST /workouts/other` or `POST /balance`, Then 404
  with the envelope and `code: "not_found"`. (Deno unit)
- **AC17 [b]** Given A calls `POST /workouts/suggest` with, one at a time: `budgetMin` 0, 481 or
  30.5; `energy: "max"`; an extra key `foo`; a body that isn't JSON; a missing `tz`;
  `tz: "Mars/Base"`. Then each call gets 400 with the envelope, `code: "invalid_request"` and a message
  naming the field. `GET /balance` with no `tz` or with `tz=Mars/Base` gets 400 the same way. The unit spy
  shows the engine was never called. (Deno unit; one call per endpoint **CI**)
- **AC18 [b]** (D-0037 §4) Given user B with no `profiles` row, and user C with a profile but 8
  `area_targets`, When either calls `POST /workouts/suggest` or `GET /balance`, Then 422 with the envelope and
  `code: "profile_missing"`, and the engine spy has 0 calls (unit). **(CI + Deno unit)**
- **AC19 [b]** (zero history) Given A has no sessions, When A calls suggest with the AC13
  `sessionInput`, Then 200, the body validates against `Workout` in `api/openapi.yaml` (Ajv 2020-12),
  `plan.version = 1`, `plan.items.length ≥ 1`, `unusedS ≥ 0`, and every `days_since` reason has
  `days: null`. `GET /balance` returns 200 and validates against `BalanceResult`, with 9 areas, each at 0
  weighted sets and `coverageStep: 0`. **(CI)**
- **AC20 [b]** (time running out) Given A with the AC13 input but `budgetMin: 1`, Then 200, schema-valid,
  `unusedS ≥ 0` (`plan.items` may be empty). With `budgetMin: 480`, Then 200 and
  `plan.items.length ≤ 8`. **(CI)**
- **AC21 [b]** (returning after 10 days off) Given A's only hard sets are 3 × `barbell-bench-press` at
  `now − 10 d` and 5 × `barbell-row` at `now − 16 d`, When A calls `GET /balance?tz=Europe/Stockholm`, Then
  200 and schema-valid. The `chest` entry counts 3 weighted sets (the 10-day sets are inside the
  window), the `back` entry counts 0 (the 16-day sets are outside it), and `days` has 14 entries.
  Suggest with the AC13 input returns 200. **(CI)** (Unit twin with the fixed `now`: the same
  counts.)
- **AC22 [b]** (RLS) Given A's balance body `X`, When user D inserts 10 hard sets of their own, Then A's
  next balance deep-equals `X`, apart from any `now`-dependent field (both calls within the same minute,
  no set near a window edge). **(CI)**
- **AC23 [b]** (errors) Given the handler deps throw `new Error("db down: user@example.com")`, Then 500
  with the envelope, `code: "internal"` and `message: "Something went wrong"`, with no stack and no email.
  The single log line is JSON with `requestId`, `fn`, `status: 500` and `ms`, and contains neither the
  user id nor the email. Across the whole integration suite, no error `message` contains the caller's
  user id or email (NFR-PRIV-7). (Deno unit; **CI** sweep)

### [c] Finish
Fixture session `S` owned by A: `started_at = 2026-09-28T07:00:00Z`, `time_budget_min = 30`, with 3 live
hard sets (2 × `barbell-back-squat`, 1 × `push-up`), 1 warm-up set and 1 tombstoned hard set.
`30 × 60 + 120 = 1920 s`.
- **AC24 [c]** Given S, When A posts `{endedAt: "2026-09-28T07:31:00Z", effortRating: 4, tz}`, Then 200, and
  the body validates against `SessionSummary`: `durationS: 1860`, `timeBudgetMin: 30`,
  `withinBudget: true`, `hardSets: 3`, `exerciseCount: 2`, `weightedSetsByArea` with 9 keys (`quads ≥ 2`,
  `chest = 1`), and `balance` schema-valid. The row has `ended_at = 07:31:00Z` and `effort_rating = 4`.
  **(CI)**
- **AC25 [c]** (boundary) Given fresh copies of S, When finished at `07:32:00Z` (1920 s), Then
  `withinBudget: true`. At `07:32:01Z` (1921 s), Then 200 with `withinBudget: false`: running over is not an
  error. (Deno unit + **CI**)
- **AC26 [c]** (idempotent) Given the AC24 finish, When the identical request is repeated, Then 200 and the body
  deep-equals the first one. The row is unchanged. Unit twin: the handler core with `now` one day later
  returns a deep-equal body (the summary uses the stored `ended_at`, D-0053 §8). **(CI + Deno unit)**
- **AC27 [c]** (the latest wins, D-0053 §7) Given S finished at 07:31 with rating 4, When A finishes at
  `07:40:00Z`, Then `ended_at = 07:40`, `durationS: 2400` and `withinBudget: false`. When A then posts
  `07:31:00Z` with `effortRating: 2`, Then 200 with a body deep-equal to the 07:40 summary, and the row keeps
  `ended_at = 07:40` and `effort_rating = 4`. **(CI)**
- **AC28 [c]** (offline replay order) Given two fresh copies of S, When one receives finishes in the order
  [07:40, 07:31] and the other in the order [07:31, 07:40], Then both rows end with `ended_at = 07:40`
  and both last responses are deep-equal. (Deno unit + **CI**)
- **AC29 [c]** Given S finished at 07:31 with no rating, When A posts `07:31:00Z` with
  `effortRating: 5`, Then `effort_rating = 5` and `ended_at` is unchanged. **(CI)**
- **AC30 [c]** Given S, When A posts, one at a time: `endedAt: "2026-09-28T06:59:59Z"` (before
  start); path id `not-a-uuid`; `effortRating` 0, 6 or 3.5; `endedAt: "2026-09-28T07:31:00"` (no
  offset); `tz: "Mars/Base"`; an extra key. Then each gets 400 with the envelope and
  `code: "invalid_request"`, and the row is unchanged. **(CI)**
- **AC31 [c]** Given a random uuid, or user D's session, When A finishes it, Then 404 with the envelope and
  `code: "not_found"`, and D's row is unchanged. `GET /sessions/{id}/finish` also returns 404. **(CI)**
- **AC32 [c]** (zero sets) Given A's session with no sets, When it's finished, Then 200 with `hardSets: 0`,
  `exerciseCount: 0` and all 9 `weightedSetsByArea` values 0. **(CI)**
- **AC33 [c]** (no 422 on finish) Given user C (a profile with 8 targets), When C finishes their own
  session, Then 200, never 422, and the summary's `balance` uses `deriveTargets(profile)` with
  `source: "default"` (D-0053 §8). (Deno unit + **CI**)

## Paths you may change
Backend lane: `supabase/functions/**`, `supabase/seed.sql`, `supabase/tests/**`, `supabase/config.toml`.
Extras for this ticket: `supabase/scripts/**` (new: `gen-seed.mjs`, `vendor.mjs`,
`tsconfig.vendor.json`), and **only the `supabase` job** in `.github/workflows/ci.yml` (AC8, AC10, AC11). No
new npm dependency: the scripts use Node built-ins and the workspace TypeScript, and the Deno tests
use `npm:` specifiers. If a lockfile change turns out to be needed, raise it as an infra follow-up.

## Contract impact
none. `api/openapi.yaml`, `docs/data-model.md` and the migrations are read only. D-0053 interprets
D-0037 §9 without changing a schema. The follow-up for the data lane is to reword the `finishSession` description.

## Definition of done
Tests for every AC pass: node:test and Deno unit locally, and every **(CI)** AC green in the `supabase` job on the
orchestrator's draft PR, with the run URL in the result notes. `pnpm -w typecheck lint test` is green. `vendor.mjs --check` and
`gen-seed.mjs --check` are clean. Contracts are unchanged. Commit messages start with `T-0203a:` / `T-0203b:` /
`T-0203c:` and cite UF-08.1, UF-10.1 and UF-03.3 where relevant. Nothing is deployed and no hosted project is touched (D-0011).
