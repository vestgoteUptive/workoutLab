#!/usr/bin/env bash
# T-0402b: prod Supabase release; human-run or run by CI (D-0201). Gate 3, H-19.
#   bash infra/scripts/supabase-prod-release.sh          # plan: read-only (default)
#   CONFIRM_PROD_RELEASE=<ref> bash infra/scripts/supabase-prod-release.sh apply
# Inputs from the environment only: SUPABASE_ACCESS_TOKEN, PROD_DB_URL (session pooler string).
set -euo pipefail

PROD_REF="csgjsdwuxqtuqpuazzpz"
CLI_VERSION="2.118.0"
FUNCTIONS=(workouts balance sessions account)

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tf_main="$here/../terraform/supabase-prod/main.tf"
repo_root="$(cd "$here/../.." && pwd)"

mode="${1:-plan}"
case "$mode" in plan | apply) ;; *)
  echo "usage: $0 [plan|apply]" >&2
  exit 2
  ;;
esac

# Locks for apply come before anything else, so a refusal makes zero CLI calls.
if [ "$mode" = "apply" ] && [ "${CONFIRM_PROD_RELEASE:-}" != "$PROD_REF" ]; then
  echo "refusing to apply: set CONFIRM_PROD_RELEASE=$PROD_REF" >&2
  exit 1
fi

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"
: "${PROD_DB_URL:?PROD_DB_URL is required (session pooler connection string)}"
export SUPABASE_ACCESS_TOKEN

tf_ref="$(sed -n 's/^[[:space:]]*id[[:space:]]*=[[:space:]]*"\([a-z0-9]*\)".*/\1/p' "$tf_main" | head -n1)"
if [ "$tf_ref" != "$PROD_REF" ]; then
  echo "prod ref constant differs from $tf_main import ID; aborting" >&2
  exit 1
fi

# Masking: replace the DB URL's password and host in everything printed.
rest="${PROD_DB_URL#*://}"
userinfo="${rest%%@*}"
hostport="${rest#*@}"
db_pass="${userinfo#*:}"
db_host="${hostport%%[:/]*}"
esc() { printf '%s' "$1" | sed 's/[][\.*^$/&|]/\\&/g'; }
# M3 (T-0543): the repo is public, so its logs are too. Postgres DETAIL lines carry row values.
redact_rows() {
  sed -e 's/^\([[:space:]]*[Dd][Ee][Tt][Aa][Ii][Ll]:\).*/\1 <redacted>/' \
    -e 's/\(ERROR:\).*\((SQLSTATE [0-9A-Z]*)\).*/\1 <redacted> \2/' \
    -e t \
    -e 's/^\(psql:.*: ERROR:\)[[:space:]]*\([0-9A-Z]\{5\}\)[[:space:]]*$/\1  \2/' \
    -e t \
    -e 's/^\(psql:.*: ERROR:\).*/\1 <redacted>/' \
    -e t \
    -e 's/^\([[:space:]]*ERROR:\).*/\1 <redacted>/' \
    -e 's/\(invalid input syntax[^:]*:\).*/\1 <redacted>/' \
    -e 's/Failing row contains.*/Failing row contains <redacted>/' \
    -e 's/Key (.*)=(.*/Key (<redacted>)=(<redacted>)/'
}
mask_secrets() {
  local -a ex=()
  local v
  for v in "$db_pass" "${PGPASSWORD:-}"; do
    [ -n "$v" ] && ex+=(-e "s|$(esc "$v")|***|g")
  done
  [ -n "$db_host" ] && ex+=(-e "s|$(esc "$db_host")|<host>|g")
  if [ "${#ex[@]}" -gt 0 ]; then sed "${ex[@]}"; else cat; fi
}
mask() { redact_rows | mask_secrets; }

# T-0554: psql reads PG* env vars (PGSSLMODE=require), so no secret is ever in argv.
# shellcheck source=pg-env.sh
. "$here/pg-env.sh"

sb() { npx -y "supabase@$CLI_VERSION" "$@" 2>&1 | mask; }

cd "$repo_root"

plan() {
  echo "== migration list (local vs remote) =="
  sb migration list --db-url "$PROD_DB_URL"
  echo "== db push dry run =="
  local out n
  out="$(sb db push --db-url "$PROD_DB_URL" --include-seed --dry-run)"
  printf '%s\n' "$out"
  n="$(printf '%s\n' "$out" | grep -cE '[0-9]{14}_[A-Za-z0-9_]+\.sql' || true)"
  echo "== deployed functions (names and status only) =="
  printf 'header = "Authorization: Bearer %s"\n' "$SUPABASE_ACCESS_TOKEN" |
    curl -sS -K - "https://api.supabase.com/v1/projects/$PROD_REF/functions" |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s);if(!Array.isArray(a))throw 0;console.log(a.length?a.map(f=>f.slug+" "+f.status).join("\n"):"(none)")}catch{console.log("(could not read function list)")}})' | mask
  echo "would apply $n migrations + seed (always); would deploy: ${FUNCTIONS[*]}"
  PENDING="$n"
}

if [ "$mode" = "plan" ]; then
  plan
  exit 0
fi

echo "== apply: db push =="
# --yes: no TTY in CI, so never wait on the CLI prompt (T-0543). The confirm lock above is the gate.
sb db push --db-url "$PROD_DB_URL" --include-seed --yes
# T-0554: the CLI skips a changed seed.sql ("Remote database is up to date"), so apply it ourselves.
# The seed is an idempotent upsert (migration-guard checkSeed is an allow-list of upserts).
echo "== apply: seed (always) =="
if ! { psql -X -v VERBOSITY=sqlstate -v ON_ERROR_STOP=1 --single-transaction -f supabase/seed.sql 2>&1 | mask; }; then
  echo "seed failed; not deploying functions" >&2
  exit 1
fi
for f in "${FUNCTIONS[@]}"; do
  echo "== deploy $f =="
  sb functions deploy "$f" --project-ref "$PROD_REF"
done
echo "== plan after apply =="
plan
if [ "$PENDING" != "0" ]; then
  echo "migrations still pending after apply; stop and investigate" >&2
  exit 1
fi
echo "apply complete; nothing pending"
