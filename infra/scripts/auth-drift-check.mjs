#!/usr/bin/env node
// T-0500: read-only drift check of the prod Supabase auth config (D-0185 §3).
// One GET. The raw response (it holds secrets) is filtered inside filterAuth()
// before anything is logged; error bodies are never printed.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SPEC_PATH = path.join(here, "../auth/expected-auth.json");

// Derived values: name -> (raw, env) => boolean. Add entries here (e.g. smtp_pass_set).
export const DERIVED = {
  external_google_client_id_matches: (raw, env) =>
    typeof env.GOOGLE_OAUTH_CLIENT_ID === "string" &&
    env.GOOGLE_OAUTH_CLIENT_ID !== "" &&
    raw.external_google_client_id === env.GOOGLE_OAUTH_CLIENT_ID,
};

const ABSENT = "<absent>";

export function filterAuth(raw, spec, env) {
  const out = {};
  for (const k of spec.keys) if (k in raw) out[k] = raw[k];
  for (const d of spec.derived ?? []) {
    const fn = DERIVED[d];
    if (!fn) throw new Error(`no derived rule for ${d}`);
    out[d] = fn(raw, env);
  }
  return out;
}

const split = (s) => String(s).split(",").map((x) => x.trim()).filter(Boolean);
const show = (v) => (v === undefined ? ABSENT : typeof v === "string" ? v : JSON.stringify(v));

export function diff(filtered, spec) {
  const lines = [];
  const unordered = new Set(spec.unordered_lists ?? []);
  for (const [k, exp] of Object.entries(spec.expected)) {
    const live = filtered[k];
    if (unordered.has(k) && typeof live === "string") {
      const e = new Set(split(exp));
      const l = new Set(split(live));
      const missing = [...e].filter((x) => !l.has(x));
      const extra = [...l].filter((x) => !e.has(x));
      if (missing.length) lines.push(`${k}: missing [${missing.join(", ")}]`);
      if (extra.length) lines.push(`${k}: extra [${extra.join(", ")}]`);
    } else if (live !== exp) {
      lines.push(`${k}: expected ${show(exp)}, live ${show(live)}`);
    }
  }
  return lines;
}

const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

export async function run({ fetchImpl = fetch, env = process.env, argv = [], stdout = (s) => process.stdout.write(s + "\n"), spec } = {}) {
  spec ??= JSON.parse(readFileSync(SPEC_PATH, "utf8"));
  if (!env.SUPABASE_ACCESS_TOKEN) {
    stdout("error: SUPABASE_ACCESS_TOKEN is not set");
    return 2;
  }
  let res;
  try {
    res = await fetchImpl(`https://api.supabase.com/v1/projects/${spec.project_ref}/config/auth`, {
      method: "GET",
      headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
    });
  } catch {
    stdout("error: request failed");
    return 2;
  }
  if (res.status !== 200) {
    stdout(`error: HTTP ${res.status}`);
    return 2;
  }
  const filtered = filterAuth(await res.json(), spec, env);
  if (argv.includes("--print")) {
    stdout(JSON.stringify(sortKeys(filtered), null, 2));
    return 0;
  }
  const lines = diff(filtered, spec);
  if (lines.length === 0) {
    stdout(`auth config matches expected (${Object.keys(spec.expected).length} keys)`);
    return 0;
  }
  for (const l of lines) stdout(l);
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await run({ argv: process.argv.slice(2) });
}
