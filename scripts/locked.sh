#!/usr/bin/env bash
# Machine-wide test locks (D-0169). Every test, typecheck or lint run goes through this script:
#   scripts/locked.sh heavy <command> [args...]   full gates, turbo -w runs, any playwright e2e
#   scripts/locked.sh small <command> [args...]   vitest on named files, planted-fault runs
# One heavy and one small run may go at once (8 cores; e2e needs port 4173, so it is always heavy).
# The command is killed after WL_LOCK_TIMEOUT seconds (default 1800 heavy, 300 small) so a hang
# frees the lock; exit 124 means it hung. Inside a locked run, a nested call runs unlocked (no
# deadlock), except that a heavy call inside a small run is refused. Each run appends wait and hold seconds to ~/.cache/wl-pw-tmp/lock-log.tsv.
set -u
kind=${1:-}
shift || true
case "$kind" in
  heavy) lock=/tmp/workoutlab-tests.lock limit=${WL_LOCK_TIMEOUT:-1800} ;;
  small) lock=/tmp/workoutlab-tests-small.lock limit=${WL_LOCK_TIMEOUT:-300} ;;
  *)
    echo "usage: scripts/locked.sh heavy|small <command> [args...]" >&2
    exit 64
    ;;
esac
if [ $# -eq 0 ]; then
  echo "locked.sh: no command given" >&2
  exit 64
fi
if [ "${WL_LOCK_HELD:-}" = small ] && [ "$kind" = heavy ]; then
  echo "locked.sh: a heavy run inside a small one; wrap the outer command as heavy" >&2
  exit 64
fi
if [ -n "${WL_LOCK_HELD:-}" ]; then
  exec timeout --kill-after=10 "$limit" "$@"
fi

log=${WL_LOCK_LOG:-$HOME/.cache/wl-pw-tmp/lock-log.tsv}
mkdir -p "$(dirname "$log")"
t0=$(date +%s)
exec 9>"$lock"
if ! flock -w 3600 9; then
  echo "locked.sh: waited an hour for $lock; giving up" >&2
  exit 75
fi
t1=$(date +%s)
WL_LOCK_HELD=$kind timeout --kill-after=10 "$limit" "$@" 9>&-
rc=$?
t2=$(date +%s)
printf '%s\t%s\twait=%s\thold=%s\texit=%s\t%s\t%s\n' "$(date -d "@$t0" +%FT%T)" "$kind" \
  $((t1 - t0)) $((t2 - t1)) "$rc" "$PWD" "$*" >>"$log"
if [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; then
  echo "locked.sh: '$*' ran past ${limit}s and was killed. A test hangs: find it by running your" \
    "files alone; don't just rerun." >&2
fi
exit "$rc"
