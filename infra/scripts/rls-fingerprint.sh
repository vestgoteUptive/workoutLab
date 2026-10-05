#!/usr/bin/env bash
# T-0402c AC-4: read-only RLS fingerprint of a database's `public` schema (D-0184 §6, D-0186 §1).
#   bash infra/scripts/rls-fingerprint.sh DB_URL            # local Docker (after supabase db reset)
#   bash infra/scripts/rls-fingerprint.sh PROD_DB_URL       # prod, human-run (session pooler string)
#   bash infra/scripts/rls-fingerprint.sh DB_URL --dump     # print the lines (schema metadata only)
# The argument is the NAME of the environment variable that holds the connection string, so the
# string never appears in argv or shell history. Prints `lines=<n> sha256=<hex>`.
# Read-only twice over: PGOPTIONS sets default_transaction_read_only, and the query runs inside
# `begin transaction read only` (in case a pooler drops startup options).
# psql: $PSQL, else `psql` on PATH, else the local Supabase postgres image through podman/docker.
set -euo pipefail

usage() {
  echo "usage: $0 <db-url-env-var-name> [--dump]" >&2
  exit 2
}

var="${1:-}"
[ -n "$var" ] || usage
[[ "$var" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || usage
dump=0
case "${2:-}" in
  "") ;;
  --dump) dump=1 ;;
  *) usage ;;
esac

url="${!var:-}"
if [ -z "$url" ]; then
  echo "error: $var is not set" >&2
  exit 2
fi

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sql="$here/rls-fingerprint.sql"
PSQL_IMAGE="${PSQL_IMAGE:-public.ecr.aws/supabase/postgres:17.11.0.002}"

# Masking: replace the URL's password and host in anything printed on failure.
rest="${url#*://}"
userinfo="${rest%%@*}"
hostport="${rest#*@}"
db_pass=""
[ "$userinfo" != "$rest" ] && [ "${userinfo#*:}" != "$userinfo" ] && db_pass="${userinfo#*:}"
db_host="${hostport%%[:/?]*}"
esc() { printf '%s' "$1" | sed 's/[][\.*^$/&|]/\\&/g'; }
mask() {
  local s
  s="$(cat)"
  [ -n "$db_pass" ] && s="$(printf '%s' "$s" | sed "s|$(esc "$db_pass")|***|g")"
  [ -n "$db_host" ] && s="$(printf '%s' "$s" | sed "s|$(esc "$db_host")|<host>|g")"
  printf '%s\n' "$s"
}

input() {
  echo "begin transaction read only;"
  cat "$sql"
  echo "rollback;"
}

export WL_FP_DB_URL="$url"
export PGOPTIONS='-c default_transaction_read_only=on'
run_psql() {
  local args=(-X -q -At -v ON_ERROR_STOP=1 -f -)
  if [ -n "${PSQL:-}" ]; then
    "$PSQL" "$WL_FP_DB_URL" "${args[@]}"
  elif command -v psql > /dev/null 2>&1; then
    psql "$WL_FP_DB_URL" "${args[@]}"
  else
    local engine
    engine="$(command -v podman || command -v docker || true)"
    if [ -z "$engine" ]; then
      echo "error: no psql, podman or docker found (set PSQL=/path/to/psql)" >&2
      return 2
    fi
    "$engine" run --rm -i --network host -e WL_FP_DB_URL -e PGOPTIONS --entrypoint sh "$PSQL_IMAGE" \
      -c 'exec psql "$WL_FP_DB_URL" -X -q -At -v ON_ERROR_STOP=1 -f -'
  fi
}

errf="$(mktemp)"
trap 'rm -f "$errf"' EXIT
if ! out="$(input | run_psql 2> "$errf")"; then
  echo "error: psql failed:" >&2
  mask < "$errf" >&2
  exit 1
fi

out="$(printf '%s\n' "$out" | sed '/^$/d')"
n="$(printf '%s\n' "$out" | grep -c . || true)"
if [ "$n" = "0" ]; then
  echo "error: the query returned no lines" >&2
  exit 1
fi
if command -v sha256sum > /dev/null 2>&1; then
  hash="$(printf '%s\n' "$out" | sha256sum | cut -d' ' -f1)"
else
  hash="$(printf '%s\n' "$out" | shasum -a 256 | cut -d' ' -f1)"
fi
[ "$dump" = "1" ] && printf '%s\n' "$out"
echo "lines=$n sha256=$hash"
