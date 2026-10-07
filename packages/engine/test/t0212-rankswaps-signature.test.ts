// T-0212 UF-08.3 UF-05.1 (D-0130): rule 12 states rankSwaps as (… now, tz), the order of the
// code (D-0056 §2). AC1 the line, AC2 doc and code agree (TS compiler API), AC3 the two rule 12
// guards accept exactly that line, AC4 traceability. T-0533 (D-0199 §3) moves AC1 to the
// D-0199 line and AC2 to 9 parameters (`…, now, tz, excludeIds`); AC3 runs on the D-0130-era doc.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { R12_E1_LINE } from "./fixtures/r12-e1-d0056.js";
import { RULE12_SIGNATURE_LINE } from "./fixtures/rule12-signature-d0130.js";
import { RULE12_SIGNATURE_LINE_D0199 } from "./fixtures/rule12-signature-d0199.js";
import { rule12Slice, t0204GuardOk, t0224GuardOk } from "./rule12-guards.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_DIR = path.resolve(TEST_DIR, "..");
const REPO_DIR = path.resolve(ENGINE_DIR, "..", "..");
const RULES = path.join(REPO_DIR, "docs", "engine-rules.md");
const SWAPS = path.join(ENGINE_DIR, "src", "swaps.ts");

const doc = readFileSync(RULES, "utf8");
const SIGNATURE_PREFIX = "`rankSwaps(current, ";
const EXPECTED_CODE = [
  "currentExerciseId",
  "reason",
  "session",
  "profile",
  "library",
  "history",
  "now",
  "tz",
  "excludeIds",
] as const;

/** Parameter names of the exported `rankSwaps` function declaration in `source`. */
export function codeParams(source: string): string[] {
  const file = ts.createSourceFile("swaps.ts", source, ts.ScriptTarget.Latest, false);
  for (const st of file.statements) {
    if (
      ts.isFunctionDeclaration(st) &&
      st.name?.text === "rankSwaps" &&
      (ts.getCombinedModifierFlags(st) & ts.ModifierFlags.Export) !== 0
    ) {
      return st.parameters.map((p) => p.name.getText(file));
    }
  }
  throw new Error("no exported function rankSwaps");
}

/** The doc's argument list on the signature line, with the doc names mapped to the code names. */
export function docParams(line: string): string[] {
  const m = /^`rankSwaps\(([^)]*)\)`/.exec(line);
  if (m === null) throw new Error(`not a rankSwaps signature line: ${line}`);
  const alias: Record<string, string> = { current: "currentExerciseId", "reason | null": "reason" };
  return (m[1] ?? "").split(",").map((a) => {
    // A default value (`excludeIds = []`, D-0199 §3) is not part of the name.
    const t = a.replace(/=.*$/, "").trim();
    return alias[t] ?? t;
  });
}

/** Positions where the doc and code lists differ (a length difference counts every extra slot). */
export function mismatches(docList: readonly string[], codeList: readonly string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.max(docList.length, codeList.length); i++) {
    if (docList[i] !== codeList[i]) out.push(i);
  }
  return out;
}

function signatureLines(d: string): string[] {
  return d.split("\n").filter((l) => l.startsWith(SIGNATURE_PREFIX));
}

describe("T-0212 the rule 12 signature line (D-0130 §1)", () => {
  it("T-0212 AC1 rule-12 exactly one line starts with `rankSwaps(current, and it is the D-0199 fixture's after line", () => {
    const lines = signatureLines(doc);
    expect(lines).toEqual([RULE12_SIGNATURE_LINE_D0199.after]);
    expect(lines[0]).toContain("history, now, tz, excludeIds = [])");
    expect(doc.split("\n").filter((l) => l.includes("history, tz, now)"))).toEqual([]);
    expect(lines).not.toContain(RULE12_SIGNATURE_LINE.after);
    // The line sits in rule 12, right under its heading.
    const r12 = doc.indexOf("\n## 12. Swap ranking");
    expect(doc.indexOf(`\n${RULE12_SIGNATURE_LINE_D0199.after}\n`)).toBe(
      doc.indexOf("\n", r12 + 1),
    );
  });

  it("T-0533 AC4 rule-12 the D-0199 fixture's before is D-0130's after and they differ only in `, excludeIds = []`", () => {
    expect(RULE12_SIGNATURE_LINE_D0199.before).toBe(RULE12_SIGNATURE_LINE.after);
    expect(
      RULE12_SIGNATURE_LINE_D0199.before.replace(
        "history, now, tz)",
        "history, now, tz, excludeIds = [])",
      ),
    ).toBe(RULE12_SIGNATURE_LINE_D0199.after);
    expect(RULE12_SIGNATURE_LINE_D0199.before).not.toBe(RULE12_SIGNATURE_LINE_D0199.after);
  });

  it("T-0212 AC1 rule-12 the fixture's before and after differ only in `tz, now` → `now, tz`", () => {
    expect(RULE12_SIGNATURE_LINE.before.replace("history, tz, now)", "history, now, tz)")).toBe(
      RULE12_SIGNATURE_LINE.after,
    );
    expect(RULE12_SIGNATURE_LINE.before).not.toBe(RULE12_SIGNATURE_LINE.after);
  });
});

