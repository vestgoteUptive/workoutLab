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

## Re-review (2026-10-07, commit 1592041)

Read-only check of the rework. `node --test` on the four changed test files passed 64/64, and `check-deploy-workflow.mjs` passed. I re-ran my probes against the new `scan()` guard.

### Verdict: approve-with-conditions (one new medium, N1)

M1 to M5 are fixed. N1 is a regression introduced by the M4 fix and must be fixed before the job goes live. N2 to N4 are low and non-blocking.

### Status of the original findings
- **M1, fixed.** The plan regex is now loose, and both plan names and on-disk files must match `^\d{14}_[A-Za-z0-9_]+\.sql$`. `_add-thing.sql`, `2026100712_short.sql` and `_ünïcode.sql` are all refused. A name with a space is cut short by the plan regex, but the on-disk check still refuses it, because the CLI can only push files that exist locally. Residual (low, unchanged): if the pinned CLI ever lists only bare versions in the dry run, nothing is detected. The CLI pin makes that unlikely.
- **M2, fixed.** `cancel-in-progress: ${{ github.event_name == 'push' }}` is a valid workflow-level expression. For `workflow_run` it evaluates to false, so a running release is never cancelled. GitHub still replaces an older *pending* run with a newer one, which is fine: the newer run supersedes it, and the tip check would fail the older one anyway. The checker enforces the setting.
- **M3, fixed for the cases I found.** `redact_rows` (both scripts, applied before secret masking) redacts `DETAIL:` lines (indented too), `Failing row contains ...` anywhere on a line, and `Key (..)=(..)` lines. Residual (low, N3): values embedded in the main message line are not redacted, for example `invalid input syntax for type integer: "<value>"` from an `ALTER ... TYPE ... USING`, or a `RAISE EXCEPTION '%', row`. The match is also case-sensitive (`DETAIL`).
- **M4, fixed.** All three original bypasses are now red (`'--'`, `'/*'`, `'--'` inside `$$`). Also red: an `E'\''` escape, a `"a""--"` identifier, a `$fn$` body, an unterminated `$a$`, `a$b`, nested block comments, and a header inside a string. The header is now only accepted from real `--` comments. **But see N1.**
- **M5, fixed in code.** The release job declares `environment: production`, the checker enforces it, and the README documents a main-only branch policy with no reviewers. That GitHub setting is applied by the owner. The secrets must be created only as environment secrets, and any repo-level copies deleted, or M5 has no effect. Add this to H-28 or the go-live checklist.
- **L1, mostly fixed. Acceptable, but see N2.** `head_branch == 'main'` is in both `if`s, and the tip-of-main step runs before the guard and before any secret. A run whose `head_sha` is no longer main's tip goes red, and the newer run releases. That is acceptable and the safer choice: nothing but the current tip ever reaches prod, and re-runs of old SHAs can't roll back. One consequence to note: if the newer commit's CI is red, no release happens at all until main is green again. That is conservative and correct. The red run is noise only, and the error message explains why.
- **L2, fixed.** `pg_dump` takes `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` and `PGDATABASE` from the environment. Nothing is echoed (plain assignments and exports, no `set -x`). URL decoding works (`p%40ss%25w0rd` becomes `p@ss%w0rd`). See N4 for the remaining details.
- **L3, fixed.** The release actions are pinned by SHA, which the checker enforces. The CLI is prefetched by `npx` in a step without secrets, so its install and postinstall never see them.
- **L4, fixed.** The seed is scanned for DROP, TRUNCATE and DELETE FROM. The real seed passes.
- **L5, fixed.** The checker now has rules for the upload path (`*.sql.age`), the checkout `ref`, the environment, the head-branch check, the tip step before the guard, and SHA pins.

### New findings
- **N1 (medium). The guard now misses destructive dynamic SQL.** `scan()` blanks every single-quoted literal, so `do $$ begin execute 'drop table public.sets'; end $$;` and `execute format('truncate %I', t)` pass. The pre-rework guard caught them. `EXECUTE format('drop policy ... %I', ...)` is a common migration pattern. Fix: for migrations, keep string-literal contents in the scanned code. Use quote awareness only to find real comments (that keeps M4 fixed). Blank strings only for the seed, where prose like "drop your hips" lives. A `comment on ... is '... drop ...'` then needs the header, which fails safe. Add red tests for both cases.
- **N2 (low). The tip check can still be fooled by a tag named `main`.** `git fetch --depth=1 origin main` prefers `refs/tags/main` over `refs/heads/main`. I confirmed this locally: with both present, FETCH_HEAD was the tag. So the tag trick from L1 still passes the tip check. It needs write access. Fix: `git fetch --depth=1 origin refs/heads/main`, plus a checker rule for that exact refspec.
- **N3 (low). Values in main error messages are not redacted** (see M3 above). Consider redacting `invalid input syntax ...: "..."` and matching `DETAIL` case-insensitively.
- **N4 (low). Parsing in `prod-backup.sh`.**
  - The `?sslmode=require` query string is dropped, so libpq falls back to `sslmode=prefer`. Set `PGSSLMODE=require`, or `verify-full` with the Supabase CA.
  - `urldecode` uses `printf %b`, so a literal backslash sequence in the password is interpreted. That only causes an auth failure, so it fails closed.
  - Masking covers the URL-encoded password. Also mask, or `::add-mask::`, the decoded `PGPASSWORD`.

