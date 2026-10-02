---
id: T-0390
title: "Web shell: widen the T-0229 AC6 bundle scan to Function('…'), Function(`…`), eval(, (0,eval)( and the ajv/dist/compile marker (D-0117 §4c)"
lane: web-shell
screens: [UF-09.1]
decisions: [D-0117]
deps: [T-0229]
status: done
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-web. About ⅛ day. Follow-up from the T-0229 review. -->

## Why
D-0117 §4c guards against runtime code generation in the shipped PWA. Under the strict CSP (`script-src 'self'`, no `'unsafe-eval'`), that code generation fails silently, as TR-0036 showed. The T-0229 AC6 scan in `apps/web/build.test.ts` only matches `new Function(`, `Function("` and `Error compiling schema`. It misses single-quote and template-literal `Function` calls, direct and indirect `eval`, and the `ajv/dist/compile` marker that D-0117 §4c names.

## Scope
- In: `apps/web/build.test.ts`, the `T-0229 AC6` describe block only.
  - Add the markers below, as regexes, next to the existing three. The existing three stay.
  - Add a small pure matcher table test (positive and negative samples) in the same file, so the regexes are proven without a build.
- Out:
  - The CSP and `vite.config.ts`.
  - Every other assertion in `build.test.ts`.
  - Any allowlist.
  - Source scans in `packages/shared/test` (D-0117 §4b, unchanged).

## Acceptance criteria
Each test title starts with `T-0390 ACn`.
- AC1 (marker set) The scan flags a `dist/**/*.js` asset when its text matches any of:
  - `new Function(`;
  - `Function("`;
  - `Error compiling schema` (the existing three);
  - `(?<![\w$.])Function\(\s*'`;
  - ``(?<![\w$.])Function\(\s*` `` (a backtick);
  - `(?<![\w$.])eval\(`;
  - `\(\s*0\s*,\s*eval\s*\)\s*\(`;
  - `ajv/dist/compile`.
- AC2 (the matcher, no build needed) For a table of strings:
  - **Then** each of these is flagged:
    - `Function('return this')()`;
    - ``Function(`a`, `b`)``;
    - `eval("1")`;
    - `;eval(x)`;
    - `(0,eval)("x")`;
    - `( 0 , eval )(x)`;
    - `require("ajv/dist/compile/index")`;
    - `new Function(a)`;
    - `Function("x")`.
  - **And** none of these is flagged:
    - `retrieval(x)`;
    - `isFunction(x)`;
    - `x.eval(y)`;
    - `$eval(y)`;
    - `toFunction('a')`;
    - `evaluate(x)`;
    - `"interval"`;
    - `typeof Function`;
    - `Function.prototype.call(x)`.
- AC3 (today's bundle is clean)
  - **Given** the existing `beforeAll` build, **When** the widened scan runs, **Then** `hits` is `[]`, and the test fails naming `asset: marker` on any hit.
  - If today's bundle trips a new marker, it's a real finding, not a false positive. Stop, write `.squad/triage/TR-NNNN-…` with the asset and a ±40-character snippet, and return `needs-triage`. Don't add an allowlist (D-0117 §4c).
- AC4 Every other `build.test.ts` assertion passes with its code unchanged. The diff touches only the T-0229 AC6 block and the new matcher test.

## Paths you may change
- `apps/web/build.test.ts` (the lane: `web-shell`).
- **Listed extras:**
  - `docs/tickets/T-0390-bundle-scan-widen.md`: this file, for the accept log.

## Contract impact
none

## Coordination
- The only file touched is `apps/web/build.test.ts`. No other ready or doing ticket edits it (T-0229 is done).
- It can run in parallel with T-0392 (same lane, disjoint files).

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force` green · contracts unchanged · commit messages start with `T-0390` and cite UF-09.1 (e.g. `T-0390 UF-09.1: widen the no-eval bundle scan (D-0117 §4c)`).

## Build log
- 2026-10-02, frontend-dev (build), on top of 742d669.
  - Today's bundle, before the change: a scratch `vite build` (32 JS assets) scanned with all eight markers gave **0 hits**. No triage needed.
  - Change: `CODEGEN_MARKERS` (the existing three plus five new regexes) and `codegenHits()` sit next to the `T-0229 AC6` block. The scan test is retitled `T-0390 AC1 AC3 (T-0229 AC6) …` and fails as `asset: marker`. The new `T-0390 AC2` table has 9 flagged and 9 clean samples. No other assertion is touched (AC4).
  - Red proofs (temporary patch that appended `$PLANT` to the first built chunk, `registerSW.js`, then reverted): `Function('return this')()`, ``Function(`a`,`b`)``, `eval("1")`, `(0,eval)("x")` and `"ajv/dist/compile/index"` each turned AC1 red. The `(0,eval)` run failed with `registerSW.js: \(\s*0\s*,\s*eval\s*\)\s*\(`. A plant of all AC2 clean samples stayed green. With the `eval(` regex removed, AC2 went red on `eval("1")` and `;eval(x)` (2 fail, 16 pass). Restored.
  - Checks: web typecheck and lint clean, web `test` 110 files / 1639 tests pass, `-w format:check` clean, `check-all.mjs` exit 0.

## Accept log
- 2026-10-02, product-owner (accept), branch `t/T-0390-bundle-scan-widen` at 8e16cba. Verdict: **done**.
  - AC1: `CODEGEN_MARKERS` in `apps/web/build.test.ts` holds exactly the eight AC1 patterns (the three old ones plus five new). The planted-fault red proofs on the real built `registerSW.js` cover each new marker. Pass.
  - AC2: the `T-0390 AC2` table has the 9 flagged and 9 clean samples, character for character as listed. Removing the `eval(` regex turned it red (2 failed). Pass.
  - AC3: on today's build, 0 hits across 32 JS assets. The assertion is `expect(hits).toEqual([])` over `asset: marker` strings, so a failure names the asset and marker. No allowlist. No triage needed. Pass.
  - AC4: review confirmed that only the T-0229 AC6 block and the new matcher describe changed, and no existing assertion was weakened. Web 1639/1639 pass, and typecheck, lint, format and check-all are green. Pass.
  - Principles: unaffected. The change is test-only and touches no contracts.
  - QA: the orchestrator did QA and relied on the builder's planted-fault proofs. Accepted on that basis because every new marker was proven red on a real build.
  - Follow-up (web-shell, from review): widen the scan further to cover member-access eval (`globalThis.eval(`), `Function.apply/call`, `Reflect.construct(Function`, `Function(identifier)`, `new Function (` with whitespace, string-argument `setTimeout`/`setInterval`, and anchor the legacy `Function("` marker with the same lookbehind.
