---
id: T-0320
title: Enforce the D-0071 §1 shared-file convention — a `check:repo` changed-paths rule that fails when a ticket branch edits a file its ticket does not own (`lib/i18n/en.ts`, another flow's `lib/i18n/flows/uf-NN.ts`, `eslint.config.mjs`, `app/routes.ts`)
lane: infra
screens: []
decisions: [D-0023, D-0060, D-0067, D-0071, D-0074]
deps: [T-0318]
status: ready
---
<!-- Written by product-owner 2026-09-29 (spec mode) from the T-0318 accept log follow-up, D-0071 §1/§9/§11 and `.squad/ownership.yaml`. Build flow: wl-build-infra. About ½ day. Lane moved from the board's `web-shell` to `infra`: `.github/**` and the root `package.json` belong to infra in `.squad/ownership.yaml`, and this ticket's whole mechanism lives there. See "Lane" below. -->

## Why
T-0318's entire value is that the ten Phase 3 children can run in parallel. That guarantee is exactly D-0071 §1, §9 and §11: after T-0318, **no feature ticket edits `lib/i18n/en.ts`**, each feature owns **only** its own `lib/i18n/flows/uf-NN.ts`, and routes plus `eslint.config.mjs` stay with web-shell. Nothing mechanically stops any of that. A builder in the UF-10 lane can add a key to `en.ts` or to `flows/uf-06.ts` and every check in the repo stays green — the collision only surfaces as a merge conflict, or worse, as a silent overwrite when the two branches touch different lines of the same shared file. T-0325 recorded the same class of hole for `lib/offline` ("conventional rather than enforced").

This is the gating risk for the parallel push, not polish. Five lanes are about to run at once for the first time, and the convention that keeps them apart is currently a sentence in a decision.

**The honest limit, stated up front.** ESLint sees *imports*, not *edits*. Editing `en.ts` is not an import of anything, so **no lint rule can detect it** — T-0318's three import bans are the right pattern for the wrong question. The enforceable mechanism is a **repo-level check over the set of changed paths**, which needs a diff base. So this ticket buys a real guarantee on a **PR / ticket branch in CI**, and buys nothing on `main` or for uncommitted work. §"What this does and does not cover" makes that explicit, and AC-11 pins the wording so the next reader cannot mistake it for a total guarantee.

## Lane
The board says `web-shell`. **It is `infra`.** `.squad/ownership.yaml` gives `.github/**` and the root `package.json` to infra, and both the check script and its wiring live there. Nothing in `apps/web/**` changes. This is a lane correction, not a scope change; the orchestrator should update the board row. Because the ticket touches no `apps/web` path, it **can run in parallel with all five Phase 3 feature tickets and with web-shell** — which is the point, since it is the thing that makes their parallelism safe.

## Scope
- In:
  - **`.github/scripts/check-lane-paths.mjs`**, a new `check:repo` sub-check in the D-0023 shape the other five already use: an exported pure function plus an exported `runCheck(root, opts)`, findings as `{path, line, rule, message}`, `printFindings`, `process.exit(1)` on any finding, Node built-ins only. Registered in `check-all.mjs` alongside the existing five.
  - **How it decides what a branch may change.** Three inputs, in this order:
    1. **The ticket id**, from the branch name `t/T-NNNN-slug` (the `check-placeholder-tests.mjs` `resolveBranch` precedent: `--branch` override, then `GITHUB_HEAD_REF`, then `GITHUB_REF_NAME`, then `git rev-parse --abbrev-ref HEAD`).
    2. **The allowed path set**, from `docs/tickets/T-NNNN-*.md`: its `lane:` front-matter key resolved against `.squad/ownership.yaml` `lanes.<lane>.paths` (with `web-feature:UF-NN` substituting `UF-NN` for `<flow>` in the `apps/web/src/features/<flow>/**` pattern), **plus** every repo-relative path or glob the ticket's `## Paths you may change` section names.
    3. **The changed paths**, from `git diff --name-only <base>...HEAD` where `<base>` is `git merge-base origin/main HEAD`, falling back to `main` when `origin/main` is absent.
  - **The rule.** Every changed path must match at least one allowed pattern, or the check reports `lane-path-not-owned` on that path. Matching is glob-style over POSIX-separated repo-relative paths (`**` crosses `/`, `*` does not); implement the matcher in the script — no new dependency (D-0023 rule: Node built-ins only).
  - **Four always-shared paths get their own rule ids and messages**, because these are the ones D-0071 is about and a generic "not owned" message buries the lesson:
    | Path | Rule id | Message names |
    |---|---|---|
    | `apps/web/src/lib/i18n/en.ts` | `shared-i18n-en-edited` | D-0071 §1: after T-0318 no feature ticket edits `en.ts`; add to your own `flows/uf-NN.ts` |
    | `apps/web/src/lib/i18n/flows/uf-NN.ts` where `NN` is not the ticket's own flow | `shared-i18n-other-flow` | D-0071 §1: each web-feature ticket owns exactly its own flow file |
    | `apps/web/eslint.config.mjs` | `shared-lint-config-edited` | D-0071 §9: the import bans are web-shell's (T-0318) |
    | `apps/web/src/app/routes.ts` | `shared-routes-edited` | D-0071 §2: a new route is a web-shell ticket |
    A path that hits one of these **and** is listed in the ticket's `## Paths you may change` is allowed and silent — the listed-extra escape hatch is the whole reason D-0071 §1 says "listed as an explicit extra path" (T-0301a §"Paths you may change" uses it for `flows/uf-01.ts`).
  - **Deliberate no-ops, each tested (AC-8):** no branch name match (`main`, `HEAD`, a detached checkout, `spike/foo`) → zero findings; no ticket file for a matched id → zero findings **and** a one-line note on stdout (absence of a ticket file is T-0327's business, not a failure here); no `## Paths you may change` section → lane paths only; no diff base resolvable → zero findings and a note. Every no-op exits 0.
  - **Wiring:** `.github/workflows/ci.yml`'s `checks` job gets `fetch-depth: 0` on `actions/checkout` (or an explicit `git fetch --no-tags origin main`), because the default shallow checkout has no merge base and the check would silently no-op on every PR. This is the one change that turns the ticket from decorative into real, so it has its own AC (AC-9).
  - **`.github/scripts/check-lane-paths.test.mjs`** in the `node:test` style of the five existing `*.test.mjs`, plus fixtures under `.github/scripts/fixtures/lane-paths/` (fixture ticket files and a fixture `ownership.yaml`). The pure functions are tested directly against fixture strings; no test runs `git`.
  - **A `docs/ci/` note is not in scope** (that lane is ci-investigator's). Instead, the script's header comment carries the "what this does not cover" list verbatim, and AC-11 pins it.
- Out:
  - **Any ESLint rule.** Ruled out on the merits, recorded in D-0074 §1. An import ban cannot see a file edit, and a rule that fired on *importing* `en.ts` would be wrong — every screen legitimately imports `en`.
  - **The build-lane checklist** (T-0327) and **the mocked-status legibility test** (T-0332). This ticket adds no checklist prose and no `apps/web` test.
  - **`lib/offline` write-helper enforcement** (T-0325's `offlineDb()` barrel hole). Same class of problem, different file set; a follow-up.
  - **The dynamic-`import()` loophole** (T-0313).
  - **Blocking a merge.** The check reports and exits 1 in the `checks` job. Branch-protection rules are T-0402.
  - **Validating that `## Paths you may change` is itself sane** (e.g. a ticket that lists `apps/web/**`). A ticket granting itself the world is a grooming failure, caught at accept, not here.
  - Any change under `apps/web/**`, `packages/**`, or any contract file.

### Edge cases that are in scope
- **Offline / no network.** `git merge-base origin/main HEAD` must not reach the network. Use the local ref only; if it is missing, fall back to `main`, and if that is missing, no-op with a note (AC-8). The check never runs `git fetch`.
- **Zero history (a fresh branch with no commits yet).** `merge-base` equals `HEAD`, the diff is empty, zero findings (AC-8).
- **A rename.** `git diff --name-only` lists both the old and new path; both are checked. A feature ticket renaming a shared file is reported (AC-6).
- **A deletion.** Also a changed path, also checked (AC-6). Deleting `flows/uf-06.ts` from the UF-10 lane must fail.
- **Time running out / a returning user / 14 days off.** Not applicable — no product surface.
- **A ticket with a hyphenated or lettered id.** `t/T-0307a-balance-screen` resolves to `T-0307a` and `docs/tickets/T-0307a-*.md` (the board uses `T-\d{4}[a-z]?`, as `check-placeholder-tests.mjs` already parses).
- **Two lanes, one ticket.** A `lane:` value the ownership file does not define (e.g. the `split → …` form the parent tickets use) → treat as "no lane paths", fall back to the listed extras only, and report a `lane-unknown` finding **on the ticket file**, so a typo'd lane is loud rather than permissive (AC-7).
- **Windows line endings** in a ticket or in `ownership.yaml`: normalise through `toLines` from `lib.mjs` (the existing AC10 behaviour).

## Acceptance criteria
`node:test` in `.github/scripts/check-lane-paths.test.mjs`, run by `pnpm test:repo-checks`. Every AC below tests an **exported pure function** against fixture strings (parsed ticket text, parsed ownership text, an array of changed paths) — never a live `git` invocation, never the real repo tree, so the suite is deterministic and does not go green or red because of whatever branch the runner happens to be on. AC-9 and AC-10 are the two exceptions and say so.

- **AC-1 (branch → ticket id)** `ticketIdFromBranch()` returns `"T-0307a"` for `t/T-0307a-balance-screen`, `"T-0320"` for `t/T-0320-shared-file-enforcement`, and `null` for each of `main`, `HEAD`, `""`, `spike/try-something`, `t/T-0307a` (no slug), `t/0307a-x` (no `T-`) and `feature/T-0307a-x` (wrong prefix). The `null` cases are the contrast half: a matcher that returned an id for anything would fail here, and a `null` id is what makes the whole check no-op.
- **AC-2 (lane → paths)** `lanePathsFor(ownershipText, lane)` returns, for `web-feature:UF-10`, exactly `["apps/web/src/features/UF-10/**"]`; for `web-shell`, exactly the seven patterns in `.squad/ownership.yaml`'s `web-shell.paths`, in file order; for `infra`, the list including `.github/**` and `package.json`; for `qa`, `["tests/e2e/**"]`. For `web-feature:UF-10` it does **not** return the literal `apps/web/src/features/<flow>/**` (the placeholder must have been substituted), and for `web-feature` with no flow it returns `[]` plus a `lane-unknown` signal.
- **AC-3 (ticket → listed extras)** `listedPathsFromTicket(ticketText)` on a fixture reproducing T-0307's `## Paths you may change` section returns `apps/web/src/features/UF-10/**`, `apps/web/src/lib/i18n/flows/uf-10.ts` and `tests/e2e/uf-10-balance.spec.ts`, and does **not** return the `[b]` line's `flows/uf-06.ts` when the ticket id is the `[a]` child (the extractor takes the section of the child's own ticket file, so the fixture is T-0307a's file, not the parent's). It stops at the next `##` heading: a path-shaped string in `## Contract impact` (`packages/design-tokens/src/tokens.json`) is **not** returned. Prose in the section that is not a path ("Not yours:", "web-shell owns …") yields no entry.
- **AC-4 (the matcher)** `matches(path, pattern)` — `apps/web/src/features/UF-10/Balance.tsx` matches `apps/web/src/features/UF-10/**` and does **not** match `apps/web/src/features/UF-06/**`. `apps/web/eslint.config.mjs` matches `apps/web/*.*` (the web-shell pattern) and **not** `apps/web/src/**`. `apps/web/src/lib/i18n/en.ts` matches `apps/web/src/lib/**` and **not** `apps/web/src/lib/*` (one `*` does not cross `/`). `package.json` matches `package.json`; `apps/web/package.json` does **not**. `.github/scripts/x.mjs` matches `.github/**`. The negative half of each pair is what stops an over-broad matcher (e.g. a bare `includes`) from passing.
- **AC-5 (the happy path is silent — the anti-vacuity half)** `checkLanePaths({ticketId: "T-0307a", ticketText: <T-0307a fixture>, ownershipText: <real ownership.yaml text>, changed: ["apps/web/src/features/UF-10/index.tsx", "apps/web/src/features/UF-10/__tests__/Balance.test.tsx", "apps/web/src/lib/i18n/flows/uf-10.ts", "tests/e2e/uf-10-balance.spec.ts"]})` returns **zero** findings. Same for `T-0318` with `["apps/web/src/app/routes.ts", "apps/web/eslint.config.mjs", "apps/web/src/lib/i18n/en.ts", "apps/web/src/lib/i18n/flows/uf-03.ts"]` — web-shell's own ticket editing all four shared files is legitimate and must be silent. Without this AC, a check that reported every path would pass AC-6.
- **AC-6 (the four shared-file violations, one test each)** With `ticketId: "T-0307a"` and the T-0307a fixture (whose listed extras are UF-10's only):
  1. `changed: ["apps/web/src/lib/i18n/en.ts"]` → exactly one finding, rule `shared-i18n-en-edited`, message containing `D-0071 §1` and `flows/uf-10.ts`.
  2. `changed: ["apps/web/src/lib/i18n/flows/uf-06.ts"]` → exactly one finding, rule `shared-i18n-other-flow`. And `["apps/web/src/lib/i18n/flows/uf-10.ts"]` → **zero** findings (its own flow file, listed).
  3. `changed: ["apps/web/eslint.config.mjs"]` → exactly one finding, rule `shared-lint-config-edited`.
  4. `changed: ["apps/web/src/app/routes.ts"]` → exactly one finding, rule `shared-routes-edited`.
  Plus: a **deletion** of `apps/web/src/lib/i18n/flows/uf-06.ts` and a **rename** reported as the pair `["apps/web/src/lib/i18n/flows/uf-06.ts", "apps/web/src/lib/i18n/flows/uf-06b.ts"]` both report (2 findings for the pair) — a check that only looked at files present on disk would miss these.
- **AC-7 (generic not-owned, and a bad lane is loud not permissive)** `ticketId: "T-0307a"`, `changed: ["supabase/migrations/0009_x.sql", "docs/data-model.md", "packages/engine/src/balance.ts"]` → three findings, all rule `lane-path-not-owned`, each naming the ticket's lane. Separately, a fixture ticket whose `lane:` is `split → web-feature:UF-10 (T-0307a), …` (the real T-0307 parent form) or `lane: web-featur:UF-10` (a typo) with `changed: ["apps/web/src/features/UF-10/index.tsx"]` returns a `lane-unknown` finding **on the ticket file path** — it does **not** return zero findings. This is the contrast that stops an unresolvable lane from becoming a blanket permit.
- **AC-8 (every no-op is a real no-op, and exits 0)** `checkLanePaths` returns zero findings, with no throw, for each of: `ticketId: null` (any `changed`, including `["apps/web/src/lib/i18n/en.ts"]` — this is the `main`-branch case and it must stay silent); `ticketText: null` (no ticket file) — zero findings, and the returned result carries a `note` string mentioning the missing file; `changed: []`; and a ticket with a `## Paths you may change` section that is empty, where the lane paths alone still decide (a UF-10 lane path is silent, `en.ts` is not). A separate test asserts `runCheck` resolves to `[]` rather than throwing when `git` is unavailable (the child-process call is injected as an option so the test never shells out).
- **AC-9 (CI actually has a diff base — the wiring, not the script)** A test of `.github/workflows/ci.yml` text (the `check-e2e-wiring.mjs` fixture style: parse the `checks` job's steps) asserts the `actions/checkout` step in the `checks` job sets `fetch-depth: 0`, **or** that a later step in the same job runs a `git fetch` naming `origin main` before `pnpm check:repo`. **Contrast:** a fixture workflow with a bare `actions/checkout@v4` and no fetch step **fails** the same assertion. Without this pair the ticket ships a check that silently no-ops on every PR, which is worse than no check.
- **AC-10 (registered, and the whole thing runs green on this branch)** `check-all.mjs` imports `runCheck` from `check-lane-paths.mjs` and includes its findings in the returned array — asserted in `check-all.test.mjs` the way the existing five are, by a source assertion plus a run. And `pnpm check:repo` exits 0 on this ticket's own branch `t/T-0320-shared-file-enforcement`, whose changed paths are `.github/scripts/**`, `.github/workflows/ci.yml` and `docs/tickets/T-0320-*.md` — which requires this ticket's file to list the `docs/tickets/` path as a listed extra (it does, below), so the check passes on its own terms. **Contrast, in the same test:** invoking the check with `--branch t/T-0307a-balance-screen` against the same changed paths **reports** (`.github/**` is not UF-10's), which proves the green above is not because the check is inert.
- **AC-11 (the coverage limits are written down, not implied)** A test asserts `check-lane-paths.mjs`'s header comment contains all four of these literal limits, so the next reader cannot mistake the mechanism for a total guarantee:
  1. it needs a `t/T-NNNN-slug` branch and does nothing on `main` or a detached HEAD;
  2. it needs a committed diff — uncommitted working-tree edits are invisible;
  3. it cannot see a *runtime* violation, only a *file* edit, so a feature reaching a shared value some other way (a dynamic `import()`, the `offlineDb()` barrel of T-0325) is out of reach;
  4. it does not detect two tickets that both legitimately list the same shared file — that stays D-0071 §1's "two tickets that list it never run in parallel", an orchestrator rule.
  The same four lines go in D-0074 §2. A vaguer word than these ("mostly", "generally") in place of any of them fails the test.

## Paths you may change
- `.github/scripts/check-lane-paths.mjs` (new), `.github/scripts/check-lane-paths.test.mjs` (new), `.github/scripts/fixtures/lane-paths/**` (new), `.github/scripts/check-all.mjs` and `.github/scripts/check-all.test.mjs` (register the new check), `.github/workflows/ci.yml` (the `fetch-depth`/fetch step for AC-9). All infra, per `.squad/ownership.yaml`.
- `.github/scripts/lib.mjs` — only if a helper genuinely belongs there (a glob matcher does). Adding an export is fine; changing an existing export's behaviour is not.
- `.squad/decisions/D-0074-shared-file-enforcement.md` (new, `status: revisit`) — see below.
- `docs/tickets/T-0320-shared-file-enforcement.md` (this file), for the accept log only.
- **Not yours:** anything under `apps/**` or `packages/**`, `.squad/ownership.yaml` and `.squad/board.md` (orchestrator — the lane correction goes in your result as a follow-up), `docs/ci/**` (ci-investigator), the root `package.json` (no new script is needed: `check:repo` already runs `check-all.mjs`; if you conclude one is, stop and raise it rather than editing the file).

## Decision to record
Write `.squad/decisions/D-0074-shared-file-enforcement.md` (`status: revisit`, `area: infra`) in this ticket and cite it in the commits. It records:
1. **ESLint was considered and rejected**, with the reason: `no-restricted-imports` matches import specifiers, and editing a shared file is not an import. The three T-0318 bans remain the right tool for cross-feature *imports*; they are simply not the tool for this. (No conflict with D-0071 §9, which only ever claimed the import bans.)
2. **The four coverage limits** from AC-11, verbatim.
3. **The lane correction**: this is infra, not web-shell, because `.github/**` is infra's in `.squad/ownership.yaml`. Consequence: it may run in parallel with every Phase 3 feature ticket.
4. **The listed-extra escape hatch is deliberate.** D-0071 §1 already grants it ("listed as an explicit extra path"); the check reads the ticket file so that the grant and the enforcement can never drift apart. Consequence: a ticket file is now load-bearing for CI, which raises the cost of a missing or sloppy `## Paths you may change` section — T-0327's checklist should say so.

## Contract impact
None. No schema, API, engine or token change. `.squad/ownership.yaml` and the ticket files are **read** only. No new dependency (D-0023: Node built-ins only).

## Definition of done
Every AC has a passing test · `pnpm test:repo-checks` green · `pnpm check:repo` exits 0 on this branch (AC-10) · `pnpm -w typecheck lint test --force --concurrency=1` green — note the **`--force`**: turbo will otherwise replay another worktree's cache and report a false green · `pnpm format:check` green · contracts unchanged · D-0074 written and cited · commits start `T-0320:`.

Note on `check:size`: it lives **only** in `apps/web/package.json`, `pnpm -w check:size` errors, and it **exits 0 against a stale or absent `dist/`** (T-0322). This ticket changes nothing that ships to the browser, so make no size claim at all rather than an unmeasured one.
