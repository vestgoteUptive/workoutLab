// T-0320 QA: closes the proof gaps found by fault injection on check-lane-paths.mjs, and
// exercises runCheck against a REAL temporary git repository (real `git diff`, real renames,
// real deletes), which the ticket's own pure-function suite deliberately never does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, realpathSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matches, ticketIdFromBranch, lanePathsFor, checkLanePaths, resolveChangedPaths, runCheck } from "./check-lane-paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const FIXTURES = path.join(__dirname, "fixtures", "lane-paths");
const UF10_TICKET = readFileSync(path.join(FIXTURES, "ticket-T-0307a.md"), "utf8");
const BACKEND_TICKET = "---\nid: T-0500\nlane: backend\n---\n## Paths you may change\n- `supabase/functions/**`\n\n## Contract impact\nNone.\n";

async function captureLog(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => lines.push(a.join(" "));
  try {
    const result = await fn();
    return { result, lines };
  } finally {
    console.log = orig;
  }
}

// --- root builders --------------------------------------------------------------------
function makeRoot({ ci = true, tickets = {} } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "lane-paths-qa-"));
  mkdirSync(path.join(root, ".squad"), { recursive: true });
  copyFileSync(path.join(REPO_ROOT, ".squad", "ownership.yaml"), path.join(root, ".squad", "ownership.yaml"));
  mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
  if (ci === true) copyFileSync(path.join(REPO_ROOT, ".github", "workflows", "ci.yml"), path.join(root, ".github", "workflows", "ci.yml"));
  else if (typeof ci === "string") writeFileSync(path.join(root, ".github", "workflows", "ci.yml"), ci);
  mkdirSync(path.join(root, "docs", "tickets"), { recursive: true });
  for (const [name, text] of Object.entries(tickets)) writeFileSync(path.join(root, "docs", "tickets", name), text);
  return root;
}

const BARE_CI = "name: ci\njobs:\n  checks:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pnpm check:repo\n";

// --- proof gaps closed with an injected git ---------------------------------------------
test("QA AC-1: a ticket branch with an EMPTY slug (`t/T-0307a-`) is not a ticket branch", () => {
  assert.equal(ticketIdFromBranch("t/T-0307a-"), null);
  assert.equal(ticketIdFromBranch("t/T-0307a-x"), "T-0307a");
});

test("QA AC-4: `a/**/b` matches zero and many segments, and not a sibling tree", () => {
  assert.ok(matches("a/b", "a/**/b"));
  assert.ok(matches("a/x/y/b", "a/**/b"));
  assert.ok(!matches("a/x/y/c", "a/**/b"));
  assert.ok(!matches("z/x/b", "a/**/b"));
});

test("QA AC-2: a lettered flow (`UF-06B`) lowercases into its own `flows/uf-06b.ts`", () => {
  const own = checkLanePaths({
    ticketId: "T-0999",
    ticketText: "lane: web-feature:UF-06B\n## Paths you may change\n- `apps/web/src/lib/i18n/flows/uf-06b.ts`\n",
    ownershipText: readFileSync(path.join(REPO_ROOT, ".squad", "ownership.yaml"), "utf8"),
    changed: ["apps/web/src/lib/i18n/flows/uf-06b.ts", "apps/web/src/lib/i18n/flows/uf-06.ts"],
  }).findings;
  assert.deepEqual(own.map((f) => [f.path, f.rule]), [["apps/web/src/lib/i18n/flows/uf-06.ts", "shared-i18n-other-flow"]]);
  // Unlisted own file must not be called "another flow's": the lowercase comparison is what says so.
  const unlisted = checkLanePaths({
    ticketId: "T-0999",
    ticketText: "lane: web-feature:UF-06B\n",
    ownershipText: readFileSync(path.join(REPO_ROOT, ".squad", "ownership.yaml"), "utf8"),
    changed: ["apps/web/src/lib/i18n/flows/uf-06b.ts"],
  }).findings;
  assert.ok(unlisted.every((f) => f.rule !== "shared-i18n-other-flow"), JSON.stringify(unlisted));
});

test("QA AC-8: the diff is `<merge-base>...HEAD` (three dots, against the merge base, not HEAD~1)", () => {
  const seen = [];
  const git = (args) => {
    seen.push(args);
    if (args[0] === "merge-base") return "cafe123\n";
    return "";
  };
  resolveChangedPaths(git);
  const diff = seen.find((a) => a[0] === "diff");
  assert.ok(diff.includes("cafe123...HEAD"), `diff args were ${JSON.stringify(diff)}`);
});

