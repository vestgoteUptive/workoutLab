---
id: T-0514b
title: "Manual-deploy runbook: fold the human's go-live script in as infra/scripts/deploy-prod.sh (repo-relative, URL from expected-auth.json, publishable key from env and checked), replace its Python secret scan with a tested Node bundle scan (sb_secret_, service_role JWT, foreign Supabase origin, .mjs leak per F-7), and document it in infra/deploy/README.md (go-live review F-4/F-7; split from T-0514, D-0190 §5)"
lane: infra
screens: []
decisions: [D-0190, D-0186, D-0189, D-0184]
deps: [T-0508]
status: todo
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner against main fa4171e (D-0190 §5). Build flow:
wl-build-infra. About ⅓ day. Waits for T-0508 (infra/deploy/README.md, and the eslint node
globals the new .mjs needs). Agents never run the deploy itself (D-0186); every test stubs
npx/wrangler/git. -->

## Why
GitHub Actions runners are unavailable, so production is deployed by hand (D-0189). The go-live
review asked for a runbook and a build that refuses a secret key (F-4), and for a note that the
landing must be built in-root (F-7). `infra/deploy/README.md` still says only CI deploys.

The human's actual go-live script lives outside the repo at
`../workoutLab-worktrees/deploy-prod.sh`. It:
- checks that the tree is clean, on `main`, and equal to `origin/main`;
- builds tokens, web and landing;
- runs an inline **Python** scan for a real `sb_secret_` key body or a service_role JWT;
- uploads with `wrangler@4.147.0 pages deploy … --branch main` only when given `deploy`.

It also hard-codes the absolute repo path and the publishable key. This ticket brings it into the
repo in a form that can be tested. T-0514a adds the build-time guard. This scan is the second
line of defence: it checks the actual output.