## Re-review 2 (2026-10-07, commit 465a695)

Read-only check of the fixes for N1 to N4. `node --test` on the four changed test files passed 68/68, and `check-deploy-workflow.mjs` passed.

### Verdict: approve

No blocker remains. The residuals below are low or informational and need no follow-up before go-live. One owner action remains from M5: create both secrets only in the `production` Environment (main-only branch policy) and delete any repo-level copies (H-28 or the go-live checklist).

### Checks
- **N1, fixed.** Migrations now scan the contents of string literals (`scan(sql, true)`), and the seed still blanks them. These are now red:
  - `execute 'drop table ...'`
  - `execute format('truncate %I', ...)`
  - the `pg_policies` loop with `format('DROP POLICY %I ...')`
  - `execute E'drop table x'`

  The M4 probes are still red (`'--'`, `'/*'`, `'--'` inside `$$`, `"a""--"`, a header inside a string), so comment detection stays quote-aware. The M1 probes are still refused (`_add-thing.sql`, `2026100712_short.sql`). A clean migration passes. The real seed passes. `comment on ... is 'do not drop'` is red, which fails safe because it just needs the header.
- **N2, fixed.** The tip step fetches `origin refs/heads/main`, which can't be shadowed by a tag. Planted fault: I put `origin main` back in a copy of `deploy.yml`, and the checker reported `T-0543 N2: release must check head_sha is the tip of main ...`.
- **N3, fixed.**
  - `ERROR: ... (SQLSTATE x)` becomes `ERROR: <redacted> (SQLSTATE x)`, including mid-line (`failed to push: ERROR: ...`). The sed `t` stops later rules from re-mangling that line.
  - A line that starts with `ERROR:` and has no SQLSTATE is fully redacted.
  - `invalid input syntax ...:` is redacted.
  - `DETAIL` is matched case-insensitively.
  - Failing-row and `Key (..)=(..)` are redacted as before.
- **N4, fixed.**
  - `PGSSLMODE=require` is exported, so TLS is enforced, though without certificate verification.
  - `mask_secrets` in `prod-backup.sh` masks both the URL-encoded and the decoded password, plus the host.
  - Nothing echoes `PGPASSWORD`.

### Residuals (low or info, non-blocking)
- An `ERROR:` in the middle of a line with no SQLSTATE is not redacted, for example `pg_dump: error: query failed: ERROR:  permission denied ...`. `pg_dump` errors carry no row data, and CLI errors carry a SQLSTATE, so this is low.
- `CONTEXT:` lines are not redacted. `COPY` context can quote a row, but migrations don't `COPY` prod data. Info.
- Redacting all ERROR text means the cause of a failed prod release has to be read from the SQLSTATE and the statement number. That is an accepted trade-off on a public repo.
- `PGSSLMODE=verify-full` with the Supabase CA would add server authentication. Info.
- Obfuscated dynamic SQL (`'dr' || 'op ...'`) still passes. That only matters for a malicious committer, who is outside the guard's threat model (D-0201 §3 targets mistakes). Info.
- The N2 checker regex `origin refs\/heads\/main\b` would also accept `refs/heads/main-foo`. Trivial. Info.

## T-0554: seed applied on every release (2026-10-08, ac80d1d plus a merge of main)

Read-only review. `node --test` on the release, backup and guard test files passed 47/47.

### Verdict: approve

