---
id: T-0983
title: "Root-cause the UF-01.5 AC-14 save-writes e2e failure under load (writes recorded as [] instead of area_targets, profiles)"
lane: qa
screens: [UF-01.5, UF-02.1]
decisions: [D-0197]
deps: []
status: ready
---
## Why
During T-0981 (2026-11-23), `tests/e2e/uf-01-onboarding.spec.ts` line ~369 (UF-01.5 AC-14) failed once in 140 runs under CPU pressure: `expect(writes.map((w) => w.table)).toEqual(["area_targets", "profiles"])` received `[]`, although UF-02.1 was already visible. Either the recorder misses requests (route registration order, a request served from another handler, or the write sent after the screen changes), or the app shows UF-02.1 before the writes are sent (a product defect: onboarding data could be lost on a fast close).

## Scope
- In: reproduce, find which of the two it is with evidence, fix the test if it is the test; if it is the app, report it with file:line and a proposed fix (and a follow-up ticket for the web lane).
- Out: app code changes in this ticket.

## Acceptance criteria
- AC1 The log names the cause with evidence (request timeline from a reproduced run).
- AC2 If test-side: the test waits on the real writes (e.g. `waitForRequest`) rather than reading the recorder once; `--repeat-each 30` under load is green.
- AC3 If app-side: a follow-up ticket exists with the defect, and the test keeps failing on it rather than being loosened.
- AC4 A planted fault (profile write dropped) still turns the test red.

## Paths you may change
`tests/e2e/**`

## Contract impact
none.

## Definition of done
Every AC has evidence · `-w lint:e2e`, `-w format:check` green · commit messages start with `T-0983`.

## Build / accept log
