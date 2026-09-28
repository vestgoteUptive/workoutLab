// T-0901: guards the two defects that made `playwright e2e` red on `main` (docs/ci/
// CI-T-0901-e2e-no-config-and-unbuilt-tokens.md). Two independent checks:
//   1. `.github/workflows/ci.yml`'s `e2e` job must run Playwright through the repo's
//      config (or `test:e2e`), never a bare `playwright test` from the repo root.
//   2. `tests/e2e/playwright.config.ts`'s `webServer.command` must build through turbo
//      (`^build`), so `packages/design-tokens/dist/tokens.css` exists before `vite build`.
// It also rejects the forbidden workarounds: `continue-on-error`, `--retries`, a
// CI-positive `retries` value in the config, and any extra `if:` on the Playwright step.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { printFindings } from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const CI_YML_PATH = ".github/workflows/ci.yml";
const CONFIG_PATH = "tests/e2e/playwright.config.ts";
const HAS_E2E_IF = "steps.has-e2e.outputs.present == 'true'";

/**
 * Minimal GitHub Actions step parser, scoped to the shapes this workflow uses: a
 * top-level `jobs:` map, jobs at 2-space indent, `steps:` under a job, and `- ` step
 * items whose fields (`id`, `name`, `run`, `if`, `uses`, `continue-on-error`, …) sit two
 * spaces deeper than the `-`. `run: |` (or `>`) block scalars collect their more-indented
 * continuation lines. This is not a general YAML parser; it only needs to survive the
 * real `ci.yml` and the fixtures in `fixtures/e2e-wiring/`.
 */
export function parseJobSteps(yamlText, jobName) {
  const lines = yamlText.split("\n");
  const jobsIdx = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsIdx === -1) return [];
  const jobHeaderRe = new RegExp(`^  ${jobName}:\\s*$`);
  let jobStart = -1;
  for (let i = jobsIdx + 1; i < lines.length; i++) {
    if (jobHeaderRe.test(lines[i])) {
      jobStart = i;
      break;
    }
  }
  if (jobStart === -1) return [];
  let jobEnd = lines.length;
  for (let i = jobStart + 1; i < lines.length; i++) {
    if (/^ {0,2}\S/.test(lines[i])) {
      jobEnd = i;
      break;
    }
  }
  const bodyStart = jobStart + 1;
  const bodyLines = lines.slice(bodyStart, jobEnd);
  const stepsRelIdx = bodyLines.findIndex((l) => /^\s*steps:\s*$/.test(l));
  if (stepsRelIdx === -1) return [];
  const stepsIndent = bodyLines[stepsRelIdx].match(/^(\s*)/)[1].length;
  const itemIndent = stepsIndent + 2;
  const chunks = [];
  let current = null;
  for (let i = stepsRelIdx + 1; i < bodyLines.length; i++) {
    const line = bodyLines[i];
    const lineNumber = bodyStart + i + 1; // 1-based line number in the original text
    if (line.trim() === "") {
      if (current) current.lines.push(line);
      continue;
    }
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent < itemIndent) break;
    if (indent === itemIndent && line.slice(indent, indent + 2) === "- ") {
      current = { lines: [line], startLine: lineNumber };
      chunks.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return chunks.map(({ lines: chunkLines, startLine }) => parseStepChunk(chunkLines, startLine));
}

function parseStepChunk(chunkLines, startLine) {
  const markerIndent = chunkLines[0].match(/^(\s*)-\s?/)[1].length;
  const fieldIndent = markerIndent + 2;
  const normalised = [chunkLines[0].replace(/^(\s*)-\s?/, (_m, sp) => sp + "  "), ...chunkLines.slice(1)];
  const step = { line: startLine };
  let currentKey = null;
  let blockMode = false;
  let blockBaseIndent = null;
  for (const line of normalised) {
    if (line.trim() === "") continue;
    const indent = line.match(/^(\s*)/)[1].length;
    if (blockMode && currentKey && indent > fieldIndent) {
      if (blockBaseIndent === null) blockBaseIndent = indent;
      step[currentKey] += (step[currentKey] ? "\n" : "") + line.slice(blockBaseIndent);
      continue;
    }
    blockMode = false;
    if (indent === fieldIndent) {
      const m = line.slice(fieldIndent).match(/^([A-Za-z_-]+):\s?(.*)$/);
      if (m) {
        const [, key, val] = m;
        currentKey = key;
        if (val === "" || val === "|" || val === ">" || val === "|-" || val === ">-") {
          step[key] = "";
          blockMode = true;
          blockBaseIndent = null;
        } else {
          step[key] = val;
        }
      }
    }
  }
  return step;
}

function isPlaywrightTestStep(step) {
  const run = (step.run || "").trim();
  if (!run) return false;
  if (run.includes("playwright test")) return true;
  if (run === "pnpm --filter @workoutlab/web test:e2e") return true;
  return false;
}

