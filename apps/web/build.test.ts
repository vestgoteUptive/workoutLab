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
  // T-0312: say why instead of letting Rollup's "failed to resolve" look like a flake.
  const tokensCss = resolve(webRoot, "../../packages/design-tokens/dist/tokens.css");
  if (!existsSync(tokensCss)) {
    throw new Error(
      `${tokensCss} is not built. Run tests with \`pnpm --filter @workoutlab/web test\` ` +
        "(its pretest builds it), or run `node ensure-tokens-css.mjs` before calling vitest directly.",
    );
  }
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

// T-0429: the bundle registers the worker (src/lib/pwa/register.ts) with a rejection handler,
// so vite-plugin-pwa must not inject its own handler-less `registerSW.js` (injectRegister: false).
describe("T-0429 AC4 no injected service worker registration", () => {
  it("T-0429 AC4 dist has no registerSW.js but still has sw.js", () => {
    expect(existsSync(join(outDir, "registerSW.js"))).toBe(false);
    expect(existsSync(join(outDir, "sw.js"))).toBe(true);
  });

  it("T-0429 AC4 index.html has no registerSW reference and no inline <script>", () => {
    expect(indexHtml).not.toContain("registerSW");
    const scripts = [...indexHtml.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1]!);
    expect(scripts.length).toBeGreaterThan(0);
    const inline = scripts.filter((attrs) => !/\bsrc\s*=/.test(attrs));
    expect(inline).toEqual([]);
  });
});

// D-0144 §2 §4: feature folders with no route of their own, mounted from other flows' chunks
// through seams (D-0069 §5, D-0071 §7, D-0142 §8). Only a web-shell ticket citing a decision
// that the feature has no route may add to this list. An entry may be missing from disk.
const SEAM_MOUNTED_FEATURES: readonly string[] = ["UF-05"];

// D-0144 §3c, amended by D-0156 §2: strings only the seam-mounted feature's own code and CSS
// carry. For UF-05 that is the `wl-uf05` class prefix of its JSX and `uf-05.css`. Flow strings are
// in the entry by design (D-0071 §1: `flows/uf-NN.ts` are composed into the `en` catalogue the
// shell uses, and Rollup keeps every key a lazy chunk reads), so copy can't be a sentinel. The
// prefix still catches a side-effect import of UF-05 from `src/app` (the CSS lands in the entry)
// and UF-05 inlined into a chunk with no `src`.
const SEAM_SENTINELS: Readonly<Record<string, readonly string[]>> = {
  "UF-05": ["wl-uf05"],
};

/** The folders `src/app/routes.ts` lazy-loads, from its `import("../features/<dir>/index.js")`. */
function routeFolders(): string[] {
  const src = readFileSync(resolve(webRoot, "src/app/routes.ts"), "utf8");
  const dirs = [...src.matchAll(/import\(\s*["']\.\.\/features\/([^/"']+)\/index\.js["']\s*\)/g)];
  return [...new Set(dirs.map((m) => m[1]!))];
}

