---
id: TR-0047
status: resolved
raised_by: devops on T-0500
date: 2026-10-05
---
# TR-0047 T-0500: prod `mailer_otp_length` is 8, UF-01.5 verifies 6 digits

## Finding
The first live drift check (read-only GET) shows prod `mailer_otp_length` = 8. `apps/web/src/lib/auth/magic-link.ts` accepts only `/^\d{6}$/` (UF-01.5, D-0045 §5), so entering the emailed code on prod would fail. Every other managed key matches D-0011 (allow-list matches as a set).

## Options
1. Set `mailer_otp_length` to 6 in the Supabase dashboard (H-08 hand-managed). Then `node infra/scripts/auth-drift-check.mjs` exits 0 and shows `auth config matches expected (6 keys)`.
2. Change the web code to accept 8 digits (and update the spec). Then expected-auth.json changes to 8.

`expected-auth.json` keeps 6 (the intended value) so the check stays red until resolved. Nothing was written to prod.

## Resolution (2026-10-05)
The human set prod **Email OTP Length = 6** in the Supabase dashboard (D-0185 §4: prod auth stays hand-managed). Re-ran `node infra/scripts/auth-drift-check.mjs`: `auth config matches expected (6 keys)`, exit 0. `infra/auth/expected-auth.json` stays at 6, matching UF-01.5 (`maxLength={6}`), D-0045 §5 and local `supabase/config.toml`.
