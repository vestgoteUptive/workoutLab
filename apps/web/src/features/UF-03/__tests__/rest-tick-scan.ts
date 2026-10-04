// T-0418 AC-1: a UF-03 copy of the T-0304a "no tick counting" scanner
// (`features/UF-09/__tests__/tick-scan.ts`). A test in `features/UF-03` may not deep-import
// `features/UF-09/__tests__` (D-0071 §4), so the scan is copied here rather than imported. It
// strips comments and string literals first, so a CSS custom property inside a string
// (`"var(--wl-color-accent)"`) never matches, and it never greps a bare `--`.
const NAME = String.raw`[\w$.\]\[]*(?:remaining|timer|seconds|secs|countdown)[\w$.\]\[]*`;

const PATTERNS: RegExp[] = [
  // `remaining--`, `timer.durationS++`, `secs -= 1`, `countdown += 1`
  new RegExp(String.raw`(?<![\w$])${NAME}\s*(?:--|\+\+|-=\s*1(?![\d.])|\+=\s*1(?![\d.]))`, "i"),
  // `--remaining`, `++seconds`
  new RegExp(String.raw`(?<![\w$)\]])(?:--|\+\+)\s*${NAME}`, "i"),
  // `setRemaining(n => n - 1)`, `setSecs((s) => s + 1)`
  /\bset\w*\(\s*\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>\s*\1\s*[-+]\s*1(?![\d.])/,
];

/** Source without comments, string or template literals (their text becomes spaces). */
export function stripCommentsAndStrings(source: string): string {
  return source.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g,
    (m) => m.replace(/[^\n]/g, " "),
  );
}

/** The tick-counting fragments found in `source` (empty when clean). */
export function tickCountingMatches(source: string): string[] {
  const code = stripCommentsAndStrings(source);
  const found: string[] = [];
  for (const re of PATTERNS) {
    const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    for (const m of code.matchAll(global)) found.push(m[0]);
  }
  return found;
}

/** `setInterval(`/`setTimeout(` calls found in `source` (AC-1: "no own timer"). */
export function ownTimerMatches(source: string): string[] {
  const code = stripCommentsAndStrings(source);
  return [...code.matchAll(/\b(?:setInterval|setTimeout)\s*\(/g)].map((m) => m[0]);
}
