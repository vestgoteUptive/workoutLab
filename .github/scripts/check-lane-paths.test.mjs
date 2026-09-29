// T-0320 / D-0074: tests for the D-0071 §1 shared-file enforcement check.
// Every AC except AC-9 and AC-10 exercises an exported pure function against fixture
// strings, so the suite never shells out to `git` and never goes green or red because of
// whatever branch the runner happens to be on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ticketIdFromBranch,
  lanePathsFor,
  listedPathsFromTicket,
  matches,
  checkLanePaths,
  checkCiDiffBase,
  laneFromTicket,
  resolveChangedPaths,
  runCheck,
} from "./check-lane-paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const FIXTURES = path.join(__dirname, "fixtures", "lane-paths");

function fixture(name) {
  return readFileSync(path.join(FIXTURES, name), "utf8");
}

function realOwnership() {
  return readFileSync(path.join(REPO_ROOT, ".squad", "ownership.yaml"), "utf8");
}

function realTicket(prefix) {
  const dir = path.join(REPO_ROOT, "docs", "tickets");
  const name = readdirSync(dir).find((f) => f.startsWith(`${prefix}-`) && f.endsWith(".md"));
  assert.ok(name, `expected a real docs/tickets/${prefix}-*.md`);
  return readFileSync(path.join(dir, name), "utf8");
}

/**
 * The leading `//` comment block of check-lane-paths.mjs, up to its first real import
 * statement. Slicing on a bare `indexOf("import ")` would truncate at the prose "The T-0318
 * import bans ..." inside the header itself and make AC-11 pass vacuously.
 */
function headerOf() {
  const src = readFileSync(path.join(__dirname, "check-lane-paths.mjs"), "utf8");
  const lines = src.split("\n");
  const end = lines.findIndex((l) => /^import\s/.test(l));
  assert.ok(end > 0, "check-lane-paths.mjs has no import statement; headerOf() found no boundary");
  const header = lines.slice(0, end).join("\n");
  assert.ok(
    header.split("\n").every((l) => l === "" || l.startsWith("//")),
    "headerOf() captured non-comment source",
  );
  return header;
}

// ---------------------------------------------------------------------------
// AC-1: branch -> ticket id. The null half is what makes the whole check no-op.
// ---------------------------------------------------------------------------
test("AC-1: a ticket branch yields its id", () => {
  assert.equal(ticketIdFromBranch("t/T-0307a-balance-screen"), "T-0307a");
  assert.equal(ticketIdFromBranch("t/T-0320-shared-file-enforcement"), "T-0320");
});

test("AC-1: everything that is not a ticket branch yields null", () => {
  for (const branch of [
    "main",
    "HEAD",
    "",
    "spike/try-something",
    "t/T-0307a", // no slug
    "t/0307a-x", // no T- prefix
    "feature/T-0307a-x", // wrong prefix
  ]) {
    assert.equal(ticketIdFromBranch(branch), null, `expected null for ${JSON.stringify(branch)}`);
  }
  assert.equal(ticketIdFromBranch(null), null);
  assert.equal(ticketIdFromBranch(undefined), null);
});

// ---------------------------------------------------------------------------
// AC-2: lane -> paths, read out of the real ownership.yaml.
// ---------------------------------------------------------------------------
test("AC-2: web-feature:UF-10 substitutes the <flow> placeholder", () => {
  const { patterns, unknown } = lanePathsFor(realOwnership(), "web-feature:UF-10");
  assert.equal(unknown, false);
  assert.deepEqual(patterns, ["apps/web/src/features/UF-10/**"]);
  // The mechanism, not just the result: the literal placeholder must be gone.
  assert.ok(
    !patterns.includes("apps/web/src/features/<flow>/**"),
    "the <flow> placeholder was returned unsubstituted",
  );
  assert.ok(
    patterns.every((p) => !p.includes("<flow>")),
    "a pattern still contains <flow>",
  );
});

test("AC-2: web-shell returns exactly its ownership.yaml patterns, in file order", () => {
  const ownership = realOwnership();
  const { patterns, unknown } = lanePathsFor(ownership, "web-shell");
  assert.equal(unknown, false);
  // Derive the expectation from the file itself, so this test asserts the parse rather
  // than a hardcoded count that would drift the moment the lane gains a path.
  const raw = ownership.match(/^ {2}web-shell:[\s\S]*?^ {4}paths:\s*\[(.*)\]\s*$/m)[1];
  const expected = raw.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
  assert.deepEqual(patterns, expected);
  assert.ok(patterns.includes("apps/web/src/app/**"));
  assert.ok(patterns.includes("apps/web/*.*"));
  assert.ok(patterns.includes("apps/web/src/lib/**"));
});

