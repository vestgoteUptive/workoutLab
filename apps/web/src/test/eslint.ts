// T-0982 (D-0197): the one way a web test builds an ESLint instance.
//
// Why: `new ESLint()` is free, but the FIRST `lintText` in a process loads the whole flat config
// (typescript-eslint, react, import plugins). Measured alone that is ~1.0 s of CPU; with 8
// processes competing for 4 cores it is 4.4 to 5.2 s. Vitest runs each test file in its own
// worker, so every ESLint test file paid that cold start inside its first test, whose budget is
// the 5 s global `testTimeout`. Later lints in the same process cost 5 to 40 ms.
//
// Fix: pay the cold start at module load. A test file does
//     const eslint = await warmEslint();
// at top level. Collection has no timeout, so however slow the machine is, the cold start never
// counts against a test. No timeout is raised; the cost is moved to where it cannot time out.
import { resolve } from "node:path";
import { ESLint } from "eslint";

/** Files the tests lint, by extension: the config is resolved per file, so warm each kind. */
const WARM_FILES = ["src/features/UF-09/x.tsx", "src/features/UF-09/x.ts"];

/** Builds an ESLint instance over the shipped config and runs it once, so the config is loaded. */
export async function warmEslint(cwd: string = process.cwd()): Promise<ESLint> {
  const eslint = new ESLint({ cwd });
  for (const file of WARM_FILES) {
    await eslint.lintText("export const warm = 1;\n", { filePath: resolve(cwd, file) });
  }
  return eslint;
}
