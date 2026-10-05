---
id: T-0500
title: "Read-only prod auth drift check: GET /config/auth, filter to the managed keys before anything is printed, diff against a committed secret-free expected file, exit 1 on drift, never write (D-0185 §3)"
lane: infra
screens: []
decisions: [D-0011, D-0184, D-0185, D-0186]
deps: [T-0400]
status: ready
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main c378ddf (D-0186). Build flow: wl-build-infra.
About ½ day. Read-only against prod: one GET. T-0402c, T-0402d and T-0404b each extend the
expected file in the same ticket that changes the live setting (D-0185 §4). -->

## Why
D-0185 kept prod's auth settings out of Terraform. The provider can't import them without
declaring about 120 live keys. So they're hand-managed in the dashboard (H-08), and nothing
notices when one of them moves. Phase 4 is about to change three of them on purpose: the preview
redirect pattern (T-0402c), SMTP (T-0404b) and `site_url` at go-live (T-0402d). D-0185 §4 wants
each change shown as a before/after of the filtered keys and checked afterwards. This script is
that check. It is strictly read-only, and the raw auth config, which holds secrets (SMTP
password, OAuth secret), never reaches stdout, a file or the log.

## Scope
- **In:**
  - `infra/scripts/auth-drift-check.mjs`, plain Node 22 with no dependencies:
    - It reads `SUPABASE_ACCESS_TOKEN` and `GOOGLE_OAUTH_CLIENT_ID` from the environment. The
      project ref comes from the expected file, not from a literal in the script.
    - It sends exactly one request, `GET https://api.supabase.com/v1/projects/<ref>/config/auth`.
    - It **filters first**, inside the function that receives the parsed JSON, before any
      logging, and keeps only the keys listed in the expected file's `keys`. The
      `client_id_matches` booleans are derived values: `external_google_client_id ===
      $GOOGLE_OAUTH_CLIENT_ID`. Neither ID is ever printed. Derived values come from one table
      in the script, `DERIVED = { name: (raw, env) => boolean }`, so a later ticket adds an entry
      (T-0404b adds `smtp_pass_set`) without touching the filter.
    - It compares the filtered object with `infra/auth/expected-auth.json`'s `expected`. A key
      listed in `unordered_lists` (comma-separated strings, e.g. `uri_allow_list`) is compared
      as a set: live order differs from D-0011, and that isn't drift (D-0185 §3).
    - On a match it prints `auth config matches expected (<n> keys)` and exits 0. On drift it
      prints one line per key, `<key>: expected <x>, live <y>` (set keys: `missing [..]` /
      `extra [..]`), and exits 1. On an error it exits 2 with the HTTP status only.
    - `--print` prints the filtered live object as JSON (sorted keys). That's the "before/after"
      output D-0185 §4 asks for. It's safe because only filtered keys exist at that point.
    - Pure exports for tests: `filterAuth(raw, spec, env)`, `diff(filtered, spec)`, and
      `run({fetchImpl, env, argv, stdout})`.
  - `infra/auth/expected-auth.json`, committed and secret-free:
    ```json
    {
      "project_ref": "<the prod ref, from T-0400's config>",
      "keys": ["site_url", "uri_allow_list", "external_google_enabled", "external_email_enabled", "mailer_otp_length"],
      "derived": ["external_google_client_id_matches"],
      "unordered_lists": ["uri_allow_list"],
      "expected": {
        "site_url": "http://localhost:3000",
        "uri_allow_list": "http://localhost:3000/**,http://localhost:5173/**,https://app.workout.vestgote.com/**",
        "external_google_enabled": true,
        "external_email_enabled": true,
        "mailer_otp_length": 6,
        "external_google_client_id_matches": true
      }
    }
    ```
    The values are D-0011's, with the order not significant. `mailer_otp_length` is pinned
    because UF-01.5 verifies a 6-digit code (`apps/web/src/lib/auth/magic-link.ts`). The live
    GET at build time confirms every value. If one differs, follow the edge case below.
  - `.github/scripts/auth-drift-check.test.mjs` (node:test) and fixtures under
    `.github/scripts/fixtures/auth-drift/`. Fixtures are made-up, full-shaped auth responses
    holding sentinel secrets (`smtp_pass: "SENTINEL-SMTP"`, `external_google_secret:
    "SENTINEL-GOOGLE"`).
  - `infra/auth/README.md`: what the check covers, how to run it, and the rule that a ticket
    changing a live auth key updates this file in the same ticket (D-0185 §4).
- **Out:**
  - Any write call (PATCH/POST/PUT/DELETE).
  - Running in CI (D-0186 §4: the access token stays local).
  - Changing any live setting: T-0402c, T-0402d and T-0404b do that.
  - Managing keys beyond the list above. Later tickets add theirs.

### Edge cases that are in scope
- **Live differs from D-0011 today** (e.g. `mailer_otp_length` isn't 6, or the allow-list has an
  extra entry). Don't "fix" prod. The expected file states **reality**, with a `_notes` entry,
  and the difference goes in the log and in your handback for the orchestrator to raise. The one
  exception is `mailer_otp_length` ≠ 6: that breaks UF-01.5 code entry on prod, so return
  `needs-triage`.
