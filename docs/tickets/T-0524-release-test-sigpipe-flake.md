# T-0524: supabase-prod-release test flakes with exit 141 (SIGPIPE)

## Why
`T-0402b AC-1 plan is the default and read-only` failed intermittently under load with exit 141. The script pipes `printf 'header = ...' | curl -K -`; the stub `curl` never read stdin, so if it exited before `printf` wrote, `printf` got SIGPIPE and `pipefail` returned 141. Real curl drains stdin, so the script has no race; the stub was wrong.

## Acceptance criteria
- AC-1: the stub `curl` drains stdin; the test passes 100/100 runs under CPU load.
- AC-2: script and its `pipefail`/masking are unchanged; T-0402b and T-0513 tests stay green.

## Build / accept log
- Red on unfixed code: 11 failures in 100 runs (8 busy-loop CPU hogs running).
- Fix: `cat >/dev/null` first in the curl stub (test file only).
- After: 0 failures in 100 runs under the same load.
