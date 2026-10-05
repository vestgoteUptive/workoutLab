import { randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  CHUNK_BUDGET_BYTES,
  ENTRY_BUDGET_BYTES,
  checkBundleSize,
  runSizeCheck,
} from "./check-bundle-size.mjs";

function contentOfGzipSize(targetBytes: number): Buffer {
  // Random bytes are incompressible, so gzip size is ~= targetBytes: this reliably clears
  // (or, scaled up, blows) a budget expressed in gzip bytes.
  return randomBytes(targetBytes);
}

describe("check:size (AC-A11)", () => {
  it("passes when the entry and every chunk are within budget", () => {
    const files = [
      { path: "assets/index-abc.js", content: contentOfGzipSize(10 * 1024) },
      { path: "assets/route-xyz.js", content: contentOfGzipSize(5 * 1024) },
    ];
    const manifest = {
      "src/main.tsx": { file: "assets/index-abc.js", isEntry: true, imports: [] },
      "src/features/UF-02/index.tsx": { file: "assets/route-xyz.js" },
    };
    const { ok, findings } = checkBundleSize(files, manifest);
    expect(ok).toBe(true);
    expect(findings).toEqual([]);
  });

  it("fails and names the file when the entry exceeds 200 KB gzip", () => {
    const bigContent = contentOfGzipSize(ENTRY_BUDGET_BYTES + 1024);
    // Sanity: the fixture content actually gzips over budget (AC-A11 fixture requirement).
    expect(gzipSync(bigContent).length).toBeGreaterThan(ENTRY_BUDGET_BYTES);

    const files = [{ path: "assets/index-abc.js", content: bigContent }];
    const manifest = {
      "src/main.tsx": { file: "assets/index-abc.js", isEntry: true, imports: [] },
    };
    const { ok, findings } = checkBundleSize(files, manifest);
    expect(ok).toBe(false);
    expect(findings[0].kind).toBe("entry");
    expect(findings[0].files).toContain("assets/index-abc.js");
  });

  it("fails and names the file when a lazy route chunk exceeds 100 KB gzip", () => {
    const bigContent = contentOfGzipSize(CHUNK_BUDGET_BYTES + 1024);
    const files = [
      { path: "assets/index-abc.js", content: contentOfGzipSize(1024) },
      { path: "assets/route-xyz.js", content: bigContent },
    ];
    const manifest = {
      "src/main.tsx": { file: "assets/index-abc.js", isEntry: true, imports: [] },
      "src/features/UF-09/index.tsx": { file: "assets/route-xyz.js" },
    };
    const { ok, findings } = checkBundleSize(files, manifest);
    expect(ok).toBe(false);
    expect(findings[0].kind).toBe("chunk");
    expect(findings[0].files).toContain("assets/route-xyz.js");
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "check-bundle-size.mjs");

describe("T-0322 runSizeCheck", () => {
  const tmps: string[] = [];
  afterEach(() => {
    for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const T = new Date("2026-01-01T00:00:00Z");
  const later = (s: number) => new Date(T.getTime() + s * 1000);

  function fixture(opts: { entryKB?: number; lazy?: boolean } = {}) {
    const root = mkdtempSync(join(tmpdir(), "wl-size-"));
    tmps.push(root);
    const dist = join(root, "dist");
    const src = join(root, "src");
    mkdirSync(join(dist, ".vite"), { recursive: true });
    mkdirSync(join(dist, "assets"));
    mkdirSync(join(src, "app"), { recursive: true });
    mkdirSync(join(src, "__tests__"));
    mkdirSync(join(src, "lib"));
    const entry = randomBytes((opts.entryKB ?? 10) * 1024);
    const lazy = randomBytes(5 * 1024);
    writeFileSync(join(dist, "assets/index-abc.js"), entry);
    const manifest: Record<string, unknown> = {
      "src/main.tsx": { file: "assets/index-abc.js", isEntry: true, imports: [] },
    };
    if (opts.lazy !== false) {
      writeFileSync(join(dist, "assets/route-xyz.js"), lazy);
      manifest["src/route.tsx"] = { file: "assets/route-xyz.js" };
    }
    const mpath = join(dist, ".vite/manifest.json");
    writeFileSync(mpath, JSON.stringify(manifest));
    writeFileSync(join(src, "app/main.tsx"), "x");
    utimesSync(join(src, "app/main.tsx"), T, T);
    utimesSync(mpath, later(10), later(10));
    return { root, dist, src, mpath, entry, lazy };
  }

  it("T-0322 AC-1 prints the measured entry and max chunk", () => {
    const f = fixture();
    const r = runSizeCheck(f.dist, { sourceRoots: [f.src] });
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    const e = r.out.find((l) => /^check:size: entry \d+ B gzip \(budget 204800\)$/.test(l));
    const c = r.out.find((l) =>
      /^check:size: max chunk \d+ B gzip assets\/route-xyz\.js \(budget 102400\)$/.test(l),
    );
    expect(e).toBeDefined();
    expect(c).toBeDefined();
    const m = JSON.parse(readFileSync(f.mpath, "utf8"));
    const res = checkBundleSize(
      [
        { path: "assets/index-abc.js", content: f.entry },
        { path: "assets/route-xyz.js", content: f.lazy },
      ],
      m,
    );
    expect(e).toContain(` ${res.entryBytes} B`);
    expect(c).toContain(` ${res.maxChunk?.bytes} B`);

    const g = fixture({ lazy: false });
    expect(runSizeCheck(g.dist, { sourceRoots: [g.src] }).out).toContain(
      "check:size: max chunk none",
    );
  });

  it("T-0322 AC-2 a dist older than the source fails (function and CLI)", () => {
    const f = fixture();
    utimesSync(f.mpath, T, T);
    utimesSync(join(f.src, "app/main.tsx"), later(60), later(60));
    const r = runSizeCheck(f.dist, { sourceRoots: [f.src] });
    expect(r.code).toBe(1);
    expect(r.err).toHaveLength(1);
    expect(r.err[0]).toContain("src/app/main.tsx");
    expect(r.err[0]).toMatch(/older than/);

    const g = fixture();
    utimesSync(g.mpath, new Date(0), new Date(0));
    const cli = spawnSync("node", [cliPath, g.dist], { encoding: "utf8" });
    expect(cli.status).toBe(1);
    expect(cli.stderr).toMatch(/older than/);
  });

  it("T-0322 AC-3 a missing dist is a sentence, not a stack trace", () => {
    const root = mkdtempSync(join(tmpdir(), "wl-size-"));
    tmps.push(root);
    const r = runSizeCheck(root, { sourceRoots: [] });
    expect(r.code).toBe(1);
    expect(r.err).toHaveLength(1);
    expect(r.err[0]).toContain(".vite/manifest.json");
    expect(r.err.some((l) => l.startsWith("    at "))).toBe(false);
  });

  it("T-0322 AC-4 changed test files do not make dist stale", () => {
    const f = fixture();
    utimesSync(f.mpath, T, T);
    writeFileSync(join(f.src, "__tests__/a.test.ts"), "x");
    writeFileSync(join(f.src, "lib/b.test.tsx"), "x");
    utimesSync(join(f.src, "__tests__/a.test.ts"), later(60), later(60));
    utimesSync(join(f.src, "lib/b.test.tsx"), later(60), later(60));
    expect(runSizeCheck(f.dist, { sourceRoots: [f.src] }).code).toBe(0);
  });

  it("T-0322 AC-5 a fresh over-budget build still fails", () => {
    const f = fixture({ entryKB: 210 });
    const r = runSizeCheck(f.dist, { sourceRoots: [f.src] });
    expect(r.code).toBe(1);
    expect(r.err.some((l) => l.includes("entry budget exceeded"))).toBe(true);
  });

  it("T-0322 AC-6 the CLI passes on a fresh dist", () => {
    const f = fixture();
    const future = new Date(Date.now() + 3600 * 1000);
    utimesSync(f.mpath, future, future);
    const cli = spawnSync("node", [cliPath, f.dist], { encoding: "utf8" });
    expect(cli.status).toBe(0);
    expect(cli.stdout).toMatch(/^check:size: entry \d+ B gzip \(budget 204800\)$/m);
    expect(cli.stdout).toMatch(
      /^check:size: max chunk \d+ B gzip assets\/route-xyz\.js \(budget 102400\)$/m,
    );
  });

  it("T-0322 AC-7 root package.json has the check:size script", () => {
    const pkg = JSON.parse(readFileSync(resolve(here, "../../../package.json"), "utf8"));
    expect(pkg.scripts["check:size"]).toBe("pnpm --filter @workoutlab/web check:size");
  });
});
