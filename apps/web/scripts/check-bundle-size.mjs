#!/usr/bin/env node
// `check:size` (NFR-PERF-2, AC-A11): the initial JS (entry + its static imports) must be
// <= 200 KB gzip, and each lazy route chunk <= 100 KB gzip.
import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";
import { extname, resolve } from "node:path";
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
 * Returns `{ ok, findings }`; `findings` name the offending file(s).
 */
export function checkBundleSize(files, manifest) {
  const byOutputFile = new Map(files.map((f) => [f.path, f]));
  const findings = [];

  const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry);
  if (entryKey) {
    const entry = manifest[entryKey];
    const initialFiles = new Set([entry.file, ...(entry.css ?? [])]);
    for (const importKey of entry.imports ?? []) {
      const imported = manifest[importKey];
      if (imported) initialFiles.add(imported.file);
    }
    let totalGzip = 0;
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
    if (bytes > CHUNK_BUDGET_BYTES) {
      findings.push({ kind: "chunk", bytes, budget: CHUNK_BUDGET_BYTES, files: [chunk.file] });
    }
  }

  return { ok: findings.length === 0, findings };
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

const isMain = process.argv[1] && resolve(process.argv[1]) === here;
if (isMain) {
  const distDir = resolve(process.argv[2] ?? "dist");
  const { files, manifest } = loadDist(distDir);
  const { ok, findings } = checkBundleSize(files, manifest);
  for (const f of findings) {
    console.error(
      `check:size: ${f.kind} budget exceeded (${f.bytes} > ${f.budget} bytes gzip): ${f.files.join(", ")}`,
    );
  }
  process.exit(ok ? 0 : 1);
}
