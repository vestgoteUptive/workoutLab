---
id: T-0004
title: CI checks — screen IDs exist in v2 flows and no v1 labels; unique D-NNNN ids; placeholder tests flagged
lane: infra
screens: []
decisions: [D-0002, D-0016, D-0023]
deps: [T-0002]
status: ready
---
## Why
D-0002 makes user flows v2 the only source of screen IDs. v1 and v2 reuse the same numbers
for different screens (v1 `UF-06 Logging` is v2 UF-06 Progress), so a stale ID in a ticket
sends an agent to the wrong screen. Parallel runs have already produced two decision files with
the same number (T-0002 accept pass 2, `.squad/state.md`). The T-0002 bootstrap (D-0016) left
placeholder tests that keep `pnpm -w test` green without testing anything. Once the owning lane
ships, they must go. D-0023 turns all three risks into CI failures and defines the rules.

## Scope
- In:
  - `.github/scripts/check-screen-ids.mjs`: (a) every `UF-NN`, `UF-NN.n` or `UF-NN.*` in
    `docs/PRD.md`, `docs/specs/**/*.md` and `docs/tickets/**/*.md` exists in the flow index of
    `Design-docs/docs/product/user-flows.md` (D-0023 rule 1); (b) no v1 flow label appears
    (D-0023 rule 2).
  - `.github/scripts/check-decision-ids.mjs`: no two files in `.squad/decisions/` share a D-number,
    and each frontmatter `id:` matches its filename (D-0023 rule 3).
  - `.github/scripts/check-placeholder-tests.mjs`: the `@placeholder T-NNNN` rules in D-0023
    rule 4, reading ticket status from `.squad/board.md` and the branch from `GITHUB_HEAD_REF`,
    then `GITHUB_REF_NAME`, then `git rev-parse --abbrev-ref HEAD`. A `--branch <name>` flag
    overrides all three, for tests.
  - `.github/scripts/check-all.mjs` runs all three and exits 1 if any fails.
  - Each script exports a pure function (file contents in, findings out), plus a thin CLI.
    Findings print one per line as `<repo-relative path>:<line>: <rule>: <message>`. Exit 0 means
    no findings. Exit 1 means one or more.
  - Node ESM, Node ≥ 22, no new dependencies, no network access. Tests use `node:test` with
    fixtures in `.github/scripts/__fixtures__/`.
  - Wiring: root `package.json` gets `"check:repo": "node .github/scripts/check-all.mjs"` and
    `"test:repo-checks": "node --test .github/scripts/"`. Root `test` becomes
    `turbo run test && pnpm test:repo-checks`. The CI `checks` job runs `pnpm check:repo` after
    `format:check`.
  - Add the comment `// @placeholder T-NNNN` to the four bootstrap tests (initial tags in
    D-0023 rule 4). No other change to those files.
- Out:
  - Duplicate TR-NNNN ids in `.squad/triage/`. Revisit in D-0023.
  - Checking screen IDs in code, commit messages or PR titles.
  - Fixing any finding in files the infra lane doesn't own. A finding on current main becomes
    a follow-up to the owning lane. Never an allowlist entry, and never a weaker rule.
  - Component IDs (C-01, C-02).

## Acceptance criteria
Every AC is a `node:test` case in `.github/scripts/*.test.mjs`. Each one builds its input from
fixture strings or a temporary directory, unless it names the real repo.

**Screen IDs (a)**
- AC1 Given a flow index whose UF-09 row reads `.1–.9 (below)` and a ticket fixture that cites
  `UF-09.9`, When the screen-ID check runs, Then it returns 0 findings.
- AC2 Given the same index and a ticket fixture that cites UF-09 with step `.10` on line 4,
  When the check runs, Then it returns exactly 1 finding: the fixture path, line `4`, rule
  `unknown-screen-id`, and the offending ID.
- AC3 Given the same index and a spec fixture that cites a flow numbered `12`, which is not in
  the index, When the check runs, Then it returns 1 `unknown-screen-id` finding. Given a fixture
  that cites `UF-10.*` or `UF-01.5`, Then it returns 0 findings.
- AC4 Given the intro sentence of the real `user-flows.md`, which uses UF-09 with step `.10` as
  an example, When the valid set is built, Then that ID is not in it. Only the flow index table
  counts.
- AC5 Given a PRD fixture with the plain text `UF-06 Logging` on line 7, When the check runs,
  Then it returns 1 finding with line `7` and rule `v1-label`. The same holds for each of the
  nine labels in D-0023 rule 2, in any case, with the separators ` `, `: `, ` — `, ` - ` and
  ` · ` (9 labels × 5 separators, table-driven).