test("AC-2: infra includes .github/** and package.json; qa is tests/e2e/**", () => {
  const ownership = realOwnership();
  const infra = lanePathsFor(ownership, "infra");
  assert.equal(infra.unknown, false);
  assert.ok(infra.patterns.includes(".github/**"));
  assert.ok(infra.patterns.includes("package.json"));
  assert.deepEqual(lanePathsFor(ownership, "qa"), { patterns: ["tests/e2e/**"], unknown: false });
});

test("AC-2: web-feature with no flow returns [] plus the lane-unknown signal", () => {
  assert.deepEqual(lanePathsFor(realOwnership(), "web-feature"), { patterns: [], unknown: true });
});

test("AC-2 (CRLF): ownership.yaml with Windows line endings parses the same", () => {
  const crlf = fixture("ownership-crlf.yaml");
  assert.ok(crlf.includes("\r\n"), "the CRLF fixture lost its \\r\\n — the test would be vacuous");
  assert.deepEqual(lanePathsFor(crlf, "web-feature:UF-10"), {
    patterns: ["apps/web/src/features/UF-10/**"],
    unknown: false,
  });
  assert.deepEqual(lanePathsFor(crlf, "infra").patterns, ["infra/**", ".github/**", "package.json"]);
});

// ---------------------------------------------------------------------------
// AC-3: ticket -> listed extras.
// ---------------------------------------------------------------------------
test("AC-3: the T-0307a fixture yields its three granted paths", () => {
  const listed = listedPathsFromTicket(fixture("ticket-T-0307a.md"));
  assert.deepEqual(listed, [
    "apps/web/src/features/UF-10/**",
    "apps/web/src/lib/i18n/flows/uf-10.ts",
    "tests/e2e/uf-10-balance.spec.ts",
  ]);
});

test("AC-3: the `Not yours` bullet's paths are not grants", () => {
  const listed = listedPathsFromTicket(fixture("ticket-T-0307a.md"));
  for (const denied of [
    "apps/web/src/lib/i18n/flows/uf-06.ts",
    "apps/web/src/lib/i18n/en.ts",
    "apps/web/eslint.config.mjs",
    "apps/web/src/app/**",
    "apps/web/src/features/UF-06/**",
    "packages/**",
  ]) {
    assert.ok(!listed.includes(denied), `${denied} came from the "Not yours" bullet and must not be a grant`);
  }
});

test("AC-3: extraction stops at the next ## heading", () => {
  const listed = listedPathsFromTicket(fixture("ticket-T-0307a.md"));
  assert.ok(
    !listed.includes("packages/design-tokens/src/tokens.json"),
    "a path-shaped token in ## Contract impact leaked into the grants",
  );
});

test("AC-3: prose in the section that is not a path yields no entry", () => {
  const listed = listedPathsFromTicket(fixture("ticket-T-0307a.md"));
  assert.ok(
    listed.every((p) => /^[A-Za-z0-9_.*[\]@-]+(\/[A-Za-z0-9_.*[\]@-]+)*$/.test(p)),
    `a non-path entry was returned: ${JSON.stringify(listed)}`,
  );
  assert.ok(!listed.some((p) => /Not yours|web-shell owns|D-0071/.test(p)));
});

test("AC-3: no `## Paths you may change` section yields []", () => {
  assert.deepEqual(listedPathsFromTicket(fixture("ticket-no-paths-section.md")), []);
  assert.deepEqual(listedPathsFromTicket(""), []);
  assert.deepEqual(listedPathsFromTicket(null), []);
});

test("AC-3: an empty section yields []", () => {
  assert.deepEqual(listedPathsFromTicket(fixture("ticket-empty-paths-section.md")), []);
});

test("AC-3: a citation (`per .squad/ownership.yaml`) is not a grant", () => {
  // The real T-0320 ticket's first grant bullet ends "All infra, per `.squad/ownership.yaml`."
  // Treating that as a grant would let this ticket edit the orchestrator's file.
  const listed = listedPathsFromTicket(realTicket("T-0320"));
  assert.ok(listed.includes(".github/scripts/check-lane-paths.mjs"));
  assert.ok(
    !listed.includes(".squad/ownership.yaml"),
    "a cited file became a grant; the check would then permit editing .squad/ownership.yaml",
  );
  assert.ok(!listed.includes(".squad/board.md"));
  assert.ok(!listed.includes("docs/ci/**"));
});

// ---------------------------------------------------------------------------
// AC-4: the matcher. Each pair's negative half is what stops an over-broad matcher.
// ---------------------------------------------------------------------------
test("AC-4: ** crosses / and confines to its own subtree", () => {
  assert.ok(matches("apps/web/src/features/UF-10/Balance.tsx", "apps/web/src/features/UF-10/**"));
  assert.ok(!matches("apps/web/src/features/UF-10/Balance.tsx", "apps/web/src/features/UF-06/**"));
});