## Scope
- **In:**
  - **`infra/scripts/deploy-prod.sh`**, based on the human's script, with these changes:
    - The repo root comes from the script's own location, not an absolute path.
    - `VITE_SUPABASE_URL` is `https://<project_ref>.supabase.co`, with `project_ref` read from
      `infra/auth/expected-auth.json`.
    - `VITE_SUPABASE_ANON_KEY` comes from `PROD_SUPABASE_PUBLISHABLE_KEY` (environment or the
      repo-root `.env.local`). The script stops before building when that variable is unset or
      doesn't start with `sb_publishable_`.
    - Both `VITE_` values are exported only for the build commands.
    - `PUBLIC_APP_URL` is unset.
    - The scan step calls `node infra/scripts/bundle-secret-scan.mjs apps/web/dist apps/landing/dist`.
      It is no longer Python.
    - Kept as they are: build-only by default, upload only with the `deploy` argument, the same
      pinned wrangler version, `--branch main` and `--commit-hash`.
    - After an upload, it prints the security headers of both hosts with `curl -sI` (read-only)
      and prints `DEPLOY_COMPLETE`.
  - **`infra/scripts/bundle-secret-scan.mjs`.** Export `scan(dirs, { supabaseOrigin })`, which
    returns findings. The CLI exits 1 and prints the finding *kind* and file path for each
    finding, never the matched text. The findings are:
    - `sb_secret_` followed by ≥ 20 key characters. supabase-js's bare `"sb_secret_"`
      prefix-check string isn't a finding.
    - a JWT whose payload decodes to `role: "service_role"`;
    - any `https://<20-char ref>.supabase.co` origin other than `supabaseOrigin`;
    - any `.mjs` file in a scanned dir (F-7: an out-of-root astro build leaks
      `manifest_*.mjs`).
  - **`infra/deploy/README.md`**: a new `## Manual production deploy (runners down, D-0189)`
    section covering:
    - prerequisites (`.env.local` holds `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and
      `PROD_SUPABASE_PUBLISHABLE_KEY`);
    - the two commands, `bash infra/scripts/deploy-prod.sh` and then `… deploy`;
    - what the scan checks;
    - that the landing is always built in-root to `apps/landing/dist` (F-7);
    - the post-deploy header check;
    - rollback (Cloudflare dashboard → Pages project → Deployments → "Rollback to this
      deployment");
    - that `.github/workflows/deploy.yml` is the path again once runners return.

    Change the opening line "Agents never run wrangler" to keep that rule and add "the human
    runs the manual deploy".
- **Out:**
  - Running the script against the real account (H-24 is the human's).
  - Changing `deploy.yml`.
  - The web build guard (T-0514a).

## Acceptance criteria
Every test title starts with `T-0514b AC-n`. These are `node --test` tests in `.github/scripts/`
(`bundle-secret-scan.test.mjs`, `deploy-prod.test.mjs`). For the script, use
`supabase-prod-release.test.mjs`'s pattern: stub `npx`, `git`, `curl` and `python3` on `PATH`,
log their calls, and point `HOME` at a temp dir.

- **AC-1 (scan finds the four kinds, red on main)** In temp dirs:
  - a `.js` containing `"sb_secret_" + "k".repeat(24)` → one `sb-secret-key` finding;
  - a `.js` with a JWT whose payload is `{"role":"service_role"}` → one `service-role-jwt`;
  - a `.js` with `https://abcdefghijklmnopqrst.supabase.co` while `supabaseOrigin` is
    `https://csgjsdwuxqtuqpuazzpz.supabase.co` → one `foreign-supabase-origin`;
  - a `manifest_x.mjs` → one `mjs-file`.

  The CLI output names each kind and path and contains neither `"k".repeat(8)` nor the JWT
  payload segment.

  **Red:** the module doesn't exist on main.
- **AC-2 (scan stays quiet on a clean bundle)** No finding for:
  - a `.js` containing `r.startsWith("sb_secret_")`;
  - an anon JWT;
  - `sb_publishable_xyz`;
  - the expected origin;
  - `http://localhost:54321` and `127.0.0.1`. These are supabase-js and react-router library
    constants, per the go-live review.

  CLI exit 0.
- **AC-3 (script stops before building without a good key)**
  - **Given** stubs, and `PROD_SUPABASE_PUBLISHABLE_KEY` unset → exit ≠ 0, the message names
    the variable, and no `npx … build` call is logged.
  - **Given** it set to `sb_secret_` + 24 chars → same result, and the value isn't in the
    output.
- **AC-4 (build-only by default; deploy only with the argument)**
  - **Given** stubs, a valid publishable key, and `git` stubbed as clean, `main` and equal to
    `origin/main`.
  - **When** run with no argument.
  - **Then**:
    - three build calls are logged (tokens, web, landing);
    - the scan ran;
    - no `wrangler` call is logged;
    - the output ends with the re-run hint;
    - the build env had `VITE_SUPABASE_URL=https://csgjsdwuxqtuqpuazzpz.supabase.co`. Have the
      stub log `$VITE_SUPABASE_URL`.

  With `deploy`, exactly two `wrangler@4.147.0 pages deploy` calls are logged:
  - `apps/web/dist --project-name workoutlab-web --branch main`;
  - `apps/landing/dist --project-name workoutlab-landing --branch main`.

  Then two `curl -sI` calls (app and landing hosts), then `DEPLOY_COMPLETE`.
- **AC-5 (git guards)** With `git` stubbed as dirty, or not on `main`, or `HEAD` ≠
  `origin/main`, the script exits ≠ 0 before any build call (three cases).
- **AC-6 (scan failure stops the upload)** With a stub build that writes an `sb_secret_` body into
  `apps/web/dist`, the script with `deploy` exits ≠ 0 and logs no `wrangler` call. Use a temp
  copy of the repo layout, or point the script's dist paths at a temp dir with an env override
  that exists only for tests and is documented in the script header.
- **AC-7 (README)** A test asserts that `infra/deploy/README.md` has the
  `## Manual production deploy` heading and mentions:
  - `infra/scripts/deploy-prod.sh`;
  - `bundle-secret-scan.mjs`;
  - `apps/landing/dist`;
  - `PROD_SUPABASE_PUBLISHABLE_KEY`;
  - `Rollback`.

  And that the README contains no `sb_publishable_` key value (the regex
  `sb_publishable_[A-Za-z0-9_-]{8,}`).
- **AC-8 (planted faults)** On backup copies, restored with `cp`:
  - drop the `.mjs` rule from the scan → AC-1 fails;
  - remove the scan call from the script → AC-6 fails.

  Record both.

## Paths you may change
- `infra/scripts/deploy-prod.sh` (new), `infra/scripts/bundle-secret-scan.mjs` (new),
  `infra/deploy/README.md`, `.github/scripts/bundle-secret-scan.test.mjs` (new),
  `.github/scripts/deploy-prod.test.mjs` (new), `.github/scripts/fixtures/deploy-prod/**` (new)
  (the lane: `infra`).
- **Listed extras:**
  - `docs/tickets/T-0514b-manual-deploy-runbook-and-script.md`, for the build and accept logs.

## Contract impact
None.

## Definition of done
- Tests for every AC pass, with the red run and the planted faults recorded.
- `npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check` and
  `node .github/scripts/check-all.mjs` are green through `scripts/locked.sh small`.
- T-0508's lint test covers the new `.mjs` and is green.
- Commits start `T-0514b`.
- The human can use the repo script for H-24 (or the next redeploy) in place of the worktrees
  copy. Say this in the handback so the orchestrator updates `.squad/needs-human.md`.

## Notes
- **Parallel:** after T-0508 (`infra/deploy/README.md`). Shares no file with T-0509, T-0507 or
  T-0513. T-0515 waits for this ticket (README).
- The publishable key is public by design, but it doesn't go into the repo. It stays in the
  human's `.env.local`.

## Build / accept log
Archived in `docs/tickets/log/T-0514b.md` (D-0157).
