#!/usr/bin/env node
// check-figure (T-0315, D-0207): checks body-figure.svg and the docs that describe it.
// Node only, no dependencies.
//
// Usage: node check-figure.mjs              check body-figure.svg (AC-1..3) and the docs (AC-5)
//        node check-figure.mjs --svg <file>  check one SVG file only ("-" reads stdin)
// Exit 0 = clean, 1 = problems found (one per line on stdout).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../../..");

export const AREAS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
];
/** Spec §3.1: which areas each view draws. */
export const VIEW_AREAS = {
  front: ["chest", "shoulders", "arms", "core", "quads"],
  back: ["back", "shoulders", "arms", "glutes", "hamstrings", "calves"],
};
const SHAPES = new Set(["path", "rect", "circle", "ellipse", "polygon", "polyline", "line"]);
const COLOUR_ATTRS = new Set([
  "fill",
  "stroke",
  "style",
  "color",
  "stop-color",
  "flood-color",
  "lighting-color",
  "bgcolor",
]);
const COLOUR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/;
// CSS named colours (and keywords) that must not appear anywhere in the asset.
const COLOUR_NAMES =
  /\b(?:aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen|currentcolor|transparent)\b/i;

/** Minimal XML tokenizer: elements with attributes, nesting checked. Comments are skipped. */
export function parseSvg(text) {
  const problems = [];
  const elements = [];
  const stack = [];
  const body = text.replace(/<!--[\s\S]*?-->/g, (m) => " ".repeat(m.length));
  const tagRe = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let last = 0;
  for (const m of body.matchAll(tagRe)) {
    const between = body.slice(last, m.index);
    if (/[<>]/.test(between)) problems.push(`invalid markup near offset ${last}`);
    last = m.index + m[0].length;
    const [, closing, name, rawAttrs, selfClosing] = m;
    if (closing) {
      const open = stack.pop();
      if (!open || open.name !== name)
        problems.push(`invalid XML: </${name}> closes <${open ? open.name : "nothing"}>`);
      continue;
    }
    const attrs = {};
    for (const a of rawAttrs.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      if (a[1] in attrs) problems.push(`invalid XML: duplicate attribute ${a[1]} on <${name}>`);
      attrs[a[1]] = a[2] ?? a[3];
    }
    const el = { name, attrs, parent: stack[stack.length - 1] ?? null };
    el.inDefs = Boolean(el.parent && (el.parent.name === "defs" || el.parent.inDefs));
    el.view = attrs["data-view"] ?? el.parent?.view ?? null;
    elements.push(el);
    if (!selfClosing) stack.push(el);
  }
  if (/[<>]/.test(body.slice(last))) problems.push(`invalid markup near offset ${last}`);
  for (const open of stack) problems.push(`invalid XML: <${open.name}> is never closed`);
  const roots = elements.filter((e) => e.parent === null);
  if (roots.length !== 1 || roots[0].name !== "svg")
    problems.push("invalid XML: the document must have exactly one root <svg>");
  return { elements, problems };
}

const classes = (el) => (el.attrs.class ?? "").split(/\s+/).filter(Boolean);
const sorted = (xs) => [...new Set(xs)].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

