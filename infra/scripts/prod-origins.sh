#!/usr/bin/env bash
# T-0515: narrow prod origins, human-run (D-0190 §4, D-0185 §4, go-live review F-6, H-25).
#   bash infra/scripts/prod-origins.sh          # plan: read-only (default)
#   CONFIRM_PROD_AUTH=<ref> bash infra/scripts/prod-origins.sh apply
# Input from the environment only: SUPABASE_ACCESS_TOKEN.
# Sets the Edge Function secret ALLOWED_ORIGINS (an origin list, not a secret) and the auth
# uri_allow_list (without the two localhost entries), then probes CORS and checks auth drift.
set -euo pipefail

PROD_REF="csgjsdwuxqtuqpuazzpz"
CLI_VERSION="2.118.0"
ORIGINS="https://app.workout.vestgote.com"
ALLOW_LIST="https://app.workout.vestgote.com/**,https://*.workoutlab-web.pages.dev/**"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$here/../.." && pwd)"

mode="${1:-plan}"
case "$mode" in plan | apply) ;; *)
  echo "usage: $0 [plan|apply]" >&2
  exit 2
  ;;
esac

# The lock comes before anything else, so a refusal makes zero calls.
if [ "$mode" = "apply" ] && [ "${CONFIRM_PROD_AUTH:-}" != "$PROD_REF" ]; then
  echo "refusing to apply: set CONFIRM_PROD_AUTH=$PROD_REF" >&2
  exit 1
fi

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"
export SUPABASE_ACCESS_TOKEN

cd "$repo_root"

if [ "$mode" = "plan" ]; then
  echo "== functions secrets (names and digests only) =="
  secrets="$(npx -y "supabase@$CLI_VERSION" secrets list --project-ref "$PROD_REF" 2>&1)"
  if printf '%s\n' "$secrets" | grep -q 'ALLOWED_ORIGINS'; then
    echo "ALLOWED_ORIGINS exists (digest not shown)"
  else
    echo "ALLOWED_ORIGINS is not set (functions use the built-in default list)"
  fi
  echo "would set secret ALLOWED_ORIGINS=$ORIGINS"
  echo "== auth uri_allow_list before/after (preview, GET only) =="
  node infra/scripts/auth-patch.mjs --set "uri_allow_list=$ALLOW_LIST"
  echo "== CORS probe (current state; red until applied) =="
  node infra/scripts/cors-probe.mjs || echo "(probe red: expected before apply)"
  exit 0
fi

echo "== apply: secrets set =="
npx -y "supabase@$CLI_VERSION" secrets set "ALLOWED_ORIGINS=$ORIGINS" --project-ref "$PROD_REF"
echo "== apply: auth uri_allow_list =="
node infra/scripts/auth-patch.mjs --set "uri_allow_list=$ALLOW_LIST" --apply
echo "== wait 10 s for the function secret to reach the runtime =="
sleep 10
echo "== CORS probe =="
node infra/scripts/cors-probe.mjs
echo "== auth drift check =="
node infra/scripts/auth-drift-check.mjs
echo "apply complete"