describe("T-0212 doc and code agree (D-0130 §3)", () => {
  it("T-0212 AC2 rule-12 the code's rankSwaps parameters are (currentExerciseId, reason, session, profile, library, history, now, tz, excludeIds)", () => {
    expect(codeParams(readFileSync(SWAPS, "utf8"))).toEqual([...EXPECTED_CODE]);
  });

  it("T-0212 AC2 rule-12 the rule 12 signature lists the same parameters in the same order", () => {
    const code = codeParams(readFileSync(SWAPS, "utf8"));
    const lines = signatureLines(doc);
    expect(lines).toHaveLength(1);
    const docList = docParams(lines[0] ?? "");
    expect(mismatches(docList, code)).toEqual([]);
    expect(docList).toEqual(code);
  });

  it("T-0212 AC2 rule-12 unit pair: the comparator flags `tz, now` at positions 6 and 7 and passes `now, tz`", () => {
    const old = docParams(RULE12_SIGNATURE_LINE.before);
    const pre0199 = EXPECTED_CODE.slice(0, 8);
    expect(mismatches(old, pre0199)).toEqual([6, 7]);
    expect(mismatches(docParams(RULE12_SIGNATURE_LINE.after), pre0199)).toEqual([]);
    // The mapping itself: current and reason | null become the code names.
    expect(old.slice(0, 2)).toEqual(["currentExerciseId", "reason"]);
    // A gained or lost parameter is a mismatch too (D-0130 Revisit, fired by D-0199 §3).
    expect(mismatches(pre0199, EXPECTED_CODE)).toEqual([8]);
    expect(mismatches(docParams(RULE12_SIGNATURE_LINE.after), EXPECTED_CODE)).toEqual([8]);
    // T-0533: the D-0199 line, default value stripped, matches the 9 code parameters.
    expect(docParams(RULE12_SIGNATURE_LINE_D0199.after)).toEqual([...EXPECTED_CODE]);
  });

  it("T-0212 AC2 rule-12 codeParams reads the AST, not text: a non-exported or commented rankSwaps is ignored", () => {
    const src = [
      "// export function rankSwaps(a, b) {}",
      "function rankSwaps(x: string) { return x; }",
      "export function rankSwapsLater(y: string) { return y; }",
    ].join("\n");
    expect(() => codeParams(src)).toThrow(/no exported function rankSwaps/);
    expect(codeParams("export function rankSwaps(p: string, q = 1) { return [p, q]; }")).toEqual([
      "p",
      "q",
    ]);
  });
});

// AC3: in-memory docs built from today's main text, one with each signature line, so the unit
// tests hold whether the working copy has the D-0130 edit or not. T-0533: the D-0199 line is put
// back first, so these stay the D-0130-era docs (the D-0199 allowance: t0533-rankswaps-exclude).
const D0130_DOC = doc.replace(
  RULE12_SIGNATURE_LINE_D0199.after,
  RULE12_SIGNATURE_LINE_D0199.before,
);
const NEW_DOC = D0130_DOC.replace(RULE12_SIGNATURE_LINE.before, RULE12_SIGNATURE_LINE.after);
const OLD_DOC = NEW_DOC.replace(RULE12_SIGNATURE_LINE.after, RULE12_SIGNATURE_LINE.before);
/** `d` with one extra character changed inside rule 12 (before R12-E5) or rule 13. */
function touchRule12(d: string): string {
  return d.replace("- **R12-E3", "- **R12-E3 ");
}
function touchRule13(d: string): string {
  const r13 = d.indexOf("\n## 13.");
  const at = d.indexOf("\n", r13 + 1) + 1;
  return `${d.slice(0, at)}x${d.slice(at)}`;
}
function touchSignature(d: string): string {
  return d.replace(SIGNATURE_PREFIX, "`rankSwaps(currentId, ");
}
/** The pre-D-0056 doc: the R12-E1 line put back to its old text. */
function oldE1(d: string): string {
  return d.replace(R12_E1_LINE.after, R12_E1_LINE.before);
}