/** AC-1..AC-3 on the SVG text. Returns a list of problems (empty = pass). */
export function checkSvg(text) {
  const { elements, problems } = parseSvg(text);
  const svg = elements.find((e) => e.name === "svg");

  // AC-1: exactly the 9 areas, and the right ones per view.
  const tagged = elements.filter((e) => "data-area" in e.attrs);
  const all = tagged.map((e) => e.attrs["data-area"]);
  if (!same(all, AREAS))
    problems.push(`AC-1: data-area values are [${sorted(all)}], expected [${sorted(AREAS)}]`);
  for (const [view, want] of Object.entries(VIEW_AREAS)) {
    const got = tagged.filter((e) => e.view === view).map((e) => e.attrs["data-area"]);
    if (!same(got, want))
      problems.push(`AC-1: ${view} view has [${sorted(got)}], expected [${sorted(want)}]`);
  }
  for (const e of tagged)
    if (!(e.view in VIEW_AREAS))
      problems.push(`AC-1: data-area="${e.attrs["data-area"]}" is outside a front/back view`);

  // AC-2: no colour attributes, no colour literals or names anywhere.
  for (const e of elements)
    for (const a of Object.keys(e.attrs))
      if (COLOUR_ATTRS.has(a.toLowerCase())) problems.push(`AC-2: <${e.name}> has a ${a} attribute`);
  const lit = text.match(COLOUR_RE);
  if (lit) problems.push(`AC-2: colour literal "${lit[0]}" in the file`);
  const named = text.match(COLOUR_NAMES);
  if (named) problems.push(`AC-2: colour name "${named[0]}" in the file`);

  // AC-3: structure and classes.
  if (svg?.attrs.viewBox !== "0 0 256 290")
    problems.push(`AC-3: viewBox is "${svg?.attrs.viewBox}", expected "0 0 256 290"`);
  for (const a of ["tabindex", "role"])
    if (svg && a in svg.attrs) problems.push(`AC-3: <svg> has a ${a} attribute`);
  if (elements.some((e) => e.name === "title")) problems.push("AC-3: the file has a <title>");
  for (const e of elements)
    if ("tabindex" in e.attrs || e.name === "a")
      problems.push(`AC-3: <${e.name}> is focusable or named`);
  const pattern = elements.find((e) => e.name === "pattern" && e.attrs.id === "wl-fig-hatch");
  if (!pattern) problems.push('AC-3: <pattern id="wl-fig-hatch"> is missing');
  else if (!elements.some((e) => e.parent === pattern && classes(e).includes("wl-fig__hatch-stripe")))
    problems.push("AC-3: the hatch pattern has no element with class wl-fig__hatch-stripe");
  for (const e of tagged) {
    if (e.name !== "path") problems.push(`AC-3: data-area="${e.attrs["data-area"]}" is a <${e.name}>, not a <path>`);
    if (!classes(e).includes("wl-fig__region"))
      problems.push(`AC-3: data-area="${e.attrs["data-area"]}" path lacks class wl-fig__region`);
  }
  for (const e of elements) {
    if (!SHAPES.has(e.name) || e.inDefs || "data-area" in e.attrs) continue;
    const c = classes(e);
    if (!c.includes("wl-fig__seam") && !c.includes("wl-fig__body"))
      problems.push(`AC-3: an untagged <${e.name}> is neither wl-fig__body nor wl-fig__seam`);
    if (c.includes("wl-fig__region")) problems.push("AC-3: a wl-fig__region has no data-area");
  }
  return problems;
}

function walkMd(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkMd(full, out);
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/** AC-5 on the design docs under `root` (the repo root). */
export function checkDocs(root = REPO) {
  const problems = [];
  const design = join(root, "Design-docs/docs/design");
  const read = (f) => readFileSync(join(design, f), "utf8");
  const c01 = read("components/c-01-body-map.md");
  for (const s of ["## Silhouette layout", "label grid", "BodyFigure", "D-0207"])
    if (!c01.includes(s)) problems.push(`AC-5: c-01-body-map.md lacks "${s}"`);
  if (/proposed/i.test(c01)) problems.push('AC-5: c-01-body-map.md still says "proposed"');
  if (!/D-0060 §1 is superseded by D-0207/.test(c01))
    problems.push("AC-5: c-01-body-map.md doesn't mark D-0060 §1 superseded by D-0207");
  const uf04 = read("screens/UF-04.1-UF-04.2.md");
  for (const s of ["## UF-04.2 Body figure", "figure card", "Primary", "Secondary"])
    if (!uf04.includes(s)) problems.push(`AC-5: UF-04.1-UF-04.2.md lacks "${s}"`);
  const deltas = ["c-01-body-map-silhouette.md", "UF-04.2-body-figure.md"];
  for (const f of ["components/c-01-body-map-silhouette.md", "screens/UF-04.2-body-figure.md"])
    if (existsSync(join(design, f))) problems.push(`AC-5: delta file ${f} still exists`);
  for (const f of walkMd(join(root, "Design-docs")))
    for (const d of deltas)
      if (readFileSync(f, "utf8").includes(d))
        problems.push(`AC-5: ${relative(root, f)} still links ${d}`);
  const ds = read("design-system.md");
  const section = ds.split(/^## /m).find((s) => s.startsWith("Body figure"));
  if (!section) problems.push('AC-5: design-system.md has no "## Body figure" section');
  else
    for (const s of ["1.5 px", "1 px", "0.75 px", "5 px period", "1.5 px stripes", "45°", "non-scaling-stroke"])
      if (!section.includes(s)) problems.push(`AC-5: design-system.md Body figure lacks "${s}"`);
  return problems;
}

function main(argv) {
  let problems;
  const svgFlag = argv.indexOf("--svg");
  if (svgFlag >= 0) {
    const file = argv[svgFlag + 1];
    problems = checkSvg(readFileSync(file === "-" || !file ? 0 : file, "utf8"));
  } else {
    problems = [...checkSvg(readFileSync(join(HERE, "body-figure.svg"), "utf8")), ...checkDocs()];
  }
  for (const p of problems) console.log(p);
  if (problems.length > 0) {
    console.error(`check-figure: ${problems.length} problem(s).`);
    process.exit(1);
  }
  console.log("check-figure: ok");
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main(process.argv.slice(2));
