import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDecisionIds } from "./check-decision-ids.mjs";

test("AC11: duplicate D-number gives exactly 1 finding naming both paths", () => {
  const files = [
    {
      path: ".squad/decisions/D-0015-bootstrap-scaffold-ownership.md",
      content: "---\nid: D-0015\n---\n",
    },
    { path: ".squad/decisions/D-0015-set-sync-upsert.md", content: "---\nid: D-0015\n---\n" },
  ];
  const findings = checkDecisionIds(files);
  const dup = findings.filter((f) => f.rule === "duplicate-decision-id");
  assert.equal(dup.length, 1);
  assert.match(dup[0].message, /D-0015/);
  assert.match(dup[0].message, /D-0015-bootstrap-scaffold-ownership\.md/);
  assert.match(dup[0].message, /D-0015-set-sync-upsert\.md/);
});

test("AC12: frontmatter id mismatch, and missing id", () => {
  const mismatch = checkDecisionIds([{ path: "D-0019-foo.md", content: "---\nid: D-0020\n---\n" }]);
  assert.equal(mismatch.length, 1);
  assert.equal(mismatch[0].rule, "decision-id-mismatch");

  const missing = checkDecisionIds([{ path: "D-0019-foo.md", content: "---\ntitle: x\n---\n" }]);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].rule, "decision-id-missing");
});

test("AC13: same subject, different numbers -> 0 findings; README.md ignored", () => {
  const files = [
    { path: "D-0007-domains.md", content: "---\nid: D-0007\n---\n" },
    { path: "D-0009-domains-workout.md", content: "---\nid: D-0009\n---\n" },
    { path: "D-0010-domains-app-subdomain.md", content: "---\nid: D-0010\n---\n" },
    { path: "README.md", content: "no frontmatter here" },
  ];
  const findings = checkDecisionIds(files);
  assert.deepEqual(findings, []);
});
