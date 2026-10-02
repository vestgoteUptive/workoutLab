// T-0408 (D-0096; UF-01.5-save, UF-04.3, UF-08.4): the waits on lazy route chunks named in the
// ticket carry explicit, local budgets, so the `--concurrency=1` gate can't trip Testing Library's
// 1 s default (or vitest's 5 s default) on them. No global `asyncUtilTimeout`/`testTimeout`: a
// really slow test elsewhere still fails. Parsed with the TS compiler API (the T-0230 rule).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIN_WAIT_MS = 5_000;
const MIN_TEST_MS = 15_000;

/** Which sites in one file must be budgeted. */
export interface LazySpec {
  /** Every wait inside these named functions needs `timeout` ≥ MIN_WAIT_MS. */
  functions?: readonly string[];
  /** These test titles need a third argument ≥ MIN_TEST_MS, and every wait in their callback. */
  tests?: readonly string[];
  /** Every test call whose callback calls one of these needs a third argument ≥ MIN_TEST_MS. */
  callersOf?: readonly string[];
  /** Titles that must be among the `callersOf` matches (non-vacuity). */
  requiredCallerTitles?: readonly string[];
  /** Exact wait counts per named function or test title (non-vacuity). */
  waitCounts?: Readonly<Record<string, number>>;
}

export interface LazyReport {
  offenders: string[];
  /** Names (functions, titles) the spec asked for that weren't found. */
  missing: string[];
  waitsChecked: number;
  testsChecked: number;
}

function isTestCallee(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr)) return expr.text === "it" || expr.text === "test";
  if (ts.isPropertyAccessExpression(expr)) return isTestCallee(expr.expression);
  if (ts.isCallExpression(expr)) return isTestCallee(expr.expression);
  return false;
}

function literalTitle(arg: ts.Expression | undefined): string | null {
  if (arg === undefined) return null;
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
  return null;
}

function numericConsts(sf: ts.SourceFile): Map<string, number> {
  const out = new Map<string, number>();
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    if ((stmt.declarationList.flags & ts.NodeFlags.Const) === 0) continue;
    for (const d of stmt.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer && ts.isNumericLiteral(d.initializer)) {
        out.set(d.name.text, Number(d.initializer.text));
      }
    }
  }
  return out;
}

function numberOf(arg: ts.Expression | undefined, consts: Map<string, number>): number | null {
  if (arg === undefined) return null;
  if (ts.isNumericLiteral(arg)) return Number(arg.text);
  if (ts.isIdentifier(arg)) return consts.get(arg.text) ?? null;
  return null;
}

/** `waitFor(cb, opts)` → "waitFor" (options at 1); `findBy*(m, o, opts)` → its name (options at 2). */
function waitKind(node: ts.CallExpression): { name: string; optionsAt: number } | null {
  const callee = node.expression;
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : null;
  if (name === "waitFor") return { name, optionsAt: 1 };
  if (name !== null && /^findAllBy|^findBy/.test(name)) return { name, optionsAt: 2 };
  return null;
}

function timeoutOf(arg: ts.Expression | undefined, consts: Map<string, number>): number | null {
  if (arg === undefined || !ts.isObjectLiteralExpression(arg)) return null;
  for (const p of arg.properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "timeout") {
      return numberOf(p.initializer, consts);
    }
  }
  return null;
}

function descendantCalls(root: ts.Node): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) out.push(n);
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(root, visit);
  return out;
}

