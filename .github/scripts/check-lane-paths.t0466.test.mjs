// T-0466 / D-0167 §1: a ticket branch may always edit its own docs/tickets/<id>-*.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkLanePaths, runCheck } from "./check-lane-paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ownership = readFileSync(path.join(REPO_ROOT, ".squad", "ownership.yaml"), "utf8");
const ticketText = (lane = "infra") =>
  `---\nid: T-0466\nlane: ${lane}\n---\n## Paths you may change\n- \`.github/**\` (the lane)\n\n## Next\n`;
const run = (ticketId, changed, lane) =>
  checkLanePaths({ ticketId, ticketText: ticketText(lane), ownershipText: ownership, changed }).findings;

const OWN = "docs/tickets/T-0466-check-lane-paths-self-grant.md";

test("T-0466 AC-1: own ticket file is allowed with no self-grant line", () => {
  assert.deepEqual(run("T-0466", [OWN]), []);
  assert.deepEqual(run("T-0307b", ["docs/tickets/T-0307b-progress.md"]), []);
});

test("T-0466 AC-2: nothing but the own file is allowed", () => {
  const cases = [
    ["T-0466", "docs/tickets/T-0465-route-boundary-focus-and-reset.md"],
    ["T-0466", "docs/tickets/T-0466a-split.md"],
    ["T-0466", "docs/tickets/T-04661-x.md"],
    ["T-0307", "docs/tickets/T-0307b-progress.md"],
    ["T-0466", "docs/tickets/log/T-0466.md"],
    ["T-0466", "docs/tickets/T-0466-notes.txt"],
    ["T-0466", "docs/tickets/_template.md"],
    ["T-0466", "docs/tickets/sub/T-0466-x.md"],
  ];
  for (const [id, file] of cases) {
    const f = run(id, [file]);
    assert.equal(f.length, 1, `${id} ${file}: ${JSON.stringify(f)}`);
    assert.equal(f[0].rule, "lane-path-not-owned");
  }
});

test("T-0466 AC-3: unknown lane still reports lane-unknown, not lane-path-not-owned", () => {
  const f = checkLanePaths({
    ticketId: "T-0466",
    ticketText: ticketText("web-featur:UF-10"),
    ownershipText: ownership,
    changed: [OWN],
    ticketPath: OWN,
  }).findings;
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, "lane-unknown");
  assert.equal(f[0].path, OWN);
});

test("T-0466 AC-4: wired through runCheck; own file does not widen grants", async () => {
  const git = (diff) => (args) => {
    if (args[0] === "merge-base") return "abc123\n";
    if (args[0] === "diff") return `${diff.join("\n")}\n`;
    if (args[0] === "ls-tree") return `${OWN}\n`;
    if (args[0] === "show") return ticketText();
    throw new Error(`unexpected git ${args.join(" ")}`);
  };
  const branch = "t/T-0466-check-lane-paths-self-grant";
  const lane = (fs) => fs.filter((f) => f.rule.startsWith("lane-") || f.rule.startsWith("shared-"));
  assert.deepEqual(lane(await runCheck(REPO_ROOT, { branch, git: git([OWN]), env: {} })), []);
  const both = lane(await runCheck(REPO_ROOT, { branch, git: git([OWN, "apps/web/src/lib/i18n/en.ts"]), env: {} }));
  assert.equal(both.length, 1);
  assert.equal(both[0].rule, "shared-i18n-en-edited");
});
