#!/usr/bin/env bash
# T-0514b: manual production deploy, human-run while GitHub Actions runners are down (D-0189).
# Agents never run this with `deploy`. Mirrors the `production` job in .github/workflows/deploy.yml.
#   bash infra/scripts/deploy-prod.sh          # checks + builds + bundle scan (no upload)
#   bash infra/scripts/deploy-prod.sh deploy   # the same, then uploads both sites to production
# Inputs (environment or repo-root .env.local): PROD_SUPABASE_PUBLISHABLE_KEY (sb_publishable_...),
# and for `deploy` CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
# Test-only overrides (used by .github/scripts/deploy-prod.test.mjs, never needed by hand):
#   DEPLOY_DIST_ROOT  directory holding apps/web/dist and apps/landing/dist (default: . = the repo)
#   DEPLOY_ENV_FILE   env file to source instead of <repo>/.env.local
set -euo pipefail

WRANGLER=4.147.0
PNPM=pnpm@10.28.2
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
cd "$repo"

mode="${1:-build}"
case "$mode" in build | deploy) ;; *)
  echo "usage: $0 [deploy]" >&2
  exit 2
  ;;
esac

env_file="${DEPLOY_ENV_FILE:-$repo/.env.local}"
if [ -f "$env_file" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
fi

dist_root="${DEPLOY_DIST_ROOT:-.}"
web_dist="$dist_root/apps/web/dist"
landing_dist="$dist_root/apps/landing/dist"

echo "== checks"
case "${PROD_SUPABASE_PUBLISHABLE_KEY:-}" in
  sb_publishable_?*) ;;
  *)
    echo "PROD_SUPABASE_PUBLISHABLE_KEY is unset or not an sb_publishable_ key; stop" >&2
    exit 1
    ;;
esac
git fetch -q origin
[ -z "$(git status --porcelain)" ] || { echo "working tree not clean; stop" >&2; exit 1; }
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "not on main; stop" >&2; exit 1; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "HEAD is not origin/main; stop" >&2; exit 1; }
sha="$(git rev-parse HEAD)"
echo "deploying main @ $(git rev-parse --short HEAD)"

project_ref="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).project_ref)' "$repo/infra/auth/expected-auth.json")"
[ -n "$project_ref" ] || { echo "no project_ref in infra/auth/expected-auth.json; stop" >&2; exit 1; }
supabase_url="https://${project_ref}.supabase.co"
unset PUBLIC_APP_URL # landing CTA defaults to the prod app (T-0309)

echo "== build"
npx -y "$PNPM" install --frozen-lockfile >/dev/null
# The VITE_ values exist only for the build commands.
build() {
  VITE_SUPABASE_URL="$supabase_url" VITE_SUPABASE_ANON_KEY="$PROD_SUPABASE_PUBLISHABLE_KEY" \
    npx -y "$PNPM" --filter "$1" build
}
build @workoutlab/design-tokens
build @workoutlab/web
# The landing is always built in-root, into apps/landing/dist (go-live review F-7).
build @workoutlab/landing

echo "== bundle secret scan (expect clean)"
node "$here/bundle-secret-scan.mjs" "$web_dist" "$landing_dist"

if [ "$mode" != deploy ]; then
  echo "build ok; re-run with 'deploy' to upload"
  exit 0
fi

echo "== upload (production branch = main)"
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
npx -y "wrangler@$WRANGLER" pages deploy "$web_dist" --project-name workoutlab-web --branch main --commit-hash "$sha" --commit-dirty=false
npx -y "wrangler@$WRANGLER" pages deploy "$landing_dist" --project-name workoutlab-landing --branch main --commit-hash "$sha" --commit-dirty=false

echo "== security headers (read-only)"
curl -sI https://app.workout.vestgote.com
curl -sI https://workout.vestgote.com
echo "DEPLOY_COMPLETE"
