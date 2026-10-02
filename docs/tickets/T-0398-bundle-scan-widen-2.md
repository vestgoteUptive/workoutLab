---
id: T-0398
title: "Web shell: widen the D-0117 §4c bundle scan again — member-access eval, Function.apply/call, Reflect.construct(Function, Function(<identifier>), new Function with whitespace, string-arg setTimeout/setInterval; anchor the legacy Function(\" marker"
lane: web-shell
screens: [UF-09.1]
decisions: [D-0117]
deps: [T-0390]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-web. About ⅛ day. Follow-up from the T-0390 review (accept log). T-0390 is done. -->

## Why
D-0117 §4c guards against runtime code generation, which the strict CSP (`script-src 'self'`, no `'unsafe-eval'`) blocks silently (TR-0036). After T-0390, `CODEGEN_MARKERS` in `apps/web/build.test.ts` still misses these forms:
- eval reached through a global object (`globalThis.eval(`, `window["eval"](`);
- `Function.apply(` / `Function.call(`;
- `Reflect.construct(Function, …)`;
- `Function(src)` with an identifier argument;
- `new Function (` with whitespace;
- `setTimeout` / `setInterval` with a string argument.

The legacy `Function("` marker also has no lookbehind, so `isFunction("x")` is a false positive.

## Scope
- In: `apps/web/build.test.ts`, the `CODEGEN_MARKERS` table, the scan test and the matcher-table describe only.
  - **Before any change**, run the widened markers over a scratch `vite build` of today's `main` and record the hit count in the build log (see AC4).
  - Replace `/Function\("/` with the anchored form below. The other seven T-0390 markers stay as they are.
  - Add the new markers below.
  - Add the new samples to the matcher table as a new `T-0398 AC3` describe. The T-0390 AC2 table stays as it is.
- Out:
  - The CSP and `vite.config.ts`.
  - Every other assertion in `build.test.ts`.
  - Any allowlist.
  - Source scans in `packages/shared/test` (D-0117 §4b).

## Acceptance criteria
Each new test title starts with `T-0398 ACn`.
- AC1 (anchored legacy marker) `CODEGEN_MARKERS` holds `/(?<![\w$.])Function\(\s*"/` in place of `/Function\("/`.
- AC2 (new markers) `CODEGEN_MARKERS` also holds each of these, or an equivalent that passes AC3:
  - `/\b(?:globalThis|window|self|global)\s*(?:\.\s*eval|\[\s*["'`]eval["'`]\s*\])\s*\(/` (member-access eval);
  - `/(?<![\w$.])Function\s*\.\s*(?:apply|call)\s*\(/`;
  - `/Reflect\s*\.\s*construct\s*\(\s*Function\b/`;
  - `/(?<![\w$.])Function\(\s*[A-Za-z_$][\w$]*\s*[,)]/` (an identifier argument);
  - `/new\s+Function\s*\(/` (whitespace);
  - `/(?<![\w$])set(?:Timeout|Interval)\s*\(\s*["'`]/` (a string argument; member access such as `window.setTimeout("…")` included).
- AC3 (matcher table, no build needed, red on unfixed code)
  - **Then** `codegenHits()` flags each of these (none is flagged on main):
    - `globalThis.eval("x")`;
    - `window.eval(x)`;
    - `self["eval"](x)`;
    - `globalThis . eval (x)`;
    - `Function.apply(null, ["x"])`;
    - `Function.call(null, "x")`;
    - `Reflect.construct(Function, ["x"])`;
    - `Function(src)`;
    - `Function(a, b)`;
    - `new Function (a)`;
    - `new  Function(a)` (two spaces);
    - `Function( "x")`;
    - `setTimeout("tick()", 10)`;
    - `setInterval('tick()', 5)`;
    - ``setTimeout(`x`)``;
    - `window.setTimeout("x")`.
  - **And** none of these is flagged:
    - `isFunction("x")` (flagged on main by the unanchored marker, so red there);
    - `myFunction(src)`;
    - `x.Function(src)`;
    - `setTimeout(fn, 10)`;
    - `setInterval(() => tick(), 5)`;
    - `clearTimeout(id)`;
    - `x.evaluate(y)`;
    - `globalThis.evaluate(x)`;
    - `Function.prototype.apply(x)`;
    - `Reflect.construct(Foo, [])`;
    - `typeof Function`.
  - **Red proof:** run the AC3 table against main's `CODEGEN_MARKERS`. All 16 flagged samples and `isFunction("x")` fail (17 red). Record this in the build log.
- AC4 (today's bundle is clean)
  - **Given** the existing `beforeAll` build, **When** the scan runs with the widened table, **Then** `hits` is `[]`, and a failure names `asset: marker`.
  - If today's bundle trips a new marker, it's a real finding, not a false positive. Stop, write `.squad/triage/TR-NNNN-…` with the asset and a ±40-character snippet, and return `needs-triage`. Don't add an allowlist (D-0117 §4c).
- AC5 (no regression) The T-0390 AC2 table (9 flagged, 9 clean) passes unedited, and every other `build.test.ts` assertion passes with its code unchanged. The diff touches only `CODEGEN_MARKERS`, the scan test's title (it may add `T-0398 AC4`) and the new describe.

## Paths you may change
- `apps/web/build.test.ts` (the lane: `web-shell`).
- **Listed extras:**
  - `docs/tickets/T-0398-bundle-scan-widen-2.md`: this file, for the build and accept log.
  - `.squad/triage/TR-NNNN-*.md`: only on an AC4 hit.

## Contract impact
none

## Coordination
- The only file touched is `apps/web/build.test.ts`. No other ready or doing ticket edits it.
- It can run in parallel with T-0385 (`lib/offline`, doing) and T-0396 (`lib/auth`, ready): same lane, disjoint files. The build test runs a real `vite build`; stagger verification runs (one vitest per machine, state.md).

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` green · contracts unchanged · commit messages start with `T-0398` and cite UF-09.1 (e.g. `T-0398 UF-09.1: widen the no-eval bundle scan again (D-0117 §4c)`).

