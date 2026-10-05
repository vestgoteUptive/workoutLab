---
id: T-0501
title: "Commit the Cloudflare zone-baseline computation as a read-only script with one exact line format and sort, so before/after hashes are comparable (T-0401 follow-up, D-0186 §5)"
lane: infra
screens: []
decisions: [D-0010, D-0184, D-0186]
deps: [T-0401]
status: ready
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main c378ddf (D-0186). Build flow: wl-build-infra.
About 2 hours. Read-only: the script only issues GET requests. Small tier (D-0178): no
review/QA unless the builder flags a deviation. -->

## Why
D-0184 §3 protects the shared `vestgote.com` zone with a count and a SHA-256 over every record
the squad doesn't own, taken before and after each apply. T-0401's run A never recorded the
exact line format and sort it used. So run B's hash (`92ab4340…`) couldn't be compared with run
A's (`0fd3771f…`), and the orchestrator had to fall back to `modified_on`. T-0404a is the next
apply on that zone, and it needs a baseline that is computed the same way every time.

## Scope
- **In:**
  - `infra/scripts/zone-baseline.mjs`, plain Node 22 with no dependencies. Its behaviour:
    - It reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` from the environment and fails
      with exit 2 naming the missing variable (never its value).
    - It sends `GET /client/v4/zones/<zone>/dns_records?per_page=100&page=N` for every page,
      using `result_info.total_pages`. It never sends any other method.
    - It **excludes** `workout.vestgote.com` and every name ending `.workout.vestgote.com`,
      which is the squad's subtree under gate 4 (D-0186 §5).
    - For each remaining record it builds one line: `id`, `type`, `name`, `content`, `proxied`
      (`true`/`false`), `ttl`, `priority` (empty when absent) and `modified_on`, joined by
      `\t`.
    - It sorts the lines with JavaScript's default `Array.prototype.sort()`, joins them as
      `line + "\n"` each, and hashes the UTF-8 bytes with SHA-256 (lowercase hex).
    - Output is exactly one line, `count=<n> sha256=<hex>`. Record names, contents and IDs are
      never printed.
    - `--expect count=<n> sha256=<hex>` compares the result. On a match it exits 0. On a
      mismatch it prints `zone baseline changed: count <a> -> <b>, sha256 differs` and exits 1.
    - The pure parts (`toLine`, `isOwned`, `baselineOf(records)`) are exported for tests, along
      with a `fetchAll(fetchImpl)` that takes an injected fetch.
  - `.github/scripts/zone-baseline.test.mjs` (node:test, run by `test:repo-checks`), with
    fixtures under `.github/scripts/fixtures/zone-baseline/`. Fixture records use made-up
    names under `example.test` plus owned names. Real zone names never go in the repo.
  - Update `infra/terraform/cloudflare/README.md`: run A and run B call the script instead of
    the prose recipe.
- **Out:**
  - Any write call, and any Terraform change.
  - Running the script in CI (D-0186 §4: the H-03 token stays local).
  - Recomputing T-0401's old hashes. They are retired (D-0186 §5).

### Edge cases that are in scope
- **Pagination.** The zone has 26 foreign records today. A fixture with 150 records over 2 pages
  must hash the same as the same 150 records in one page.
- **Ordering of the API response.** The hash doesn't depend on the order the API returns records
  in.
- **Name case.** Cloudflare returns lower-case names. Use `isOwned` on the lower-cased name, so
  `Send.Workout.Vestgote.com` counts as owned.
- **A name that merely contains the suffix**, e.g. `notworkout.vestgote.com`, is **not** owned
  (suffix match on `.workout.vestgote.com` or equality only).
- **An API error** (`success: false` or HTTP ≠ 200) exits 2 with the HTTP status and the error
  `code` values, never the body.

## Acceptance criteria
Each node:test title starts with `T-0501 AC-n`.

- **AC-1 [static] Stable format.**
  - **Given** the fixture `two-records.json`, **when** `baselineOf` runs, **then** it returns
    `count=2` and the SHA-256 written in the test, computed by hand from the two expected lines.
    Both expected lines are spelled out in the test.
  - **And** a record with `priority: 10` contributes `\t10\t` in that position, and one without
    priority contributes `\t\t`.
- **AC-2 [static] Order and pagination don't change the hash.**
  - **Given** the same 150 fixture records, shuffled, and split into 1 page and into 2 pages,
    **then** all three runs give an identical `count=150 sha256=…`.
- **AC-3 [static] Owned names are excluded.**
  - **Given** records named `workout.vestgote.com`, `app.workout.vestgote.com`,
    `resend._domainkey.workout.vestgote.com`, `Send.Workout.Vestgote.com`,
    `notworkout.vestgote.com` and `www.example.test`, **then** the count is 2, made up of
    `notworkout.vestgote.com` and `www.example.test`.
- **AC-4 [static] GET only, nothing leaks.**
  - **Given** an injected fetch that records every call, **when** the script runs over 2 pages,
    **then** every call's method is `GET`, and stdout is exactly one line matching
    `/^count=\d+ sha256=[0-9a-f]{64}$/`.
  - **And** no fixture record name or content appears in stdout or stderr.
  - **And** with `CLOUDFLARE_API_TOKEN` set to the sentinel `tok-SENTINEL-123`, the sentinel
    appears in neither stdout nor stderr, including on the API-error path.
- **AC-5 [static] Compare mode.**
  - **Given** `--expect` with the right value, **then** exit 0.
  - **Given** one changed `content` in a foreign record, **then** exit 1 and the message names
    the counts only.
  - **Given** one changed `content` in an owned record, **then** exit 0.
- **AC-6 [live, read-only] Two runs against the real zone agree.** Run with `.env.local` loaded,
  twice, a minute apart.
  - **Then** both print the same `count=<n> sha256=<hex>`, and `n` is 26. That is T-0401's
    foreign count; the owned CNAMEs are excluded either way.
  - Put both lines in the log as the new reference baseline (D-0186 §5).
  - If `n` ≠ 26, record it and say so. Don't treat it as a failure of this ticket: someone may
    have changed their own record since 2026-10-05.
- Planted fault, recorded in the log: drop the sort in a copy of `baselineOf`, and AC-2 goes red.

## Paths you may change
- `infra/scripts/zone-baseline.mjs` (new), `infra/terraform/cloudflare/README.md`.
- `.github/scripts/zone-baseline.test.mjs`, `.github/scripts/fixtures/zone-baseline/**` (new).
- **Listed extras:**
  - `docs/tickets/T-0501-zone-baseline-script.md`, for the build and accept logs.

## Contract impact
None. No cost.

## Definition of done
- Every `[static]` AC has a passing node:test, and the planted fault is recorded. AC-6's two
  output lines are in the log.
- `node --test .github/scripts/zone-baseline.test.mjs` passes while you work. Before handing back,
  `npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check` and
  `node .github/scripts/check-all.mjs` pass.
- Nothing under `apps/` or `packages/` changes, so the `-w typecheck lint test` gate and e2e
  aren't needed (D-0178). Say so in the log.
- Commits start `T-0501`.

## Notes
- **Environment:** `set -a; . <repo>/.env.local; set +a; node infra/scripts/zone-baseline.mjs`
  in one command line. Never echo the variables.
- **Parallel:** shares no file with T-0500, T-0405, T-0402a or T-0402b.
- **Unblocks:** T-0404a (its run A and run B take the baseline with this script).

## Build / accept log

### Build log (devops, 2026-10-05, base 6950954, tree clean)
- Added `infra/scripts/zone-baseline.mjs`, test + `two-records.json` fixture, README run A/B now call the script.
- AC->test: AC-1..AC-5 = `.github/scripts/zone-baseline.test.mjs` titles `T-0501 AC-n` (6/6 pass). AC-1 hash computed by hand with `sha256sum` over the two spelled-out lines.
- Planted fault: `.sort()` removed in a temp copy; the test `AC-2 planted fault` shows reversed input then gives a different hash (sort is what makes AC-2 pass).
- AC-6 live, read-only, 60 s apart, both identical (new reference baseline, D-0186 §5):
  `count=26 sha256=1196f0d86c86ddebbcf58460013c811d663e7fc470130a4e9e2b3b4a66839ae8`
  `count=26 sha256=1196f0d86c86ddebbcf58460013c811d663e7fc470130a4e9e2b3b4a66839ae8`
- No apps/ or packages/ change, so no `-w typecheck lint test` or e2e (D-0178).

