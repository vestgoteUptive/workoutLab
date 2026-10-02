// T-0440 (D-0155 §5–§6): pins the e2e config's two loud-failure rules and everything around them
// that must not move. No page is needed: these read the loaded config, its source and the
// preflight's pure function. Imported from the guarded fixture so T-0432's check finds it guarded.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./fixtures/guarded-test.js";
import { checkTmpdir, tmpdirProblem } from "./fixtures/preflight.js";
import config, { BASE_URL } from "./playwright.config.js";

// Playwright transpiles these specs to CJS, so `__dirname` is this directory (see
// fixture-guard.spec.ts).
const read = (path: string) => readFileSync(join(__dirname, path), "utf8");
const configSource = read("playwright.config.ts");

/** The config's single `webServer`, typed loosely: the AC-5 pins compare literals. */
function webServer() {
  const server = config.webServer;
  expect(Array.isArray(server)).toBe(false);
  return server as Exclude<typeof server, unknown[] | undefined>;
}

test.describe("T-0440 playwright.config", () => {
  test("T-0440 AC1 never reuses a server on :4173, and the port is strict", () => {
    expect(webServer().reuseExistingServer).toBe(false);
    // The literal `false`, not an expression on CI (the old `!process.env.CI`).
    expect(configSource).toMatch(/^\s*reuseExistingServer:\s*false,\s*$/m);
    expect(configSource).not.toMatch(/reuseExistingServer:[^\n]*process\.env/);

    const pkg = JSON.parse(read("../../apps/web/package.json")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.preview).toContain("--port 4173");
    expect(pkg.scripts.preview).toContain("--strictPort");
    expect(new URL(BASE_URL).port).toBe("4173");
  });

  test("T-0440 AC5 nothing else in the config moved", () => {
    expect(config.retries).toBe(0);
    const server = webServer();
    expect(server.command).toBe(
      "pnpm turbo run build --filter=@workoutlab/web && pnpm --filter @workoutlab/web preview",
    );
    expect(server.url).toBe(BASE_URL);
    expect(server.env).toEqual({
      VITE_SUPABASE_URL: "https://abc.supabase.co",
      VITE_SUPABASE_ANON_KEY: "e2e-fake-anon-key",
    });
    expect(config.projects?.map((p) => p.name)).toEqual(["chromium"]);
  });

  test("T-0440 AC4 the config imports the preflight and calls it at top level, outside defineConfig", () => {
    expect(configSource).toMatch(
      /^import \{[^}]*\bcheckTmpdir\b[^}]*\} from "\.\/fixtures\/preflight\.js";$/m,
    );
    // A top-level statement (column 0) that calls it and throws its message.
    const call = configSource.match(/^const (\w+) = checkTmpdir\([^)]*\);$/m);
    expect(call).not.toBeNull();
    const name = call![1]!;
    expect(configSource).toMatch(
      new RegExp(`^if \\(${name}\\) throw new Error\\(${name}\\);$`, "m"),
    );
    // Before `defineConfig(`, so it runs at load and is not part of the config object.
    expect(call!.index!).toBeLessThan(configSource.indexOf("export default defineConfig("));
  });
});

test.describe("T-0440 tmpfs preflight", () => {
  const TMPFS = 0x01021994;
  const EXT4 = 0xef53;

  test("T-0440 AC3 an 80% full tmpfs fails, naming the dir, the share and the fix", () => {
    const message = tmpdirProblem({ type: TMPFS, blocks: 100, bavail: 20 }, "/tmp");
    expect(message).not.toBeNull();
    expect(message).toContain("/tmp");
    expect(message).toContain("80%");
    expect(message).toContain("TMPDIR=$HOME/.cache/wl-pw-tmp");
  });

  test("T-0440 AC3 a 79% full tmpfs passes", () => {
    expect(tmpdirProblem({ type: TMPFS, blocks: 100, bavail: 21 }, "/tmp")).toBeNull();
  });

  test("T-0440 AC3 a 95% full disk (ext4) passes: only a tmpfs counts", () => {
    expect(tmpdirProblem({ type: EXT4, blocks: 100, bavail: 5 }, "/tmp")).toBeNull();
  });

  test("T-0440 AC3 an empty tmpfs (blocks 0) passes, with no divide by zero", () => {
    expect(tmpdirProblem({ type: TMPFS, blocks: 0, bavail: 0 }, "/tmp")).toBeNull();
  });

  test("T-0440 AC3 checkTmpdir returns null when statfs throws", () => {
    expect(
      checkTmpdir("/x", () => {
        throw new Error("ENOSYS");
      }),
    ).toBeNull();
  });

  test("T-0440 AC3 checkTmpdir hands the statfs result and dir to tmpdirProblem", () => {
    const seen: string[] = [];
    const message = checkTmpdir("/y", (path) => {
      seen.push(path);
      return { type: TMPFS, blocks: 10, bavail: 1 };
    });
    expect(seen).toEqual(["/y"]);
    expect(message).toContain("/y");
    expect(message).toContain("90%");
  });
});