### Checks
- **Secrets in argv.** None: `psql` gets no connection arguments and reads `PG*` from `pg-env.sh`. The CLI's `--db-url` stays the accepted L2 exception.
- **Secrets in logs.** `psql` stdout and stderr go through `mask`, which redacts rows and masks both the encoded and decoded password and the host. Nothing echoes `PGPASSWORD`.
- **TLS.** `PGSSLMODE=require` holds: `pg-env.sh` exports it before `psql` and `pg_dump` run.
- **Failure stops the deploys.** The seed runs as `if ! { psql ... | mask; }` under `pipefail`, then `exit 1`, so a seed failure means no function deploys. The job then fails, so the web deploy doesn't run.
- **Seed scope.** `--single-transaction` plus `ON_ERROR_STOP` makes the seed all-or-nothing. The seed's own `begin;` (line 5) and `commit;` (last line) wrap the whole file, so the effect is unchanged; psql only warns.
- **Refactor regressions: none.**
  - M3: `redact_rows` is unchanged in both scripts.
  - L2 and N4: the parsing is byte-identical to before, now shared, with `PGSSLMODE` kept. `prod-backup.sh` sources the shared file after `userinfo`, `hostport`, `db_pass` and `db_host` are set.

### Findings (low, non-blocking; one follow-up)
- **T1 (low). The seed guard is a deny-list and can be bypassed.** `checkSeed` blanks strings, including inside `$$` bodies, and only looks for DROP, TRUNCATE and DELETE FROM. The seed now runs as the pooler `postgres` role on every release, and these all pass:
  - `do $$ begin execute 'delete from public.sets'; end $$;`
  - `update public.sets set reps = 0;`
  - `alter ... type`
  - `alter ... rename`
  - an `insert ... on conflict do update` into a user table

  Today the seed is only upserts into `exercises`, `exercise_areas` and `exercise_variants`. Follow-up: switch `checkSeed` to an allow-list, where each statement must be `begin`, `commit`, or `INSERT INTO public.(exercises|exercise_areas|exercise_variants) ... ON CONFLICT`, and fail on anything else.
- **T2 (low). psql error lines are not redacted.** psql prints `psql:supabase/seed.sql:N: ERROR:  <message>` with no SQLSTATE. That line matches neither ERROR rule, so the message text stays in the public log. `DETAIL`, `Key (..)` and `invalid input syntax` values are still redacted. The seed only touches catalogue tables, so the risk is low. Fix: run `psql -X -v VERBOSITY=sqlstate`, which prints only the SQLSTATE and also skips any runner `.psqlrc`.
- **Info.** A human-run `apply` re-applies the seed without the guard step that CI runs first. The seed is in git and reviewed.

## T-0555: seed allow-list, psql redaction, GRANT/REVOKE (2026-10-08, 64d3aac plus a merge of main)

Read-only review. `node --test` on the guard, release and backup test files passed 50/50.

### Verdict: approve

### AC-2b (GRANT/REVOKE not destructive)
The T-0535 line `revoke truncate, references, trigger on ... from authenticated;` now passes. These all stay red:
- a REVOKE and a TRUNCATE on one line, with or without a space after the `;`
- `';grant'` inside a string followed by a real TRUNCATE
- `delete ... where note = ';grant'`
- a DO block holding a GRANT and a TRUNCATE, as statements or via `execute '...'`
- a `/* ; */` block comment before a DROP
- a GRANT followed by a RENAME

Two inputs pass, and neither is a mistake-level bypass:
- `revoke ... -- ;\ntruncate x;`: the comment hides the `;`, so Postgres sees one statement, `revoke ... truncate x`. That is a syntax error, so nothing runs.
- `execute replace(';revoke truncate t', ';revoke ', '')` executes a TRUNCATE. This is deliberate obfuscation, the same class as the `'dr'||'op'` info item, and outside the guard's threat model (D-0201 §3 guards against mistakes).

Hardening (info): split statements on the strings-blanked scan, and match the patterns on the strings-kept scan. A `;` inside a string could then no longer start a GRANT/REVOKE "statement".

### T1, seed allow-list: strict enough
The real seed passes. These are refused:
- an INSERT without ON CONFLICT
- an upsert into a user table
- a table with a name like `exercises_backup`
- a DO block
- UPDATE
- `set role`
- an INSERT ... SELECT
- a CTE containing a DELETE
- a psql meta-command at the start of a statement

A `;` inside a string is handled, because strings are blanked before splitting.

Residual (info, deliberate-only): a function call in VALUES (`values (public.wipe())`) and a psql meta-command placed after an upsert on the same line (`... do nothing \! cmd`) pass. Optional hardening: reject any backslash outside strings, and any `identifier(` call other than an allow-listed cast or `array`.

### T2, psql redaction: fixed
With `psql -X -v VERBOSITY=sqlstate`, a line like `psql:...: ERROR:  23505` is kept as-is (SQLSTATE only). Any other `psql:...: ERROR:` line, including one with extra text after the code, becomes `ERROR: <redacted>`. `-X` skips `.psqlrc`. Both scripts carry the same rules.
