// T-0315 (D-0207, UF-04.2 / UF-10.1; v2 art T-0660, D-0225): the body figure asset and its docs pass check-figure.mjs,
// and each check catches a planted fault in the SVG.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot, runCli } from "./helpers";

const dir = resolve(repoRoot, "Design-docs/docs/design/assets/body-figure");
const checker = resolve(dir, "check-figure.mjs");
const svg = readFileSync(resolve(dir, "body-figure.svg"), "utf8");

function check(args: string[], input?: string) {
  const r = spawnSync(process.execPath, [checker, ...args], { encoding: "utf8", input });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}
const checkSvg = (text: string) => check(["--svg", "-"], text);

/** Replace exactly one occurrence, so a fault is never planted by accident elsewhere. */
function plant(from: string | RegExp, to: string): string {
  const out = svg.replace(from, to);
  expect(out, `fault ${String(from)} was planted`).not.toBe(svg);
  return out;
}

describe("T-0315 body figure: shipped asset and docs", () => {
  it("check-figure passes on the asset and the docs (AC-1, AC-2, AC-3, AC-5)", () => {
    const r = check([]);
    expect(r.out).toContain("check-figure: ok");
    expect(r.status).toBe(0);
  });
  it("wl-check-colours finds no raw colour in the asset folder (AC-2, AC-6)", () => {
    const r = runCli([dir]);
    expect(r.stdout + r.stderr).toBe("");
    expect(r.status).toBe(0);
  });
});

describe("T-0315 body figure: planted faults are caught", () => {
  const cases: [string, string, RegExp][] = [
    // AC-1
    [
      "a calves path removed",
      plant(/<path class="wl-fig__region" data-area="calves"[^>]*><\/path>/g, ""),
      /AC-1: data-area values/,
    ],
    ["an unknown area", plant('data-area="chest"', 'data-area="neck"'), /AC-1: data-area values/],
    [
      "chest drawn on the back view",
      plant('data-area="glutes"', 'data-area="chest"'),
      /AC-1: back view/,
    ],
    [
      "quads missing from the front",
      plant(/data-area="quads"/g, 'data-area="hamstrings"'),
      /AC-1: front view/,
    ],
    // AC-2
    [
      "a fill attribute",
      plant('class="wl-fig__body"', 'fill="none" class="wl-fig__body"'),
      /AC-2: <path> has a fill attribute/,
    ],
    [
      "a stroke attribute",
      plant('class="wl-fig__body"', 'stroke="var(--x)" class="wl-fig__body"'),
      /AC-2: <path> has a stroke attribute/,
    ],
    [
      "a style attribute",
      plant("<svg ", '<svg style="display:block" '),
      /AC-2: <svg> has a style attribute/,
    ],
    [
      "a hex in a comment",
      plant("<defs>", "<!-- #a1b2c3 --><defs>"),
      /AC-2: colour literal "#a1b2c3"/,
    ],
    [
      "an rgb( literal",
      plant("<defs>", "<!-- rgb(1,2,3) --><defs>"),
      /AC-2: colour literal "rgb\("/,
    ],
    [
      "an hsla( literal",
      plant("<defs>", "<!-- hsla(1,2%,3%,1) --><defs>"),
      /AC-2: colour literal "hsla\("/,
    ],
    ["a colour name", plant("<defs>", "<!-- in white --><defs>"), /AC-2: colour name "white"/],
    // AC-3
    [
      "a region that is a rect",
      plant(
        /<path (class="wl-fig__region" data-area="core")[^>]*><\/path>/,
        '<rect $1 width="1" height="1"/>',
      ),
      /AC-3: data-area="core" is a <rect>/,
    ],
    [
      "a region without its class",
      plant('class="wl-fig__region" data-area="arms"', 'class="x" data-area="arms"'),
      /AC-3: data-area="arms" path lacks class wl-fig__region/,
    ],
    [
      "a neutral part without wl-fig__body",
      plant(/class="wl-fig__body"(?= d=)/, 'class="wl-fig__part"'),
      /AC-3: an untagged <path> is not wl-fig__body/,
    ],
    ["the wrong viewBox", plant('viewBox="0 0 212 215"', 'viewBox="0 0 240 290"'), /AC-3: viewBox/],
    [
      "the c2pa metadata block put back",
      plant("<defs>", "<metadata>x</metadata><defs>"),
      /AC-3: the file has a <metadata> block/,
    ],
    [
      "a seam path left in",
      plant('class="wl-fig__body"', 'data-seam="chest" class="wl-fig__body"'),
      /AC-3: a data-seam path is left/,
    ],
    [
      "a hatch without wl-fig__hatch-line",
      plant('class="wl-fig__hatch-line"', 'class="wl-fig__hatch-stripe"'),
      /AC-3: the hatch pattern has no element with class wl-fig__hatch-line/,
    ],
    [
      "no hatch pattern",
      plant('id="wl-fig-hatch"', 'id="hatch"'),
      /AC-3: <pattern id="wl-fig-hatch"> is missing/,
    ],
    ["a tabindex", plant("<svg ", '<svg tabindex="0" '), /AC-3: <svg> has a tabindex/],
    ["a role", plant("<svg ", '<svg role="img" '), /AC-3: <svg> has a role/],
    ["a title", plant("<defs>", "<title>Body</title><defs>"), /AC-3: the file has a <title>/],
    // validity
    ["an unclosed group", plant("</g>\n</svg>", "</svg>"), /invalid XML/],
    ["a stray <", plant("<defs>", "<defs> < "), /invalid markup/],
  ];
  it.each(cases)("%s", (_name, text, message) => {
    const r = checkSvg(text);
    expect(r.out).toMatch(message);
    expect(r.status).toBe(1);
  });
  it("the unmodified asset passes the same stdin path", () => {
    expect(checkSvg(svg).status).toBe(0);
  });
});