test("AC-4: apps/web/*.* matches a root dotfile-extension file, not a nested one", () => {
  assert.ok(matches("apps/web/eslint.config.mjs", "apps/web/*.*"));
  assert.ok(!matches("apps/web/eslint.config.mjs", "apps/web/src/**"));
});

test("AC-4: a single * does not cross /", () => {
  assert.ok(matches("apps/web/src/lib/i18n/en.ts", "apps/web/src/lib/**"));
  assert.ok(
    !matches("apps/web/src/lib/i18n/en.ts", "apps/web/src/lib/*"),
    "one * crossed a / — the matcher is too loose",
  );
  assert.ok(matches("apps/web/src/lib/x.ts", "apps/web/src/lib/*"));
});

test("AC-4: a bare filename pattern is anchored at the repo root", () => {
  assert.ok(matches("package.json", "package.json"));
  assert.ok(
    !matches("apps/web/package.json", "package.json"),
    "a nested package.json matched the root pattern — a bare `includes` would pass here",
  );
});

test("AC-4: .github/** matches a script under it", () => {
  assert.ok(matches(".github/scripts/x.mjs", ".github/**"));
  assert.ok(!matches(".githubfoo/scripts/x.mjs", ".github/**"));
});

test("AC-4: a substring is not a match (the anchoring guard)", () => {
  assert.ok(!matches("xapps/web/src/lib/i18n/en.ts", "apps/web/src/lib/**"));
  assert.ok(!matches("apps/web/src/lib/i18n/en.ts.bak", "apps/web/src/lib/i18n/en.ts"));
  assert.ok(!matches("", "package.json"));
  assert.ok(!matches("package.json", ""));
});

// ---------------------------------------------------------------------------
// AC-5: the happy path is silent. This is the anti-vacuity half of AC-6.
// ---------------------------------------------------------------------------
test("AC-5: T-0307a's own real path set produces zero findings", () => {
  const { findings, note } = checkLanePaths({
    ticketId: "T-0307a",
    ticketText: fixture("ticket-T-0307a.md"),
    ownershipText: realOwnership(),
    changed: [
      "apps/web/src/features/UF-10/index.tsx",
      "apps/web/src/features/UF-10/__tests__/Balance.test.tsx",
      "apps/web/src/lib/i18n/flows/uf-10.ts",
      "tests/e2e/uf-10-balance.spec.ts",
    ],
  });
  assert.deepEqual(findings, []);
  assert.equal(note, null);
});

test("AC-5: T-0307a's *real* ticket file is also silent on its real path set", () => {
  // The fixture could drift from the ticket it reproduces; assert against both.
  const { findings } = checkLanePaths({
    ticketId: "T-0307a",
    ticketText: realTicket("T-0307a"),
    ownershipText: realOwnership(),
    changed: [
      "apps/web/src/features/UF-10/index.tsx",
      "apps/web/src/lib/i18n/flows/uf-10.ts",
      "tests/e2e/uf-10-balance.spec.ts",
    ],
  });
  assert.deepEqual(findings, []);
});

test("AC-5: T-0318 (web-shell) editing all four shared files is legitimate and silent", () => {
  const { findings } = checkLanePaths({
    ticketId: "T-0318",
    ticketText: realTicket("T-0318"),
    ownershipText: realOwnership(),
    changed: [
      "apps/web/src/app/routes.ts",
      "apps/web/eslint.config.mjs",
      "apps/web/src/lib/i18n/en.ts",
      "apps/web/src/lib/i18n/flows/uf-03.ts",
    ],
  });
  assert.deepEqual(findings, [], "web-shell's own ticket must not be reported for the shared files");
});

// ---------------------------------------------------------------------------
// AC-6: the four shared-file violations, one test each.
// ---------------------------------------------------------------------------
function uf10Check(changed) {
  return checkLanePaths({
    ticketId: "T-0307a",
    ticketText: fixture("ticket-T-0307a.md"),
    ownershipText: realOwnership(),
    changed,
  }).findings;
}

test("AC-6.1: editing en.ts from a feature lane is shared-i18n-en-edited", () => {
  const findings = uf10Check(["apps/web/src/lib/i18n/en.ts"]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "shared-i18n-en-edited");
  assert.equal(findings[0].path, "apps/web/src/lib/i18n/en.ts");
  assert.match(findings[0].message, /D-0071 §1/);
  assert.match(findings[0].message, /flows\/uf-10\.ts/);
});

test("AC-6.2: editing another flow's file is shared-i18n-other-flow; its own is silent", () => {
  const findings = uf10Check(["apps/web/src/lib/i18n/flows/uf-06.ts"]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "shared-i18n-other-flow");
  assert.match(findings[0].message, /D-0071 §1/);
  assert.deepEqual(uf10Check(["apps/web/src/lib/i18n/flows/uf-10.ts"]), []);
});

