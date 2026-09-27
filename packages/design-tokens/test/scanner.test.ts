import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join, relative, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { pkgRoot, repoRoot, runCli } from "./helpers";

const tmp = mkdtempSync(join(tmpdir(), "wl-check-colours-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function fixture(name: string, files: Record<string, string>): string {
  const dir = join(tmp, name);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), content);
  }
  return dir;
}

describe("AC13 non-JS scanner (D-0019)", () => {
  it("exits 1 and prints path:line for each offending file", () => {
    const dir = fixture("dirty", {
      "a.css": ".x {\n  color: #D4F25A;\n}\n",
      "b.astro": "---\n---\n<style>.x{background: rgb(0 0 0)}</style>\n",
      "c.svg": '<svg><path fill="#fff" d="M0 0" /></svg>\n',
      "d.html": '<head>\n<meta name="theme-color" content="#121210">\n</head>\n',
      "e.webmanifest": '{\n  "theme_color": "#121210"\n}\n',
      "f.scss": "$c: hsl(0 0% 0%);\n",
    });
    const res = runCli([dir]);
    expect(res.status).toBe(1);
    for (const [file, line] of [
      ["a.css", 2],
      ["b.astro", 3],
      ["c.svg", 1],
      ["d.html", 2],
      ["e.webmanifest", 2],
      ["f.scss", 1],
    ] as const) {
      expect(res.stdout).toContain(`${join(dir, file)}:${line}`);
    }
  });

  it("exits 0 for tokens-only CSS, currentColor SVG and hex in skipped dirs", () => {
    const dir = fixture("clean", {
      "ok.css":
        ".x {\n  color: var(--wl-color-accent);\n  border-color: var(--wl-color-warn);\n}\n",
      "icon.svg": '<svg><path stroke="currentColor" fill="url(#fade)" /></svg>\n',
      "page.html": '<a href="#add">Add</a><a href="#section-2">2</a>\n',
      "node_modules/x/a.css": "a { color: #fff; }\n",
      "dist/a.css": "a { color: #fff; }\n",
      ".astro/a.css": "a { color: #fff; }\n",
      "coverage/a.html": '<span style="color:#fff">x</span>\n',
    });
    const res = runCli([dir]);
    expect(res.stdout).toBe("");
    expect(res.status).toBe(0);
  });

  it("catches colours in SVG animate/set `to` and unquoted markup attributes (D-0031)", () => {
    const dir = fixture("markup", {
      "anim.svg":
        '<svg>\n<animate attributeName="fill" to="#D4F25A" />\n<set attributeName="stroke" to=\'#fff\' />\n</svg>\n',
      "font.html": "<p>\n<font color=#fff>x</font>\n</p>\n",
      "page.astro": "---\n---\n<td bgcolor=#121210>x</td>\n",
    });
    const res = runCli([dir]);
    expect(res.status).toBe(1);
    for (const [file, line] of [
      ["anim.svg", 2],
      ["anim.svg", 3],
      ["font.html", 2],
      ["page.astro", 3],
    ] as const) {
      expect(res.stdout).toContain(`${join(dir, file)}:${line}`);
    }
  });

  it("still treats `>` as a combinator in stylesheets and ignores href/xlink:href/id in markup", () => {
    const dir = fixture("markup-clean", {
      "sel.css":
        "#add > li {\n  color: var(--wl-color-fg);\n}\n#bad>a { color: var(--wl-color-fg); }\n",
      "use.svg": '<svg><use xlink:href="#fab" /><g id="#add" /></svg>\n',
      "nav.html": '<a href="#add">x</a>\n',
    });
    const res = runCli([dir]);
    expect(res.stdout).toBe("");
    expect(res.status).toBe(0);
  });

  it("does not skip public/", () => {
    const dir = fixture("public", { "public/manifest.webmanifest": '{"theme_color":"#121210"}' });
    expect(runCli([dir]).status).toBe(1);
  });
});

describe("AC14 scanner is wired (current tree)", () => {
  it.each(["apps/web", "apps/landing"])("wl-check-colours exits 0 on %s", (dir) => {
    const res = runCli(["."], resolve(repoRoot, dir));
    expect(res.stdout).toBe("");
    expect(res.status).toBe(0);
  });

  // Runs in an isolated copy of the workspace so the real packages/design-tokens/dist is
  // never touched: `design-tokens#build` may be writing it in the same turbo run.
  it("web and landing lint pass with packages/design-tokens/dist deleted", () => {
    const ws = isolatedWorkspace();
    expect(existsSync(join(ws.root, "packages/design-tokens/dist"))).toBe(false);
    for (const app of ["apps/web", "apps/landing"]) {
      const res = ws.lint(app);
      expect(res.status, `${app}\n${res.stdout}\n${res.stderr}`).toBe(0);
    }
    // Control: the isolated lint really runs both guards.
    const probe = join(ws.root, "apps/web/src/__probe.ts");
    writeFileSync(probe, 'export const c = "#fff";\n');
    expect(ws.lint("apps/web").status).toBe(1);
    rmSync(probe);
    writeFileSync(join(ws.root, "apps/landing/src/__probe.css"), ".x { color: #fff; }\n");
    expect(ws.lint("apps/landing").status).toBe(1);
  }, 180_000);
});

const SKIP_COPY = new Set(["node_modules", "dist", ".astro", ".turbo", ".output", "coverage"]);

/** Copy of root config, design-tokens (package.json, eslint-plugin, bin, src; no dist)
 *  and the web/landing package roots, resolving deps through the real node_modules. */
function isolatedWorkspace() {
  const root = join(tmp, "ws");
  const copy = (rel: string) =>
    cpSync(resolve(repoRoot, rel), join(root, rel), {
      recursive: true,
      filter: (src) => !SKIP_COPY.has(basename(src)),
    });
  for (const rel of ["package.json", "eslint.config.mjs", "apps/web", "apps/landing"]) copy(rel);
  for (const rel of ["package.json", "eslint-plugin", "bin", "src"]) {
    copy(relative(repoRoot, join(pkgRoot, rel)));
  }
  symlinkSync(resolve(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  for (const app of ["apps/web", "apps/landing"]) {
    const scope = join(root, app, "node_modules/@workoutlab");
    mkdirSync(scope, { recursive: true });
    symlinkSync(join(root, "packages/design-tokens"), join(scope, "design-tokens"), "dir");
  }
  const bin = join(root, ".bin");
  mkdirSync(bin);
  const cli = join(root, "packages/design-tokens/bin/wl-check-colours.js");
  chmodSync(cli, 0o755);
  symlinkSync(cli, join(bin, "wl-check-colours"));
  const PATH = [bin, resolve(repoRoot, "node_modules/.bin"), process.env.PATH].join(delimiter);

  return {
    root,
    /** Run the app's own `lint` script, as `pnpm lint` would. */
    lint(app: string) {
      const pkg = JSON.parse(readFileSync(join(root, app, "package.json"), "utf8")) as {
        scripts: { lint: string };
      };
      return spawnSync("sh", ["-c", pkg.scripts.lint], {
        cwd: join(root, app),
        encoding: "utf8",
        env: { ...process.env, PATH },
        timeout: 120_000,
      });
    },
  };
}

describe("AC18 no raw colours in apps/ or packages/ outside design-tokens (non-JS)", () => {
  it("wl-check-colours exits 0 on apps and the other packages", () => {
    const res = runCli(["apps/web", "apps/landing", "packages/engine", "packages/shared"]);
    expect(res.stdout).toBe("");
    expect(res.status).toBe(0);
  });
});
