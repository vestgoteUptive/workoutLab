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
  /** The call's own title, or `<unresolvable title>` when it isn't literal text. */
  title: string;
  /** The third argument as a number, or null when it is missing or not a numeric literal. */
  budget: number | null;
  /** True when the title argument can't be folded to literal text (always an offender). */
  unresolvable?: true;
}

const UNRESOLVABLE = "<unresolvable title>";

/** `name`, `name.skip`/`name.only`/…, `name.each(…)` and `name.each\`…\`` callees. */
function isCalleeOf(expr: ts.Expression, names: readonly string[]): boolean {
  if (ts.isIdentifier(expr)) return names.includes(expr.text);
  if (ts.isPropertyAccessExpression(expr)) return isCalleeOf(expr.expression, names);
  if (ts.isCallExpression(expr)) return isCalleeOf(expr.expression, names);
  if (ts.isTaggedTemplateExpression(expr)) return isCalleeOf(expr.tag, names);
  return false;
}

const TEST_NAMES = ["it", "test"] as const;
const DESCRIBE_NAMES = ["describe"] as const;

/** `x.each(table)`: its argument is a table, never a title. */
function isEachTableCall(node: ts.CallExpression): boolean {
  return ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "each";
}

/**
 * Literal text of a string, no-substitution template or template literal (head + spans), or a
 * `+` chain of those (parentheses allowed). Null for anything else.
 */