test("AC-6.3: editing apps/web/eslint.config.mjs is shared-lint-config-edited", () => {
  const findings = uf10Check(["apps/web/eslint.config.mjs"]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "shared-lint-config-edited");
  assert.match(findings[0].message, /D-0071 §9/);
});

test("AC-6.4: editing apps/web/src/app/routes.ts is shared-routes-edited", () => {
  const findings = uf10Check(["apps/web/src/app/routes.ts"]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "shared-routes-edited");
  assert.match(findings[0].message, /D-0071 §2/);
});

test("AC-6: a deletion is a changed path and is reported", () => {
  // `git diff --name-only` lists a deleted file exactly like an edited one, so a check that
  // only looked at files present on disk would miss this.
  const findings = uf10Check(["apps/web/src/lib/i18n/flows/uf-06.ts"]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "shared-i18n-other-flow");
});

test("AC-6: a rename reports both halves of the pair", () => {
  const findings = uf10Check([
    "apps/web/src/lib/i18n/flows/uf-06.ts",
    "apps/web/src/lib/i18n/flows/uf-06b.ts",
  ]);
  assert.equal(findings.length, 2);
  assert.deepEqual(
    findings.map((f) => f.rule),
    ["shared-i18n-other-flow", "shared-i18n-other-flow"],
  );
  assert.deepEqual(
    findings.map((f) => f.path),
    ["apps/web/src/lib/i18n/flows/uf-06.ts", "apps/web/src/lib/i18n/flows/uf-06b.ts"],
  );
});

test("AC-6: a shared path that the ticket *lists* is allowed and silent (the escape hatch)", () => {
  // D-0071 §1's "listed as an explicit extra path". T-0301a uses it for flows/uf-01.ts.
  const ticketText = fixture("ticket-T-0307a.md").replace(
    "  - `tests/e2e/uf-10-balance.spec.ts`",
    "  - `apps/web/src/lib/i18n/en.ts` — granted by decision.\n  - `tests/e2e/uf-10-balance.spec.ts`",
  );
  assert.ok(
    listedPathsFromTicket(ticketText).includes("apps/web/src/lib/i18n/en.ts"),
    "the injected grant did not land; the test below would be vacuous",
  );
  const { findings } = checkLanePaths({
    ticketId: "T-0307a",
    ticketText,
    ownershipText: realOwnership(),
    changed: ["apps/web/src/lib/i18n/en.ts"],
  });
  assert.deepEqual(findings, []);
});

// ---------------------------------------------------------------------------
// AC-7: generic not-owned, and a bad lane is loud rather than permissive.
// ---------------------------------------------------------------------------
test("AC-7: paths outside the lane are lane-path-not-owned and name the lane", () => {
  const findings = uf10Check([
    "supabase/migrations/0009_x.sql",
    "docs/data-model.md",
    "packages/engine/src/balance.ts",
  ]);
  assert.equal(findings.length, 3);
  for (const f of findings) {
    assert.equal(f.rule, "lane-path-not-owned");
    assert.match(f.message, /web-feature:UF-10/, "the finding must name the ticket's lane");
    assert.match(f.message, /T-0307a/);
  }
  assert.deepEqual(
    findings.map((f) => f.path),
    ["supabase/migrations/0009_x.sql", "docs/data-model.md", "packages/engine/src/balance.ts"],
  );
});

test("AC-7: a `split → …` parent lane is lane-unknown on the ticket file, not a blanket permit", () => {
  const ticketText = fixture("ticket-T-0307-parent.md");
  assert.match(laneFromTicket(ticketText), /^split →/, "the fixture's lane is not the split form");
  const { findings } = checkLanePaths({
    ticketId: "T-0307",
    ticketText,
    ownershipText: realOwnership(),
    changed: ["apps/web/src/features/UF-10/index.tsx"],
    ticketPath: "docs/tickets/T-0307-progress-balance.md",
  });
  assert.ok(findings.length > 0, "an unresolvable lane must not return zero findings");
  const unknown = findings.find((f) => f.rule === "lane-unknown");
  assert.ok(unknown, `expected a lane-unknown finding, got ${JSON.stringify(findings)}`);
  assert.equal(unknown.path, "docs/tickets/T-0307-progress-balance.md");
});

test("AC-7: a typo'd lane is lane-unknown too", () => {
  const ticketText = fixture("ticket-lane-typo.md");
  assert.equal(laneFromTicket(ticketText), "web-featur:UF-10");
  const { findings } = checkLanePaths({
    ticketId: "T-0399",
    ticketText,
    ownershipText: realOwnership(),
    changed: ["apps/web/src/features/UF-10/index.tsx"],
    ticketPath: "docs/tickets/T-0399-x.md",
  });
  const unknown = findings.find((f) => f.rule === "lane-unknown");
  assert.ok(unknown, "a typo'd lane silently granted everything");
  assert.equal(unknown.path, "docs/tickets/T-0399-x.md");
  assert.match(unknown.message, /web-featur:UF-10/);
  // The listed extra still stands, so the changed path itself is not double-reported.
  assert.ok(!findings.some((f) => f.path === "apps/web/src/features/UF-10/index.tsx"));
});