## Build / accept log
- 2026-10-02, frontend-dev (build), on top of 0305d73 (code identical to `main` 8ffa53f).
  - Today's bundle, before any edit: a scratch `vite build` (33 JS assets) scanned with the full widened table (14 markers) gave **0 hits**. No triage needed.
  - Change (`apps/web/build.test.ts` only): `/Function\("/` is replaced by `/(?<![\w$.])Function\(\s*"/` (AC1), and the six AC2 regexes are appended as written. The other seven T-0390 markers are untouched. The scan test is retitled `T-0398 AC4 T-0390 AC1 AC3 (T-0229 AC6) …`. The new `T-0398 AC3` describe has the 16 flagged and 11 clean samples. The T-0390 AC2 table is unedited.
  - Red proof (AC3): with main's `CODEGEN_MARKERS` swapped back in, `-t "AC3 |AC2 "` gave **17 failed** (all 16 flagged plus `isFunction("x")`), 29 passed. The T-0390 AC2 table (18) stayed green. Restored.
  - Red proof (AC4, temporary plant of `setTimeout("tick()",1);Reflect.construct(Function,[])` into the built `registerSW.js`, then reverted): the scan failed as `registerSW.js: Reflect\s*\.\s*construct…` and `registerSW.js: (?<![\w$])set(?:Timeout|Interval)…`.
  - Checks (under `flock /tmp/workoutlab-tests.lock`): `build.test.ts` 58/58, web typecheck and lint clean, web `test` 120 files / 1815 tests pass, `-w format:check` clean, `.github/scripts/check-all.mjs` exit 0.
- 2026-10-02, product-owner (accept), branch `t/T-0398-bundle-scan-widen-2` at da68126. Verdict: **done**.
  - AC1: `CODEGEN_MARKERS` holds `/(?<![\w$.])Function\(\s*"/` in place of `/Function\("/`. `isFunction("x")` was red on main's markers and is green now. Pass.
  - AC2: all six regexes are present as written. The other seven T-0390 markers are unchanged, which makes 14. Pass.
  - AC3: the `T-0398 AC3` describe has the 16 flagged and 11 clean samples, character for character as listed. Red proof against main's markers: 17 failed, as the AC predicts. Pass.
  - AC4: 0 hits across 33 JS assets, both before the edit and with the widened table. The assertion is `expect(hits).toEqual([])` over `asset: marker` strings, and the planted fault in `registerSW.js` failed with the asset and marker named. No allowlist. No triage. Pass.
  - AC5: the T-0390 AC2 table (9 flagged, 9 clean) is unedited and green. Outside `CODEGEN_MARKERS`, the only changes are the scan test's title and the new describe. Review confirmed that nothing was weakened. Web 1815 tests pass, and typecheck, lint, format and check-all are green. Pass.
  - Principles: unaffected. The change is test-only and touches no contracts.
  - QA: the orchestrator did QA and relied on the builder's red proofs (17 red on the matcher table, and the real-build plant for AC4). Accepted on that basis.
  - Known gaps, deliberately not ticketed: `(0,globalThis.eval)(x)`, `globalThis?.eval(x)`, `Function(...a)` and `Function(a+b)` are still unmatched. Review also noted theoretical false positives (`$self.eval`, `renew Function(`, `socket.setTimeout('x')`). These would fail loudly, not silently. None of these forms appears in any dependency today, and the production CSP (`script-src 'self'`, no `'unsafe-eval'`) blocks all of them at runtime anyway. The scan is an early-warning net, not the control, so a third widening isn't worth a ticket. Revisit only if a dependency bump trips the CSP (TR-0036 pattern) through a form the scan missed.
