# Security review: T-0543 automatic prod Supabase release (D-0201)

- Date: 2026-10-07. Reviewer: security-reviewer.
- Branch `t/T-0543-ci-automatic-db-release`, HEAD `59cc6f2`, diff `main...HEAD`. Tree was clean at the start.
- Context: the repo is public. The `release` job holds `SUPABASE_ACCESS_TOKEN` and `PROD_DB_URL` and writes to prod on every green push to main, with no approval click (D-0201).
- Tests run: `node --test` on the four changed test files passed 48/48, and `check-deploy-workflow.mjs` passed. I probed the guard with ad-hoc cases (results below).

## Verdict: approve-with-conditions

There are no high or critical findings. Fix M1 to M4 before `PROD_DEPLOY_ENABLED` and H-28 make the job live. M5 is strongly recommended. The low findings can become follow-ups.

## Findings (by severity)

### M1 (medium). The guard fails open on migration names its regex doesn't match
`pendingFromPlan` only picks up names that match `\d{14}_[A-Za-z0-9_]+\.sql`. The Supabase CLI accepts any `<digits>_<name>.sql`, so a file with a hyphen in its name (`20261007120000_add-thing.sql`) or a shorter version is pushed by `apply` but never scanned. I checked this with a plan listing `_add-thing.sql`, `2026100712_short.sql` and `_ok.sql`: the guard returned only `_ok.sql`. The release script's own count `n` uses the same regex, so nothing else catches it.

Fix:
- Compute "pending" independently: local `supabase/migrations/*.sql` minus the remote versions from `migration list`.
- Or fail closed when the dry-run section contains any `.sql` token the strict regex rejects.
- Add a repo check that enforces the naming convention.

### M2 (medium). Workflow-level concurrency can cancel a release mid-apply
`deploy.yml` sets `concurrency: deploy-${{ github.ref }}` with `cancel-in-progress: true` at the workflow level. For `workflow_run`, `github.ref` is always `refs/heads/main`, so a second green push cancels the running deploy run, including `release` during `db push` or `functions deploy`. The job-level `prod-release` / `cancel-in-progress: false` does not protect against the workflow-level cancel.

After a cancel, `production` is skipped, which is good. But prod is left with whichever migrations and functions had finished. I believe the CLI applies each migration file in its own transaction, but I couldn't verify that here.

Fix: `cancel-in-progress: ${{ github.event_name == 'push' }}` at the workflow level (previews keep cancelling, prod runs queue). Add a checker rule for it.

### M3 (medium). Prod personal data can reach the public workflow logs
Workflow logs on a public repo are world-readable. `mask` only redacts the DB password and host. When a migration or seed statement fails on prod data, Postgres prints `DETAIL` lines with row values, and the CLI echoes them:
- `Key (col)=(value) is duplicated.`
- `Failing row contains (...)`, which prints the full row.

This is health-adjacent data of EU users. CI's pgTAP runs on an empty database, so data-dependent failures are exactly the ones that reach prod.

Fix: in `mask` (both scripts), drop or redact `DETAIL:` lines, `Failing row contains`, and `Key (...)=(...)` values, and add a test.

### M4 (medium). The guard can be bypassed by `--` or `/*` inside a string literal
`stripComments` removes from any `--` to the end of the line, even inside a string. These returned no problems:
- `select '--'; drop table public.workouts;`
- `select '/*'; drop table x; select '*/';`
- `do $$ begin raise notice '--'; end $$; truncate public.sets;`

This is unlikely by accident but trivial to hit.

Fix: strip only whole-line `--` comments and block comments that start a line, or tokenise string literals properly. Add the three cases as red tests.

### M5 (medium, hardening). Repo-level secrets are reachable from any pushed branch's workflows
As repository secrets, `PROD_DB_URL` and `SUPABASE_ACCESS_TOKEN` are available to any workflow file in any branch pushed to this repo. That covers push events and same-repo PRs, though not forks. The static checker runs in CI but cannot stop a workflow added on a branch.

Fix: put both in a GitHub Environment (for example `production-db`) with a deployment-branch policy of `main` only and no required reviewers, which stays fully automatic per D-0201. Add `environment: production-db` to `release`. Checker rule: `release` must name that environment.

