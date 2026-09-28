---
id: D-0045
title: PWA shell (T-0300) — split a/b/c/d, route table, C-02 tabs, magic link + code, queue semantics, build-time token colours, e2e home
status: revisit
date: 2026-09-28
by: product-owner (T-0300 groom)
area: web
---
## Context
T-0300 is the first `apps/web` ticket. The board line, the folded-in follow-ups (D-0015, D-0034 §3, D-0019/D-0031, NFR-OFF/SYNC/PERF/A11Y/I18N/AN) and C-01 add up to well over a day. Several things aren't settled anywhere: C-02 Tab bar has no spec, there's no route table, the magic-link round trip breaks in an installed iOS PWA (the link opens in Safari, not the PWA), and D-0015/D-0020 don't say what the queue does with a row that the server will never accept, with a clock that goes backwards, or with two users on one device. `tests/e2e` isn't a workspace package, and `pnpm-workspace.yaml` belongs to infra.

## Decision
1. **Split (TR-0015 pattern, D-0037 §12).** The `T-0300` row stays on the board as the parent with status `split → T-0300a, T-0300b, T-0300c, T-0300d`. The marker stays `@placeholder T-0300`. It's valid because the parent row isn't `done`, and T-0300a deletes it.
   - **T-0300a** shell: Vite PWA, tokens, manifest/icons, routes, C-02, i18n, Intl helpers, CSP, size budget, Playwright wiring. Deps T-0002, T-0003, T-0102a.
   - **T-0300b** auth: magic link + code, callback, guard. Deps T-0300a.
   - **T-0300c** offline store, queue, sync, engine history feed, offline status. Deps T-0300b, T-0102b (row mappers, DB types).
   - **T-0300d** C-01 body map + legend. Deps T-0300a. It can run in parallel with b and c, because its paths are disjoint from theirs.
