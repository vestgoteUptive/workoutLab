import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkCiYml, checkPlaywrightConfig, runCheck } from "./check-e2e-wiring.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const FIXTURES = path.join(__dirname, "fixtures", "e2e-wiring");

function fixture(name) {
  return readFileSync(path.join(FIXTURES, name), "utf8");
}

function realCiYml() {
  return readFileSync(path.join(REPO_ROOT, ".github", "workflows", "ci.yml"), "utf8");
}

function realConfig() {
  return readFileSync(path.join(REPO_ROOT, "tests", "e2e", "playwright.config.ts"), "utf8");
}

// AC1 + AC3: exactly one step runs Playwright, and it must pass --config or be test:e2e.
test("AC1/AC3: a bare `playwright test` step is a finding naming the job and the step", () => {
  const findings = checkCiYml(fixture("ci-bare.yml"));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "e2e-wiring-bare-playwright-step");
  assert.match(findings[0].message, /\be2e\b/);
  assert.match(findings[0].message, /pnpm exec playwright test/);
});

test("AC3: a step with --config tests/e2e/playwright.config.ts passes", () => {
  assert.deepEqual(checkCiYml(fixture("ci-config.yml")), []);
});

test("AC3: a step running `pnpm --filter @workoutlab/web test:e2e` passes", () => {
  assert.deepEqual(checkCiYml(fixture("ci-test-script.yml")), []);
});

test("AC1: the real ci.yml has exactly one Playwright test step, wired to the config", () => {
  assert.deepEqual(checkCiYml(realCiYml()), []);
});

// AC2 + AC4: webServer.command must build through turbo (^build) before preview.
test("AC4: a webServer.command that skips ^build is a finding saying so", () => {
  const findings = checkPlaywrightConfig(fixture("config-unbuilt.ts"));
  const skip = findings.find((f) => f.rule === "e2e-wiring-webserver-skips-caret-build");
  assert.ok(skip, "expected an e2e-wiring-webserver-skips-caret-build finding");
  assert.match(skip.message, /\^build/);
});

test("AC2/AC4: the real tests/e2e/playwright.config.ts builds through turbo before preview", () => {
  const findings = checkPlaywrightConfig(realConfig());
  assert.deepEqual(
    findings.filter((f) => f.rule === "e2e-wiring-webserver-skips-caret-build"),
    [],
  );
  const command = realConfig().match(/command:\s*"([^"]*)"/)[1];
  assert.match(command, /turbo run build --filter=@workoutlab\/web/);
  assert.ok(command.indexOf("turbo run build") < command.indexOf("preview"));
});

// AC8: forbidden workarounds, one failing fixture per case.
test("AC8: continue-on-error: true on the Playwright step is a finding", () => {
  const findings = checkCiYml(fixture("ci-continue-on-error.yml"));
  assert.ok(findings.some((f) => f.rule === "e2e-wiring-continue-on-error"));
});

test("AC8: a --retries flag on the Playwright step is a finding", () => {
  const findings = checkCiYml(fixture("ci-retries-flag.yml"));
  assert.ok(findings.some((f) => f.rule === "e2e-wiring-retries-flag"));
});

test("AC8: an `if:` other than the has-e2e gate on the Playwright step is a finding", () => {
  const findings = checkCiYml(fixture("ci-extra-if.yml"));
  assert.ok(findings.some((f) => f.rule === "e2e-wiring-extra-if"));
});

test("AC8: a retries value greater than 0 under CI in the config is a finding", () => {
  const findings = checkPlaywrightConfig(fixture("config-retries-ci.ts"));
  assert.ok(findings.some((f) => f.rule === "e2e-wiring-retries-under-ci"));
});

test("AC8: the real ci.yml and playwright.config.ts have none of the forbidden workarounds", () => {
  const findings = [...checkCiYml(realCiYml()), ...checkPlaywrightConfig(realConfig())];
  const forbidden = findings.filter((f) =>
    [
      "e2e-wiring-continue-on-error",
      "e2e-wiring-retries-flag",
      "e2e-wiring-extra-if",
      "e2e-wiring-retries-under-ci",
    ].includes(f.rule),
  );
  assert.deepEqual(forbidden, []);
});

// AC7 (optional): if a playwright-report upload step exists, it must gate on failure().
test("AC7: a playwright-report upload step with no `if: failure()` is a finding", () => {
  const findings = checkCiYml(fixture("ci-report-upload-missing-if.yml"));
  assert.ok(findings.some((f) => f.rule === "e2e-wiring-report-upload-missing-failure-if"));
});

test("AC7: the real ci.yml's playwright-report upload step gates on if: failure()", () => {
  const findings = checkCiYml(realCiYml());
  assert.deepEqual(
    findings.filter((f) => f.rule === "e2e-wiring-report-upload-missing-failure-if"),
    [],
  );
});

test("runCheck() finds nothing on the real repo (AC1, AC2, AC7, AC8 together)", async () => {
  const findings = await runCheck();
  assert.deepEqual(findings, []);
});
