#!/usr/bin/env node
// `check:size` (NFR-PERF-2, AC-A11): the initial JS (entry + its static imports) must be
// <= 200 KB gzip, and each lazy route chunk <= 100 KB gzip.
import { gzipSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(import.meta.url);

export const ENTRY_BUDGET_BYTES = 200 * 1024;
export const CHUNK_BUDGET_BYTES = 100 * 1024;

function gzipSize(content) {
  return gzipSync(Buffer.isBuffer(content) ? content : Buffer.from(content)).length;
}

/**
 * `files`: array of `{ path, content }` for every JS file under `dist/assets` (or a fixture
 * dist). `manifest`: Vite's `.vite/manifest.json` object (path -> { file, isEntry, imports }).
 * Returns `{ ok, findings, entryBytes, maxChunk }`; `findings` name the offending file(s).
 */
export function checkBundleSize(files, manifest) {
  const byOutputFile = new Map(files.map((f) => [f.path, f]));
  const findings = [];
  let totalGzip = 0;
  let maxChunk = null;

  const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry);
  if (entryKey) {
    const entry = manifest[entryKey];
    const initialFiles = new Set([entry.file, ...(entry.css ?? [])]);
    for (const importKey of entry.imports ?? []) {
      const imported = manifest[importKey];
      if (imported) initialFiles.add(imported.file);
    }
    totalGzip = 0;
    for (const file of initialFiles) {
      const f = byOutputFile.get(file);
      if (f && extname(file) === ".js") totalGzip += gzipSize(f.content);
    }
    if (totalGzip > ENTRY_BUDGET_BYTES) {
      findings.push({
        kind: "entry",
        bytes: totalGzip,
        budget: ENTRY_BUDGET_BYTES,
        files: [...initialFiles],
      });
    }
  }

  const initialManifestFiles = new Set();
  if (entryKey) {
    const entry = manifest[entryKey];
    initialManifestFiles.add(entry.file);
    for (const importKey of entry.imports ?? []) {
      const imported = manifest[importKey];
      if (imported) initialManifestFiles.add(imported.file);
    }
  }

  for (const [key, chunk] of Object.entries(manifest)) {
    if (key === entryKey) continue;
    if (initialManifestFiles.has(chunk.file)) continue;
    if (extname(chunk.file) !== ".js") continue;
    const f = byOutputFile.get(chunk.file);
    if (!f) continue;
    const bytes = gzipSize(f.content);
    if (!maxChunk || bytes > maxChunk.bytes) maxChunk = { file: chunk.file, bytes };
    if (bytes > CHUNK_BUDGET_BYTES) {
      findings.push({ kind: "chunk", bytes, budget: CHUNK_BUDGET_BYTES, files: [chunk.file] });
    }
  }

  return { ok: findings.length === 0, findings, entryBytes: totalGzip, maxChunk };
}

function loadDist(distDir) {
  const manifestPath = resolve(distDir, ".vite/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const assetsDir = resolve(distDir, "assets");
  const files = [];
  for (const name of readdirSync(assetsDir)) {
    files.push({ path: `assets/${name}`, content: readFileSync(resolve(assetsDir, name)) });
  }
  return { files, manifest };
}

const repoRoot = resolve(here, "../../../..");
export const DEFAULT_SOURCE_ROOTS = [
  "apps/web/src",
  "apps/web/index.html",
  "apps/web/vite.config.ts",
  "packages/engine/src",
  "packages/shared/src",
  "packages/design-tokens/src",
].map((p) => resolve(repoRoot, p));

const SKIP_DIRS = new Set(["__tests__", "node_modules", "dist"]);

/** Newest shipped source file under `roots`: `{ path, mtimeMs }` or null. */
function newestSource(roots) {
  let newest = null;
  const visit = (p) => {
    let st;
    try {
      st = statSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      for (const name of readdirSync(p)) {
        if (SKIP_DIRS.has(name)) continue;
        visit(join(p, name));
      }
    } else if (!/\.test\./.test(p.slice(p.lastIndexOf("/") + 1))) {
      if (!newest || st.mtimeMs > newest.mtimeMs) newest = { path: p, mtimeMs: st.mtimeMs };
    }
  };
  for (const r of roots) if (existsSync(r)) visit(r);
  return newest;
}

/** Does the whole CLI job without exiting or printing: `{ code, out, err }`. */
export function runSizeCheck(distDir, { sourceRoots = DEFAULT_SOURCE_ROOTS } = {}) {
  const manifestPath = resolve(distDir, ".vite/manifest.json");
  if (!existsSync(manifestPath)) {
    return {
      code: 1,
      out: [],
      err: [`check:size: ${manifestPath} not found; run the web build first`],
    };
  }
  const newest = newestSource(sourceRoots);
  if (newest && newest.mtimeMs > statSync(manifestPath).mtimeMs) {
    return {
      code: 1,
      out: [],
      err: [
        `check:size: dist/ is older than the source (${newest.path} is newer than ${manifestPath}); rebuild the web app`,
      ],
    };
  }
  const { files, manifest } = loadDist(distDir);
  const { ok, findings, entryBytes, maxChunk } = checkBundleSize(files, manifest);
  const out = [
    `check:size: entry ${entryBytes} B gzip (budget ${ENTRY_BUDGET_BYTES})`,
    maxChunk
      ? `check:size: max chunk ${maxChunk.bytes} B gzip ${maxChunk.file} (budget ${CHUNK_BUDGET_BYTES})`
      : "check:size: max chunk none",
  ];
  const err = findings.map(
    (f) =>
      `check:size: ${f.kind} budget exceeded (${f.bytes} > ${f.budget} bytes gzip): ${f.files.join(", ")}`,
  );
  return { code: ok ? 0 : 1, out, err };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === here;
if (isMain) {
  const { code, out, err } = runSizeCheck(resolve(process.argv[2] ?? "dist"));
  for (const l of out) console.log(l);
  for (const l of err) console.error(l);
  process.exit(code);
}