/** The manifest keys the entry reaches through static `imports`, followed transitively. */
function staticEntryGraph(): ManifestChunk[] {
  const entryKey = Object.keys(manifest).find((k) => manifest[k]!.isEntry)!;
  const seen = new Set<string>([entryKey]);
  const queue = [entryKey];
  while (queue.length > 0) {
    for (const next of manifest[queue.shift()!]!.imports ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return [...seen].map((k) => manifest[k]!);
}

describe("AC-A6 lazy route chunks (D-0144)", () => {
  const featureDirs = readdirSync(resolve(webRoot, "src/features"));
  const routeDirs = routeFolders();
  const seamDirs = SEAM_MOUNTED_FEATURES.filter((dir) => featureDirs.includes(dir));

  it("has one dynamic-entry chunk per route module in routes.ts", () => {
    expect(routeDirs.length).toBeGreaterThan(0);
    const files = new Set<string>();
    for (const dir of routeDirs) {
      const chunk = manifest[`src/features/${dir}/index.tsx`];
      expect(chunk, dir).toBeDefined();
      expect(chunk!.isDynamicEntry).toBe(true);
      expect(entry.dynamicImports).toContain(`src/features/${dir}/index.tsx`);
      expect(chunk!.file).not.toBe(entry.file);
      files.add(chunk!.file);
    }
    expect(files.size).toBe(routeDirs.length);
  });

  it("every feature folder is a route folder or seam-mounted, never both", () => {
    expect(featureDirs.length).toBeGreaterThan(0);
    const unaccounted = featureDirs.filter(
      (dir) => !routeDirs.includes(dir) && !SEAM_MOUNTED_FEATURES.includes(dir),
    );
    expect(unaccounted, "feature folders with no route in routes.ts").toEqual([]);
    const both = SEAM_MOUNTED_FEATURES.filter((dir) => routeDirs.includes(dir));
    expect(both, "seam-mounted features that routes.ts also loads").toEqual([]);
  });

  it("no seam-mounted feature is in the entry chunk", () => {
    const graph = staticEntryGraph();
    const texts = graph.flatMap((c) => [c.file, ...(c.css ?? [])]).map((f) => [f, read(f)]);
    for (const dir of SEAM_MOUNTED_FEATURES) expect(SEAM_SENTINELS[dir], dir).toBeDefined();
    for (const dir of seamDirs) {
      expect(entry.dynamicImports ?? [], dir).not.toContain(`src/features/${dir}/index.tsx`);
      const inGraph = graph.filter((c) => c.src?.startsWith(`src/features/${dir}/`));
      expect(
        inGraph.map((c) => c.src),
        `${dir} sources the entry reaches statically`,
      ).toEqual([]);
      const hits = SEAM_SENTINELS[dir]!.flatMap((sentinel) =>
        texts.filter(([, text]) => text!.includes(sentinel)).map(([f]) => `${f}: ${sentinel}`),
      );
      expect(hits, `entry-graph files with a ${dir} sentinel`).toEqual([]);
    }
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

// D-0117 §4c / T-0390: markers of runtime code generation, which `script-src 'self'` blocks.
// The lookbehind keeps `isFunction(`, `x.eval(`, `$eval(` and `retrieval(` from matching.
// T-0398 widens it: member-access eval, Function.apply/call, Reflect.construct(Function,
// Function(<identifier>), `new  Function (` and string-argument setTimeout/setInterval.
const CODEGEN_MARKERS: readonly RegExp[] = [
  /new Function\(/,
  /(?<![\w$.])Function\(\s*"/,
  /Error compiling schema/,
  /(?<![\w$.])Function\(\s*'/,
  /(?<![\w$.])Function\(\s*`/,
  /(?<![\w$.])eval\(/,
  /\(\s*0\s*,\s*eval\s*\)\s*\(/,
  /ajv\/dist\/compile/,
  /\b(?:globalThis|window|self|global)\s*(?:\.\s*eval|\[\s*["'`]eval["'`]\s*\])\s*\(/,
  /(?<![\w$.])Function\s*\.\s*(?:apply|call)\s*\(/,
  /Reflect\s*\.\s*construct\s*\(\s*Function\b/,
  /(?<![\w$.])Function\(\s*[A-Za-z_$][\w$]*\s*[,)]/,
  /new\s+Function\s*\(/,
  /(?<![\w$])set(?:Timeout|Interval)\s*\(\s*["'`]/,
];

/** The marker sources that `text` matches; empty when the text is clean. */
function codegenHits(text: string): string[] {
  return CODEGEN_MARKERS.filter((m) => m.test(text)).map((m) => m.source);
}

describe("T-0229 AC6 no runtime code generation in the bundle (D-0117 §4c)", () => {
  it("T-0398 AC4 T-0390 AC1 AC3 (T-0229 AC6) no dist JS asset matches a code-generation marker", () => {
    const assets = (readdirSync(outDir, { recursive: true }) as string[])
      .map((f) => f.split("\\").join("/"))
      .filter((f) => f.endsWith(".js"));
    expect(assets.length).toBeGreaterThan(0);
    const hits = assets.flatMap((asset) => codegenHits(read(asset)).map((m) => `${asset}: ${m}`));
    expect(hits).toEqual([]);
  });
});

describe("T-0390 AC2 code-generation matcher table (D-0117 §4c)", () => {
  const flagged = [
    "Function('return this')()",
    "Function(`a`, `b`)",
    'eval("1")',
    ";eval(x)",
    '(0,eval)("x")',
    "( 0 , eval )(x)",
    'require("ajv/dist/compile/index")',
    "new Function(a)",
    'Function("x")',
  ];
  const clean = [
    "retrieval(x)",
    "isFunction(x)",
    "x.eval(y)",
    "$eval(y)",
    "toFunction('a')",
    "evaluate(x)",
    '"interval"',
    "typeof Function",
    "Function.prototype.call(x)",
  ];

  it.each(flagged)("T-0390 AC2 flags %s", (sample) => {
    expect(codegenHits(sample)).not.toEqual([]);
  });

  it.each(clean)("T-0390 AC2 does not flag %s", (sample) => {
    expect(codegenHits(sample)).toEqual([]);
  });
});

describe("T-0398 AC3 widened code-generation matcher table (D-0117 §4c)", () => {
  const flagged = [
    'globalThis.eval("x")',
    "window.eval(x)",
    'self["eval"](x)',
    "globalThis . eval (x)",
    'Function.apply(null, ["x"])',
    'Function.call(null, "x")',
    'Reflect.construct(Function, ["x"])',
    "Function(src)",
    "Function(a, b)",
    "new Function (a)",
    "new  Function(a)",
    'Function( "x")',
    'setTimeout("tick()", 10)',
    "setInterval('tick()', 5)",
    "setTimeout(`x`)",
    'window.setTimeout("x")',
  ];
  const clean = [
    'isFunction("x")',
    "myFunction(src)",
    "x.Function(src)",
    "setTimeout(fn, 10)",
    "setInterval(() => tick(), 5)",
    "clearTimeout(id)",
    "x.evaluate(y)",
    "globalThis.evaluate(x)",
    "Function.prototype.apply(x)",
    "Reflect.construct(Foo, [])",
    "typeof Function",
  ];

  it.each(flagged)("T-0398 AC3 flags %s", (sample) => {
    expect(codegenHits(sample)).not.toEqual([]);
  });

  it.each(clean)("T-0398 AC3 does not flag %s", (sample) => {
    expect(codegenHits(sample)).toEqual([]);
  });
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