- **A key in `keys` is absent from the live response** (renamed by Supabase). Report it as drift
  (`<key>: expected <x>, live <absent>`), exit 1.
- **Pretty-printing an error.** On a non-200, the body is never printed. It may echo request
  data.
- **The ref is a prod identifier, not a secret**, but `supabase/tests/scripts/prod-guard.test.mjs`
  bans it under `supabase/`. `infra/` is outside that scan. Keep it out of `supabase/` and
  `.github/workflows/`.

## Acceptance criteria
Each node:test title starts with `T-0500 AC-n`.

- **AC-1 [static] Filter before print.**
  - **Given** the fixture `full.json` (with the sentinels), **when** `run` executes with each of
    no flag, `--print`, a drifting fixture and a 500 response, **then** neither `SENTINEL-SMTP`
    nor `SENTINEL-GOOGLE` appears in captured stdout or stderr.
  - **And** the raw Google client ID value from the fixture appears in neither.
  - **And** `--print` output parses as JSON whose keys are exactly `keys ∪ derived`.
- **AC-2 [static] GET only, one call.**
  - **Given** an injected fetch spy, **then** it is called exactly once, with method `GET`
    (or no method), and a URL ending `/config/auth`.
  - **And** a source scan of `auth-drift-check.mjs` finds no `PATCH`, `POST`, `PUT` or `DELETE`
    string.
- **AC-3 [static] Allow-list order doesn't count.**
  - **Given** a live `uri_allow_list` holding the same three entries in the order T-0400 saw
    (`http://localhost:3000/**,https://app.workout.vestgote.com/**,http://localhost:5173/**`),
    **then** exit 0.
  - **Given** one entry missing, **then** exit 1, and the output names `missing
    [http://localhost:5173/**]`.
  - **Given** an extra `https://*.workoutlab-web.pages.dev/**`, **then** exit 1 and
    `extra [https://*.workoutlab-web.pages.dev/**]`.
- **AC-4 [static] Drift and errors.**
  - **Given** `site_url` changed, **then** exit 1 with the line
    `site_url: expected http://localhost:3000, live https://app.workout.vestgote.com`.
  - **Given** client IDs that don't match, **then** exit 1 on
    `external_google_client_id_matches`.
  - **Given** a key missing from the response, **then** exit 1 with `live <absent>`.
  - **Given** HTTP 401, **then** exit 2, and the output holds `401` and nothing from the body.
- **AC-5 [static] The committed expected file is secret-free.**
  - **Given** `infra/auth/expected-auth.json`, **then** no name in `keys`, `derived` or
    `expected` contains `secret`, `pass` or `token`, except a derived name ending `_set` or
    `_matches`, which holds a boolean only.
  - **And** no value matches `/(sbp_|GOCSPX-|re_[A-Za-z0-9]{8,})/`.
  - **And** every `expected` key is in `keys ∪ derived`.
  - **And** every `derived` value in `expected` is a boolean.
  - Planted fault, recorded: add `"smtp_pass"` to `keys` in a copy, and AC-5 goes red.
- **AC-6 [live, read-only] Prod matches.**
  - **When** the builder runs the script against prod with `.env.local` loaded, **then** it
    exits 0 and prints `auth config matches expected (6 keys)`.
  - The `--print` output goes in the log. It's filtered, so it's safe.
  - If it exits 1, the edge case above applies. Never PATCH.

## Paths you may change
- `infra/scripts/auth-drift-check.mjs`, `infra/auth/expected-auth.json`, `infra/auth/README.md`
  (new).
- `.github/scripts/auth-drift-check.test.mjs`, `.github/scripts/fixtures/auth-drift/**` (new).
- **Listed extras:**
  - `docs/tickets/T-0500-prod-auth-drift-check.md`, for the build and accept logs.

## Contract impact
None. No cost.

## Definition of done
- Every `[static]` AC has a passing node:test, and the planted fault is recorded. AC-6's output is
  in the log.
- `node --test .github/scripts/auth-drift-check.test.mjs` passes while you work. Before handing
  back, `npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check` and
  `node .github/scripts/check-all.mjs` pass.
- Nothing under `apps/` or `packages/` changes, so the `-w typecheck lint test` gate and e2e
  aren't needed (D-0178). Say so in the log.
- Commits start `T-0500`.

## Notes
- **Environment:** `set -a; . <repo>/.env.local; set +a; node infra/scripts/auth-drift-check.mjs`
  in one command line. Never echo the variables, and never `curl` the endpoint by hand: the raw
  response holds secrets.
- **Parallel:** shares no file with T-0501, T-0405, T-0402a or T-0402b.
- **Unblocks:** T-0402c, T-0404b and T-0402d. Each one updates `expected-auth.json` in the same
  ticket as its live change, and runs this script before (expect exactly its own key to differ
  once the file is updated) and after (expect exit 0).

## Build / accept log
Archived in `docs/tickets/log/T-0500.md` (D-0157).
