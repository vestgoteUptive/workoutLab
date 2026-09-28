// @vitest-environment node
// Build-output checks for T-0300a (AC-A2, AC-A3, AC-A5, AC-A6, AC-A10, AC-A11). One real
// `vite build` into a temp outDir runs in beforeAll; every assertion reads that output.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { tokens } from "@workoutlab/design-tokens";

const webRoot = dirname(fileURLToPath(import.meta.url));
const viteBin = resolve(webRoot, "node_modules/vite/bin/vite.js");
const SUPABASE_URL = "https://abc.supabase.co";
const SUPABASE_ANON_KEY = "test-anon-key";
const BUILD_TIMEOUT = 60_000;

interface ManifestChunk {
  file: string;
  src?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
}

function runViteBuild(
  outDir: string,
  supabaseUrl: string | undefined,
  supabaseAnonKey: string | undefined = SUPABASE_ANON_KEY,
): SpawnSyncReturns<string> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Vitest sets NODE_ENV=test; a production build must not inherit it.
  delete env.NODE_ENV;
  delete env.VITE_SUPABASE_URL;
  delete env.VITE_SUPABASE_ANON_KEY;
  if (supabaseUrl) env.VITE_SUPABASE_URL = supabaseUrl;
  if (supabaseAnonKey) env.VITE_SUPABASE_ANON_KEY = supabaseAnonKey;
  return spawnSync(process.execPath, [viteBin, "build", "--outDir", outDir, "--emptyOutDir"], {
    cwd: webRoot,
    env,
    encoding: "utf8",
  });
}

/** Width/height from the PNG IHDR chunk (bytes 16-23). */
function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

let outDir: string;
let build: SpawnSyncReturns<string>;
let manifest: Record<string, ManifestChunk>;
let entry: ManifestChunk;
let indexHtml: string;

const read = (rel: string) => readFileSync(join(outDir, rel), "utf8");

beforeAll(() => {
  outDir = mkdtempSync(join(tmpdir(), "wl-web-build-"));
  build = runViteBuild(outDir, SUPABASE_URL);
  if (build.status !== 0) {
    throw new Error(`vite build failed:\n${build.stdout}\n${build.stderr}`);
  }
  manifest = JSON.parse(read(".vite/manifest.json")) as Record<string, ManifestChunk>;
  entry = Object.values(manifest).find((c) => c.isEntry)!;
  indexHtml = read("index.html");
}, BUILD_TIMEOUT);

afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

describe("AC-A2 tokens.css in the built CSS", () => {
  it("defines --wl-color-bg and --wl-color-coverage-4 and styles body from tokens", () => {
    expect(entry.css?.length).toBeGreaterThan(0);
    const css = entry.css!.map(read).join("\n");
    expect(css).toMatch(/--wl-color-bg\s*:/);
    expect(css).toMatch(/--wl-color-coverage-4\s*:/);
    expect(css).toMatch(
      /body\s*\{[^}]*background:\s*var\(--wl-color-bg\)\s*;\s*color:\s*var\(--wl-color-text\)/,
    );
  });
});

describe("AC-A3 manifest and icons from tokens", () => {
  const icons = [
    { src: "/icons/icon-192.png", sizes: "192x192", px: 192, purpose: undefined },
    { src: "/icons/icon-512.png", sizes: "512x512", px: 512, purpose: undefined },
    { src: "/icons/icon-512-maskable.png", sizes: "512x512", px: 512, purpose: "maskable" },
  ];

  it("manifest.webmanifest has the app identity and token colours", () => {
    const wm = JSON.parse(read("manifest.webmanifest")) as Record<string, unknown>;
    expect(wm.name).toBe("workout LAB");
    expect(wm.short_name).toBe("workout LAB");
    expect(wm.display).toBe("standalone");
    expect(wm.start_url).toBe("/");
    expect(wm.theme_color).toBe(tokens.color.bg);
    expect(wm.background_color).toBe(tokens.color.bg);
  });

  it("lists the three PNG icons, and each file is in dist at its pixel size", () => {
    const wm = JSON.parse(read("manifest.webmanifest")) as {
      icons: { src: string; sizes: string; type: string; purpose?: string }[];
    };
    for (const icon of icons) {
      const listed = wm.icons.find((i) => i.src === icon.src);
      expect(listed).toMatchObject({ sizes: icon.sizes, type: "image/png" });
      expect(listed?.purpose).toBe(icon.purpose);
      const { width, height } = pngSize(readFileSync(join(outDir, icon.src)));
      expect(width).toBe(icon.px);
      expect(height).toBe(icon.px);
    }
  });

  it("index.html carries the theme-color meta from tokens", () => {
    expect(indexHtml).toContain(`<meta name="theme-color" content="${tokens.color.bg}"`);
  });

  it("favicon.svg only uses bg/accent", () => {
    const svg = read("favicon.svg");
    const colours = [...svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]);
    expect(colours.length).toBeGreaterThan(0);
    for (const c of colours) expect([tokens.color.bg, tokens.color.accent]).toContain(c);
  });
});