function literalTitle(arg: ts.Expression | undefined): string | null {
  if (arg === undefined) return null;
  if (ts.isParenthesizedExpression(arg)) return literalTitle(arg.expression);
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
  if (ts.isTemplateExpression(arg)) {
    return arg.head.text + arg.templateSpans.map((s) => "${…}" + s.literal.text).join("");
  }
  if (ts.isBinaryExpression(arg) && arg.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = literalTitle(arg.left);
    const right = literalTitle(arg.right);
    return left === null || right === null ? null : left + right;
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

/**
 * Every `it(…)`/`test(…)` call whose title, or the title of any enclosing `describe`, matches the
 * sweep/seed pattern, with its budget. Any `describe`/`it`/`test` call whose title can't be
 * folded to literal text is collected as `<unresolvable title>`.
 */
export function collectBudgetCalls(file: string, source: string): BudgetCall[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const consts = numericConsts(sf);
  const calls: BudgetCall[] = [];
  const lineOf = (node: ts.Node): number =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const visit = (node: ts.Node, inMatchingDescribe: boolean): void => {
    let childMatching = inMatchingDescribe;
    if (ts.isCallExpression(node) && !isEachTableCall(node)) {
      const isTest = isCalleeOf(node.expression, TEST_NAMES);
      const isDescribe = !isTest && isCalleeOf(node.expression, DESCRIBE_NAMES);
      if (isTest || isDescribe) {
        const title = literalTitle(node.arguments[0]);
        const budget = budgetOf(node.arguments[2], consts);
        if (title === null) {
          calls.push({ file, line: lineOf(node), title: UNRESOLVABLE, budget, unresolvable: true });
        } else if (isTest && (inMatchingDescribe || TITLE.test(title))) {
          calls.push({ file, line: lineOf(node), title, budget });
        } else if (isDescribe && TITLE.test(title)) {
          childMatching = true;
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, childMatching));
  };
  visit(sf, false);
  return calls;
}

export function offenders(calls: readonly BudgetCall[]): string[] {
  return calls
    .filter((c) => c.unresolvable === true || c.budget === null || c.budget < MIN_BUDGET_MS)
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

  it("T-0230 AC2 T-0232 AC7 non-vacuity: at least 9 matches, including the four in scope, the AC28 template titles and the three rule 14 describe-level titles", () => {
    const calls = collectAll();
    expect(calls.length).toBeGreaterThanOrEqual(9);
    const titles = calls.map((c) => `${c.file} ${c.title}`);
    const expected = [
      "rule-7-histories.test.ts R7-E8 rule-7 (AC14) budget sweep 15..120",
      "rule-7-histories.test.ts R7-E8 rule-7 (AC14) 200 seeded histories",
      "simulated-histories.test.ts rule-5 never negative deficit",
      "simulated-histories.test.ts rule-0 history order never changes balance()",
      "rule-7-histories.test.ts rule-7 (AC28) energy ${…}: budget sweep",
      "rule-7-histories.test.ts rule-7 (AC28) energy ${…}: 200 seeded histories",
      "rule-14-properties.test.ts rule-14 (AC19) (AC21) prefill equals the independent rule 14 oracle",
      "rule-14-properties.test.ts rule-14 (AC19) same input → same output;",
      "rule-14-properties.test.ts rule-14 (AC21) invariants: shape, bounds,",
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

const mem = (src: string): BudgetCall[] => collectBudgetCalls("mem.test.ts", src);

describe("T-0232 the guard reads describe titles, folds literal + chains, reports unresolvable titles", () => {
  it("T-0232 AC2 an it/test under a matching describe is a matching call", () => {
    const src = 'describe("x (seeded)", () => {\n  it("a", () => {});\n});\n';
    expect(offenders(mem(src))).toEqual(["mem.test.ts:2 a"]);
  });

  it("T-0232 AC2 pair: with a 30_000 budget there it is collected once and not reported", () => {
    const calls = mem('describe("x (seeded)", () => {\n  it("a", () => {}, 30_000);\n});\n');
    expect(calls).toHaveLength(1);
    expect(offenders(calls)).toEqual([]);
  });

  it("T-0232 AC2 nesting at any depth under a matching describe still matches", () => {
    const src =
      'describe("big sweep", () => { describe("inner", () => { it("b", () => {}); }); });\n';
    expect(offenders(mem(src))).toEqual(["mem.test.ts:1 b"]);
  });

  it("T-0232 AC2 a describe whose title doesn't match collects nothing", () => {
    const calls = mem('describe("plain", () => { it("c", () => {}); });\n');
    expect(calls).toHaveLength(0);
    expect(offenders(calls)).toEqual([]);
  });

  it("T-0232 AC2 describe.skip, describe.only and describe.each(…)(…) titles count too", () => {
    const src = [
      'describe.skip("s sweep", () => { it("d", () => {}); });',
      'describe.only("o sweep", () => { it("e", () => {}); });',
      'describe.each([[1]])("%s sweep", () => { it("f", () => {}); });',
      "",
    ].join("\n");
    expect(offenders(mem(src))).toEqual(["mem.test.ts:1 d", "mem.test.ts:2 e", "mem.test.ts:3 f"]);
  });

  it("T-0232 AC3 a + chain of string literals is folded into one title", () => {
    expect(offenders(mem('it("a " + "sweep", () => {});\n'))).toEqual(["mem.test.ts:1 a sweep"]);
  });

  it("T-0232 AC3 parenthesised + chains fold, and a budgeted one is not reported", () => {
    const calls = mem('it("a " + ("big " + "sweep"), () => {}, 30_000);\n');
    expect(offenders(calls)).toEqual([]);
    expect(calls.map((c) => c.title)).toEqual(["a big sweep"]);
  });

  it("T-0232 AC3 template literals inside a + chain keep their ${…} spans", () => {
    const src = "for (const e of [1]) it(`energy ${e}: ` + 'big ' + `sweep`, () => {});\n";
    expect(offenders(mem(src))).toEqual(["mem.test.ts:1 energy ${…}: big sweep"]);
  });

  it("T-0232 AC4 an identifier title is unresolvable, even with a budget", () => {
    const src = 'const T = "a sweep";\nit(T, () => {}, 30_000);\n';
    expect(offenders(mem(src))).toEqual(["mem.test.ts:2 <unresolvable title>"]);
  });

  it("T-0232 AC4 a + chain with an identifier operand is unresolvable", () => {
    const src = 'const name = "a";\nit(name + " sweep", () => {});\n';
    expect(offenders(mem(src))).toEqual(["mem.test.ts:2 <unresolvable title>"]);
  });

  it("T-0232 AC4 an identifier describe title is unresolvable", () => {
    const src = 'const T = "a sweep";\ndescribe(T, () => {});\n';
    expect(offenders(mem(src))).toEqual(["mem.test.ts:2 <unresolvable title>"]);
  });

  it("T-0232 AC4 call and property-access titles are unresolvable", () => {
    const src = "it(String(1), () => {});\nit(o.title, () => {}, 30_000);\n";
    expect(offenders(mem(src))).toEqual([
      "mem.test.ts:1 <unresolvable title>",
      "mem.test.ts:2 <unresolvable title>",
    ]);
  });

  it("T-0232 AC5 an each table is not a title; the budgeted call is not reported", () => {
    expect(offenders(mem('it.each([[1]])("%s sweep", () => {}, 30_000);\n'))).toEqual([]);
  });

  it("T-0232 AC5 pair: without the budget the one offender is the each call's title", () => {
    expect(offenders(mem('it.each([[1]])("%s sweep", () => {});\n'))).toEqual([
      "mem.test.ts:1 %s sweep",
    ]);
  });

  it("T-0232 AC5 tagged-template each tables and identifier tables are not titles", () => {
    const src = [
      "const rows = [[1]];",
      'test.each(rows)("%s sweep", () => {}, 30_000);',
      'it.each`a ${1}`("$a sweep", () => {}, 30_000);',
      'it.each`a ${1}`("$a sweep", () => {});',
      "",
    ].join("\n");
    expect(offenders(mem(src))).toEqual(["mem.test.ts:4 $a sweep"]);
  });
});
