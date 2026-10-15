// T-0525: every workspace importer must resolve the same vitest variant.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Returns { importer: versionString } for each importer that lists vitest in devDependencies.
export function vitestVersions(lockText) {
  const out = {};
  const lines = lockText.split("\n");
  let section = null;
  let importer = null;
  let inDev = false;
  let inVitest = false;
  for (const line of lines) {
    if (/^\S/.test(line)) {
      section = line.replace(/:.*$/, "");
      importer = null;
      continue;
    }
    if (section !== "importers") continue;
    let m = /^ {2}(\S.*):$/.exec(line);
    if (m) {
      importer = m[1].replace(/^'|'$/g, "");
      inDev = false;
      inVitest = false;
      continue;
    }
    if (/^ {4}\S/.test(line)) {
      inDev = /^ {4}devDependencies:/.test(line);
      inVitest = false;
      continue;
    }
    if (!inDev || !importer) continue;
    if (/^ {6}vitest:\s*$/.test(line)) inVitest = true;
    else if (/^ {6}\S/.test(line)) inVitest = false;
    else if (inVitest && (m = /^ {8}version: (.+)$/.exec(line))) out[importer] = m[1];
  }
  return out;
}

export function checkVitestVariant(lockText) {
  const versions = vitestVersions(lockText);
  const entries = Object.entries(versions);
  const findings = [];
  if (entries.length === 0) return ["no importer lists vitest in pnpm-lock.yaml"];
  const counts = new Map();
  for (const [, v] of entries) counts.set(v, (counts.get(v) ?? 0) + 1);
  if (counts.size === 1) return findings;
  const [majority] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  for (const [imp, v] of entries) {
    if (v !== majority) findings.push(`${imp}: vitest ${v} differs from ${majority}`);
  }
  return findings;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const findings = checkVitestVariant(readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8"));
  for (const f of findings) console.error(f);
  process.exit(findings.length ? 1 : 0);
}
