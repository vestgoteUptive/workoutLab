// T-0212 AC3 (D-0130 §2): the T-0204 and T-0224 rule 12 guards as pure helpers over
// `(currentDoc, mainDoc)`, so they can be unit-tested on in-memory docs. The `it`s that compare
// with `main` (t0204-traceability.test.ts, rule-12-apply-swap.test.ts) call these.
import { execFileSync } from "node:child_process";
import { R12_E1_LINE } from "./fixtures/r12-e1-d0056.js";
import { RULE12_SIGNATURE_LINE } from "./fixtures/rule12-signature-d0130.js";

/** The rules doc on the first of `main` / `origin/main` that exists, or null (shallow CI). */
export function rulesOnMain(repoDir: string): string | null {
  for (const ref of ["main", "origin/main"]) {
    try {
      return execFileSync("git", ["show", `${ref}:docs/engine-rules.md`], {
        cwd: repoDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      // try the next ref
    }
  }
  return null;
}

/**
 * The slice both guards cover (D-0092 §6): rule 12 from `## 12.` up to and including the
 * `- **R12-E5` line, and rule 13 from `## 13.` up to `## 14.`. Throws when a marker is missing.
 */
export function rule12Slice(doc: string): string {
  const r12 = doc.indexOf("\n## 12.");
  const e5 = r12 < 0 ? -1 : doc.indexOf("\n- **R12-E5", r12);
  const e5End = e5 < 0 ? -1 : doc.indexOf("\n", e5 + 1);
  const r13 = doc.indexOf("\n## 13.");
  const r14 = r13 < 0 ? -1 : doc.indexOf("\n## 14.", r13);
  if ([r12, e5, e5End, r13, r14].some((i) => i < 0)) {
    throw new Error("rule12Slice: a rule 12 / rule 13 marker is missing");
  }
  return `${doc.slice(r12, e5End)}\n${doc.slice(r13, r14)}`;
}

/** `s` with the `after` line of `edit` put back to its `before` text (whole line, once). */
function revert(s: string, edit: { readonly before: string; readonly after: string }): string {
  return s.replace(edit.after, edit.before);
}

/**
 * The T-0204 guard: against main, rule 12 (to R12-E5) and rule 13 differ by at most the
 * D-0056 §1 R12-E1 line and the D-0130 §1 signature line.
 */
export function t0204GuardOk(currentDoc: string, mainDoc: string): boolean {
  const current = rule12Slice(currentDoc);
  const main = rule12Slice(mainDoc);
  const e1 = revert(current, R12_E1_LINE);
  const accepted = [
    current,
    e1,
    revert(current, RULE12_SIGNATURE_LINE),
    revert(e1, RULE12_SIGNATURE_LINE),
  ];
  return accepted.includes(main);
}

/**
 * The T-0224 guard: against main, R12-E1…R12-E5 and rule 13 are unchanged, except for the
 * D-0130 §1 signature line.
 */
export function t0224GuardOk(currentDoc: string, mainDoc: string): boolean {
  const current = rule12Slice(currentDoc);
  const main = rule12Slice(mainDoc);
  return [current, revert(current, RULE12_SIGNATURE_LINE)].includes(main);
}