- AC6 Given fixtures containing `` `UF-08 Balance` `` (inline code), the same label inside a
  ```` ``` ```` fenced block, and the text `was v1 UF-08 Balance`, When the check runs, Then
  it returns 0 `v1-label` findings.
- AC7 Given the v2 label `UF-06 Progress` or `UF-08 Session setup`, When the check runs, Then it
  returns 0 findings.
- AC8 Given the file `docs/tickets/_template.md` containing `UF-xx.n`, When the check runs, Then
  it returns 0 findings, because a non-numeric placeholder is not an ID.
- AC9 Given a repo fixture with no `docs/specs/` directory, When the CLI runs, Then it exits 0
  and does not crash. Given a fixture where `Design-docs/docs/product/user-flows.md` is missing
  or has no flow index table, Then it exits 1 with rule `flow-index-missing`, so it never passes
  by validating against an empty set.
- AC10 Given a fixture with CRLF line endings, When the check runs, Then the line numbers match
  the LF version of the same fixture.

**Decision ids (b)**
- AC11 Given `.squad/decisions/` containing `D-0015-set-sync-upsert.md` and
  `D-0015-bootstrap-scaffold-ownership.md`, When the decision-ID check runs, Then it returns
  1 `duplicate-decision-id` finding that names `D-0015` and both paths.
- AC12 Given `D-0019-foo.md` with frontmatter `id: D-0020`, When the check runs, Then it returns
  1 `decision-id-mismatch` finding. Given a file with no `id:` line, Then it returns 1
  `decision-id-missing` finding.
- AC13 Given `D-0007-domains.md`, `D-0009-domains-workout.md` and `D-0010-domains-app-subdomain.md`
  (the same subject, different numbers), When the check runs, Then it returns 0 findings.
  Files without a `D-NNNN-` prefix, such as a `README.md`, are ignored.

**Placeholder tests (c)**
- AC14 Given a test file with `// @placeholder T-0309` and a board where T-0309 is `todo`, When
  the check runs on branch `t/T-0003-design-tokens`, Then it returns 0 findings.
- AC15 Given the same file and board, When the check runs with `--branch t/T-0309-landing`, Then
  it returns 1 `placeholder-on-owning-branch` finding.
- AC16 Given the same file and a board where the T-0309 row's status is `done`, When the check
  runs on any branch, including `main`, Then it returns 1 `placeholder-ticket-done` finding.
- AC17 Given a test file containing `expect(true).toBe(true)` and no marker, When the check runs,
  Then it returns 1 `untagged-placeholder` finding. The same holds for `expect(1)`, `expect("x")`,
  `expect(null)` and `expect(undefined)`. Given `expect(ENGINE_VERSION).toBe("0.0.0")`, Then it
  returns 0 findings.
- AC18 Given `// @placeholder T-9999` and a board with no T-9999 row, When the check runs, Then it
  returns 1 `placeholder-unknown-ticket` finding.
- AC19 Given no branch source (no env vars, no `--branch`, not a git repo), When the check runs,
  Then it skips only the owning-branch rule, applies the rest, and does not crash.
- AC20 Given test files under `node_modules/` that contain `expect(true)`, When the check runs,
  Then they are ignored.

**Wiring and current repo**
- AC21 Given the real repo on this branch, where the four bootstrap tests carry their D-0023
  markers and none of T-0300, T-0309, T-0200 or T-0102 is `done`, When `pnpm check:repo` runs,
  Then it exits 0. If it finds anything in a file outside the infra lane, record the finding as a
  follow-up and raise it in the result. Don't edit that file, and don't weaken the rule.
- AC22 Given `.github/workflows/ci.yml`, When it is parsed, Then the `checks` job has a step
  `pnpm check:repo` that runs after `pnpm format:check`. Given the root `package.json`, Then
  `scripts.test` runs `test:repo-checks`, so `pnpm -w test` runs AC1–AC20.
- AC23 Given the scripts in `.github/scripts/`, When their imports are listed, Then they import
  only `node:` built-ins. The check is a test, not a review note.

## Paths you may change
Infra lane: `.github/**` (scripts, fixtures, tests, `workflows/ci.yml`), `package.json`,
`eslint.config.mjs` and `.prettierignore` (only if the new `.mjs` files or fixtures need them).
Also, for this ticket only, one added comment line `// @placeholder T-NNNN` in each of:
- `apps/web/src/app/App.test.tsx` (T-0300)
- `apps/landing/test/placeholder.test.ts` (T-0309)
- `packages/engine/test/index.test.ts` (T-0200)
- `packages/shared/test/index.test.ts` (T-0102)

## Contract impact
none. D-0023 is a process decision and changes no contract.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `pnpm check:repo` exits 0 on the
branch · contracts unchanged · commit messages start with `T-0004`.
