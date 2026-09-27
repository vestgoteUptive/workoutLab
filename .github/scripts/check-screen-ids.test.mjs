import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildValidScreenIds,
  checkScreenIdExistence,
  checkV1Labels,
  runCheck,
  USER_FLOWS_PATH,
} from "./check-screen-ids.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const FLOW_INDEX = `# User Flows — v2

## Flow index

| Flow | Screens | Purpose | Influences |
|---|---|---|---|
| UF-01 Onboarding | .1 Welcome · .2 Goal · .3 Level & equipment · .4 Schedule & plan · .5 Account | Personal plan | x |
| UF-08 Session setup | .1 Time & energy · .2 Suggested | Time-boxed | x |
| UF-09 Focus mode | .1–.9 (below) | One step at a time | x |
| UF-10 Balance | .1 All areas · .2 Area detail | All areas vs target | x |
| UF-11 Plan check-in | .1 Check-in · .2 Plan · .3 Edit plan | Adaptive | x |

Shared components: C-01 Body map, C-02 Tab bar.
`;

test("AC1: UF-09.9 against a .1-.9 range is 0 findings", () => {
  const valid = buildValidScreenIds(FLOW_INDEX);
  const findings = checkScreenIdExistence(
    [{ path: "docs/tickets/T-0900-focus.md", content: "See UF-09.9 pause." }],
    valid,
  );
  assert.deepEqual(findings, []);
});

test("AC2: UF-09.10 is out of range -> exactly 1 finding at line 4", () => {
  const valid = buildValidScreenIds(FLOW_INDEX);
  const fixturePath = "docs/tickets/T-0900-focus.md";
  const content = "line one\nline two\nline three\ncites UF-09.10 here\n";
  const findings = checkScreenIdExistence([{ path: fixturePath, content }], valid);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].path, fixturePath);
  assert.equal(findings[0].line, 4);
  assert.equal(findings[0].rule, "unknown-screen-id");
  assert.match(findings[0].message, /UF-09\.10/);
});

test("AC3: unknown flow number 12 is a finding; UF-10.* and UF-01.5 are not", () => {
  const valid = buildValidScreenIds(FLOW_INDEX);
  const unknown = checkScreenIdExistence(
    [{ path: "docs/specs/x.md", content: "flow UF-12 does not exist" }],
    valid,
  );
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].rule, "unknown-screen-id");

  const wildcard = checkScreenIdExistence(
    [{ path: "docs/specs/x.md", content: "see UF-10.* for details" }],
    valid,
  );
  assert.deepEqual(wildcard, []);

  const step = checkScreenIdExistence(
    [{ path: "docs/specs/x.md", content: "goes to UF-01.5" }],
    valid,
  );
  assert.deepEqual(step, []);
});

test("AC4: the real intro sentence's UF-09.10 example is not in the valid set", () => {
  const real = readFileSync(path.join(REPO_ROOT, USER_FLOWS_PATH), "utf8");
  const valid = buildValidScreenIds(real);
  const stepSet = valid.steps.get("09");
  assert.ok(stepSet, "UF-09 should be in the index");
  assert.equal(stepSet.has(10), false);
});

test("AC5: v1 labels are findings across the nine labels x five separators", () => {
  const labels = [
    ["01", "Sign up"],
    ["02", "Onboarding"],
    ["03", "Today"],
    ["04", "Start workout"],
    ["05", "Exercise guide"],
    ["06", "Logging"],
    ["07", "Summary"],
    ["08", "Balance"],
    ["09", "Plan"],
  ];
  const seps = [" ", ": ", " — ", " - ", " · "];
  for (const [num, name] of labels) {
    for (const sep of seps) {
      const content = `pad\npad\npad\npad\nUF-${num}${sep}${name} lives here\n`;
      const findings = checkV1Labels([{ path: "docs/PRD.md", content }]);
      assert.equal(
        findings.length,
        1,
        `expected a finding for UF-${num}${JSON.stringify(sep)}${name}`,
      );
      assert.equal(findings[0].line, 5);
      assert.equal(findings[0].rule, "v1-label");
    }
  }
});

test("AC5 (PRD line 7 example): UF-06 Logging on line 7 is 1 finding at line 7", () => {
  const content = "1\n2\n3\n4\n5\n6\nUF-06 Logging changed\n";
  const findings = checkV1Labels([{ path: "docs/PRD.md", content }]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 7);
  assert.equal(findings[0].rule, "v1-label");
});

test("AC6: inline code, fenced code and 'was v1 UF-08 Balance' are not findings", () => {
  const content = [
    "the tag is `UF-08 Balance` inline",
    "```",
    "UF-08 Balance",
    "```",
    "this was v1 UF-08 Balance, replaced in v2",
  ].join("\n");
  const findings = checkV1Labels([{ path: "docs/PRD.md", content }]);
  assert.deepEqual(findings, []);
});

test("AC7: v2 labels UF-06 Progress and UF-08 Session setup are not findings", () => {
  const content = "UF-06 Progress is the new name.\nUF-08 Session setup replaces Balance.\n";
  const findings = checkV1Labels([{ path: "docs/PRD.md", content }]);
  assert.deepEqual(findings, []);
});

test("AC8: docs/tickets/_template.md's UF-xx.n placeholder is not an ID", () => {
  const valid = buildValidScreenIds(FLOW_INDEX);
  const findings = checkScreenIdExistence(
    [{ path: "docs/tickets/_template.md", content: "screens: [UF-xx.n]" }],
    valid,
  );
  assert.deepEqual(findings, []);
});

test("AC9: no docs/specs dir exits 0 (does not crash); missing flow index -> error", async () => {
  const os = await import("node:os");
  const fs = await import("node:fs/promises");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "t0004-"));
  await fs.mkdir(path.join(tmp, "docs", "tickets"), { recursive: true });
  await fs.mkdir(path.join(tmp, "Design-docs", "docs", "product"), { recursive: true });
  await fs.writeFile(path.join(tmp, "Design-docs/docs/product/user-flows.md"), FLOW_INDEX);
  const result = await runCheck(tmp);
  assert.equal(result.error, null);
  assert.deepEqual(result.findings, []);

  const tmp2 = await fs.mkdtemp(path.join(os.tmpdir(), "t0004-"));
  const missing = await runCheck(tmp2);
  assert.equal(missing.error, "flow-index-missing");

  const tmp3 = await fs.mkdtemp(path.join(os.tmpdir(), "t0004-"));
  await fs.mkdir(path.join(tmp3, "Design-docs", "docs", "product"), { recursive: true });
  await fs.writeFile(
    path.join(tmp3, "Design-docs/docs/product/user-flows.md"),
    "# User Flows\nno table here\n",
  );
  const noTable = await runCheck(tmp3);
  assert.equal(noTable.error, "flow-index-missing");
});

test("AC10: CRLF line endings give the same line numbers as the LF version", () => {
  const valid = buildValidScreenIds(FLOW_INDEX);
  const lf = "one\ntwo\nthree\nUF-09.10 here\n";
  const crlf = lf.replace(/\n/g, "\r\n");
  const lfFindings = checkScreenIdExistence([{ path: "a.md", content: lf }], valid);
  const crlfFindings = checkScreenIdExistence([{ path: "a.md", content: crlf }], valid);
  assert.equal(lfFindings.length, 1);
  assert.equal(crlfFindings.length, 1);
  assert.equal(lfFindings[0].line, crlfFindings[0].line);
});
