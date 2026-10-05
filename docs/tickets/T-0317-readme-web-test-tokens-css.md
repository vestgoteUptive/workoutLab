---
id: T-0317
title: "README: the filtered web test builds the tokens CSS via pretest; a direct vitest call needs ensure-tokens-css.mjs first (T-0312 follow-up)"
lane: infra
screens: []
decisions: [D-0001, D-0157, D-0178]
deps: [T-0312]
status: done
---
<!-- Groomed 2026-10-04 by product-owner. Build flow: wl-build-infra. Docs only, size: small (about ½ hour). D-0178 tier: skip review and QA. No draft PR: it doesn't touch .github/**. -->

## Why
T-0312 made `pnpm --filter @workoutlab/web test` build
`packages/design-tokens/dist/tokens.css` (gitignored, generated) through a `pretest` hook
(`node ensure-tokens-css.mjs` in `apps/web/package.json`). The hook only runs through the package
script. A direct `npx vitest run <files>` in `apps/web`, which D-0158/D-0178 tell agents to use
while they work, skips it. On a clean clone or a fresh worktree, `build.test.ts` then fails on
the missing CSS. T-0312 left the README line to the infra lane (`docs/tickets/log/T-0312.md`).

## Scope
- In:
  - The root `README.md`, which is the right home: `apps/web/` has no README, and the root one
    already holds the `pnpm --filter @workoutlab/web dev` instructions under
    `## Running the web app`. Add one short paragraph (one or two sentences) at the end of that
    section, or under a new `## Running the web tests` heading right after it. It says:
    - `pnpm --filter @workoutlab/web test` builds `packages/design-tokens/dist/tokens.css` when
      it's missing or stale, through the `pretest` hook;
    - a direct vitest call (for example `npx vitest run <files>` in `apps/web`) skips `pretest`,
      so run `node apps/web/ensure-tokens-css.mjs` from the repo root first.
- Out:
  - The landing package. Its vitest global setup (`apps/landing/test/global-setup.ts`) runs
    `astro build`, and `src/layouts/Layout.astro` imports `@workoutlab/design-tokens/tokens.css`,
    so a fresh worktree needs the tokens built first there too. But landing has no `pretest`, and
    the row covers the web package only. Follow-up below.
  - Any code, `package.json`, `turbo.json` or script change. Any other README section.
  - `apps/web/**` (no README there; the web lane owns it).

### Edge cases that are in scope
- **Command strings are exact.** The README must use the real strings, so a reader can paste
  them: `pnpm --filter @workoutlab/web test` and `node apps/web/ensure-tokens-css.mjs`. The
  script resolves the tokens package from its own folder, so it works from the repo root.
- **No-op when fresh.** The line may say the script does nothing when the CSS is up to date.
  It must not claim the script always rebuilds.

## Acceptance criteria
Docs only (D-0178 small tier). Each AC is a command whose result the build log records.

- **AC-1 (filtered command)** Given the changed `README.md`, When
  `grep -nF 'pnpm --filter @workoutlab/web test' README.md` runs, Then it prints at least one
  line, and that line (or the paragraph it sits in) names `pretest` and `tokens.css`.
- **AC-2 (direct call)** When `grep -nF 'node apps/web/ensure-tokens-css.mjs' README.md` runs,
  Then it prints exactly one line, in the same paragraph as AC-1's match, which says it is needed
  before a direct vitest call.
- **AC-3 (accurate)** The paragraph's facts match the code at HEAD: `apps/web/package.json` has
  `"pretest": "node ensure-tokens-css.mjs"`, and `apps/web/ensure-tokens-css.mjs` builds only
  when the CSS is missing or older than `tokens.json` or `scripts/`. The build log quotes both
  lines it checked.
- **AC-4 (nothing else changed)** `git diff --stat main...HEAD` lists only `README.md` and this
  ticket file. The rest of `README.md` is byte-identical (`git diff main...HEAD -- README.md`
  shows only added lines, plus at most one blank line).
- **AC-5 (checks green)** `npx -y pnpm@10.28.2 -w format:check` passes (`README.md` is in
  `.prettierignore`, so this only proves nothing else broke). `node .github/scripts/check-all.mjs`
  exits 0, `check-lane-paths` included (the grant below). `npx -y pnpm@10.28.2 -w test:repo-checks`
  passes. No repo check pins the root README's text today; if one does by build time, it stays
  green unedited.

## Paths you may change
- `.github/**` and the rest of the `infra` lane: none needed.
- **Listed extras:**
  - `README.md`: the root README, which is in no lane.
  - `docs/tickets/T-0317-readme-web-test-tokens-css.md`: this file, for the logs.

## Contract impact
None.

## Definition of done
AC-1 to AC-5 recorded in the log · `format:check`, `test:repo-checks` and `check-all` green ·
no code or contract change, so the `-w typecheck lint test` gate and e2e are not needed (D-0178)
· commits start `T-0317`.

## Notes
- **Flow:** `wl-build-infra`. Docs only, so no review or QA step (D-0178).
- **Parallel:** no shared file with T-0210 (backend) or T-0475 (`apps/web` eslint).
- **Follow-up (not in this ticket):** landing tests in a fresh worktree need
  `npm run build` in `packages/design-tokens` (or a landing `pretest` like web's). Suggested
  as a `landing`-lane ticket (a landing `pretest`), with its README line added when that lands.

## Build / accept log
Archived in `docs/tickets/log/T-0317.md` (D-0157).
