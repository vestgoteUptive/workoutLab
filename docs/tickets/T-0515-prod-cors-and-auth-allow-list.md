---
id: T-0515
title: "Narrow prod origins: Edge Function ALLOWED_ORIGINS=https://app.workout.vestgote.com (previews stay off it) and drop the two localhost entries from the prod auth uri_allow_list, via a human-run plan/apply script, verified by a read-only CORS probe and the auth drift check (go-live review F-6, D-0190 §4)"
lane: infra
screens: [UF-01.5]
decisions: [D-0190, D-0011, D-0053, D-0184, D-0185, D-0186]
deps: [T-0509, T-0514b]
status: todo
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner against main fa4171e (D-0190 §4, §7). Build flow:
wl-build-infra. About ⅓ day of agent work: run A builds the probe, the script and the
expected-file change, then stops. The human runs the apply (H-25). Run B is a read-only verify.
Lane moved backend → infra: no file under supabase/ changes. -->

## Why
`docs/security/go-live-review.md` F-6 found two places where prod trusts more origins than it
needs:
- **Edge Function CORS.** Prod doesn't set `ALLOWED_ORIGINS`, so `supabase/functions/_shared/cors.ts`
  falls back to its default list: `http://localhost:3000`, `http://localhost:5173` and the app
  host. A page on a developer's localhost can make credentialed-by-token calls to prod functions.
- **Auth `uri_allow_list`.** It holds the same two localhost entries
  (`infra/auth/expected-auth.json`). Local dev doesn't need them, because it runs its own
  Supabase (`supabase/config.toml`).

D-0190 §4 decides the outcome:
- Prod CORS is the app host only.
- Previews stay off the CORS list. Their Edge Function calls already fail today, because
  `cors.ts` matches exactly and previews are off (H-18).
- The localhost entries leave the auth allow-list. The preview wildcard
  `https://*.workoutlab-web.pages.dev/**` stays (D-0184 §5).

Both changes are prod writes, so the human runs them (D-0186). Agents verify them read-only.