2. **Routes.** `/welcome` UF-01.1 · `/account` UF-01.5 · `/auth/callback` · `/` UF-02.1 · `/library` UF-04.1 · `/library/:exerciseId` UF-04.2 · `/progress` UF-06.1 · `/balance` UF-10.1 · `/balance/:area` UF-10.2 · `/plan` UF-11.2 · `/session/setup` UF-08.1 · `/session/:sessionId` UF-09 host. An unknown path redirects to `/`, and `/balance/<not one of the 9 areas>` redirects to `/balance`. Each screen is a lazy route. T-0300a creates one stub per flow at `apps/web/src/features/<flow>/index.tsx`, which renders `data-screen-id` and a catalogue title. The feature tickets replace their own stubs. Sub-routes that aren't listed here are added by the feature tickets through their `index.tsx`.
3. **C-02 Tab bar.** Four tabs in this order: Today `/`, Library `/library`, Progress `/progress`, Plan `/plan`. Each has an icon and a visible text label. The active tab has `aria-current="page"`, and on `/balance/*` Progress is active. C-02 isn't rendered on `/welcome`, `/account`, `/auth/*` or `/session/*` (principle 1: no chrome in UF-08/UF-09). Account settings (T-0310) go under Plan, not in a fifth tab.
4. **C-01 variants.** `compact` (UF-02.1) is one link to `/balance` with an accessible name, and its areas aren't separately focusable. `full` (UF-10.1) has nine area buttons, each linking to `/balance/:area`. Numeric labels show in both variants. C-01 may not be imported from `features/UF-03`, `UF-08` or `UF-09`. An ESLint `no-restricted-imports` rule enforces this.
5. **Auth.** supabase-js with `flowType: 'pkce'`, reading `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, with `emailRedirectTo` = `<origin>/auth/callback`. The same email also carries a 6-digit code, and the shell accepts it through `verifyOtp({type: 'email'})`, so an installed PWA can finish sign-in without the link (follow-up to T-0404: the template includes `{{ .Token }}`). Google isn't wired in T-0300: T-0301 adds the button, and the auth module doesn't assume a provider. The first render of UF-01.1 never waits on a network request (principle 5). A session with an expired token counts as `stale` and keeps the user in the app while offline. A refresh that is definitively rejected signs the user out, but never while on `/session/*` (principle 1). There the redirect waits until the user leaves the route.
6. **Queue semantics (extends D-0015/D-0020, no contract change).**
   - The IndexedDB store holds one entry per `(user_id, client_id)` for sets and per `id` for sessions. An edit or delete replaces the entry.
   - The edit clock is monotonic: `edited_at = max(now, previous edited_at + 1 ms)`.
   - Flush order: sessions (`onConflict: 'id'`), then sets (`onConflict: 'user_id,client_id'`), sorted by `edited_at` ascending, in batches of at most 100.
   - On success, the flush removes only the entries whose stored `edited_at` is ≤ the `edited_at` it sent.
   - `23503` or `401`/JWT-expired responses keep the entries. After a `401`, the next flush waits for `SIGNED_IN`/`TOKEN_REFRESHED`.
   - Network errors retry with backoff of 2, 4, 8 … s, capped at 300 s. An `online` event triggers an immediate flush.
   - For `23514`/`23502`/`22P02`, the flush retries the batch row by row and marks each failing row `rejected`. A rejected row stays in IndexedDB, isn't retried automatically, and still goes to the engine as `pending`. It's never dropped (NFR-OFF-4). The UX for rejected rows is a follow-up.
   - No TTL. Sign-out doesn't clear the queue. Another user's entries are never flushed or passed to the engine. Only account deletion (NFR-PRIV-5, T-0310) clears the queue.
7. **Engine feed (D-0034 §3).** Server rows come from `session_sets_live` with `completed_at ≥` the start of local day `today − 55` in the device tz (56 local days), mapped with `toHistorySet`. Queued rows for the same user follow them, all with `pending: true`, including tombstones and rejected rows. The feed doesn't dedupe; the engine does (rule 0).
8. **Colours at build time.** `vite.config.ts` reads `tokens.color` from `@workoutlab/design-tokens` and uses it for the manifest `theme_color`/`background_color` (`bg`), `<meta name="theme-color">` (injected through `transformIndexHtml`) and the icons (`accent` mark on `bg`). The icons are rendered to `dist/` by `apps/web/scripts/gen-icons.mjs`, with `@resvg/resvg-js` for the PNGs. `public/` and `index.html` hold no colour values, so `wl-check-colours .` stays green.
9. **Offline status copy.** "Offline · last synced HH:MM" uses `Intl` `timeStyle: 'short'` in the device locale and tz. If nothing has synced yet, it reads "Offline · not synced yet". Online, it shows nothing. The `icon` variant (UF-09) is an icon with `aria-label` "Offline" and no text, banner or `role="alert"`.
10. **e2e home.** The Playwright config and specs live in `tests/e2e/` (qa lane). `@playwright/test` and `@axe-core/playwright` are devDependencies of `apps/web`, which gets a `test:e2e` script. The tests run against `vite preview` with Supabase mocked by `page.route`, so they need no Docker. e2e isn't part of `pnpm -w test`. A CI job for it is an infra follow-up.
11. **Perf.** The initial JS budget (≤ 200 KB gzip) and the per-route chunk budget (≤ 100 KB gzip) are checked by `apps/web/scripts/check-bundle-size.mjs` (`check:size`). NFR-PERF-1 is written as `apps/web/lighthouserc.json` (mobile preset: LCP ≤ 2500 ms, CLS ≤ 0.1, TBT ≤ 200 ms as the lab proxy for INP) and run in CI by T-0402/infra.
12. **i18n lint.** `react/jsx-no-literals` (`noStrings: true`) applies to `apps/web/src/**/*.tsx` except tests. The allowlist is `· × / – − + %`. The catalogue is `apps/web/src/lib/i18n/en.ts`. T-0300a also adds the C-01 and offline strings, so that b, c and d don't all edit the file.

13. **Amendment from TR-0022 (triage, 2026-09-28).**
    - **IndexedDB library:** the offline store uses **Dexie**, as D-0001 (`decided`) requires, not `idb`. `fake-indexeddb` stays for tests. In AC-C1, "a fresh `openDB`" means a new Dexie instance on the same database name. The queue semantics in §6–§7 are unchanged. `lib/offline` stays out of UF-01.1's static import graph, so it adds nothing to the first render (principle 5, NFR-PERF-2).
    - **Guard and onboarding (D-0014):** `/welcome` and every path under `/welcome/` are public when signed out, so T-0301 can nest UF-01.2–01.4 there before sign-in. AC-B5 adds: signed out, `/welcome/goal` renders without a redirect.

## Consequences
- The orchestrator splits the board row as in §1. product has written `docs/tickets/T-0300-pwa-shell.md` with ACs tagged [a]–[d].
- infra follow-ups: a CI job for `test:e2e` (Playwright browsers cached), Lighthouse CI on `lighthouserc.json` (T-0402), and `check:size` in CI. T-0404: the magic-link template includes the 6-digit `{{ .Token }}`.
- The lockfile changes only through `pnpm install`, run by the orchestrator (the T-0103a precedent).

## Revisit when
- Design delivers a C-02 spec, or user tests show Balance needs its own tab.
- The iOS PWA code entry tests poorly (then consider a universal-link or deep-link return).
- Rejected queue rows show up in real use (then design a UX to review them).
- The e2e suite needs a real Supabase stack (then move it to the CI supabase job).
