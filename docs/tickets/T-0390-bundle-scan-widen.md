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

## Build / accept log
Archived in `docs/tickets/log/T-0390.md` (D-0157).
