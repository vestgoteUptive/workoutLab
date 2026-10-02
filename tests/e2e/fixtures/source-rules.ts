// T-0430 (D-0086, D-0091): source rules for the guarded e2e specs, as pure functions so
// `fixture-guard.spec.ts` can unit-test them on planted strings and then run them over the real
// spec files. Each rule takes `(file, source)` and returns the offending lines as `file:line`
// (1-based), in source order. An empty array means the file passes.

/** The pattern an own console listener matches (T-0430 AC1), checked on code only. */
const OWN_LISTENER = /\.on\(\s*["'](console|pageerror)["']/;

/** The call AC3 checks, and the ticket reference its comment block must carry. */
const ALLOW_CALL = "consoleGuard.allow(";
const TICKET_REF = /T-\d{4}/;

/** Characters after which a `/` starts a regex literal rather than a division. */
const REGEX_PRECEDERS = new Set(["", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";"]);

/**
 * Returns `source` with every `//` and `/* *\/` comment blanked to spaces, newlines kept, so line
 * numbers survive. String, template and regex literals are skipped over, so a `//` inside
 * `"http://…"` or a quote inside `/"/` doesn't throw the scan off. Template `${…}` nesting is
 * not tracked: the whole template is treated as one literal, which only matters for code inside
 * a `${}` (none of the specs put a listener there).
 */
export function stripComments(source: string): string {
  let out = "";
  let i = 0;
  let lastSignificant = "";
  const n = source.length;
  const blank = (text: string) => text.replace(/[^\n]/g, " ");

  while (i < n) {
    const c = source[i]!;
    const next = source[i + 1];

    if (c === "/" && next === "/") {
      let end = source.indexOf("\n", i);
      if (end === -1) end = n;
      out += blank(source.slice(i, end));
      i = end;
      continue;
    }
    if (c === "/" && next === "*") {
      let end = source.indexOf("*/", i + 2);
      end = end === -1 ? n : end + 2;
      out += blank(source.slice(i, end));
      i = end;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n && source[j] !== c) {
        if (source[j] === "\\") j++;
        else if (c !== "`" && source[j] === "\n") break;
        j++;
      }
      j = Math.min(j + 1, n);
      out += source.slice(i, j);
      lastSignificant = c;
      i = j;
      continue;
    }
    if (c === "/" && REGEX_PRECEDERS.has(lastSignificant)) {
      let j = i + 1;
      let inClass = false;
      while (j < n && source[j] !== "\n") {
        const d = source[j]!;
        if (d === "\\") j++;
        else if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) break;
        j++;
      }
      j = Math.min(j + 1, n);
      out += source.slice(i, j);
      lastSignificant = "/";
      i = j;
      continue;
    }

    out += c;
    if (!/\s/.test(c)) lastSignificant = c;
    i++;
  }
  return out;
}

/**
 * T-0430 AC1: every line, outside comments, that registers its own `console` or `pageerror`
 * listener (`.on("console"`, `.on('pageerror'`). A guarded spec doesn't need one: the
 * `consoleGuard` auto fixture already fails the test on either, and a private copy drifts from
 * it (it reports the `Failed to load resource:` lines the guard deliberately exempts).
 */
export function ownConsoleListeners(file: string, source: string): string[] {
  const found: string[] = [];
  stripComments(source)
    .split("\n")
    .forEach((line, index) => {
      if (OWN_LISTENER.test(line)) found.push(`${file}:${index + 1}`);
    });
  return found;
}

/**
 * The contiguous block of `//` lines directly above line `index` (0-based), nearest last. A blank
 * line or any code line ends the block, so a ticket reference two paragraphs up doesn't count.
 */
export function commentBlockAbove(lines: readonly string[], index: number): string[] {
  const block: string[] = [];
  for (let k = index - 1; k >= 0; k--) {
    const trimmed = lines[k]!.trim();
    if (!trimmed.startsWith("//")) break;
    block.unshift(trimmed);
  }
  return block;
}

/**
 * T-0430 AC3: every line containing `consoleGuard.allow(` whose comment block directly above
 * (see `commentBlockAbove`) has no line matching `T-\d{4}`. Replaces the T-0425 check, which
 * looked only at the single line above and accepted any code there that held the text.
 */
export function allowCommentViolations(file: string, source: string): string[] {
  const lines = source.split("\n");
  const found: string[] = [];
  lines.forEach((line, index) => {
    if (!line.includes(ALLOW_CALL)) return;
    const block = commentBlockAbove(lines, index);
    if (!block.some((comment) => TICKET_REF.test(comment))) found.push(`${file}:${index + 1}`);
  });
  return found;
}
