---
id: T-0514a
title: "The web build refuses a secret key in VITE_SUPABASE_ANON_KEY (an sb_secret_ key, or a JWT whose payload role is service_role) and never prints the value (go-live review F-4; split from T-0514, D-0190 §5)"
lane: web-shell
screens: []
decisions: [D-0190, D-0135, D-0001]
deps: [T-0510]
status: todo
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner against main fa4171e (D-0190 §5). Build flow:
wl-build-web. About ⅛ day. Waits for T-0510, which edits the same two files
(vite.config.ts, build.test.ts). The infra half of T-0514 is T-0514b. -->

## Why
`apps/web/vite.config.ts` only checks that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are
non-empty. A secret key pasted into the anon variable would ship in the public bundle, and
it would give anyone full database access, bypassing RLS
(`docs/security/go-live-review.md` F-4). Today only care during the manual deploy prevents
that. supabase-js itself only warns at runtime, after the key is already public.

## Scope
- **In:**
  - Add a pure guard, `apps/web/anon-key-guard.mjs` (with a `.d.mts` if TypeScript needs it),
    exporting `assertPublicAnonKey(value)`. It throws when:
    - the value starts with `sb_secret_`; or
    - the value has the JWT shape (three `.`-separated base64url parts) and the middle part
      decodes to JSON whose `role` is `"service_role"`.
  - The error message names `VITE_SUPABASE_ANON_KEY` and says why (secret key / service_role
    JWT). It **never** contains the value or any part of it.
  - A value that isn't a JWT and doesn't start with `sb_secret_` passes. That covers
    `sb_publishable_…`, an `anon` JWT, and the test value `test-anon-key`.
  - A JWT whose payload can't be decoded is treated as not-service-role and passes. Don't guess.
  - `vite.config.ts` calls the guard for `command === "build"`, right after the existing
    non-empty check.
- **Out:**
  - The manual-deploy runbook and the bundle scan (T-0514b).
  - Checking that the URL matches the key's project.
  - Dev-server (`vite`) runs: the guard is build-only, like the existing checks.

## Acceptance criteria
Every test title starts with `T-0514a AC-n`.

- **AC-1 (unit: rejects)** In `apps/web/anon-key-guard.test.ts`, `assertPublicAnonKey` throws for:
  - `"sb_secret_" + "A".repeat(32)`;
  - a JWT built in the test as `b64url({"alg":"HS256","typ":"JWT"}) + "." + b64url({"role":"service_role","iss":"supabase"}) + ".sig"`.

  Each error message contains `VITE_SUPABASE_ANON_KEY` and doesn't contain `"A".repeat(8)` or
  the payload segment.

  **Red:** the module doesn't exist on main.
- **AC-2 (unit: accepts)** It doesn't throw for:
  - `"sb_publishable_B5vExample"`;
  - a JWT with payload `{"role":"anon"}`;
  - `"test-anon-key"`;
  - `"a.b.c"` (not decodable);
  - `"xsb_secret_"` (the prefix isn't at the start).
- **AC-3 (the real build refuses, red on main)** In `apps/web/build.test.ts`, use the existing
  `runViteBuild(dir, SUPABASE_URL, key)` with the AC-1 `sb_secret_` value, then with the AC-1
  service_role JWT. For each:
  - `status` isn't 0;
  - stdout+stderr contain `VITE_SUPABASE_ANON_KEY`;
  - stdout+stderr don't contain the key's body (`"A".repeat(8)`, or the JWT payload segment).

  **Red:** on main, both builds succeed.
- **AC-4 (planted fault)** On a backup copy of `vite.config.ts`, remove the guard call. AC-3
  must fail. Restore with `cp`. Record the run.

## Paths you may change
- `apps/web/*.*` (the lane: `vite.config.ts`, `build.test.ts`, the new `anon-key-guard.mjs`,
  `.d.mts` and `.test.ts`).
- **Listed extras:**
  - `docs/tickets/T-0514a-web-build-refuses-secret-key.md`, for the build and accept logs.

## Contract impact
None.

## Definition of done
- Tests for every AC pass. The red runs and the planted fault are recorded.
- No e2e: the guard runs only at build time, and the e2e build uses a non-secret key.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` are green, each through
  `scripts/locked.sh` (D-0169).
- Commits start `T-0514a`.

## Notes
- **Parallel:** after T-0510 (same files). Shares no file with T-0514b, so the two can run at
  the same time once T-0510 is merged.
- Keep the guard dependency-free (`Buffer.from(seg, "base64url")` in Node). `vite.config.ts` runs
  under Node's ESM loader.

## Build / accept log

- 2026-10-06 build: added `anon-key-guard.mjs/.d.mts/.test.ts`, guard call in `vite.config.ts` (build only), AC-3 tests in `build.test.ts`. A bare `sb_secret_` with no key body passes (matches the real-key-only rule).
  AC-1 -> `anon-key-guard.test.ts` "AC-1 rejects"; AC-2 -> "AC-2 accepts"; AC-3 -> `build.test.ts` "T-0514a AC-3" (2 builds); AC-4 -> planted fault.
  Red (AC-3): with the guard call removed from a backup copy of vite.config.ts, both AC-3 builds failed (build succeeded, status 0); restored with `cp`. AC-1/2 red: module absent before this change.