const GUARDS = [
  ["T-0204", t0204GuardOk],
  ["T-0224", t0224GuardOk],
] as const;

describe("T-0212 the two rule 12 guards accept exactly the D-0130 line (D-0130 §2)", () => {
  it("T-0212 AC3 rule-12 the in-memory docs differ where intended", () => {
    expect(OLD_DOC).not.toBe(NEW_DOC);
    expect(signatureLines(NEW_DOC)).toEqual([RULE12_SIGNATURE_LINE.after]);
    expect(signatureLines(OLD_DOC)).toEqual([RULE12_SIGNATURE_LINE.before]);
    for (const f of [touchRule12, touchRule13, touchSignature]) {
      expect(rule12Slice(f(NEW_DOC))).not.toBe(rule12Slice(NEW_DOC));
    }
    expect(oldE1(NEW_DOC)).not.toBe(NEW_DOC);
    // A change outside the slice (Traceability) is not the guards' business.
    expect(rule12Slice(`${NEW_DOC}\n| x | T-9999 |`)).toBe(rule12Slice(NEW_DOC));
  });

  for (const [name, ok] of GUARDS) {
    it(`T-0212 AC3 rule-12 rule-13 ${name} guard: main with the old line vs the new line passes (branch)`, () => {
      expect(ok(NEW_DOC, OLD_DOC)).toBe(true);
    });

    it(`T-0212 AC3 rule-12 rule-13 ${name} guard: new line vs new line passes (after merge)`, () => {
      expect(ok(NEW_DOC, NEW_DOC)).toBe(true);
      expect(ok(`${NEW_DOC}\n| x | T-9999 |`, NEW_DOC)).toBe(true);
    });

    it(`T-0212 AC3 rule-12 rule-13 ${name} guard: any other change in rule 12 (to R12-E5) or rule 13 fails`, () => {
      for (const main of [OLD_DOC, NEW_DOC]) {
        expect(ok(touchRule12(NEW_DOC), main)).toBe(false);
        expect(ok(touchRule13(NEW_DOC), main)).toBe(false);
        expect(ok(touchSignature(NEW_DOC), main)).toBe(false);
      }
      // The D-0130 edit applied backwards on the branch is not accepted against a fixed main.
      expect(ok(OLD_DOC, NEW_DOC)).toBe(false);
    });
  }

  it("T-0212 AC3 rule-12 T-0204 guard: the D-0056 §1 R12-E1 allowance still works, alone and with the D-0130 line", () => {
    // Alone: main has the old R12-E1 line and the new signature.
    expect(t0204GuardOk(NEW_DOC, oldE1(NEW_DOC))).toBe(true);
    // Combined: main has both old lines.
    expect(t0204GuardOk(NEW_DOC, oldE1(OLD_DOC))).toBe(true);
    // Still nothing else: an extra edit on top of either allowance fails.
    expect(t0204GuardOk(touchRule13(NEW_DOC), oldE1(OLD_DOC))).toBe(false);
    expect(t0204GuardOk(touchRule12(NEW_DOC), oldE1(NEW_DOC))).toBe(false);
  });

  it("T-0212 AC3 rule-12 T-0224 guard: it gains only the D-0130 line, not the R12-E1 allowance", () => {
    expect(t0224GuardOk(NEW_DOC, oldE1(NEW_DOC))).toBe(false);
    expect(t0224GuardOk(NEW_DOC, oldE1(OLD_DOC))).toBe(false);
  });

  it("T-0212 AC3 rule-12 a doc without the rule 12 or rule 13 markers throws, never passes silently", () => {
    const noR13 = NEW_DOC.replace("\n## 13.", "\n## 13x");
    for (const [, ok] of GUARDS) {
      expect(() => ok(noR13, NEW_DOC)).toThrow(/marker is missing/);
      expect(() => ok(NEW_DOC, noR13)).toThrow(/marker is missing/);
    }
  });
});

describe("T-0212 traceability", () => {
  it("T-0212 AC4 rule-12 the Traceability table has exactly one T-0212 row and it cites D-0130", () => {
    const table = doc.slice(doc.indexOf("## Traceability"));
    const rows = table.split("\n").filter((l) => /^\|.*\|\s*T-0212\s*\|$/.test(l));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("D-0130");
  });
});
