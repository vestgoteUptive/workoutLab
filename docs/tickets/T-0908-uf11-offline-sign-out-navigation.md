---
id: T-0908
title: UF-11.4 sign-out (and delete) must reach /welcome offline without a full page load racing the auth state
lane: web-feature:UF-11
screens: [UF-11.4]
decisions: [D-0195]
deps: [T-0529]
status: doing
---

## Why
CI on main went red at `b3e9d30` (run 37600741398). The failing test is `tests/e2e/uf-11-account.spec.ts:582`, T-0529 AC-8, "offline with a queued set". After "Sign out anyway" the page ended on `chrome-error://chromewebdata/` instead of `/welcome`.

`AccountSettingsBody.tsx` `doSignOut`, and the delete path the same way, navigate in the app only when `statusRef.current === "signed-out"` at the moment the call returns. Otherwise they call `window.location.replace("/welcome")`. The auth state's SIGNED_OUT update can land after `signOutAndClearDevice` resolves. If the service worker isn't controlling the page yet (a fresh install, or CI), that full page load while offline shows the browser's error page. Real users can hit this, and it keeps CI red, which blocks automatic deploys.

## Acceptance criteria
- AC-1: after sign-out, the screen waits for the auth status to become `signed-out` for a bounded time (≤ 2 s), then navigates in the app to `/welcome`. A full page load is used only if the status never flips **and** the browser is online. Offline with the status still stale, it navigates in the app anyway. The /welcome guest gate must not bounce back: check with the auth context how the session is cleared, and say in the Build log which mechanism prevents the bounce.
- AC-2: the delete-account path uses the same helper, and its behaviour is unchanged when online.
- AC-3: unit tests cover status flips before return / flips after return within the bound / never flips while online (full load) / never flips while offline (app navigation). A planted fault (the old immediate check) fails the "flips after return" test.
- AC-4: the T-0529 AC-8 e2e passes 10 times in a row with `--repeat-each=10`, including with the service worker blocked (`serviceWorkers: 'block'` for that test, or an equivalent), which reproduces CI. The other UF-11 account e2e tests stay green.

## Paths you may change
- `apps/web/src/features/UF-11/**`
- `tests/e2e/uf-11-account.spec.ts`

## Contract impact
None.

## Build / accept log

- Built from HEAD 44e3c54 (clean). `leaveToWelcome()` in `AccountSettingsBody.tsx`, shared by sign-out and delete: polls the status (25 ms, ≤ 2 s), then in-app navigate if `signed-out` or offline, else a full load; it does nothing if the screen unmounted meanwhile (the protected route's own redirect on SIGNED_OUT).
- No-bounce mechanism: `signOutAndClearDevice` calls supabase-js `signOut({scope:"local"})`, which removes the stored session and emits SIGNED_OUT without the network, so the auth status flips to `signed-out` and the guest gate lets /welcome through. Offline with a status that somehow stays stale, the in-app navigation is the only option that works; a full load is the failure being fixed.
- Red on unfixed code: new e2e (SW blocked, offline) ended on `chrome-error://chromewebdata/`.
- AC-1..3 unit (account-settings.test.tsx, 5 new "T-0908" tests): flipped-before, flips-after (bound), never-flips online (full load), never-flips offline (in-app), delete shares helper. Planted fault (`deadline = 0`, the old immediate check) failed 3 tests; restored from backup.
- AC-4: `--repeat-each=10` on AC-8 and the new SW-blocked variant: 20/20 pass. Whole uf-11-account spec: see the final run in the handback.
- Gate: typecheck/lint/test 19/19 green, format:check, check-all, test:repo-checks green. Whole uf-11-account spec 11/11.
