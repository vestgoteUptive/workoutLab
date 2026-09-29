---
id: D-0074
title: Enforcing the D-0071 §1 shared-file convention — a check:repo changed-paths rule, why ESLint cannot do it, and the four things the check does not cover
status: revisit
date: 2026-09-29
by: devops (T-0320)
area: infra
---
## Context
D-0071 §1, §2 and §9 are what make the ten Phase 3 children safe to run in parallel: after
T-0318, no feature ticket edits `apps/web/src/lib/i18n/en.ts`, each web-feature ticket owns
exactly its own `lib/i18n/flows/uf-NN.ts`, and `apps/web/eslint.config.mjs` plus
`apps/web/src/app/routes.ts` stay with web-shell. Until T-0320 nothing enforced any of it.
A builder in the UF-10 lane could add a key to `en.ts` or to `flows/uf-06.ts` and every check
in the repo stayed green; the collision surfaced only as a merge conflict, or worse as a
silent overwrite when two branches touched different lines of the same file. T-0325 recorded
the same class of hole for `lib/offline` ("conventional rather than enforced").

Five lanes are about to run at once for the first time. This is the gating risk for the
parallel push, not polish.

## Decision

### 1. ESLint was considered and rejected
`no-restricted-imports` matches an **import specifier**. Editing `en.ts` is not an import of
anything, so no lint rule can see it. Worse, a rule that fired on *importing* `en` would be
actively wrong: every screen legitimately imports `en`. The three T-0318 import bans (D-0071
§9) remain the right tool for cross-feature *imports*; they are simply not the tool for this
question, and this decision does not conflict with D-0071 §9, which only ever claimed the
import bans.

The enforceable mechanism is a **repo-level check over the set of changed paths**, which needs
a diff base. It ships as `.github/scripts/check-lane-paths.mjs`, a `check:repo` sub-check in
the D-0023 shape (exported pure functions, `runCheck(root, opts)`, findings as
`{path, line, rule, message}`, Node built-ins only), registered in `check-all.mjs`.

It decides what a branch may change from three inputs: the ticket id from the branch name
`t/T-NNNN-slug`; the allowed path set from that ticket's `lane:` resolved against
`.squad/ownership.yaml` plus every path its `## Paths you may change` section names; and the
changed paths from `git diff --name-only <merge-base>...HEAD`. Four always-shared paths get
their own rule ids — `shared-i18n-en-edited`, `shared-i18n-other-flow`,
`shared-lint-config-edited`, `shared-routes-edited` — because a generic "not owned" message
buries the lesson D-0071 is about.

### 2. What this does not cover
These four limits are the honest scope of the guarantee. They are repeated verbatim in
`check-lane-paths.mjs`'s header comment, and a test (T-0320 AC-11) fails if either copy loses
one or hedges it with a vaguer word:

1. it needs a `t/T-NNNN-slug` branch and does nothing on `main` or a detached HEAD;
2. it needs a committed diff — uncommitted working-tree edits are invisible;
3. it cannot see a *runtime* violation, only a *file* edit, so a feature reaching a shared
   value some other way (a dynamic `import()`, the `offlineDb()` barrel of T-0325) is out of
   reach;
4. it does not detect two tickets that both legitimately list the same shared file — that
   stays D-0071 §1's "two tickets that list it never run in parallel", an orchestrator rule.

A fifth thing, not a limit but a prerequisite: CI must actually have a diff base.
`.github/workflows/ci.yml`'s `checks` job used a bare `actions/checkout@v4` — shallow, no merge
base — so shipped as-is the check would have silently no-opped on every PR, which is worse
than no check. The job now sets `fetch-depth: 0`, and `checkCiDiffBase()` asserts that the
`checks` job either does so or runs a `git fetch` naming `origin main` before `pnpm
check:repo`. That guard runs unconditionally, before the branch no-op, so a regression is
caught on `main` too. A bare-checkout fixture is the failing contrast.

### 3. The lane correction: this is infra, not web-shell
The board carried T-0320 in `web-shell`. `.squad/ownership.yaml` gives `.github/**` and the
root `package.json` to **infra**, and both the check script and its CI wiring live there.
Nothing under `apps/web/**` changes. Consequence: T-0320 may run in parallel with every
Phase 3 feature ticket and with web-shell — which is the point, since it is the thing that
makes their parallelism safe.

### 4. The listed-extra escape hatch is deliberate
D-0071 §1 already grants it ("listed as an explicit extra path"; T-0301a uses it for
`flows/uf-01.ts`). The check therefore **reads the ticket file**, so the grant and the
enforcement can never drift apart: a path that hits one of the four shared rules *and* appears
in the ticket's `## Paths you may change` section is allowed and silent.

Consequence: **a ticket file is now load-bearing for CI.** A missing or sloppy `## Paths you
may change` section is no longer only a grooming smell — it decides whether a branch passes.
T-0327's build-lane checklist should say so. Two related sharp edges the check handles
deliberately rather than silently:

- A `lane:` value the ownership file does not define — the `split → …` parent form, or a typo
  like `web-featur:UF-10` — yields a `lane-unknown` finding **on the ticket file**, not zero
  findings. An unresolvable lane must be loud rather than a blanket permit.
- A backticked path in a citation ("All infra, per `.squad/ownership.yaml`") or in a
  "Not yours:" bullet is **not** a grant. Without that distinction a grant bullet's own
  footnote would quietly widen the grant.

It does **not** validate that a `## Paths you may change` section is itself sane. A ticket
granting itself `apps/web/**` is a grooming failure, caught at accept, not here.

## Consequences
- `pnpm check:repo` now fails a ticket branch that edits a file its ticket does not own. The
  first Phase 3 feature ticket to add a key to `en.ts` gets a named finding citing D-0071 §1
  instead of a merge conflict later.
- Every ticket file's `## Paths you may change` section must list the paths the branch really
  touches, including the `docs/tickets/T-NNNN-*.md` path when the build writes its accept log.
- Follow-ups this decision does not do: `lib/offline` write-helper enforcement (T-0325's
  `offlineDb()` barrel, same class of problem, different file set); the dynamic-`import()`
  loophole (T-0313); branch protection so a finding actually blocks a merge (T-0402).

## Status
`revisit` (D-0061): the four limits and the citation/denial heuristics in
`listedPathsFromTicket` are the parts most likely to need adjusting once five lanes have run
through the check for real.