export function checkLazyBudgets(file: string, source: string, spec: LazySpec): LazyReport {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const consts = numericConsts(sf);
  const name = path.basename(file);
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const report: LazyReport = { offenders: [], missing: [], waitsChecked: 0, testsChecked: 0 };

  const checkWaitsIn = (root: ts.Node, label: string): void => {
    let count = 0;
    for (const call of descendantCalls(root)) {
      const kind = waitKind(call);
      if (!kind) continue;
      count += 1;
      report.waitsChecked += 1;
      const t = timeoutOf(call.arguments[kind.optionsAt], consts);
      if (t === null || t < MIN_WAIT_MS) {
        report.offenders.push(
          `${name}:${lineOf(call)} ${kind.name} without timeout ≥ ${MIN_WAIT_MS}`,
        );
      }
    }
    const want = spec.waitCounts?.[label];
    if (want !== undefined && count !== want) {
      report.missing.push(`${label}: expected ${want} waits, found ${count}`);
    }
  };

  const checkTest = (call: ts.CallExpression, title: string): void => {
    report.testsChecked += 1;
    const b = numberOf(call.arguments[2], consts);
    if (b === null || b < MIN_TEST_MS) {
      report.offenders.push(`${name}:${lineOf(call)} "${title}" without budget ≥ ${MIN_TEST_MS}`);
    }
  };

  const functions = new Map<string, ts.Node>();
  const tests = new Map<string, ts.CallExpression>();
  const testCalls: { call: ts.CallExpression; title: string }[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isFunctionDeclaration(n) && n.name) functions.set(n.name.text, n);
    if (ts.isCallExpression(n) && isTestCallee(n.expression)) {
      const title = literalTitle(n.arguments[0]);
      if (title !== null) {
        testCalls.push({ call: n, title });
        tests.set(title, n);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  for (const fn of spec.functions ?? []) {
    const node = functions.get(fn);
    if (node) checkWaitsIn(node, fn);
    else report.missing.push(`function ${fn}`);
  }
  for (const title of spec.tests ?? []) {
    const call = tests.get(title);
    if (!call) {
      report.missing.push(`test "${title}"`);
      continue;
    }
    checkTest(call, title);
    const cb = call.arguments[1];
    if (cb) checkWaitsIn(cb, title);
  }
  const callees = new Set(spec.callersOf ?? []);
  if (callees.size > 0) {
    const callers = testCalls.filter(({ call }) => {
      const cb = call.arguments[1];
      return (
        cb !== undefined &&
        descendantCalls(cb).some(
          (c) => ts.isIdentifier(c.expression) && callees.has(c.expression.text),
        )
      );
    });
    for (const { call, title } of callers) checkTest(call, title);
    for (const t of spec.requiredCallerTitles ?? []) {
      if (!callers.some((c) => c.title === t)) report.missing.push(`caller "${t}"`);
    }
  }
  return report;
}

const RETRY = "retry: the second tap reuses the same id and navigates once on resolve";
const GATE = "%s redirects to /welcome/save";

export const TARGETS: ReadonlyArray<readonly [string, LazySpec]> = [
  ["profile-gate.test.tsx", { tests: [GATE], waitCounts: { [GATE]: 1 } }],
  [
    "routes.phase3.render.test.tsx",
    {
      functions: ["renderAt", "currentTabs"],
      callersOf: ["renderAt", "currentTabs"],
      requiredCallerTitles: [
        "%s renders exactly one %s with an <h1>",
        "%s marks exactly %s current",
      ],
      waitCounts: { renderAt: 1, currentTabs: 1 },
    },
  ],
  [
    "../../features/UF-08/__tests__/ready-start.test.tsx",
    { functions: ["toReady"], tests: [RETRY], waitCounts: { toReady: 4, [RETRY]: 2 } },
  ],
];

/** Runs the specs over the three files, resolved relative to `dir` (this folder by default). */
export function checkAll(dir = HERE): LazyReport {
  const total: LazyReport = { offenders: [], missing: [], waitsChecked: 0, testsChecked: 0 };
  for (const [rel, spec] of TARGETS) {
    const r = checkLazyBudgets(rel, readFileSync(path.join(dir, rel), "utf8"), spec);
    total.offenders.push(...r.offenders);
    total.missing.push(...r.missing.map((m) => `${path.basename(rel)} ${m}`));
    total.waitsChecked += r.waitsChecked;
    total.testsChecked += r.testsChecked;
  }
  return total;
}

describe("T-0408 lazy-route wait budgets", () => {
  it("T-0408 AC4 non-vacuity: every named title and function is found, ≥ 9 waits and ≥ 4 tests checked", () => {
    const r = checkAll();
    expect(r.missing, r.missing.join("\n")).toEqual([]);
    expect(r.waitsChecked).toBeGreaterThanOrEqual(9);
    expect(r.testsChecked).toBeGreaterThanOrEqual(4);
  });

  it("T-0408 AC1 AC2 AC3 every named wait has timeout ≥ 5000 and every named test a budget ≥ 15000", () => {
    const { offenders } = checkAll();
    expect(offenders, `unbudgeted lazy-route waits:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("T-0408 AC4 unit pair: a waitFor without a timeout in an unbudgeted test is reported", () => {
    const src = 'it("t", async () => { await waitFor(() => {}); });\n';
    const r = checkLazyBudgets("mem.test.tsx", src, { tests: ["t"] });
    expect(r.offenders).toEqual([
      'mem.test.tsx:1 "t" without budget ≥ 15000',
      "mem.test.tsx:1 waitFor without timeout ≥ 5000",
    ]);
  });

  it("T-0408 AC4 unit pair: a waitFor with timeout 5_000 in a 15_000 test is not reported", () => {
    const src = 'it("t", async () => { await waitFor(() => {}, { timeout: 5_000 }); }, 15_000);\n';
    const r = checkLazyBudgets("mem.test.tsx", src, { tests: ["t"] });
    expect(r.waitsChecked).toBe(1);
    expect(r.testsChecked).toBe(1);
    expect(r.offenders).toEqual([]);
  });

  it("T-0408 AC4 file-level const budgets count; a findByRole timeout is read from its third argument", () => {
    const src = [
      "const W = 5_000;",
      "const T = 15_000;",
      'it("t", async () => { await screen.findByRole("alert", undefined, { timeout: W }); }, T);',
      'it("u", async () => { await screen.findByRole("alert", { timeout: 5_000 }); });',
    ].join("\n");
    const r = checkLazyBudgets("mem.test.tsx", src, { tests: ["t", "u"] });
    expect(r.offenders).toEqual([
      'mem.test.tsx:4 "u" without budget ≥ 15000',
      "mem.test.tsx:4 findByRole without timeout ≥ 5000",
    ]);
  });
});
