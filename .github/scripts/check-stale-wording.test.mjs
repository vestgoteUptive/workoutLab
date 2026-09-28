import { test } from "node:test";
import assert from "node:assert/strict";
import { checkStaleWording } from "./check-stale-wording.mjs";

test("T-0005 AC2: 'newest `completed_at`' and 'soft delete' are findings", () => {
  const findings = checkStaleWording([
    {
      path: "docs/specs/non-functional.md",
      content: "the newest `completed_at` wins on conflict\n",
    },
    { path: "docs/PRD.md", content: "deletes are a soft delete of the row\n" },
  ]);
  assert.equal(findings.length, 2);
  assert.ok(findings.some((f) => f.rule === "stale-wording-newest-completed-at"));
  assert.ok(findings.some((f) => f.rule === "stale-wording-soft-delete"));
});

test("T-0005 AC4: raw {min-1}-style templates are findings", () => {
  for (const template of ["{min−1}", "{max−1}", "{min+1}", "{max+1}"]) {
    const findings = checkStaleWording([
      { path: "docs/specs/uf-11-plan-checkin.md", content: `renders ${template} directly\n` },
    ]);
    assert.equal(findings.length, 1, `expected a finding for ${template}`);
    assert.equal(findings[0].rule, "stale-wording-raw-template");
  }
  const ok = checkStaleWording([
    {
      path: "docs/specs/uf-11-plan-checkin.md",
      content: "newMin = max(1, min−1); newMax = min(7, max+1)\n",
    },
  ]);
  assert.deepEqual(ok, []);
});

test("T-0005 AC6: unweighted recovering copy is a finding; weighted copy is not", () => {
  const unweighted = checkStaleWording([
    {
      path: "docs/specs/uf-10-balance.md",
      content: "≥ 6 hard sets in the last 48 h\n",
    },
  ]);
  assert.equal(unweighted.length, 1);
  assert.equal(unweighted[0].rule, "stale-wording-unweighted-recovering");

  const weighted = checkStaleWording([
    {
      path: "docs/specs/uf-10-balance.md",
      content: "≥ 6 weighted hard sets in the last 48 h\n",
    },
  ]);
  assert.deepEqual(weighted, []);
});