// ---------------------------------------------------------------------------
// AC-8: every no-op is a real no-op, and exits 0.
// ---------------------------------------------------------------------------
test("AC-8: ticketId null is silent even for en.ts (the main-branch case)", () => {
  const { findings, note } = checkLanePaths({
    ticketId: null,
    ticketText: fixture("ticket-T-0307a.md"),
    ownershipText: realOwnership(),
    changed: ["apps/web/src/lib/i18n/en.ts", "apps/web/src/app/routes.ts"],
  });
  assert.deepEqual(findings, []);
  assert.equal(note, null);
});

test("AC-8: no ticket file yields zero findings plus a note naming the miss", () => {
  const { findings, note } = checkLanePaths({
    ticketId: "T-0999",
    ticketText: null,
    ownershipText: realOwnership(),
    changed: ["apps/web/src/lib/i18n/en.ts"],
  });
  assert.deepEqual(findings, []);
  assert.equal(typeof note, "string");
  assert.match(note, /T-0999/);
  assert.match(note, /ticket file/i);
});

test("AC-8: an empty changed list yields zero findings", () => {
  const { findings } = checkLanePaths({
    ticketId: "T-0307a",
    ticketText: fixture("ticket-T-0307a.md"),
    ownershipText: realOwnership(),
    changed: [],
  });
  assert.deepEqual(findings, []);
});

test("AC-8: with an empty Paths section the lane paths alone decide", () => {
  const ticketText = fixture("ticket-empty-paths-section.md");
  assert.deepEqual(listedPathsFromTicket(ticketText), [], "the fixture's section is not empty");
  const base = { ticketId: "T-0398", ticketText, ownershipText: realOwnership() };
  // A UF-10 lane path is silent...
  assert.deepEqual(
    checkLanePaths({ ...base, changed: ["apps/web/src/features/UF-10/Balance.tsx"] }).findings,
    [],
  );
  // ...and en.ts is not.
  const findings = checkLanePaths({ ...base, changed: ["apps/web/src/lib/i18n/en.ts"] }).findings;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "shared-i18n-en-edited");
});

test("AC-8: with no Paths section at all the lane paths alone decide", () => {
  const ticketText = fixture("ticket-no-paths-section.md");
  const base = { ticketId: "T-0397", ticketText, ownershipText: realOwnership() };
  assert.deepEqual(
    checkLanePaths({ ...base, changed: ["apps/web/src/features/UF-10/Balance.tsx"] }).findings,
    [],
  );
  assert.equal(
    checkLanePaths({ ...base, changed: ["apps/web/src/app/routes.ts"] }).findings[0].rule,
    "shared-routes-edited",
  );
});

test("AC-8: checkLanePaths never throws on missing or odd input", () => {
  assert.doesNotThrow(() => checkLanePaths());
  assert.doesNotThrow(() => checkLanePaths({}));
  assert.doesNotThrow(() =>
    checkLanePaths({ ticketId: "T-0307a", ticketText: "", ownershipText: "", changed: [null, ""] }),
  );
});

test("AC-8: no diff base resolvable -> changed null plus a note (offline/shallow)", () => {
  // The git call is injected, so this never shells out.
  const git = () => {
    throw new Error("fatal: Not a valid object name origin/main");
  };
  const { changed, note } = resolveChangedPaths(git);
  assert.equal(changed, null);
  assert.match(note, /no diff base/i);
});

test("AC-8: a fresh branch with no commits yet gives an empty diff, not a crash", () => {
  const git = (args) => {
    if (args[0] === "merge-base") return "abc123\n";
    if (args[0] === "diff") return "\n";
    throw new Error(`unexpected git ${args.join(" ")}`);
  };
  assert.deepEqual(resolveChangedPaths(git), { changed: [], note: null });
});

test("AC-8: resolveChangedPaths falls back to `main` when origin/main is absent", () => {
  const seen = [];
  const git = (args) => {
    seen.push(args.join(" "));
    if (args[0] === "merge-base" && args[1] === "origin/main") throw new Error("no origin/main");
    if (args[0] === "merge-base" && args[1] === "main") return "deadbee\n";
    if (args[0] === "diff") return "apps/web/src/lib/i18n/en.ts\n";
    throw new Error("unexpected");
  };
  const { changed } = resolveChangedPaths(git);
  assert.deepEqual(changed, ["apps/web/src/lib/i18n/en.ts"]);
  assert.ok(seen.includes("merge-base origin/main HEAD"));
  assert.ok(seen.includes("merge-base main HEAD"));
  // The check must never reach the network.
  assert.ok(!seen.some((s) => s.startsWith("fetch")), "resolveChangedPaths ran a git fetch");
});

