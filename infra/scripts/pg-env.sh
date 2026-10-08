# Shared by prod-backup.sh and supabase-prod-release.sh (T-0554). Source it; do not run it.
# Needs: userinfo, hostport, db_pass, db_host (parsed from PROD_DB_URL by the caller).
# L2: connection settings and the password go through the environment, never argv.
urldecode() { printf '%b' "${1//%/\\x}"; }
db_user="$(urldecode "${userinfo%%:*}")"
PGPASSWORD="$(urldecode "$db_pass")"
PGHOST="$db_host"
db_rest="${hostport#*:}"
if [ "$db_rest" = "$hostport" ]; then PGPORT=5432; else PGPORT="${db_rest%%/*}"; fi
PGDATABASE="${hostport#*/}"
PGDATABASE="${PGDATABASE%%\?*}"
PGSSLMODE=require # N4: the URL query string is not parsed, so force TLS here
export PGSSLMODE PGUSER="$db_user" PGPASSWORD PGHOST PGPORT PGDATABASE
