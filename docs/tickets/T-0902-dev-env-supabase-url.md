# T-0902 UF-01.5: dev server crashes — `supabaseUrl is required`

**Lane:** web-shell · **Flow:** wl-build-web · **Deps:** T-0300b · **Found:** 2026-09-28 (human, running `dev` from main)

## Symptom
Running the web app in dev throws immediately and the shell never paints:

```
Uncaught Error: supabaseUrl is required.
    at getClient (client.ts:19:14)
    at Object.get (client.ts:33:24)
    at auth-context.tsx:70:45
```

## Root cause — two independent defects

**1. `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are set nowhere for dev.**
Neither is in `.env.example` or `.env.local`, there is no `apps/web/.env*`, and `apps/web/vite.config.ts`
sets no `envDir`, so Vite only auto-loads `.env*` from `apps/web/` — where no such file exists. The
repo-root `.env.local` (H-02/H-03/H-04 secrets) is therefore never read by the web app, and the vars
have never been set in dev. `.github/workflows/ci.yml` does not set them either.

**2. The lazy-client deferral in `lib/auth/client.ts` is defeated at render.**
`client.ts` deliberately builds the client lazily behind a Proxy so a misconfigured deploy still paints
the shell (its own comment cites principle 5 and AC-A5). But `lib/auth/auth-context.tsx:70` calls
`supabase.auth.onAuthStateChange(...)` inside a `useEffect` that runs on mount, which triggers
`getClient()` → `createClient("", "")` → synchronous throw. So the deferral only survives import, not
render, and AC-A5's guarantee does not hold in practice.

## Why the tests did not catch it
- `apps/web/src/lib/auth/client.test.ts` asserts only that **import time** does not throw
  ("does not throw at import time when the URL is empty (AC-A5)"). Nothing asserts that *rendering*
  the app with empty env does not throw.
- `tests/e2e/playwright.config.ts:44` always injects `VITE_SUPABASE_URL=https://abc.supabase.co` and a
  fake anon key into the `webServer` env, so no e2e run ever exercises the missing-env path.
- Unit tests mock supabase-js, so they never construct a real client.

This is a **test-coverage gap on an AC that exists**, not a missing AC.

## Acceptance criteria
1. **AC1 (dev env documented)** Given a fresh clone, When a developer follows the README/`.env.example`,
   Then the names `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are documented with where they come
   from (the Supabase project's API settings) and where to put them for the web app. No secret values in
   the repo.
2. **AC2 (dev server starts without them)** Given neither var is set, When `pnpm --filter @workoutlab/web dev`
   runs and `/welcome` is loaded, Then the shell paints `[data-screen-id="UF-01.1"]` and the console shows
   no uncaught error. A clear, actionable warning naming both vars is allowed and preferred.
3. **AC3 (render-time regression test)** A test renders the app (or `AuthProvider` + a route) with both
   vars empty and asserts no throw — i.e. covers the *render* path, not just import. It must fail if
   `auth-context.tsx` touches the client eagerly again.
4. **AC4 (auth still works when configured)** Given both vars are set, When a user signs in by magic link,
   Then the existing T-0300b behaviour is unchanged and its tests still pass.
5. **AC5 (no regression to AC-A10)** The build-time guard in `vite.config.ts` that requires
   `VITE_SUPABASE_URL` for `command === "build"` stays: a *build* must still fail loudly, because the CSP
   `connect-src` is derived from it. Only *dev* degrades gracefully.

## Paths you may change
`apps/web/src/lib/auth/**`, `apps/web/src/app/**`, `apps/web/.env.example` (new), `apps/web/vite.config.ts`,
`apps/web/README.md` or the root README env section, and `apps/web/src/**/__tests__|*.test.tsx`.
Do **not** commit real secrets. Do not touch `api/openapi.yaml`, `docs/data-model.md` or
`docs/engine-rules.md`. If you need the repo-root `.env.local` to feed the web app, prefer an explicit
`envDir`/`loadEnv` change in `vite.config.ts` over copying secrets around, and say so in the PR.

## Where the tests run
Vitest + Testing Library for AC3/AC4 (`apps/web`). AC2 is verifiable in the e2e suite by overriding the
`webServer` env to empty for one spec, or as a unit render test — builder's choice, but it must be
automated, not manual.
