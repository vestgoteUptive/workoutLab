// T-0373 (UF-04.1, D-0045 §9): read each whole `<OfflineStatus …>` element with the TypeScript
// parser, so a `>` inside an attribute (an arrow `=>`, a comparison) can't cut the element short.
import ts from "typescript";

const TAG = "OfflineStatus";

type Element = ts.JsxSelfClosingElement | ts.JsxOpeningElement;

function collect(source: string): { node: Element; file: ts.SourceFile }[] {
  const file = ts.createSourceFile(
    "scan.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found: { node: Element; file: ts.SourceFile }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(file) === TAG
    ) {
      found.push({ node, file });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** The full source text of each `<OfflineStatus …>` opening or self-closing element. */
export function offlineStatusElements(source: string): string[] {
  return collect(source).map(({ node, file }) => node.getText(file));
}

/** Whether an element (as returned by `offlineStatusElements`) has a JSX attribute named `name`. */
export function hasAttribute(element: string, name: string): boolean {
  const [first] = collect(element);
  if (first === undefined) throw new Error(`not an <${TAG}> element: ${element}`);
  return first.node.attributes.properties.some(
    (p) => ts.isJsxAttribute(p) && p.name.getText(first.file) === name,
  );
}

/** How many `<OfflineStatus` tag openings the source has once comments are stripped. */
export function countTagOpenings(source: string): number {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  return stripped.match(new RegExp(`<${TAG}\\b`, "g"))?.length ?? 0;
}
