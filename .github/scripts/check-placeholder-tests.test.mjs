import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPlaceholderTests, parseBoard, isDone } from "./check-placeholder-tests.mjs";

const BOARD_TODO = `| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0309 | Landing page | landing | T-0003 | todo | wl-design |
`;

const BOARD_DONE = `| ID | Title | Lane | Deps | Status | Flow |
|---|---|---|---|---|---|
| T-0309 | Landing page | landing | T-0003 | done | wl-design |
`;

const FILE = {
  path: "apps/landing/test/placeholder.test.ts",
  content: '// @placeholder T-0309\nexpect(true).toBe(true);\n',
};

test("AC14: owning board is todo, branch is a different ticket -> 0 findings", () => {
  const board = parseBoard(BOARD_TODO);
  const findings = checkPlaceholderTests([FILE], board, "t/T-0003-design-tokens");
  assert.deepEqual(findings, []);
});

test("AC15: --branch is the owning branch -> 1 placeholder-on-owning-branch finding", () => {
  const board = parseBoard(BOARD_TODO);
  const findings = checkPlaceholderTests([FILE], board, "t/T-0309-landing");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "placeholder-on-owning-branch");
});

test("AC16: board status done -> 1 placeholder-ticket-done finding, any branch incl. main", () => {
  const board = parseBoard(BOARD_DONE);
  const onMain = checkPlaceholderTests([FILE], board, "main");
  assert.equal(onMain.length, 1);
  assert.equal(onMain[0].rule, "placeholder-ticket-done");

  const onOther = checkPlaceholderTests([FILE], board, "t/T-9999-other");
  assert.equal(onOther.length, 1);
  assert.equal(onOther[0].rule, "placeholder-ticket-done");
});

test("AC17: untagged literal assertions are findings; a non-literal expect is not", () => {
  const board = parseBoard(BOARD_TODO);
  const cases = ['expect(true)', 'expect(1)', 'expect("x")', "expect(null)", "expect(undefined)"];
  for (const literal of cases) {
    const findings = checkPlaceholderTests(
      [{ path: "packages/foo/test/x.test.ts", content: `${literal}.toBe(true);\n` }],
      board,
      null,
    );
    assert.equal(findings.length, 1, `expected a finding for ${literal}`);
    assert.equal(findings[0].rule, "untagged-placeholder");
  }

  const ok = checkPlaceholderTests(
    [
      {
        path: "packages/engine/test/index.test.ts",
        content: 'expect(ENGINE_VERSION).toBe("0.0.0");\n',
      },
    ],
    board,
    null,
  );
  assert.deepEqual(ok, []);
});

test("AC18: marker names a ticket not on the board -> placeholder-unknown-ticket", () => {
  const board = parseBoard(BOARD_TODO);
  const findings = checkPlaceholderTests(
    [
      {
        path: "packages/foo/test/x.test.ts",
        content: "// @placeholder T-9999\nexpect(true).toBe(true);\n",
      },
    ],
    board,
    null,
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "placeholder-unknown-ticket");
});

test("AC19: no branch source skips only the owning-branch rule, no crash", () => {
  const board = parseBoard(BOARD_TODO);
  const findings = checkPlaceholderTests([FILE], board, null);
  assert.deepEqual(findings, []);

  const boardDone = parseBoard(BOARD_DONE);
  const stillCaught = checkPlaceholderTests([FILE], boardDone, null);
  assert.equal(stillCaught.length, 1);
  assert.equal(stillCaught[0].rule, "placeholder-ticket-done");
});

test("AC20: files under node_modules/ are not part of the scan (integration-level)", async () => {
  const os = await import("node:os");
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { runCheck } = await import("./check-placeholder-tests.mjs");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "t0004-ph-"));
  await fs.mkdir(path.join(tmp, "packages/foo/node_modules/bar/test"), { recursive: true });
  await fs.writeFile(
    path.join(tmp, "packages/foo/node_modules/bar/test/x.test.ts"),
    "expect(true).toBe(true);\n",
  );
  await fs.mkdir(path.join(tmp, ".squad"), { recursive: true });
  await fs.writeFile(path.join(tmp, ".squad/board.md"), BOARD_TODO);
  const findings = await runCheck(tmp, { branch: "main" });
  assert.deepEqual(findings, []);
});

test("isDone: only a first-word 'done' status counts as done", () => {
  assert.equal(isDone("done"), true);
  assert.equal(isDone("done (merged)"), true);
  assert.equal(isDone("todo (needs H-06)"), false);
  assert.equal(isDone("doing"), false);
  assert.equal(isDone(""), false);
});
