// Shared raw-colour matcher for the ESLint rule and the wl-check-colours CLI (D-0019).
// Plain ESM, no build step: turbo `lint` does not depend on `^build`.

/** Hex colours: #rgb, #rgba, #rrggbb, #rrggbbaa. Not an id selector (`#add {`), hash
 *  route (`/#fab`), entity (`&#123;`) or a longer word (`#fade-in`). */
const HEX =
  /(?<![\w&#/])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![\w-]|\s*[{.[:>+~])/gi;

/** Literal colour functions. `color-mix(in oklch, var(--wl-…) …)` has no `oklch(` so passes. */
const FN = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi;

/** Fragment references such as `url(#fade)` point at ids, not colours. */
const URL_FRAGMENT = /url\(\s*["']?#[^)]*\)/gi;

/** Markup attributes whose values are ids or links, never colours (CLI only). */
const MARKUP_LINK_ATTR = /\b(?:xlink:href|href|id|for|to)\s*=\s*(?:"[^"]*"|'[^']*')/gi;

const blank = (m) => " ".repeat(m.length);

/**
 * Find raw colour values in `text`.
 * @param {string} text
 * @param {{ markup?: boolean }} [options] `markup: true` also ignores href/id/for/to values.
 * @returns {{ index: number, value: string }[]}
 */
export function findRawColours(text, options = {}) {
  let scan = text.replace(URL_FRAGMENT, blank);
  if (options.markup) scan = scan.replace(MARKUP_LINK_ATTR, blank);
  const found = [];
  for (const re of [HEX, FN]) {
    re.lastIndex = 0;
    for (const m of scan.matchAll(re)) found.push({ index: m.index, value: m[0] });
  }
  return found.sort((a, b) => a.index - b.index);
}

export const MESSAGE =
  "Raw colour {{value}}: use a token from @workoutlab/design-tokens (var(--wl-color-…) or tokens.color.…).";