## Scope
- **In:**
  - **`infra/scripts/cors-probe.mjs`** (read-only). For each function in
    `workouts balance sessions account`, and each origin in:
    - `https://app.workout.vestgote.com`;
    - `http://localhost:5173`;
    - `http://localhost:3000`;
    - `https://probe.workoutlab-web.pages.dev`;
    - `https://evil.example`,

    send `OPTIONS https://<ref>.supabase.co/functions/v1/<fn>` with that `Origin` and
    `Access-Control-Request-Method: GET`. The ref comes from `infra/auth/expected-auth.json`.
    Record whether `access-control-allow-origin` echoes the origin. Expected: only the app host
    is echoed, for all four functions. On any other result, exit 1 and print a
    `<fn> <origin> reflected|not-reflected` table. It sends no auth header and no body. An
    OPTIONS reaches `preflightResponse` (verify_jwt is off, D-0053 §4) and writes nothing.
  - **`infra/scripts/prod-origins.sh`** (human-run; follows `supabase-prod-release.sh`'s
    plan/apply shape):
    - **plan** (the default, read-only):
      - `npx -y supabase@<pinned> secrets list --project-ref <ref>` (names and digests only;
        print whether `ALLOWED_ORIGINS` exists);
      - the `auth-patch.mjs --set uri_allow_list=https://app.workout.vestgote.com/**,https://*.workoutlab-web.pages.dev/**`
        dry run;
      - `node infra/scripts/cors-probe.mjs`.
    - **apply** (needs `CONFIRM_PROD_AUTH=<ref>`, checked before any call):
      - `supabase secrets set ALLOWED_ORIGINS=https://app.workout.vestgote.com --project-ref <ref>`;
      - the same `auth-patch.mjs --set … --apply` (T-0509's snapshot and retry apply);
      - after a 10 s wait, `cors-probe.mjs` and `auth-drift-check.mjs`.
  - **`infra/auth/expected-auth.json`**: set `expected.uri_allow_list` to
    `https://app.workout.vestgote.com/**,https://*.workoutlab-web.pages.dev/**`. Until H-25 is
    applied, the live drift check reports this one key as drift. That is the intended signal.
    Say so in the handback.
  - Update the tests that read the real expected file (`auth-drift-check.test.mjs`,
    `auth-patch.test.mjs`) wherever they hard-code the old four-entry list.
  - **`infra/deploy/README.md`**:
    - "Preview risk": previews can't call Edge Functions (CORS, D-0190 §4); sign-in and CRUD
      still work.
    - "To close the door again": the localhost entries are gone.
    - Add one line naming `prod-origins.sh`.
- **Out:**
  - Any change to `supabase/functions/_shared/cors.ts`, including its default list, which local
    dev and the tests use. Wildcard support is out too.
  - `site_url`.
  - Running the apply (H-25).

### Edge cases that are in scope
- **The gateway adds its own CORS.** If the probe shows the platform answering OPTIONS with
  `*` or reflecting every origin before the function runs, the secret can't fix it. Raise
  triage instead of passing AC-5.
- **A dev pointing local web at prod.** After this change they're blocked by CORS and by the
  redirect list. That's intended. Local dev uses local Supabase.

## Acceptance criteria
Every test title starts with `T-0515 AC-n`. Unit tests are `node --test` in `.github/scripts/`,
with a fake `fetchImpl` and stub `npx`/`node`/`sleep` on `PATH`, as
`supabase-prod-release.test.mjs` does.

- **AC-1 (probe logic)**
  - **Given** a fake fetch that echoes the origin only for the app host.
  - **Then** `run()` exits 0, makes exactly 20 OPTIONS requests (4 functions × 5 origins), none
    with an `Authorization` header or a body, all to
    `https://csgjsdwuxqtuqpuazzpz.supabase.co/functions/v1/<fn>`.
  - **Given** a fake that also echoes `http://localhost:5173`.
  - **Then** exit 1, and the table names `localhost:5173 reflected`.
- **AC-2 (the script's lock and modes)**
  - Plan mode logs no `secrets set` call and no `--apply`.
  - `apply` without `CONFIRM_PROD_AUTH=csgjsdwuxqtuqpuazzpz` exits ≠ 0 with **no** logged call.
  - `apply` with the lock logs, in order:
    1. `secrets set ALLOWED_ORIGINS=https://app.workout.vestgote.com --project-ref csgjsdwuxqtuqpuazzpz`;
    2. the `auth-patch.mjs … --apply`;
    3. `cors-probe.mjs`;
    4. `auth-drift-check.mjs`.
- **AC-3 (expected file)** `expected.uri_allow_list`, split on `,`, is exactly the set
  `{https://app.workout.vestgote.com/**, https://*.workoutlab-web.pages.dev/**}`. No entry
  contains `localhost`. The other expected keys don't change: diff against main's file, and only
  this key may differ.
- **AC-4 (read-only red before H-25, by an agent)** Run `node infra/scripts/cors-probe.mjs`
  against prod. Expected today: exit 1, with `localhost:5173` and `localhost:3000` reflected.
  Also run `node infra/scripts/auth-drift-check.mjs`: expected exit 1, with only
  `uri_allow_list` differing. Record both outputs (no secrets are printed).
- **AC-5 (live, read-only, after H-25)**
  - **Given** the human ran `CONFIRM_PROD_AUTH=csgjsdwuxqtuqpuazzpz bash infra/scripts/prod-origins.sh apply`.
  - **When** an agent reruns the probe and the drift check.
  - **Then** both exit 0. Only the app host is reflected on all four functions.
  - The human then confirms one prod magic-link sign-in still returns to
    `https://app.workout.vestgote.com/auth/callback`.
- **AC-6 (planted faults)** On backup copies, restored with `cp`:
  - make the probe accept a reflected localhost → AC-1's second case fails;
  - drop the lock check from the script → AC-2 fails.

  Record both.

## Paths you may change
- `infra/scripts/cors-probe.mjs` (new), `infra/scripts/prod-origins.sh` (new),
  `infra/auth/expected-auth.json`, `infra/deploy/README.md`,
  `.github/scripts/cors-probe.test.mjs` (new), `.github/scripts/prod-origins.test.mjs` (new),
  `.github/scripts/auth-drift-check.test.mjs`, `.github/scripts/auth-patch.test.mjs`,
  `.github/scripts/fixtures/auth-patch/**` (the lane: `infra`).
- **Listed extras:**
  - `docs/tickets/T-0515-prod-cors-and-auth-allow-list.md`, for the build and accept logs.

## Contract impact
None. `api/openapi.yaml` doesn't list origins. This is a prod config change through D-0185 §4,
with the expected file updated in the same ticket, and it costs nothing.

## Definition of done
- **Run A:**
  - AC-1 to AC-4 and AC-6 pass and are recorded.
  - `npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check` and
    `node .github/scripts/check-all.mjs` are green through `scripts/locked.sh small`.
  - Hand back with H-25's exact command.
- **Run B (after H-25):** AC-5 is recorded.
- Commits start `T-0515`.

## Notes
- **Parallel:** after T-0509 (the hardened `--apply`) and T-0514b (`infra/deploy/README.md`). It
  is the last ticket in the infra chain.
- Once previews are turned on (H-18), D-0190's revisit trigger decides preview CORS.

## Build / accept log
Archived in `docs/tickets/log/T-0515.md` (D-0157).
