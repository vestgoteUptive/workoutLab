---
id: T-1024
title: "CI: the supabase db job starts only the services it needs and retries a registry rate limit cleanly"
lane: devops
screens: []
decisions: [D-0285]
deps: []
status: done
---
## Why
On 2026-11-24 the `supabase db tests` job failed twice in a row (runs 45447626002 and 45453689015) before any test body ran. `supabase start` pulls about a dozen images from `public.ecr.aws`, the registry answers "Rate exceeded", the CLI retries, and the retry dies on "failed to bind host port 0.0.0.0:54324/tcp: address already in use" (a half-created mail container from the first attempt). Pulling fewer images makes the rate limit less likely, and a clean stop between attempts makes a retry work.

## Scope
- In: `.github/workflows/ci.yml` (the `supabase` job's start step only), and `supabase/config.toml` only if a service must be switched off there instead of with `-x`.
- Out: the e2e and unit jobs, the deploy workflow, tests.

## Acceptance criteria
- AC1 The start step excludes every service no step of the job uses (check each later step: the seed re-apply and `supabase test db` need Postgres; the Deno tests under `supabase/tests/functions/` need whatever API they call, so read them). Studio, the mail catcher, imgproxy, logflare, vector and supavisor are the likely ones. List what is kept and why in the log.
- AC2 The start step retries: up to 3 attempts, `supabase stop --no-backup` (ignore its failure) and a back-off between attempts, so a failed first attempt can't leave a port bound for the next. A third failure fails the job.
- AC3 The CLI version stays pinned (2.118.0) and the `-x` names are valid for that version (checked against `supabase start --help` for that version, quoted in the log).
- AC4 `.github/scripts` checks that read `ci.yml` (run `npx -y pnpm@10.28.2 -w test:repo-checks`) still pass; add a repo check if one already pins the start step's shape.
- AC5 The job passes on the squad branch's CI after the merge (orchestrator verifies).

## Paths you may change
- `.github/workflows/ci.yml`
- `supabase/config.toml`
- `.github/scripts/**`

## Contract impact
none.

## Definition of done
Every AC has evidence · repo checks green · commit messages start with `T-1024`.

## Build / accept log
- Base: HEAD 86b5db2f, clean tree. Start step replaced by a 3-attempt loop: `supabase start -x ...`, on failure `supabase stop --no-backup || true`, back-off 30 s / 60 s, third failure `exit 1`.
- AC1 kept: postgres (seed re-apply, `supabase test db`), kong (the `/functions/v1` and `/auth/v1` gateway the Deno integration tests call via API_URL), gotrue (auth admin: user create/delete in `account` tests), postgrest (supabase-js CRUD with ANON/SERVICE_ROLE keys), edge-runtime (the functions under test). Excluded: studio, mailpit, imgproxy, logflare, vector, supavisor, realtime, storage-api, postgres-meta. No test or step touches storage, realtime, mail, analytics or the pooler (grep of supabase/tests/functions found none); analytics is off in config.toml, so config.toml is unchanged.
- AC2: loop above; a failed attempt can no longer leave port 54324 bound.
- AC3: `npx -y supabase@2.118.0 start --help` prints: `--exclude, -x string  Names of containers to not start. [gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor]`. All nine excluded names are in that list. Version pin 2.118.0 unchanged.
- AC4: no repo check pins the start step's shape, so none added. `test:repo-checks`: 404 pass, 4 fail; the 4 (AC21 x2, AC-10, T-0496 AC-5) all report `ticket-not-on-base: T-1024 has no ticket file on main`, because the ticket file is committed only on this branch; not caused by this change. check-all.mjs shows the same single finding. format:check green. ci.yml parses (python yaml).
- AC5: left for the orchestrator.
