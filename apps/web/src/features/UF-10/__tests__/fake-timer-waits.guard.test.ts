// @vitest-environment node
// T-0930 UF-10.1: a source guard for the T-0926 shape. Testing Library's `waitFor` polls on
// `setInterval` and only detects *Jest* fake timers, so in a test file that fakes `setInterval`
// (an explicit `toFake` with it, or `vi.useFakeTimers()` with no options) a wait on a NON-DOM
// condition (a spy count, a flag) re-checks only when the DOM mutates and can time out. Use
// `pollUntil` from `./test-helpers.js` there. A deliberate exception takes a `// dom-wait: <reason>`
// comment on the line above (the reason must not be empty).
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

export interface Finding {
  line: number;
  text: string;
}

/** What counts as a DOM read inside a wait body. */
const DOM_READS = [
  "screen.",
  "within(",
  "container",
  "document.",
  "rowAreas(",
  "rowValue(",
  "rowElements(",
  "rowFill(",
  "rowBarWidth(",
  "row(",
  "outlinedRowAreas(",
  "mapButton",
  "h1(",
  "contributorTexts(",
  "contributorRows(",
  "noDataLine(",
  "location(",
];

const lineOf = (src: string, index: number): number => src.slice(0, index).split("\n").length;

/** The text between the parens that open at `open` (which points at `(`). */
function callBody(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth += 1;
    else if (src[i] === ")" && --depth === 0) return src.slice(open + 1, i);
  }
  return src.slice(open + 1);
}

export function fakesSetInterval(src: string): boolean {
  for (const m of src.matchAll(/\buseFakeTimers\s*\(/g)) {
    const body = callBody(src, m.index + m[0].length - 1);
    if (!/\btoFake\b/.test(body)) return true; // no list: fakes everything
    const list = /\btoFake\s*:\s*\[([^\]]*)\]/.exec(body);
    if (!list || /["']setInterval["']/.test(list[1] ?? "")) return true;
  }
  return false;
}

export function countWaitFor(src: string): number {
  return [...src.matchAll(/(?<![.\w])waitFor\s*\(/g)].length;
}

export function scan(src: string): Finding[] {
  if (!fakesSetInterval(src)) return [];
  const lines = src.split("\n");
  const findings: Finding[] = [];
  for (const m of src.matchAll(/(?<![.\w])waitFor\s*\(/g)) {
    const body = callBody(src, m.index + m[0].length - 1);
    if (DOM_READS.some((token) => body.includes(token))) continue;
    const line = lineOf(src, m.index);
    if (/\/\/\s*dom-wait:\s*\S/.test(lines[line - 2] ?? "")) continue;
    findings.push({ line, text: (lines[line - 1] ?? "").trim() });
  }
  return findings;
}

const NON_DOM = "await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));";
const fixture = (fake: string, wait: string, before = ""): string =>
  `${fake}\nit("x", async () => {\n${before}${wait}\n});\n`;
const FAKE_INTERVAL = 'vi.useFakeTimers({ toFake: ["setInterval", "Date"] });';

describe("T-0930 fake-timer wait guard: the scanner", () => {
  it("T-0930 AC3 a non-DOM waitFor under a faked setInterval is one finding on its line", () => {
    const found = scan(fixture(FAKE_INTERVAL, NON_DOM));
    expect(found).toEqual([{ line: 3, text: NON_DOM }]);
  });

  it("T-0930 AC3 pollUntil is not a finding", () => {
    expect(scan(fixture(FAKE_INTERVAL, NON_DOM.replace("waitFor", "pollUntil")))).toEqual([]);
  });

  it("T-0930 AC3 a DOM read is not a finding", () => {
    const dom = "await waitFor(() => expect(rowAreas()).toHaveLength(9));";
    expect(scan(fixture(FAKE_INTERVAL, dom))).toEqual([]);
  });

  it("T-0930 AC3 faking only setTimeout and clearTimeout is not a finding", () => {
    const fake = 'vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });';
    expect(scan(fixture(fake, NON_DOM))).toEqual([]);
  });

  it("T-0930 AC3 useFakeTimers() with no options counts as faking setInterval", () => {
    expect(scan(fixture("vi.useFakeTimers();", NON_DOM))).toHaveLength(1);
    expect(scan(fixture("vi.useFakeTimers({ now: 5 });", NON_DOM))).toHaveLength(1);
  });

  it("T-0930 AC3 a file that fakes no timers is not a finding", () => {
    expect(scan(fixture("", NON_DOM))).toEqual([]);
  });

  it("T-0930 AC3 vi.waitFor is not a Testing Library wait", () => {
    expect(
      scan(fixture(FAKE_INTERVAL, NON_DOM.replace("await waitFor", "await vi.waitFor"))),
    ).toEqual([]);
  });

  it("T-0930 AC3 a multi-line non-DOM wait is found on its first line", () => {
    const wait = "await waitFor(() =>\n  expect(refresh).toHaveBeenCalledTimes(1),\n);";
    expect(scan(fixture(FAKE_INTERVAL, wait)).map((f) => f.line)).toEqual([3]);
  });

  it("T-0930 AC3 a dom-wait comment with a reason clears one finding, an empty reason does not", () => {
    const withReason = scan(fixture(FAKE_INTERVAL, NON_DOM, "// dom-wait: shows the miss\n"));
    expect(withReason).toEqual([]);
    const empty = scan(fixture(FAKE_INTERVAL, NON_DOM, "// dom-wait:   \n"));
    expect(empty).toHaveLength(1);
    const twoWaits = scan(
      fixture(FAKE_INTERVAL, `${NON_DOM}\n${NON_DOM}`, "// dom-wait: one only\n"),
    );
    expect(twoWaits).toHaveLength(1);
  });
});

describe("T-0930 fake-timer wait guard: the real UF-10 test files", () => {
  it("T-0930 AC4 no non-DOM waitFor runs under a faked setInterval, and the scan is not vacuous", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const self = "fake-timer-waits.guard.test.ts";
    const files = readdirSync(dir).filter((f) => /\.test\.tsx?$/.test(f) && f !== self);
    expect(files.length).toBeGreaterThanOrEqual(10);
    let intervalFiles = 0;
    let waits = 0;
    const found: string[] = [];
    for (const file of files) {
      const src = readFileSync(join(dir, file), "utf8");
      if (fakesSetInterval(src)) intervalFiles += 1;
      waits += countWaitFor(src);
      for (const f of scan(src)) found.push(`${file}:${f.line}: ${f.text}`);
    }
    expect(intervalFiles).toBeGreaterThanOrEqual(1);
    expect(waits).toBeGreaterThanOrEqual(5);
    expect(found).toEqual([]);
  });
});