test("AC-6: resolveChangedPaths asks git for BOTH halves of a rename (--no-renames)", () => {
  // Found by fault injection on this ticket. With git's default rename detection,
  // `git diff --name-only` collapses a rename to the *new* path only. A UF-10 branch that
  // renames `lib/i18n/flows/uf-06.ts` to `features/UF-10/stolen.ts` therefore deletes
  // another flow's shared file while the only path git prints is one the ticket owns —
  // zero findings, exit 0. Proven against a real clone: the check was silent before
  // `--no-renames` and reports `shared-i18n-other-flow` after it.
  const seen = [];
  const git = (args) => {
    seen.push(args.join(" "));
    if (args[0] === "merge-base") return "deadbee\n";
    if (args[0] === "diff") {
      assert.ok(
        args.includes("--no-renames"),
        "git diff ran without --no-renames: a rename into the ticket's own lane hides the " +
          "deletion of the shared file it came from",
      );
      return "apps/web/src/features/UF-10/stolen.ts\napps/web/src/lib/i18n/flows/uf-06.ts\n";
    }
    throw new Error(`unexpected git ${args.join(" ")}`);
  };
  const { changed } = resolveChangedPaths(git);
  assert.deepEqual(changed, [
    "apps/web/src/features/UF-10/stolen.ts",
    "apps/web/src/lib/i18n/flows/uf-06.ts",
  ]);
  // The old half is what makes the theft loud rather than silent.
  assert.deepEqual(
    uf10Check(changed).map((f) => [f.path, f.rule]),
    [["apps/web/src/lib/i18n/flows/uf-06.ts", "shared-i18n-other-flow"]],
  );
});

test("AC-8: runCheck resolves rather than throwing when git is unavailable", async () => {
  const git = () => {
    throw new Error("spawn git ENOENT");
  };
  const findings = await runCheck(REPO_ROOT, { git, env: {} });
  // The real ci.yml is fine, so the only possible findings would come from the diff, which
  // cannot be resolved without git.
  assert.deepEqual(findings, []);
});

// ---------------------------------------------------------------------------
// AC-9: CI actually has a diff base. The wiring, not the script.
// ---------------------------------------------------------------------------
test("AC-9: the real ci.yml `checks` job gives check:repo a diff base", () => {
  const ci = readFileSync(path.join(REPO_ROOT, ".github", "workflows", "ci.yml"), "utf8");
  assert.deepEqual(checkCiDiffBase(ci), []);
});

test("AC-9 (the mechanism): the real ci.yml checkout sets fetch-depth: 0", () => {
  // Assert the mechanism, not only that the checker is happy: a `git fetch` would also
  // satisfy checkCiDiffBase, so pin which shape actually shipped.
  const ci = readFileSync(path.join(REPO_ROOT, ".github", "workflows", "ci.yml"), "utf8");
  const checksJob = ci.match(/^ {2}checks:\n[\s\S]*?(?=^ {2}\S)/m)[0];
  assert.match(checksJob, /uses:\s*actions\/checkout@v4\s*\n\s*with:\s*\n\s*fetch-depth:\s*0\b/);
});

test("AC-9 CONTRAST: a bare actions/checkout with no fetch step fails the same assertion", () => {
  const findings = checkCiDiffBase(fixture("ci-bare-checkout.yml"));
  assert.equal(findings.length, 1, `expected exactly one finding, got ${JSON.stringify(findings)}`);
  assert.equal(findings[0].rule, "ci-diff-base-missing");
  assert.match(findings[0].message, /fetch-depth: 0/);
  assert.match(findings[0].message, /no-ops/);
});

test("AC-9: an explicit `git fetch origin main` before check:repo also passes", () => {
  assert.deepEqual(checkCiDiffBase(fixture("ci-fetch-step.yml")), []);
});

test("AC-9 CONTRAST: a fetch step placed *after* check:repo does not count", () => {
  const findings = checkCiDiffBase(fixture("ci-fetch-after-check.yml"));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "ci-diff-base-missing");
});

test("AC-9: a workflow with no checks job or no check:repo step says so", () => {
  assert.equal(checkCiDiffBase("name: CI\njobs:\n").length, 1);
  assert.equal(checkCiDiffBase("name: CI\njobs:\n")[0].rule, "ci-diff-base-no-checks-job");
  const noStep = checkCiDiffBase(
    "name: CI\njobs:\n  checks:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n",
  );
  assert.equal(noStep[0].rule, "ci-diff-base-no-check-repo-step");
});

