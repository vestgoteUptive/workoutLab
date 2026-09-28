import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./helpers.js";

// AC17: the package's tasks are wired into turbo, so `pnpm -w typecheck lint test` (run by
// CI, `.github/workflows/ci.yml`, and by QA for this ticket) actually reaches this package.
// Running the full `pnpm -w typecheck lint test` from inside this suite would recursively
// invoke the whole monorepo (including this very test), so that final "exits 0" check is left
// to CI/QA rather than repeated here.
const turboBin = resolve(repoRoot, "node_modules/.bin/turbo");

describe("AC17 tests actually run", () => {
  it.each(["test", "typecheck", "lint"])("turbo run %s --dry=json includes the package", (task) => {
    const res = spawnSync(turboBin, ["run", task, "--dry=json"], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    expect(res.status, res.stderr).toBe(0);
    const dry = JSON.parse(res.stdout) as { tasks: { taskId: string }[] };
    const taskIds = dry.tasks.map((t) => t.taskId);
    expect(taskIds).toContain(`@workoutlab/exercises#${task}`);
  }, 60_000);
});
