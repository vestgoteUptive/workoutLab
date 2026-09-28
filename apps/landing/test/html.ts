// Small, dependency-free HTML reader for the dist-based test suite. The pages
// under test are Astro's own static output — well-formed, void-element-aware
// HTML with no scripting — so a purpose-built reader is enough; a general
// HTML5 parser would be overkill for this one build's output shape.

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  nbsp: " ",
};

/** Decodes the small set of entities Astro/HTML actually emits (AC9). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z0-9]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const codePoint =
        body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : whole;
    }
    const key = body.toLowerCase();
    return key in ENTITIES ? ENTITIES[key]! : whole;
  });
}

export interface ParsedTag {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  /** Decoded text directly inside this tag, up to its closing tag (shallow). */
  readonly text: string;
}

function parseAttrs(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrString))) {
    const name = m[1]!.toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    attrs[name] = decodeEntities(value);
  }
  return attrs;
}

/** Finds every occurrence of `<tagName ...>` (self-closing or not) and its attributes. */
export function findTags(html: string, tagName: string): ParsedTag[] {
  const out: ParsedTag[] = [];
  const openRe = new RegExp(`<${tagName}\\b([^>]*)>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(html))) {
    const attrs = parseAttrs(m[1] ?? "");
    const afterOpen = html.slice(m.index + m[0].length);
    const closeIdx = afterOpen.search(new RegExp(`</${tagName}\\s*>`, "i"));
    const inner = closeIdx >= 0 ? afterOpen.slice(0, closeIdx) : "";
    out.push({ tag: tagName.toLowerCase(), attrs, text: decodeEntities(stripTags(inner)).trim() });
  }
  return out;
}

/** Removes any nested tags, leaving only text content. */
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

/** All visible text in `<body>`, tags stripped and entities decoded (AC9). */
export function bodyText(html: string): string {
  const bodyMatch = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html);
  const body = bodyMatch ? bodyMatch[1]! : html;
  return decodeEntities(stripTags(body)).replace(/\s+/g, " ").trim();
}

export function titleText(html: string): string | undefined {
  return findTags(html, "title")[0]?.text;
}

export function hasScriptTag(html: string): boolean {
  return /<script\b/i.test(html);
}