// ---------------------------------------------------------------------------
// AC-10: registered, and green on this branch — with a reporting contrast.
// ---------------------------------------------------------------------------
test("AC-10: check-all.mjs imports runCheck from check-lane-paths.mjs and calls it", () => {
  const src = readFileSync(path.join(__dirname, "check-all.mjs"), "utf8");
  assert.match(src, /import\s*\{\s*runCheck as runLanePaths\s*\}\s*from\s*"\.\/check-lane-paths\.mjs"/);
  assert.match(src, /\.\.\.\(await runLanePaths\(/, "runAll must spread runLanePaths' findings");
});

test("AC-10: pnpm check:repo exits 0 on the current checkout, whatever it is", () => {
  // Smoke only: the repo's own gate must be green wherever this test runs. It reads the live
  // checkout, so it is green on `main` (no-op, AC-8), on a ticket branch that stays in its
  // lane, and in CI's detached HEAD (no base -> no-op). The assertions that depend on WHAT a
  // diff contains are the two contrasts below, which use a constant `changed` array.
  execFileSync("node", [path.join(__dirname, "check-all.mjs")], { cwd: REPO_ROOT, stdio: "pipe" });
});

// A constant diff: `.github/**` plus a ticket file, the shape of a T-0320 commit. No live git.
const CONTRAST_CHANGED = [
  ".github/scripts/check-lane-paths.mjs",
  ".github/workflows/ci.yml",
  "docs/tickets/T-0320-shared-file-enforcement.md",
];

test("AC-10 CONTRAST: the same changed paths under a UF-10 branch report", () => {
  // Proves the green above is not because the check is inert. Hermetic: no git, no branch.
  const own = checkLanePaths({
    ticketId: "T-0320",
    ticketText: realTicket("T-0320"),
    ownershipText: realOwnership(),
    changed: CONTRAST_CHANGED,
  }).findings;
  assert.deepEqual(own, [], `T-0320 must own its own diff; got ${JSON.stringify(own)}`);

  const foreign = checkLanePaths({
    ticketId: "T-0307a",
    ticketText: realTicket("T-0307a"),
    ownershipText: realOwnership(),
    changed: CONTRAST_CHANGED,
  }).findings;
  assert.ok(foreign.length > 0, "a UF-10 ticket was allowed to change .github/** — the check is inert");
  assert.ok(foreign.some((f) => f.rule === "lane-path-not-owned"));
});

test("AC-10 CONTRAST (end to end): runCheck with an injected git reports on a UF-10 branch", async () => {
  // Through runCheck (branch -> ticket file -> ownership -> findings) against the real repo
  // files, with a stubbed git so it does not depend on branches, remotes or HEAD state.
  const git = (args) => {
    if (args[0] === "merge-base") return "abc123\n";
    if (args[0] === "diff") return `${CONTRAST_CHANGED.join("\n")}\n`;
    throw new Error(`unexpected git ${args.join(" ")}`);
  };
  const findings = await runCheck(REPO_ROOT, { branch: "t/T-0307a-balance-screen", git, env: {} });
  assert.ok(findings.some((f) => f.rule === "lane-path-not-owned"), JSON.stringify(findings));
  const own = await runCheck(REPO_ROOT, { branch: "t/T-0320-shared-file-enforcement", git, env: {} });
  assert.deepEqual(own, []);
});

// ---------------------------------------------------------------------------
// AC-3 fail-closed: a negation or exclusion grants nothing (code review, T-0320).
// The lines below are copied verbatim from real tickets on main.
// ---------------------------------------------------------------------------
const section = (...bullets) => `---\nid: T-9999\nlane: infra\n---\n## Paths you may change\n${bullets.map((b) => `- ${b}`).join("\n")}\n\n## Next\n`;

const REAL_DENIALS = [
  ["T-0309 Don't touch", "Don't touch `turbo.json`, `.github/**` or the root ESLint config.", ["turbo.json", ".github/**"]],
  ["T-0102 Not", "Not `packages/engine/**`, `supabase/functions/**`, `.github/**`, `docs/engine-rules.md`", ["packages/engine/**", ".github/**", "docs/engine-rules.md"]],
  ["T-0204 Don't touch", "Don't touch `api/openapi.yaml`, `packages/shared/**` or `supabase/functions/**`.", ["api/openapi.yaml", "packages/shared/**"]],
  ["T-0902 Do **not** touch", "Do **not** touch `api/openapi.yaml`, `docs/data-model.md`", ["api/openapi.yaml", "docs/data-model.md"]],
  ["T-0205 no contract", "This ticket changes **no** contract: `docs/engine-rules.md`, `api/openapi.yaml`, `docs/data-model.md`.", ["docs/engine-rules.md", "api/openapi.yaml"]],
  ["T-0001 Under rule", "Under `.squad/README.md` rule 1", [".squad/README.md"]],
  ["synthetic Don't touch", "Don't touch `apps/web/src/lib/i18n/en.ts`", ["apps/web/src/lib/i18n/en.ts"]],
  ["never", "Never edit `apps/web/src/lib/i18n/en.ts`", ["apps/web/src/lib/i18n/en.ts"]],
  ["nothing", "Nothing in `packages/shared/**`", ["packages/shared/**"]],
  ["curly apostrophe", "Don\u2019t touch `turbo.json`", ["turbo.json"]],
];

for (const [name, line, mustNotGrant] of REAL_DENIALS) {
  test(`AC-3 fail closed: "${name}" grants nothing`, () => {
    const listed = listedPathsFromTicket(section("`apps/web/src/features/UF-10/**`", line));
    for (const p of mustNotGrant) assert.ok(!listed.includes(p), `${p} was granted by: ${line}`);
    assert.ok(listed.includes("apps/web/src/features/UF-10/**"), "the real grant next to it was lost");
  });
}

test("AC-3 fail closed: `except ... read-only` grants the left side only (T-0309b)", () => {
  const listed = listedPathsFromTicket(
    section(
      "**T-0309b (landing):** `apps/landing/**` except `apps/landing/src/content/**`, which is read-only here. Don't touch `turbo.json`.",
    ),
  );
  assert.deepEqual(listed, ["apps/landing/**"]);
});

test("AC-3 fail closed: a path followed by 'stays read-only' is not granted (T-0202)", () => {
  const listed = listedPathsFromTicket(
    section("`packages/engine/**`: `src/**` and `test/**`. `test/fixtures/histories.ts` stays read-only."),
  );
  assert.ok(listed.includes("packages/engine/**"));
  assert.ok(!listed.includes("test/fixtures/histories.ts"));
});

test("AC-3 fail closed: a negative bullet silences its sub-bullets", () => {
  const text = "---\nid: T-9999\n---\n## Paths you may change\n- Not these:\n  - `turbo.json`\n- `apps/x/**`\n";
  assert.deepEqual(listedPathsFromTicket(text), ["apps/x/**"]);
});

test("AC-3 fail closed: the real T-0309 ticket no longer grants turbo.json or .github/**", () => {
  const listed = listedPathsFromTicket(realTicket("T-0309"));
  for (const p of ["turbo.json", ".github/**"]) assert.ok(!listed.includes(p), `${p} granted`);
  assert.ok(listed.includes("apps/landing/**"));
});

test("AC-3 fail closed: T-0307a's real extras are still granted", () => {
  const listed = listedPathsFromTicket(realTicket("T-0307a"));
  for (const p of [
    "apps/web/src/features/UF-10/**",
    "apps/web/src/lib/i18n/flows/uf-10.ts",
    "tests/e2e/uf-10-balance.spec.ts",
  ]) {
    assert.ok(listed.includes(p), `${p} lost`);
  }
  for (const p of ["apps/web/src/lib/i18n/flows/uf-06.ts", "apps/web/src/app/**", "apps/web/eslint.config.mjs"]) {
    assert.ok(!listed.includes(p), `${p} granted`);
  }
});

// ---------------------------------------------------------------------------
// AC-11: the coverage limits are written down, not implied.
// ---------------------------------------------------------------------------
test("AC-11: the script header carries all four limits verbatim", () => {
  const header = headerOf();
  const LIMITS = [
    "it needs a `t/T-NNNN-slug` branch and does nothing on `main` or a detached HEAD",
    "it needs a committed diff — uncommitted working-tree edits are invisible",
    "it cannot see a *runtime* violation, only a *file* edit",
    "it does not detect two tickets that both legitimately list the same shared file",
  ];
  for (const limit of LIMITS) {
    // Collapse the comment's line wrapping before matching.
    const flat = header.replace(/\n\s*\/\/\s*/g, " ").replace(/\s+/g, " ");
    assert.ok(flat.includes(limit), `the header is missing this limit verbatim:\n  ${limit}`);
  }
});

test("AC-11: the header does not hedge the limits with a vaguer word", () => {
  const header = headerOf();
  for (const hedge of [/\bmostly\b/i, /\bgenerally\b/i, /\busually\b/i, /\bin general\b/i]) {
    assert.ok(!hedge.test(header), `the header hedges with ${hedge}; AC-11 requires the literal limits`);
  }
});

test("AC-11: D-0074 §2 repeats the same four limits", () => {
  const decision = readFileSync(
    path.join(REPO_ROOT, ".squad", "decisions", "D-0074-shared-file-enforcement.md"),
    "utf8",
  );
  const flat = decision.replace(/\s+/g, " ");
  for (const limit of [
    "it needs a `t/T-NNNN-slug` branch and does nothing on `main` or a detached HEAD",
    "it needs a committed diff — uncommitted working-tree edits are invisible",
    "it cannot see a *runtime* violation, only a *file* edit",
    "it does not detect two tickets that both legitimately list the same shared file",
  ]) {
    assert.ok(flat.includes(limit), `D-0074 is missing this limit verbatim:\n  ${limit}`);
  }
  assert.match(decision, /status:\s*revisit/);
  assert.match(decision, /area:\s*infra/);
});
