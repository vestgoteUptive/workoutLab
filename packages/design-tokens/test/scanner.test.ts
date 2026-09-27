import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { pkgRoot, pnpm, repoRoot, runCli } from "./helpers";

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

  it("web and landing lint pass with packages/design-tokens/dist deleted", () => {
    const dist = resolve(pkgRoot, "dist");
    const aside = resolve(pkgRoot, `dist.aside-${process.pid}`);
    const hadDist = existsSync(dist);
    if (hadDist) renameSync(dist, aside);
    try {
      for (const name of ["@workoutlab/web", "@workoutlab/landing"]) {
        const res = pnpm(["--filter", name, "lint"]);
        expect(res.status, `${name}\n${res.stdout}\n${res.stderr}`).toBe(0);
      }
    } finally {
      if (hadDist) renameSync(aside, dist);
    }
  }, 180_000);
});

describe("AC18 no raw colours in apps/ or packages/ outside design-tokens (non-JS)", () => {
  it("wl-check-colours exits 0 on apps and the other packages", () => {
    const res = runCli(["apps/web", "apps/landing", "packages/engine", "packages/shared"]);
    expect(res.stdout).toBe("");
    expect(res.status).toBe(0);
  });
});