describe("AC-A5 service worker precache", () => {
  it("precaches index.html, the entry JS and CSS, the manifest and the icons", () => {
    const sw = read("sw.js");
    const urls = new Set([...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]));
    const expected = [
      "index.html",
      entry.file,
      ...(entry.css ?? []),
      "manifest.webmanifest",
      "icons/icon-192.png",
      "icons/icon-512.png",
      "icons/icon-512-maskable.png",
    ];
    for (const url of expected) expect(urls, url).toContain(url);
  });
});

describe("AC-A6 lazy route chunks", () => {
  it("has one dynamic-entry chunk per route module", () => {
    const featureDirs = readdirSync(resolve(webRoot, "src/features"));
    expect(featureDirs.length).toBeGreaterThan(0);
    const files = new Set<string>();
    for (const dir of featureDirs) {
      const chunk = manifest[`src/features/${dir}/index.tsx`];
      expect(chunk, dir).toBeDefined();
      expect(chunk!.isDynamicEntry).toBe(true);
      expect(entry.dynamicImports).toContain(`src/features/${dir}/index.tsx`);
      expect(chunk!.file).not.toBe(entry.file);
      files.add(chunk!.file);
    }
    expect(files.size).toBe(featureDirs.length);
  });
});

describe("AC-A10 CSP", () => {
  it("has default-src 'self', connect-src 'self' + Supabase origin, no unsafe-eval", () => {
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(indexHtml)?.[1];
    expect(csp).toBeDefined();
    const directives = csp!.split(";").map((d) => d.trim());
    expect(directives).toContain("default-src 'self'");
    expect(directives).toContain(`connect-src 'self' ${SUPABASE_URL}`);
    expect(csp).not.toContain("unsafe-eval");
  });

  it(
    "a build with VITE_SUPABASE_URL unset fails and names the variable",
    () => {
      const failDir = mkdtempSync(join(tmpdir(), "wl-web-build-nourl-"));
      try {
        const res = runViteBuild(failDir, undefined);
        expect(res.status).not.toBe(0);
        expect(`${res.stdout}\n${res.stderr}`).toContain("VITE_SUPABASE_URL");
      } finally {
        rmSync(failDir, { recursive: true, force: true });
      }
    },
    BUILD_TIMEOUT,
  );

  it(
    "a build with VITE_SUPABASE_ANON_KEY unset fails and names the variable",
    () => {
      const failDir = mkdtempSync(join(tmpdir(), "wl-web-build-noanonkey-"));
      try {
        const res = runViteBuild(failDir, SUPABASE_URL, "");
        expect(res.status).not.toBe(0);
        expect(`${res.stdout}\n${res.stderr}`).toContain("VITE_SUPABASE_ANON_KEY");
      } finally {
        rmSync(failDir, { recursive: true, force: true });
      }
    },
    BUILD_TIMEOUT,
  );
});

describe("AC-A11 bundle budget", () => {
  it("check:size passes on the real build", () => {
    const res = spawnSync(
      process.execPath,
      [resolve(webRoot, "scripts/check-bundle-size.mjs"), outDir],
      { encoding: "utf8" },
    );
    expect(res.stderr).toBe("");
    expect(res.status).toBe(0);
  });
});

describe("D-0045 §8 icons in dev", () => {
  let server: ViteDevServer | undefined;

  afterAll(async () => {
    await server?.close();
  });

  it(
    "vite dev serves the generated icons without any file in public/",
    async () => {
      expect(existsSync(resolve(webRoot, "public/icons"))).toBe(false);
      server = await createServer({
        root: webRoot,
        configFile: resolve(webRoot, "vite.config.ts"),
        logLevel: "silent",
        server: { port: 0, host: "127.0.0.1" },
        optimizeDeps: { noDiscovery: true },
      });
      await server.listen();
      const { port } = server.httpServer!.address() as AddressInfo;
      for (const [path, px] of [
        ["/icons/icon-192.png", 192],
        ["/icons/icon-512.png", 512],
        ["/icons/icon-512-maskable.png", 512],
      ] as const) {
        const res = await fetch(`http://127.0.0.1:${port}${path}`);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("image/png");
        const { width } = pngSize(Buffer.from(await res.arrayBuffer()));
        expect(width).toBe(px);
      }
      const favicon = await fetch(`http://127.0.0.1:${port}/favicon.svg`);
      expect(favicon.headers.get("content-type")).toBe("image/svg+xml");
    },
    BUILD_TIMEOUT,
  );
});
