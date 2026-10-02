// T-0230 (D-0096): every engine sweep or seeded test carries an explicit runtime budget, so the
// parallel turbo gate never trips vitest's 5 s default on them. Parsed with the TS compiler API.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const TITLE = /\b(sweep|seeds?|seeded)\b/i;
const MIN_BUDGET_MS = 30_000;

export interface BudgetCall {
  file: string;
  line: number;
  title: string;
  /** The third argument as a number, or null when it is missing or not a numeric literal. */
  budget: number | null;
}

/** `it`, `test`, `it.skip`/`test.only`/…, and `it.each(…)` / `test.each(…)` callees. */
function isTestCallee(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr)) return expr.text === "it" || expr.text === "test";
  if (ts.isPropertyAccessExpression(expr)) return isTestCallee(expr.expression);
  if (ts.isCallExpression(expr)) return isTestCallee(expr.expression);
  return false;
}

/** Literal text of a string, no-substitution template or template literal (head + spans). */
function literalTitle(arg: ts.Expression | undefined): string | null {
  if (arg === undefined) return null;
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
  if (ts.isTemplateExpression(arg)) {
    return arg.head.text + arg.templateSpans.map((s) => "${…}" + s.literal.text).join("");
  }
  return null;
}

/** File-level `const NAME = <numeric literal>` bindings (e.g. `SWEEP_TIMEOUT_MS = 30_000`). */
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

function budgetOf(arg: ts.Expression | undefined, consts: Map<string, number>): number | null {
  if (arg === undefined) return null;
  if (ts.isNumericLiteral(arg)) return Number(arg.text);
  if (ts.isIdentifier(arg)) return consts.get(arg.text) ?? null;
  return null;
}

/** Every `it(…)`/`test(…)` call whose title matches the sweep/seed pattern, with its budget. */
export function collectBudgetCalls(file: string, source: string): BudgetCall[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const consts = numericConsts(sf);
  const calls: BudgetCall[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isTestCallee(node.expression)) {
      const title = literalTitle(node.arguments[0]);
      if (title !== null && TITLE.test(title)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        calls.push({ file, line: line + 1, title, budget: budgetOf(node.arguments[2], consts) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return calls;
}

export function offenders(calls: readonly BudgetCall[]): string[] {
  return calls
    .filter((c) => c.budget === null || c.budget < MIN_BUDGET_MS)
    .map((c) => `${c.file}:${c.line} ${c.title}`);
}

function collectAll(): BudgetCall[] {
  return readdirSync(TEST_DIR)
    .filter((f) => f.endsWith(".test.ts"))
    .sort()
    .flatMap((f) => collectBudgetCalls(f, readFileSync(path.join(TEST_DIR, f), "utf8")));
}

describe("T-0230 runtime budgets on engine property tests", () => {
  it("T-0230 AC2 every matching it/test call in test/*.test.ts has a third argument ≥ 30000", () => {
    const bad = offenders(collectAll());
    expect(bad, `missing a ≥ ${MIN_BUDGET_MS} ms budget:\n${bad.join("\n")}`).toEqual([]);
  });

  it("T-0230 AC2 non-vacuity: at least 6 matches, including the four in scope and the AC28 template titles", () => {
    const calls = collectAll();
    expect(calls.length).toBeGreaterThanOrEqual(6);
    const titles = calls.map((c) => `${c.file} ${c.title}`);
    const expected = [
      "rule-7-histories.test.ts R7-E8 rule-7 (AC14) budget sweep 15..120",
      "rule-7-histories.test.ts R7-E8 rule-7 (AC14) 200 seeded histories",
      "simulated-histories.test.ts rule-5 never negative deficit",
      "simulated-histories.test.ts rule-0 history order never changes balance()",
      "rule-7-histories.test.ts rule-7 (AC28) energy ${…}: budget sweep",
      "rule-7-histories.test.ts rule-7 (AC28) energy ${…}: 200 seeded histories",
    ];
    for (const prefix of expected) {
      expect(
        titles.some((t) => t.startsWith(prefix)),
        prefix,
      ).toBe(true);
    }
    const ac28 = calls.find((c) => c.title.startsWith("rule-7 (AC28) energy ${…}: budget sweep"));
    expect(ac28?.budget).toBe(30_000);
  });

  it("T-0230 AC2 unit pair: a matching call without a third argument is reported", () => {
    const calls = collectBudgetCalls("mem.test.ts", 'it("a sweep", () => {});\n');
    expect(offenders(calls)).toEqual(["mem.test.ts:1 a sweep"]);
  });

  it("T-0230 AC2 unit pair: a matching call with 30_000 is not reported", () => {
    const calls = collectBudgetCalls("mem.test.ts", 'it("a sweep", () => {}, 30_000);\n');
    expect(calls).toHaveLength(1);
    expect(offenders(calls)).toEqual([]);
  });

  it("T-0230 AC2 template-literal titles are matched on their literal text", () => {
    const src = "for (const e of [1]) it(`energy ${e}: budget sweep`, () => {});\n";
    expect(offenders(collectBudgetCalls("mem.test.ts", src))).toEqual([
      "mem.test.ts:1 energy ${…}: budget sweep",
    ]);
  });
});
