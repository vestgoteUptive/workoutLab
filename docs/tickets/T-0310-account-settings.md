---
id: T-0310
title: UF-11.4 Account settings — JSON export (NFR-PRIV-4) and in-app account deletion with a local wipe (NFR-PRIV-5)
lane: web-shell
screens: [UF-11.2, UF-11.4, UF-01.1]
decisions: [D-0001, D-0017, D-0020, D-0045, D-0053, D-0071, D-0135, D-0136]
deps: [T-0300]
status: split   # → T-0310a, T-0310b, T-0310c, T-0310d (D-0135, D-0136)
---
<!-- Groomed 2026-10-02 by product-owner. The board row spans four lanes: the OpenAPI contract (data), a new Edge Function that reads the service-role key (backend), lib/account plus a shell notice (web-shell), and the UF-11.4 screen (web-feature:UF-11). New screen ID UF-11.4 is added to user flows v2 (D-0136 §1). No data-model change: the auth.users cascade exists (D-0020) and has a pgTAP test (supabase/tests/database/007_account_deletion.test.sql). -->

## Why
Users must be able to take their data with them and to leave (NFR-PRIV-4, NFR-PRIV-5; EU users, health-adjacent data, gap B7). Deleting an `auth.users` row is privileged. D-0135 makes it a fourth Edge Function, the only code that reads the service-role key, and fences that key in one file. Export is plain CRUD under RLS, so it runs on the device (D-0001). After deletion, the device keeps nothing of the user's except the build assets (D-0136 §5). No other user's queued rows are touched (NFR-OFF-4).

## Split (the orchestrator edits the board)
Parent `T-0310` → `split → T-0310a, T-0310b, T-0310c, T-0310d`.

| Child | Lane | Scope | Deps | Status | ~Size |
|---|---|---|---|---|---|
| T-0310a | data | `api/openapi.yaml` `DELETE /account` (D-0135 §1), regenerate `api.gen.ts`, AC2 operations test (`docs/tickets/T-0310a-openapi-delete-account.md`) | T-0102a | ready | 1–2 h |
| T-0310b | backend | The `account` Edge Function, `admin.ts` key fence, CORS DELETE, `config.toml`, AC12 allow-list, real-stack integration (`docs/tickets/T-0310b-account-edge-function.md`). **Draft PR at merge; ACs on the real Supabase stack.** | T-0310a | todo | ½ day |
| T-0310c | web-shell | `lib/account`: paged export v1, download, the delete call, the per-user wipe, the D-0136 §4 order; the shell notice; `en.ts` keys (`docs/tickets/T-0310c-lib-account.md`) | T-0300, T-0319 | ready | ½–¾ day |
| T-0310d | web-feature:UF-11 | The UF-11.4 screen, the UF-11.2 `Account` link, the `/plan/account` route row, the e2e (`docs/tickets/T-0310d-uf11-account-settings-screen.md`) | T-0308b, T-0310b, T-0310c | todo (T-0308b is blocked:H-13) | ½ day |

Run order: T-0310a and T-0310c can run in parallel (no path overlap). Then T-0310b, then T-0310d. T-0310c codes to the D-0135 §1 contract and mocks `fetch`, so it doesn't wait on T-0310a.

## Scope
- In: D-0135 and D-0136, split as above.
- Out:
  - A data migration or a SQL function (D-0135 option (a), rejected).
  - CSV export.
  - Account email change.
  - Level and equipment editing (T-0216).
  - The privacy notice copy (NFR-PRIV-6, T-0309/T-0403; follow-up: name "Plan → Account settings").
  - A UX for rejected queue rows (D-0045 §6).

## Edge cases (in scope, owned by the child named)
- **Offline:** export and delete are disabled with their `Connect to…` copy, and they enable on `online` without a remount (T-0310d). No request is ever sent offline (T-0310c).
- **Unsynced sets at deletion:** they are deleted with everything else, because the queue is wiped. At export time they are listed under `device` (T-0310c).
- **Zero history:** export gives 7 tables (a new user has a profile and 9 targets, the rest are empty arrays). Delete works the same (T-0310b, T-0310c).
- **2 years of data:** 5,000 sets are exported across 5 pages within 10 s (T-0310c), and deleted within 10 s on the real stack (T-0310b).
- **Returning after 10 days off with an expired access token:** supabase-js refreshes it first. If the function still answers 401, nothing is wiped and the user is told to sign in again (T-0310c, T-0310d).
- **Two users on one device:** only the deleting user's Dexie rows go (T-0310c).
- **Lost 204:** the retry gets 401 (D-0136 Consequences, accepted).
- **Mid-workout / time running out:** not reachable. UF-11.4 is under Plan, and D-0071 §9 bans UF-03/08/09 from importing UF-11.

## Definition of done
Every child is `done` with its own definition of done. NFR-PRIV-4 and NFR-PRIV-5 each have a passing automated test at every layer listed. `pnpm -w typecheck lint test --force --concurrency=1` is green on `main` after the last merge.
