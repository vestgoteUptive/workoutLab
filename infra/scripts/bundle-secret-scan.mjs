// T-0514b: second line of defence for a manual prod deploy (D-0190 §5, go-live review F-4/F-7).
// Scans built output for things that must never ship. Prints finding kinds and paths only,
// never the matched text.
//   node infra/scripts/bundle-secret-scan.mjs apps/web/dist apps/landing/dist
// Exit 0 = clean, 1 = findings, 2 = bad usage (missing dir).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// supabase-js holds the bare string "sb_secret_" in a prefix check; only a key body counts.
const SECRET_KEY = /sb_secret_[A-Za-z0-9_-]{20,}/;
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]+/g;
const ORIGIN = /https:\/\/([a-z0-9]{20})\.supabase\.co/g;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

function isServiceRoleJwt(payloadB64) {
  try {
    const json = Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json).role === "service_role";
  } catch {
    return false;
  }
}

export function scan(dirs, { supabaseOrigin }) {
  const findings = [];
  for (const dir of dirs) {
    for (const file of walk(dir)) {
      const add = (kind) => findings.push({ kind, file });
      if (file.endsWith(".mjs")) add("mjs-file");
      const text = readFileSync(file, "latin1");
      if (SECRET_KEY.test(text)) add("sb-secret-key");
      if ([...text.matchAll(JWT)].some((m) => isServiceRoleJwt(m[1]))) add("service-role-jwt");
      if ([...text.matchAll(ORIGIN)].some((m) => m[0] !== supabaseOrigin)) add("foreign-supabase-origin");
    }
  }
  return findings;
}

function expectedOrigin() {
  const here = dirname(fileURLToPath(import.meta.url));
  const cfg = JSON.parse(readFileSync(join(here, "..", "auth", "expected-auth.json"), "utf8"));
  return `https://${cfg.project_ref}.supabase.co`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) {
    console.error("usage: node bundle-secret-scan.mjs <dist-dir>...");
    process.exit(2);
  }
  for (const d of dirs) {
    try {
      if (!statSync(d).isDirectory()) throw new Error("not a directory");
    } catch {
      console.error(`scan target missing: ${d}`);
      process.exit(2);
    }
  }
  const findings = scan(dirs, { supabaseOrigin: expectedOrigin() });
  for (const f of findings) console.log(`${f.kind}: ${f.file}`);
  if (findings.length > 0) {
    console.log("SECRET OR LEAK IN BUNDLE; stop");
    process.exit(1);
  }
  console.log("clean");
}
