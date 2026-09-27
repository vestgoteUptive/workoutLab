#!/usr/bin/env node
// wl-check-colours: find raw colours in non-JS files (D-0019).
// Usage: wl-check-colours [dir…]   (default ".")
// Exit 0 = clean, 1 = raw colours found, 2 = usage error.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { findRawColours } from "../eslint-plugin/colour-patterns.js";

const EXTENSIONS = new Set([".css", ".scss", ".html", ".astro", ".svg", ".webmanifest"]);
// `public/` is deliberately not skipped: manifest and favicon colours must come from tokens.
const SKIP_DIRS = new Set(["node_modules", "dist", ".astro", "coverage", ".git"]);

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(full);
    } else if (entry.isFile() && EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      yield full;
    }
  }
}

const roots = process.argv.slice(2);
if (roots.length === 0) roots.push(".");

let findings = 0;
for (const root of roots) {
  let isDir;
  try {
    isDir = statSync(root).isDirectory();
  } catch {
    console.error(`wl-check-colours: no such directory: ${root}`);
    process.exit(2);
  }
  if (!isDir) {
    console.error(`wl-check-colours: not a directory: ${root}`);
    process.exit(2);
  }
  for (const file of walk(root)) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const { index, value } of findRawColours(line, { markup: true })) {
        findings += 1;
        console.log(
          `${file}:${i + 1}:${index + 1}  raw colour ${value}: use var(--wl-color-…) from @workoutlab/design-tokens`,
        );
      }
    });
  }
}

if (findings > 0) {
  console.error(`wl-check-colours: ${findings} raw colour(s) found (D-0019).`);
  process.exit(1);
}
