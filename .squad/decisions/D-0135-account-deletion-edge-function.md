---
id: D-0135
title: Account deletion is a fourth Edge Function, DELETE /account, the one place that reads the service-role key (only to call auth.admin.deleteUser for the verified caller); api/openapi.yaml gains the path
status: revisit
date: 2026-10-02
by: product-owner (groom, T-0310)
area: backend
supersedes: D-0053 §4 (in part, the sentence "No function uses the service-role key for user data", and the T-0203b AC12 service-role test, for `supabase/functions/account/admin.ts` only; everything else in D-0053 stays in force)
builds-on: D-0001, D-0017, D-0020, D-0037, D-0053
---
## Context
NFR-PRIV-5 says: after confirmation, the auth user and every owned row are deleted immediately (cascade), and the local caches and the queue are cleared. The cascade already exists: every user-owned table has `user_id … references auth.users(id) on delete cascade` (D-0020), and `supabase/tests/database/007_account_deletion.test.sql` proves it. What's missing is a way for a signed-in user to delete their own `auth.users` row.

Neither the `authenticated` nor the `anon` role can delete from `auth.users`. That takes the Auth admin API, which needs the service-role key, or SQL running as `postgres`. D-0001 says plain CRUD goes through supabase-js + RLS and logic that must run server-side is an Edge Function. D-0053 §4 says no function uses the service-role key for user data, and T-0203b's AC12 test (`supabase/tests/scripts/functions-platform.test.mjs`) bans any function from reading `SUPABASE_SERVICE_ROLE_KEY`.

Three options:
- (a) A `security definer` SQL function, such as `public.delete_my_account()`, called with `rpc()`. It needs no key. But it puts a privileged function in `public`, exposed through PostgREST, where D-0030 keeps privileged functions in `private`. It also bypasses Auth's own delete path.
- (b) An Edge Function that verifies the caller's JWT and calls `auth.admin.deleteUser(callerId)` with the service-role key.
- (c) A soft delete or a deletion queue processed later. NFR-PRIV-5 says "immediately", so this is out.

(b) fits D-0001 and keeps the database surface unchanged. Its risk is the key, so it is fenced in one file.

## Decision
1. **Contract change: `api/openapi.yaml` gets a fourth path** (the data lane makes the change in T-0310a):
   - Add a tag `account` (description: "The caller's own account (NFR-PRIV-4, NFR-PRIV-5).").
   - Add `/account` → `delete` with:
     - `operationId: deleteAccount`, `tags: [account]`;
     - `summary: Delete the caller's account and every row they own (UF-11.4, NFR-PRIV-5)`;
     - a `description` saying that the function verifies the bearer token, deletes the caller's `auth.users` row with the Auth admin API, and the `on delete cascade` FKs (D-0020) remove every owned row in the same step. It has no request body. A repeat call with the same token is 401, because the token no longer verifies. It is never 404 and never 403.
     - responses: exactly `"204"` (description "Deleted. No body.", no `content`), `"401": { $ref: "#/components/responses/Unauthorized" }` and `"500": { $ref: "#/components/responses/Internal" }`.
   - `info.description`'s "The three server-side functions" becomes "The four server-side functions".
   - The global `bearerAuth` security applies. No new schema and no new `ApiError` code.
   - `packages/shared/src/api.gen.ts` is regenerated (`gen:api`). `packages/shared/test/openapi.test.ts` AC2 changes from three operations to these four: `DELETE /account`, `GET /balance`, `POST /sessions/{id}/finish`, `POST /workouts/suggest`.
2. **The function** (backend lane, T-0310b): `supabase/functions/account/`, served at `/functions/v1/account`, with `[functions.account] verify_jwt = false` in `config.toml` (D-0053 §4 pattern).
   - Route table: `"DELETE /account"` only, through `createHandler("account", …)`. Every other method or sub-path is 404 `not_found` (D-0053 §3).
   - `authenticate(req)` gives the caller's `userId` (401 as for the other functions). The function then calls `auth.admin.deleteUser(userId)` once, with a hard delete (`shouldSoftDelete` false). It returns 204 with an empty body, `x-request-id` and the CORS headers.
   - An admin error, or a missing `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, gives 500 `internal` with the fixed message (D-0053 §5). The user id is never taken from the request body, the query or a header other than the verified token.
   - One log line `{requestId, fn: "account", status, ms}`, with no user id, email or token (NFR-PRIV-7).
3. **The key is fenced in one file.** `supabase/functions/account/admin.ts` is the only file under `supabase/functions/` (vendor excluded) that reads `SUPABASE_SERVICE_ROLE_KEY`. It builds the admin client with `persistSession: false, autoRefreshToken: false` and exports one function, `deleteAuthUser(userId)`. It makes exactly one `auth.admin.deleteUser(` call and has no `.from(`, `.rpc(`, `.storage` or `.schema(` call.
   - The T-0203b AC12 service-role test becomes an allow-list. It is a failure if any file other than `account/admin.ts` matches the read, if `account/admin.ts` has a forbidden call, or if `account/admin.ts` doesn't read the key at all (so a rename can't empty the allow-list silently).
   - D-0053 §4 now reads: "All data reads and writes use a client that carries the caller's JWT, so RLS applies. The only service-role use is `account/admin.ts`, which deletes the verified caller's auth user (D-0135)."
4. **CORS.** `preflightResponse` advertises `Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS`.
5. **No data-model change.** No migration, no new SQL function, no change to `docs/data-model.md`. The existing cascade and its pgTAP test are the proof that the rows go. T-0310b adds a real-stack integration test through the function.
6. **The web side** (D-0136) calls `DELETE ${VITE_SUPABASE_URL}/functions/v1/account` with `Authorization: Bearer <access token>` and `apikey: <anon key>`. It treats only 204 as deleted.

## Consequences
- data (T-0310a): makes the §1 change, regenerates `api.gen.ts` and updates the AC2 operations test. `api.gen.ts` is compiled into `supabase/functions/_shared/vendor/shared/` (D-0053 §1), so the orchestrator runs `node supabase/scripts/vendor.mjs` at merge, and then `--check`.
- backend (T-0310b): implements §2–§4 and edits the AC12 test as §3 describes. It touches `supabase/**`, so it merges through a draft PR and proves its ACs on the real local Supabase stack.
- web (T-0310c, T-0310d): D-0136.
- security-reviewer: reviews `account/admin.ts` and the allow-list test before T-0403 (release check).
- human: production Supabase injects `SUPABASE_SERVICE_ROLE_KEY` into Edge Functions by default. If the project has moved to the new secret API keys, someone has to set the secret by hand. That is an H-item, checked at the first deploy of the `account` function.

## Revisit when
- Supabase removes the legacy service-role key from the Edge Function environment (then read the new secret key in the same one file).
- We add Storage objects or any other per-user data that isn't under an `auth.users` cascade (then the function deletes it first, and this decision names how).
- The security review prefers (a), the `private`-schema SQL function, with a thin `public` wrapper.
