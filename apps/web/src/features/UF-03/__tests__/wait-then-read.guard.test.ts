// @vitest-environment node
// T-0922 UF-03.1: guard against the T-0663 test race. A test waits for a card heading, then reads a
// DIFFERENT element synchronously (`screen.getBy…`). On a loaded machine the heading commits before
// the rest of the row, so the read throws. Fix: wait on the element itself (`await screen.findBy…`),
// or mark a genuine same-commit read with `// same-commit: <reason>`. A static source scan, no DOM.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

export interface Finding {
  line: number;
  text: string;
}
export interface ScanResult {
  findings: Finding[];
  headingWaits: number;
}

const READY = /\bawait\s+(waitFor\(|screen\.findBy|screen\.findAllBy|findEl\()/;
const HEADING_FIND = /\bawait\s+screen\.findByRole\(\s*"heading"/;
const AWAIT_WAITFOR = /\bawait\s+waitFor\(/;
const SYNC_READ = /\bscreen\.(getBy|getAllBy)\w*\(/;
const MARKER = /\/\/\s*same-commit:\s*\S/;
const TEST_START = /^\s*(it|test)(\.\w+)?\(/;
const BLOCK_END = /^ {0,2}\}\)?;?\s*$/;

/** Blank out string contents and line comments so parens inside them are not counted. */
function code(line: string): string {
  return line
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""')
    .replace(/\/\/.*$/, "");
}

/** Index of the line where the call opened at `from` closes (paren-balanced). */
function spanEnd(lines: string[], from: number, opener: RegExp): number {
  let depth = 0;
  let started = false;
  for (let i = from; i < lines.length; i++) {
    const l = lines[i] ?? "";
    const c = code(i === from ? l.slice(Math.max(0, l.search(opener))) : l);
    for (const ch of c) {
      if (ch === "(") {
        depth++;
        started = true;
      } else if (ch === ")") depth--;
    }
    if (started && depth <= 0) return i;
  }
  return from;
}

export function scanWaitThenRead(source: string): ScanResult {
  const lines = source.split("\n");
  const findings: Finding[] = [];
  let headingWaits = 0;
  let armed = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const c = raw.replace(/^\s*\/\/.*$/, "");
    if (TEST_START.test(raw) || BLOCK_END.test(raw)) {
      armed = false;
      continue;
    }
    if (HEADING_FIND.test(c) || AWAIT_WAITFOR.test(c)) {
      const opener = HEADING_FIND.test(c) ? HEADING_FIND : AWAIT_WAITFOR;
      const end = spanEnd(lines, i, opener);
      const span = lines.slice(i, end + 1).join("\n");
      const isHeading = HEADING_FIND.test(c) || /getByRole\(\s*"heading"/.test(span);
      if (isHeading) headingWaits++;
      armed = isHeading;
      i = end;
      continue;
    }
    if (READY.test(c)) {
      armed = false;
      i = spanEnd(lines, i, READY);
      continue;
    }
    if (armed && SYNC_READ.test(c) && !MARKER.test(raw) && !MARKER.test(lines[i - 1] ?? "")) {
      findings.push({ line: i + 1, text: raw.trim() });
    }
  }
  return { findings, headingWaits };
}

export interface FocusScanResult {
  findings: Finding[];
  focusWaits: number;
}

const ACTIVE = /\bdocument\.activeElement\b/;
const SETTLE = /\bawait\s+settle\(/;
const FOCUS_NEGATION = /\bdocument\.activeElement\)\s*\.not\./;

/** T-0932 UF-03.1: a focus read (`document.activeElement`) that follows `await settle(` or a
 *  non-focus `await waitFor(` / `await screen.findBy…` in the same test, with no
 *  `waitFor(() => … document.activeElement …)` in between. The dialog's removal and the effect that
 *  focuses the Swap button are two steps, so the first can be seen before the second (3 of 200
 *  loaded runs). A read straight after a click (a synchronous focus move) is legal, as is a
 *  `.not.` read (it can only pass late, never fail late). `// same-commit: <reason>` clears one. */
export function scanFocusReads(source: string): FocusScanResult {
  const lines = source.split("\n");
  const findings: Finding[] = [];
  let focusWaits = 0;
  let armed = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const c = raw.replace(/^\s*\/\/.*$/, "");
    if (TEST_START.test(raw) || BLOCK_END.test(raw)) {
      armed = false;
      continue;
    }
    if (SETTLE.test(c)) {
      armed = true;
      continue;
    }
    if (READY.test(c)) {
      const end = spanEnd(lines, i, READY);
      const span = lines.slice(i, end + 1).join("\n");
      if (ACTIVE.test(span)) {
        focusWaits++;
        armed = false;
      } else armed = true;
      i = end;
      continue;
    }
    if (
      armed &&
      ACTIVE.test(code(c)) &&
      !FOCUS_NEGATION.test(c) &&
      !MARKER.test(raw) &&
      !MARKER.test(lines[i - 1] ?? "")
    ) {
      findings.push({ line: i + 1, text: raw.trim() });
    }
  }
  return { findings, focusWaits };
}

const lines = (...l: string[]) => l.join("\n");
const WAIT_ONE = 'await waitFor(() => screen.getByRole("heading", { level: 2, name: "X" }));';
const READ = 'expect(screen.getByRole("button", { name: "Y" })).toBeTruthy();';

describe("T-0922 scanner", () => {
  it("AC1: heading wait, settle(), sync read: one finding on line 3", () => {
    const r = scanWaitThenRead(lines(WAIT_ONE, "await settle();", READ));
    expect(r.findings.map((f) => f.line)).toEqual([3]);
  });

  it("AC2: multi-line heading waitFor and a findByRole heading wait are both flagged", () => {
    const multi = lines(
      "await waitFor(() =>",
      '  expect(screen.getByRole("heading", { level: 2 })).toBeTruthy(),',
      ");",
      'fireEvent.change(screen.getByRole("textbox", { name: "Set 1 reps" }), {});',
    );
    expect(scanWaitThenRead(multi).findings).toHaveLength(1);
    const find = lines(
      'await screen.findByRole("heading", { level: 2, name: "X" });',
      'fireEvent.change(screen.getByRole("textbox", { name: "Set 1 reps" }), {});',
    );
    expect(scanWaitThenRead(find).findings).toHaveLength(1);
  });

  it("AC3: a ready-signal await clears it; a wait with no read before the test ends is clean", () => {
    const fixed = lines(
      WAIT_ONE,
      'expect(await screen.findByRole("textbox", { name: "Set 1 weight in kg" })).toHaveValue("1");',
      'expect(screen.getByRole("textbox", { name: "Set 1 reps" })).toHaveValue("6");',
    );
    expect(scanWaitThenRead(fixed).findings).toEqual([]);
    const ends = lines('it("t", async () => {', `  ${WAIT_ONE}`, "});", READ);
    expect(scanWaitThenRead(ends).findings).toEqual([]);
    const nextTest = lines(
      'it("a", async () => {',
      `  ${WAIT_ONE}`,
      "  });",
      'it("b", () => {',
      `  ${READ}`,
      "});",
    );
    expect(scanWaitThenRead(nextTest).findings).toEqual([]);
  });

  it("AC4: a same-commit marker with a reason clears it; an empty reason does not", () => {
    const ok = lines(
      WAIT_ONE,
      "// same-commit: Swap button and h2 render in one card commit",
      READ,
    );
    expect(scanWaitThenRead(ok).findings).toEqual([]);
    const empty = lines(WAIT_ONE, "// same-commit:", READ);
    expect(scanWaitThenRead(empty).findings).toHaveLength(1);
    const sameLine = lines(WAIT_ONE, `${READ} // same-commit: one commit`);
    expect(scanWaitThenRead(sameLine).findings).toEqual([]);
  });

  it("reads inside the wait's own callback, and in comments, are not findings", () => {
    const src = lines(
      "await waitFor(() => {",
      '  expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();',
      '  expect(screen.getByRole("button", { name: "Y" })).toBeTruthy();',
      "});",
      '// screen.getByRole("button", { name: "Z" })',
    );
    expect(scanWaitThenRead(src).findings).toEqual([]);
  });
});

describe("T-0932 AC4 focus-read scanner", () => {
  const BTN = "expect(document.activeElement).toBe(button);";
  it("settle() then a synchronous focus read: one finding on line 2", () => {
    expect(scanFocusReads(lines("await settle();", BTN)).findings.map((f) => f.line)).toEqual([2]);
  });

  it("a non-focus waitFor or findBy then a synchronous focus read is flagged", () => {
    const w = lines('await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());', BTN);
    expect(scanFocusReads(w).findings.map((f) => f.line)).toEqual([2]);
    const f = lines('await screen.findByRole("dialog", { name: "X" });', BTN);
    expect(scanFocusReads(f).findings.map((x) => x.line)).toEqual([2]);
  });

  it("a waitFor on the focus itself is clean, single- or multi-line, and clears the arm", () => {
    expect(scanFocusReads(`await waitFor(() => ${BTN.replace(";", ")")};`).findings).toEqual([]);
    const multi = lines(
      "await settle();",
      "await waitFor(() =>",
      "  expect(document.activeElement).toBe(button),",
      ");",
      BTN,
    );
    const r = scanFocusReads(multi);
    expect(r.findings).toEqual([]);
    expect(r.focusWaits).toBe(1);
  });

  it("a focus read right after a click, with no wait between, is clean (a synchronous focus move)", () => {
    expect(scanFocusReads(lines("fireEvent.click(button);", BTN)).findings).toEqual([]);
  });

  it("a .not. read is clean (it cannot fail late)", () => {
    const src = lines(
      'await screen.findByRole("dialog");',
      "expect(document.activeElement).not.toBe(b);",
    );
    expect(scanFocusReads(src).findings).toEqual([]);
  });

  it("a same-commit marker with a reason clears one finding; an empty reason does not", () => {
    expect(
      scanFocusReads(
        lines("await settle();", "// same-commit: focus() runs inside the click's act", BTN),
      ).findings,
    ).toEqual([]);
    expect(scanFocusReads(lines("await settle();", "// same-commit:", BTN)).findings).toHaveLength(
      1,
    );
  });

  it("the arm does not leak into the next test", () => {
    const src = lines(
      'it("a", async () => {',
      "  await settle();",
      "});",
      'it("b", () => {',
      `  ${BTN}`,
      "});",
    );
    expect(scanFocusReads(src).findings).toEqual([]);
  });
});

describe("T-0922 AC5: the real UF-03 tests have no wait-then-read", () => {
  const dir = __dirname;
  const files = readdirSync(dir).filter((n) => /\.test\.tsx$/.test(n));
  const results = files.map((n) => ({
    n,
    r: scanWaitThenRead(readFileSync(resolve(dir, n), "utf8")),
  }));

  it("reads enough files and sees enough heading waits (not vacuous)", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(results.reduce((a, x) => a + x.r.headingWaits, 0)).toBeGreaterThanOrEqual(3);
  });

  it("reports 0 findings", () => {
    const found = results.flatMap((x) => x.r.findings.map((f) => `${x.n}:${f.line} ${f.text}`));
    expect(found).toEqual([]);
  });

  it("T-0932 AC4: reports 0 focus-read findings, and sees the focus waits (not vacuous)", () => {
    const fr = files.map((n) => ({ n, r: scanFocusReads(readFileSync(resolve(dir, n), "utf8")) }));
    const found = fr.flatMap((x) => x.r.findings.map((f) => `${x.n}:${f.line} ${f.text}`));
    expect(found).toEqual([]);
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(fr.reduce((a, x) => a + x.r.focusWaits, 0)).toBeGreaterThanOrEqual(3);
  });
});
