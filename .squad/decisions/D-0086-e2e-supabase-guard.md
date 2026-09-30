---
id: D-0086
title: e2e specs opt into a Supabase request guard; every signed-in spec states its profile state
status: revisit
date: 2026-09-30
by: qa (T-0904 build)
area: qa
builds-on: D-0045 §10, D-0064 §9, D-0073 §1
---
## Context
Every spec header in `tests/e2e/` promised "this spec never hits the network", and nothing
checked it. T-0301a's profile gate added a `GET /rest/v1/profiles?select=*` on the signed-in
path. `auth.spec.ts` mocked only `/auth/v1/**`, so that read went to the real
`https://abc.supabase.co`, `fetch` threw `ERR_NAME_NOT_RESOLVED`, postgrest-js retried with
1 s / 2 s / 4 s backoff, and the gate resolved only after ~7 s — past the default 5 s `expect`.
The `playwright e2e` job was red on `main` for 8 of 8 runs and blocked every merge.

The cost was not the missing mock. It was that the failure surfaced three layers from its cause,
as `toBeVisible() timeout 5000ms` on `[data-screen-id="UF-02.1"]`, with nothing pointing at an
unmocked endpoint. `shell.spec.ts` had the identical leak in AC-A7, AC-A10 and AC-A13 and stayed
green purely by luck: `unknown` happens not to redirect on `/`.

Full diagnosis: `docs/ci/CI-T-0904-auth-e2e-unmocked-profile-read.md`.

## Decision
1. **An opt-in guard.** `tests/e2e/fixtures/guarded-test.ts` exports `test`/`expect`. A spec that
   imports them gets one `auto` fixture: any Supabase request no route claimed fails the test at
   teardown, naming method and URL. Opt-in rather than global so in-flight branches
   (T-0306a, T-0307b, T-0308a) that import `@playwright/test` directly keep working; migrating
   them is a follow-up, and no repo check forces the guarded import yet — such a check would turn
   their rebase red.
2. **"Claimed" means kept off the network.** A request to `VITE_SUPABASE_URL` is claimed when any
   route consulted before the guard answers it with `route.fulfill` or `route.abort`, whichever
   file registered that route. The 501 catch-alls (`mockSupabaseAuth`, `mockSupabaseRest`) count
   as claims, because keeping the request off the network *is* the property being enforced. The
   guard therefore does **not** replace them, and specs that rely on the 501 backstop for
   AutoSync stay green.
3. **It fulfils 501, never aborts.** An aborted fetch throws, and postgrest-js retries a throw for
   ~7 s — the failure would come back as a timeout, which is the symptom this guard exists to
   replace. An HTTP error status is not retried.
4. **Two detectors, because one is not enough.** Both facts below were measured, not assumed, and
   each contradicts a plausible intuition:
   - A **context route** is the last resort: Playwright consults it only after every matching
     page route has fallen back, so page-route order cannot shadow it. It catches "nothing
     matched" and `route.fallback()`.
   - A **`requestfailed` listener** catches `route.continue()`. `continue()` does *not* fall
     through to a context route — Chromium sends the request straight to the network and the
     context handler is never invoked — so the exact leak the guard exists for is invisible to
     the route alone. Only `requestfailed` is used: `requestfinished` also fires for
     route-*fulfilled* requests, so keying on it reported all 10 of `offline.spec.ts`'s
     legitimately mocked AutoSync selects.
   The listener's limitation, stated plainly: it identifies real traffic by its DNS failure, so
   it works because the fixture hard-codes an unresolvable host. Point a spec at a host that
   genuinely answers and a `route.continue()` leak would succeed undetected.
5. **Every signed-in spec states its profile state.** `mockProfilePresent(page, row?)` and
   `mockProfileMissing(page)` in `fixtures/supabase-mock.ts`, registered *after*
   `mockSupabaseRest` so they win over the 501 backstop. Inheriting a network error, or a 501
   that resolves `unknown`, is not a profile state — and `unknown` happens to redirect, so a
   spec that relies on it passes while testing nothing it is named for.
6. **No timeout is raised, ever, to fix this class of bug.** Wanting more time is the signal the
   cause is unfixed. A source assertion in `fixture-guard.spec.ts` pins that `auth.spec.ts` adds
   no `timeout:`, `setTimeout` or `.slow(`.

## Consequences
- `auth.spec.ts`, `shell.spec.ts` and `offline.spec.ts` are migrated; a source assertion in
  `fixture-guard.spec.ts` checks all three still import from `guarded-test.js`, so a later edit
  cannot silently opt a spec out.
- `SupabaseGuard.forgetPlantedLeaks()` exists only for `fixture-guard.spec.ts`, which plants
  leaks on purpose. Named to be conspicuous: calling it from a product spec silences the guard.
- **Two documented expectations turned out to be false, and are corrected here** rather than left
  for the next reader to inherit:
  - The ticket expected `context.setOffline(true)` requests to "never reach any route".
    Measured, `setOffline` does **not** suspend interception: an unmocked Supabase fetch made
    while offline still hits the guard's route and is still reported. The offline specs stay green
    because their own page routes claim their requests, online and offline alike — not because of
    any offline exemption. The exemption that remains covers only genuine navigation failures.
  - The ticket expected `route.continue()` to be recorded by the context route. It is not; see §4.
- **A latent race in `offline.spec.ts` was found and fixed** (in lane). It went offline as soon as
  the IndexedDB poll settled, while workbox was still populating `workbox-precache-v2`. Measured
  at the moment it went offline: 21 precached entries → passes, 16 → fails, 15 → fails, with
  `page.reload()` dying on `net::ERR_INTERNET_DISCONNECTED`. The guard's small added latency
  flipped it from usually-winning to usually-losing. It now awaits `serviceWorker.ready` *and*
  the `/index.html` navigation fallback being present — `ready` resolves on activation, whereas
  `addAll` keeps writing afterwards. This is the likeliest explanation for the one-off
  `ERR_INTERNET_DISCONNECTED` the diagnosis recorded against this line in CI run 36613911266.

## Revisit when
- T-0306a, T-0307b and T-0308a have merged and their specs are migrated. Once every spec is
  guarded, add the repo check §1 deliberately omits.
- T-0351 lands (the gate read fails fast). The ~7 s retry window is what made this bug expensive
  to read; with a bounded read, a future leak fails faster even without the guard.
- Any spec needs a Supabase URL that resolves, which would break §4's detector-2 assumption.