test("QA AC-8: a missing diff base is announced on stdout, not swallowed", async () => {
  const root = makeRoot({ tickets: { "T-0307a-balance-screen.md": UF10_TICKET } });
  try {
    const git = () => {
      throw new Error("fatal: no merge base");
    };
    const { result, lines } = await captureLog(() => runCheck(root, { branch: "t/T-0307a-x", git, env: {} }));
    assert.deepEqual(result, []);
    assert.ok(lines.some((l) => /no diff base/i.test(l)), `expected a no-diff-base note, got ${JSON.stringify(lines)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("QA AC-8: a missing ticket file is announced on stdout, and a loose id prefix does not stand in for it", async () => {
  // Only T-0307a's file exists. Branch t/T-0307-x is a different ticket (`T-0307-` != `T-0307a`).
  const root = makeRoot({ tickets: { "T-0307a-balance-screen.md": UF10_TICKET } });
  try {
    const git = (args) => (args[0] === "merge-base" ? "abc\n" : args[0] === "diff" ? "apps/web/src/lib/i18n/en.ts\n" : "");
    const { result, lines } = await captureLog(() => runCheck(root, { branch: "t/T-0307-x", git, env: {} }));
    assert.deepEqual(result, [], "T-0307 must not be judged against T-0307a's ticket file");
    assert.ok(lines.some((l) => /no ticket file/i.test(l)), JSON.stringify(lines));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("QA AC-9: a bare-checkout ci.yml is reported by runCheck on a ticket branch AND off one", async () => {
  const root = makeRoot({ ci: BARE_CI, tickets: { "T-0307a-balance-screen.md": UF10_TICKET } });
  try {
    const git = (args) => (args[0] === "merge-base" ? "abc\n" : "apps/web/src/features/UF-10/x.ts\n");
    const onTicket = await runCheck(root, { branch: "t/T-0307a-x", git, env: {} });
    assert.ok(onTicket.some((f) => f.rule === "ci-diff-base-missing"), JSON.stringify(onTicket));
    const onMain = await runCheck(root, { branch: "main", git, env: {} });
    assert.ok(onMain.some((f) => f.rule === "ci-diff-base-missing"), "CI wiring guard must run on main too");
    // and it is combined with, not replaced by, lane findings
    const withLane = await runCheck(root, {
      branch: "t/T-0307a-x",
      git: (a) => (a[0] === "merge-base" ? "abc\n" : "apps/web/src/lib/i18n/en.ts\n"),
      env: {},
    });
    assert.deepEqual(withLane.map((f) => f.rule).sort(), ["ci-diff-base-missing", "shared-i18n-en-edited"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("QA branch resolution: --branch > GITHUB_HEAD_REF > GITHUB_REF_NAME > git rev-parse", async () => {
  const root = makeRoot({ tickets: { "T-0307a-balance-screen.md": UF10_TICKET } });
  try {
    const mk = (headRef) => (args) => {
      if (args[0] === "rev-parse") return `${headRef}\n`;
      if (args[0] === "merge-base") return "abc\n";
      return "apps/web/src/lib/i18n/en.ts\n";
    };
    const run = (opts) => runCheck(root, opts).then((f) => f.map((x) => x.rule));
    const hit = ["shared-i18n-en-edited"];
    // env HEAD_REF beats REF_NAME (on a PR, REF_NAME is `12/merge`)
    assert.deepEqual(await run({ git: mk("main"), env: { GITHUB_HEAD_REF: "t/T-0307a-x", GITHUB_REF_NAME: "12/merge" } }), hit);
    // REF_NAME used when no HEAD_REF (push builds)
    assert.deepEqual(await run({ git: mk("main"), env: { GITHUB_REF_NAME: "t/T-0307a-x" } }), hit);
    // HEAD_REF wins even if REF_NAME is itself a ticket branch for a different (unknown) ticket
    assert.deepEqual(await run({ git: mk("main"), env: { GITHUB_HEAD_REF: "t/T-0307a-x", GITHUB_REF_NAME: "t/T-0999-y" } }), hit);
    // rev-parse fallback
    assert.deepEqual(await run({ git: mk("t/T-0307a-x"), env: {} }), hit);
    // none of them a ticket branch: silent
    assert.deepEqual(await run({ git: mk("main"), env: {} }), []);
    // explicit --branch beats env
    assert.deepEqual(await run({ branch: "main", git: mk("t/T-0307a-x"), env: { GITHUB_HEAD_REF: "t/T-0307a-x" } }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("QA CLI: check-lane-paths.mjs itself exits 1 on findings (hermetic temp repo, not the live checkout)", () => {
  // The script finds its repo root from its own location, so run a COPY inside a throwaway git
  // repo. Never the live checkout: there the diff depends on which branch the test runs on.
  const { root, write, commit } = gitRepo("t/T-0307a-balance-screen");
  let status = 0;
  let stdout = "";
  try {
    for (const f of readdirSync(__dirname).filter((n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs"))) {
      write(path.join(".github", "scripts", f), readFileSync(path.join(__dirname, f), "utf8"));
    }
    write("apps/web/src/lib/i18n/en.ts", "export const en = { changed: true };\n");
    commit("edit en.ts from a feature lane");
    try {
      stdout = execFileSync("node", [path.join(realpathSync(root), ".github", "scripts", "check-lane-paths.mjs")], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, GITHUB_HEAD_REF: "", GITHUB_REF_NAME: "" },
      });
    } catch (err) {
      status = err.status;
      stdout = err.stdout ?? "";
    }
    assert.equal(status, 1, stdout);
    assert.match(stdout, /shared-i18n-en-edited/);
  } finally {
    cleanup(root);
  }
});

// --- REAL temporary git repository --------------------------------------------------------
function git(root, ...args) {
  return execFileSync("git", ["-c", "user.name=qa", "-c", "user.email=qa@example.com", "-c", "commit.gpgsign=false", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const FLOW = (n) => `apps/web/src/lib/i18n/flows/uf-${n}.ts`;

/** A git repo on `main` holding the shared files, then a ticket branch. Returns {root, commit}. */
function gitRepo(ticketBranch) {
  const root = makeRoot({
    tickets: { "T-0307a-balance-screen.md": UF10_TICKET, "T-0500-backend.md": BACKEND_TICKET },
  });
  const files = {
    "apps/web/src/lib/i18n/en.ts": "export const en = {};\n",
    [FLOW("06")]: "export const uf06 = {} as const;\n",
    [FLOW("10")]: "export const uf10 = {} as const;\n",
    "apps/web/eslint.config.mjs": "export default [];\n",
    "apps/web/src/app/routes.ts": "export default [];\n",
    "apps/web/src/features/UF-10/index.tsx": "export {};\n",
    "supabase/functions/x/index.ts": "export {};\n",
  };
  const write = (rel, text) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  };
  for (const [rel, text] of Object.entries(files)) write(rel, text);
  git(root, "init", "-q", "-b", "main");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "base");
  git(root, "checkout", "-q", "-b", ticketBranch);
  const commit = (msg) => {
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", msg);
  };
  return { root, write, commit };
}

const rules = (findings) => findings.map((f) => `${f.rule}:${f.path}`).sort();
const cleanup = (root) => rmSync(root, { recursive: true, force: true });

test("QA git: UF-10 filling its OWN flow file and its own feature dir is silent (D-0075)", async () => {
  const { root, write, commit } = gitRepo("t/T-0307a-balance-screen");
  try {
    write(FLOW("10"), "export const uf10 = { title: 'Balance' } as const;\n");
    write("apps/web/src/features/UF-10/Balance.tsx", "export {};\n");
    commit("uf10");
    assert.deepEqual(await runCheck(root, { env: {} }), []);
  } finally {
    cleanup(root);
  }
});

test("QA git: deleting another flow's file is reported", async () => {
  const { root, commit } = gitRepo("t/T-0307a-balance-screen");
  try {
    git(root, "rm", "-q", FLOW("06"));
    commit("rm uf06");
    assert.deepEqual(rules(await runCheck(root, { env: {} })), [`shared-i18n-other-flow:${FLOW("06")}`]);
  } finally {
    cleanup(root);
  }
});

test("QA git: a rename of another flow's file INTO the ticket's own lane is reported (real git rename detection)", async () => {
  const { root, commit } = gitRepo("t/T-0307a-balance-screen");
  try {
    git(root, "mv", FLOW("06"), "apps/web/src/features/UF-10/stolen.ts");
    commit("steal");
    assert.deepEqual(rules(await runCheck(root, { env: {} })), [`shared-i18n-other-flow:${FLOW("06")}`]);
  } finally {
    cleanup(root);
  }
});

test("QA git: en.ts, eslint config, routes edited from a feature lane, each reported once", async () => {
  const { root, write, commit } = gitRepo("t/T-0307a-balance-screen");
  try {
    write("apps/web/src/lib/i18n/en.ts", "export const en = { x: 1 };\n");
    write("apps/web/eslint.config.mjs", "export default [1];\n");
    write("apps/web/src/app/routes.ts", "export default [1];\n");
    commit("shared");
    assert.deepEqual(rules(await runCheck(root, { env: {} })), [
      "shared-i18n-en-edited:apps/web/src/lib/i18n/en.ts",
      "shared-lint-config-edited:apps/web/eslint.config.mjs",
      "shared-routes-edited:apps/web/src/app/routes.ts",
    ]);
  } finally {
    cleanup(root);
  }
});

test("QA git: a NON-feature lane (backend) editing a flow file is reported, its own paths are not", async () => {
  const { root, write, commit } = gitRepo("t/T-0500-backend");
  try {
    write("supabase/functions/x/index.ts", "export const a = 1;\n");
    write(FLOW("10"), "export const uf10 = { a: 1 } as const;\n");
    commit("backend");
    assert.deepEqual(rules(await runCheck(root, { env: {} })), [`shared-i18n-other-flow:${FLOW("10")}`]);
  } finally {
    cleanup(root);
  }
});

test("QA git: a two-ticket combined diff on one branch reports the OTHER ticket's files", async () => {
  const { root, write, commit } = gitRepo("t/T-0307a-balance-screen");
  try {
    write("apps/web/src/features/UF-10/Balance.tsx", "export {};\n"); // ticket A's own work
    write(FLOW("10"), "export const uf10 = { a: 1 } as const;\n");
    commit("A");
    write(FLOW("06"), "export const uf06 = { b: 1 } as const;\n"); // ticket B's work leaking in
    write("supabase/functions/x/index.ts", "export const b = 1;\n");
    commit("B");
    assert.deepEqual(rules(await runCheck(root, { env: {} })), [
      `lane-path-not-owned:supabase/functions/x/index.ts`,
      `shared-i18n-other-flow:${FLOW("06")}`,
    ]);
  } finally {
    cleanup(root);
  }
});

test("QA git: limit 2 holds honestly — an uncommitted edit is invisible; committing it makes it loud", async () => {
  const { root, write, commit } = gitRepo("t/T-0307a-balance-screen");
  try {
    write("apps/web/src/lib/i18n/en.ts", "export const en = { x: 1 };\n");
    assert.deepEqual(await runCheck(root, { env: {} }), []);
    commit("now committed");
    assert.deepEqual(rules(await runCheck(root, { env: {} })), ["shared-i18n-en-edited:apps/web/src/lib/i18n/en.ts"]);
  } finally {
    cleanup(root);
  }
});

test("QA git: on main and on a detached HEAD the check does nothing even with en.ts changed", async () => {
  const { root, write, commit } = gitRepo("t/T-0307a-balance-screen");
  try {
    write("apps/web/src/lib/i18n/en.ts", "export const en = { x: 1 };\n");
    commit("shared");
    git(root, "checkout", "-q", "--detach");
    assert.deepEqual(await runCheck(root, { env: {} }), []);
    git(root, "checkout", "-q", "main");
    assert.deepEqual(await runCheck(root, { env: {} }), []);
  } finally {
    cleanup(root);
  }
});

test("QA git: a ticket branch with no commits yet is silent (zero history)", async () => {
  const { root } = gitRepo("t/T-0307a-balance-screen");
  try {
    assert.deepEqual(await runCheck(root, { env: {} }), []);
  } finally {
    cleanup(root);
  }
});

test("QA git: origin/main is preferred over a stale local main", async () => {
  const { root, write, commit } = gitRepo("t/T-0307a-balance-screen");
  try {
    write("apps/web/src/lib/i18n/en.ts", "export const en = { x: 1 };\n");
    commit("shared");
    // Local `main` is moved onto the branch tip (stale/advanced), which would hide the change,
    // while origin/main still points at the true base.
    const base = git(root, "rev-parse", "HEAD~1").trim();
    git(root, "update-ref", "refs/remotes/origin/main", base);
    git(root, "update-ref", "refs/heads/main", git(root, "rev-parse", "HEAD").trim());
    assert.deepEqual(rules(await runCheck(root, { env: {} })), ["shared-i18n-en-edited:apps/web/src/lib/i18n/en.ts"]);
  } finally {
    cleanup(root);
  }
});
