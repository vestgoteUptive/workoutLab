#!/usr/bin/env bash
# T-0543 (D-0201 §4): encrypted pre-release dump of prod. Env only: PROD_DB_URL.
#   bash infra/scripts/prod-backup.sh <out-dir> <sha>
# Writes <out-dir>/backup-<sha>.sql.age (schema public) and, if the role may dump it,
# <out-dir>/backup-<sha>-auth.sql.age. Plaintext only ever flows through a pipe into `age`; the
# dump is never printed. Fails if the recipient file is still the placeholder.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
recipient="${AGE_RECIPIENT_FILE:-$here/../backup/age-recipient.txt}"
out_dir="${1:?usage: prod-backup.sh <out-dir> <sha>}"
sha="${2:?usage: prod-backup.sh <out-dir> <sha>}"
: "${PROD_DB_URL:?PROD_DB_URL is required}"

case "$sha" in *[!0-9a-f]* | "") echo "sha must be lowercase hex" >&2; exit 2 ;; esac

if ! grep -Eq '^age1[0-9a-z]{50,}[[:space:]]*$' "$recipient" 2>/dev/null; then
  echo "refusing: $recipient has no age public key (still the placeholder, see H-28)" >&2
  exit 1
fi

mkdir -p "$out_dir"
umask 077

rest="${PROD_DB_URL#*://}"
userinfo="${rest%%@*}"
hostport="${rest#*@}"
db_pass="${userinfo#*:}"
db_host="${hostport%%[:/]*}"
esc() { printf '%s' "$1" | sed 's/[][\.*^$/&|]/\\&/g'; }
# M3 (T-0543): the repo is public, so its logs are too. Postgres DETAIL lines carry row values.
redact_rows() {
  sed -e 's/^\([[:space:]]*DETAIL:\).*/\1 <redacted>/' \
    -e 's/Failing row contains.*/Failing row contains <redacted>/' \
    -e 's/Key (.*)=(.*/Key (<redacted>)=(<redacted>)/'
}
mask_secrets() {
  local p h
  p="$(esc "$db_pass")"
  h="$(esc "$db_host")"
  if [ -n "$db_pass" ] && [ -n "$db_host" ]; then sed -e "s|$p|***|g" -e "s|$h|<host>|g"
  elif [ -n "$db_pass" ]; then sed -e "s|$p|***|g"
  else cat; fi
}
mask() { redact_rows | mask_secrets; }

# L2: connection settings and the password go through the environment, never argv.
urldecode() { printf '%b' "${1//%/\\x}"; }
db_user="$(urldecode "${userinfo%%:*}")"
PGPASSWORD="$(urldecode "$db_pass")"
PGHOST="$db_host"
db_rest="${hostport#*:}"
if [ "$db_rest" = "$hostport" ]; then PGPORT=5432; else PGPORT="${db_rest%%/*}"; fi
PGDATABASE="${hostport#*/}"
PGDATABASE="${PGDATABASE%%\?*}"
export PGUSER="$db_user" PGPASSWORD PGHOST PGPORT PGDATABASE

dump() { # <schema> <outfile>; stderr is masked, stdout (the dump) goes only into age
  local schema="$1" file="$2" err
  err="$(mktemp)"
  if pg_dump --schema="$schema" --no-owner --no-privileges 2>"$err" |
    age -R "$recipient" -o "$file"; then
    mask <"$err" >&2
    rm -f "$err"
    return 0
  fi
  mask <"$err" >&2
  rm -f "$err" "$file"
  return 1
}

main_file="$out_dir/backup-$sha.sql.age"
if ! dump public "$main_file"; then
  echo "backup of schema public failed; aborting the release" >&2
  exit 1
fi
[ -s "$main_file" ] || { echo "backup file is empty; aborting" >&2; exit 1; }
echo "backup written: $(basename "$main_file") ($(wc -c <"$main_file") bytes)"

if dump auth "$out_dir/backup-$sha-auth.sql.age"; then
  echo "backup written: backup-$sha-auth.sql.age"
else
  echo "auth schema skipped: the pooler role may not dump it"
fi
