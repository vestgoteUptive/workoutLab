# Prod auth drift check (T-0500)

Prod auth settings are hand-managed in the Supabase dashboard (D-0185, H-08). This check notices
when one of the managed keys moves.

- `expected-auth.json` lists the managed keys, their expected values and derived booleans. It is
  secret-free: no secret values, only booleans such as `*_matches` / `*_set`.
- `infra/scripts/auth-drift-check.mjs` sends one `GET .../config/auth`, keeps only the listed keys
  before anything is printed, and diffs them. Read-only; never runs in CI (the access token stays
  local).

```sh
set -a; . <repo>/.env.local; set +a; node infra/scripts/auth-drift-check.mjs          # exit 0 match, 1 drift, 2 error
set -a; . <repo>/.env.local; set +a; node infra/scripts/auth-drift-check.mjs --print  # filtered live keys (before/after)
```

`uri_allow_list` is compared as a set (live order differs from D-0011).

**Rule (D-0185 §4):** a ticket that changes a live auth key updates `expected-auth.json` and this
file in the same ticket, shows before/after with `--print`, and runs the check afterwards.
