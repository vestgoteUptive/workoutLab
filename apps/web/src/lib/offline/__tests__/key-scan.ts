// T-0372 (UF-04.1, D-0091): find hand-built `userId:id` cache keys with the TypeScript parser.
// The parser knows where comments, string literals and template literals start and end, so a
// `/*` or `//` inside a string can't hide real code, and commented-out keys never count.
import ts from "typescript";

/** One hand-built key: its source text and its offset in the scanned source. */
export interface KeyFinding {
  text: string;
  start: number;
}

const isColon = (node: ts.Node): boolean =>
  (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text === ":";

const isPlus = (node: ts.Node): node is ts.BinaryExpression =>
  ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken;

/**
 * Whether `node` builds `a:b` from two values:
 * - a template with a `:`-only span between two substitutions, e.g. `${userId}:${id}` or
 *   `${row.userId}:${row.id}`;
 * - a concatenation `a + ":" + b` (also with `':'` or a `:` template), which parses as
 *   `(a + ":") + b`.
 */
function isHandBuiltKey(node: ts.Node): boolean {
  if (ts.isTemplateExpression(node)) {
    return node.templateSpans.some(
      (span) => ts.isTemplateMiddle(span.literal) && span.literal.text === ":",
    );
  }
  return isPlus(node) && isPlus(node.left) && isColon(node.left.right);
}

/** Every hand-built key expression in `source` with its offset. Comments are ignored. */
export function findHandBuiltKeySpans(source: string): KeyFinding[] {
  const file = ts.createSourceFile(
    "scan.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const found: KeyFinding[] = [];
  const visit = (node: ts.Node): void => {
    if (isHandBuiltKey(node)) {
      // One finding per key: `a + ":" + b + ":" + c` is reported once, at its outermost node.
      found.push({ text: node.getText(file), start: node.getStart(file) });
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** The source text of every hand-built key expression in `source`. Comments are ignored. */
export function findHandBuiltKeys(source: string): string[] {
  return findHandBuiltKeySpans(source).map((f) => f.text);
}