/** `jobName` defaults to `e2e`; the fixtures use the same job name as the real workflow. */
export function checkCiYml(yamlText, filePath = CI_YML_PATH, jobName = "e2e") {
  const findings = [];
  const steps = parseJobSteps(yamlText, jobName);
  const testSteps = steps.filter(isPlaywrightTestStep);

  if (testSteps.length === 0) {
    findings.push({
      path: filePath,
      line: 1,
      rule: "e2e-wiring-no-test-step",
      message: `job \`${jobName}\` has no step that runs \`playwright test\` or \`pnpm --filter @workoutlab/web test:e2e\``,
    });
    return findings;
  }
  if (testSteps.length > 1) {
    findings.push({
      path: filePath,
      line: testSteps[1].line,
      rule: "e2e-wiring-multiple-test-steps",
      message: `job \`${jobName}\` has ${testSteps.length} steps that run Playwright tests; expected exactly one`,
    });
  }

  for (const step of testSteps) {
    const run = step.run.trim();
    const usesConfig = run.includes("playwright test") && run.includes("--config tests/e2e/playwright.config.ts");
    const usesTestScript = run === "pnpm --filter @workoutlab/web test:e2e";
    if (!usesConfig && !usesTestScript) {
      findings.push({
        path: filePath,
        line: step.line,
        rule: "e2e-wiring-bare-playwright-step",
        message: `job \`${jobName}\` step \`${run}\` does not pass \`--config tests/e2e/playwright.config.ts\` and is not \`pnpm --filter @workoutlab/web test:e2e\`; a bare \`playwright test\` from the repo root also collects every Vitest and node:test file (docs/ci/CI-T-0901-e2e-no-config-and-unbuilt-tokens.md)`,
      });
    }
    if ((step["continue-on-error"] || "").trim() === "true") {
      findings.push({
        path: filePath,
        line: step.line,
        rule: "e2e-wiring-continue-on-error",
        message: `job \`${jobName}\` step \`${run}\` has \`continue-on-error: true\`; the job must pass on its merits`,
      });
    }
    if (/--retries(=|\s)/.test(run)) {
      findings.push({
        path: filePath,
        line: step.line,
        rule: "e2e-wiring-retries-flag",
        message: `job \`${jobName}\` step \`${run}\` passes \`--retries\`; the job must pass on its merits`,
      });
    }
    const stepIf = (step.if || "").trim();
    if (stepIf !== "" && stepIf !== HAS_E2E_IF) {
      findings.push({
        path: filePath,
        line: step.line,
        rule: "e2e-wiring-extra-if",
        message: `job \`${jobName}\` step \`${run}\` has \`if: ${stepIf}\`, which is not the existing \`has-e2e\` gate (\`${HAS_E2E_IF}\`)`,
      });
    }
  }

  // AC7 (optional): if a playwright-report upload step exists, it must only run on
  // failure, and never mask a real failure by dropping its own `if:` condition.
  const reportUploadSteps = steps.filter(
    (step) => (step.uses || "").includes("upload-artifact") && (step.with || "").includes("playwright-report"),
  );
  for (const step of reportUploadSteps) {
    if (!(step.if || "").includes("failure()")) {
      findings.push({
        path: filePath,
        line: step.line,
        rule: "e2e-wiring-report-upload-missing-failure-if",
        message: `job \`${jobName}\`'s playwright-report upload step must have \`if: failure()\` (found \`if: ${step.if || ""}\`)`,
      });
    }
  }

  return findings;
}

function extractWebServerCommand(configText) {
  const m = configText.match(/webServer:\s*{[\s\S]*?command:\s*"([^"]*)"/);
  return m ? m[1] : null;
}

function extractRetries(configText) {
  const m = configText.match(/retries:\s*([^\n,]+?)\s*,?\s*\n/);
  return m ? m[1].trim() : null;
}

/** Evaluate a `retries` expression under `CI=true`. Handles a literal number or a
 * `<cond referencing CI> ? <a> : <b>` ternary; anything else is treated as 0 (unknown,
 * not our concern here — the real config and fixtures only use these two shapes). */
function retriesUnderCI(expr) {
  if (expr === null) return 0;
  const ternary = expr.match(/^(.*?)\?\s*([^:]+?)\s*:\s*(.+)$/);
  if (ternary) {
    const [, cond, whenTrue, whenFalse] = ternary;
    const branch = /CI/.test(cond) ? whenTrue : whenFalse;
    const n = Number(branch.trim());
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(expr);
  return Number.isFinite(n) ? n : 0;
}

export function checkPlaywrightConfig(configText, filePath = CONFIG_PATH) {
  const findings = [];
  const command = extractWebServerCommand(configText);
  if (command === null) {
    findings.push({
      path: filePath,
      line: 1,
      rule: "e2e-wiring-no-webserver-command",
      message: "no `webServer.command` string found",
    });
  } else {
    const runsTurboBuild = /turbo\s+run\s+build\b/.test(command) && /--filter[=\s]@workoutlab\/web\b/.test(command);
    const buildIdx = command.search(/turbo\s+run\s+build\b/);
    const previewIdx = command.indexOf("preview");
    const buildBeforePreview = runsTurboBuild && (previewIdx === -1 || buildIdx < previewIdx);
    if (!runsTurboBuild || !buildBeforePreview) {
      findings.push({
        path: filePath,
        line: 1,
        rule: "e2e-wiring-webserver-skips-caret-build",
        message: `\`webServer.command\` (\`${command}\`) skips \`^build\`: it must run \`turbo run build --filter=@workoutlab/web\` (or an equivalent turbo invocation) before \`preview\`, or design-tokens' dist/tokens.css never gets built on a fresh runner`,
      });
    }
  }

  const retriesExpr = extractRetries(configText);
  if (retriesUnderCI(retriesExpr) > 0) {
    findings.push({
      path: filePath,
      line: 1,
      rule: "e2e-wiring-retries-under-ci",
      message: `\`retries\` is ${retriesUnderCI(retriesExpr)} under CI (\`retries: ${retriesExpr}\`); the job must pass on its merits, with no retries`,
    });
  }

  return findings;
}

export async function runCheck(root = REPO_ROOT) {
  const ciYmlText = readFileSync(path.join(root, CI_YML_PATH), "utf8");
  const configText = readFileSync(path.join(root, CONFIG_PATH), "utf8");
  return [...checkCiYml(ciYmlText), ...checkPlaywrightConfig(configText)];
}

async function main() {
  const findings = await runCheck();
  printFindings(findings);
  process.exit(findings.length > 0 ? 1 : 0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
