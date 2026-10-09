#!/usr/bin/env node
// serve-preview (T-0614): open the body figure preview for a design check (H-31).
// Builds packages/design-tokens/dist/tokens.css if it is missing, serves the repo root on
// 127.0.0.1 and prints the preview URL. Node only, no dependencies. Ctrl-C stops it.
//
// Usage: node Design-docs/docs/design/assets/body-figure/serve-preview.mjs [--port 5180]
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../../..");
const PREVIEW = "/Design-docs/docs/design/assets/body-figure/preview.html";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
};

const portFlag = process.argv.indexOf("--port");
const port = portFlag >= 0 ? Number(process.argv[portFlag + 1]) : 5180;

const tokensCss = join(REPO, "packages/design-tokens/dist/tokens.css");
if (!existsSync(tokensCss)) {
  const r = spawnSync(process.execPath, ["scripts/build-css.mjs"], {
    cwd: join(REPO, "packages/design-tokens"),
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  const file = normalize(join(REPO, path === "/" ? PREVIEW : path));
  if (!file.startsWith(REPO + sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Body figure preview: http://127.0.0.1:${port}${PREVIEW}`);
});