### L1 (low). The head SHA is not checked to be on main; re-runs can roll back
The `if` correctly excludes fork PRs (`event == 'push'`, same `head_repository`), and there is no `workflow_dispatch`. Two gaps remain:
- A writer could push a tag named `main` whose `ci.yml` triggers on tags. That gives a push-event CI run with head branch `main` and an arbitrary SHA.
- Re-running an old deploy run re-releases old functions and an old web build. `db push` would fail if newer migrations exist remotely.

Both need write access. Fix: in the release job, `git fetch origin main` and require `head_sha == origin/main`, or at least an ancestor of it. Also add `workflow_run.head_branch == 'main'` to the `if`.

### L2 (low). The DB URL with its password appears in process argv
`pg_dump --dbname="$PROD_DB_URL"` and `supabase ... --db-url "$PROD_DB_URL"` put the password in `/proc/*/cmdline`. On an ephemeral GitHub-hosted runner, only the job's own processes can see it.

Fix for `pg_dump`: parse the URL into `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` and `PGPASSWORD`, and call `pg_dump` without the URL. The CLI has no env alternative for `--db-url`, so accept that one. The access token is handled well: `curl -K -` reads the header from stdin.

### L3 (low). Supply chain in a job that holds prod secrets
- Actions are pinned by tag (`checkout@v4`, `setup-node@v4`, `upload-artifact@v4`). They are first-party, but pin them by SHA in this job.
- `npx -y supabase@2.118.0` is an exact pin with no lockfile integrity. Its install and postinstall run inside steps that hold both secrets. Prefer a devDependency in the lockfile, or install the CLI in a step that has no secrets.
- PGDG uses the runner's preinstalled `apt.postgresql.org.sh` and its signed keyring. The client floats within major 17, which is acceptable.
- age 1.2.1: I downloaded `age-v1.2.1-linux-amd64.tar.gz` independently from the GitHub release and its sha256 is `7df45a6c...79d50`, which matches the pin. Upstream publishes no checksum file; the GitHub API `digest` is null for the tarball. I did not verify the Sigsum `.proof` file (no tool here).

### L4 (low). The seed is applied but not scanned
`--include-seed` re-applies `supabase/seed.sql` when it changes, and the guard only scans migrations. Today the seed is an upsert-only exercise catalogue, and its "drop" hits are prose inside strings. A `DELETE`/`TRUNCATE` added to the seed would still go out unguarded.

Fix: scan the seed with the string-aware stripper from M4.

### L5 (low). Gaps in `check-deploy-workflow.mjs` rules
The existing rules work: they enforce release `if` equal to production `if`, `needs: release`, group and cancel settings, step order, retention 7, `CONFIRM_PROD_RELEASE` from vars, secrets only on the guard, backup, plan and apply steps, no secrets in job or workflow env, no inline supabase, and no literal ref.

They don't enforce:
- the workflow-level cancel (M2);
- an upload `path` limited to `*.age`;
- the release checkout `ref` being `workflow_run.head_sha`;
- a SHA or main-only check (L1);
- the environment (M5).

### Info
- **Partial apply.** If `db push` succeeds and a function deploy fails, the script exits non-zero (`pipefail` plus `set -e` through `sb`), and `production` is skipped. Prod is left on the new schema with old or mixed functions until the next green push re-runs. Migrations must stay expand/contract (backward compatible); worth stating in `infra/README.md`.
- **Backup.** Plaintext only flows through the `pg_dump | age` pipe, and `umask 077` is set. A failed dump removes the partial `.age`. The artifact path uploads only `backup-*.sql.age`, kept 7 days. On a public repo, any signed-in user can download the artifact: that is ciphertext only, and its size leaks the DB growth trend (acceptable). `pg_dump` stderr goes to a `mktemp` file in `/tmp` before masking; it holds no dump data.
- **Fail-closed paths.** A missing dry-run section blocks. A pending file missing locally blocks. A plan error stops the guard step (`pipefail` on `| tee`). The placeholder recipient blocks.
- **Allow header.** It needs a decision file whose front matter says `status: decided`. CRLF front matter fails closed. The header may sit anywhere, even inside a string, and isn't tied to the migration's subject. Acceptable, because the committer is trusted.
- **Guard scope.** Within D-0201's scope, case, `ALTER TABLE ... DROP`, multi-statement lines, files without a trailing newline, and `DROP` inside function bodies are all caught; nested comments only cause false positives. `UPDATE` without `WHERE`, `DISABLE ROW LEVEL SECURITY` and dynamic SQL (`'dr'||'op'`) are not caught. These are outside D-0201 §3, and RLS is covered by pgTAP.
