---
id: T-1017
title: "CI: the T-0934 inherited-TMPDIR test used a made-up /inherited-tmp, which fails with EACCES on GitHub's non-root runner"
lane: infra
screens: []
decisions: [D-0271, D-0285]
deps: []
status: done
---
## Why
PR #75 CI run 45364169366: `.github/scripts/check-vitest-tmp.test.mjs` "T-0934 AC5: an inherited WL_VITEST_TMP_DIR is returned as is" failed with `EACCES: permission denied, mkdir '/inherited-tmp/tsx-1001'`. The test passed locally because the container runs as root; tsx writes its cache under TMPDIR.

## Acceptance criteria
- AC1 The test uses a real writable temp folder for the inherited TMPDIR and removes it afterwards; it passes as a non-root user.

## Paths you may change
- `.github/scripts/check-vitest-tmp.test.mjs`

## Contract impact
none.

## Build / accept log
- 2026-11-24 orchestrator: `TMPDIR` now a `mkdtemp` folder; `node --test .github/scripts/check-vitest-tmp.test.mjs` 15/15.
