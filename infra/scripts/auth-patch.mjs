#!/usr/bin/env node
// T-0402c: keys-only change to the prod Supabase auth config (D-0185 §4). Human-run for --apply.
//   node infra/scripts/auth-patch.mjs --add-to-list uri_allow_list=<entry>          # preview (GET)
//   CONFIRM_PROD_AUTH=<ref> node infra/scripts/auth-patch.mjs --add-to-list ... --apply
// Changes:  --add-to-list <key>=<entry>   append to a comma list, live order kept
//           --set <key>=<value>           value coerced to the live value's type
//           --set-from-env <key>=<ENV>    value read from env var ENV; never printed
//           --set-from-file <key>=<path>  value is the file's contents, verbatim (T-0404b templates)
// Keys matching SECRET_KEY must use --set-from-env, and their values show only as <set>/<unset>.
// Long values (*_content, the mail templates) show as len=<n> sha256=<hex>. Keys the Management
// API types as strings while they read back as null (STRING_KEYS, e.g. smtp_port) stay strings.
// The after-check compares a secret key by set-ness only, as the preview shows it.
// The preview prints the changed keys' before/after and others_sha256 (a hash of the live config
// with the changed keys removed). --apply sends one PATCH holding only the changed keys, GETs
// again, and fails (exit 1) when others_sha256 moved or the after-view differs from the plan.
// Error bodies are never printed. Reused by T-0404b and T-0402d.
// T-0509: with --apply, a filtered snapshot of the WHOLE live config is written before the PATCH
// (infra/auth/.snapshots/<ref>-<UTC yyyymmddThhmmssZ>-before.json, mode 0600, gitignored) and
// another after the final read-back (-after.json). Filter = the preview's: secret-looking keys
// become <set>/<unset>, *_content keys len=<n> sha256=<hex>, the rest verbatim. If the before
// file can't be written the script prints "cannot write snapshot; nothing sent" and sends no
// PATCH. Preview mode writes nothing. The config API is eventually consistent, so after a 2xx
// PATCH the read-back is retried (up to 5 GETs, 1 s, 2 s, 4 s, 8 s apart) until every changed key
// matches the reviewed after-view; others_sha256 is judged on that read.
import { createHash } from "node:crypto";
import { readFileSync as fsReadFileSync, writeFileSync as fsWriteFileSync, mkdirSync as fsMkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SPEC_PATH = path.join(here, "../auth/expected-auth.json");
export const SNAPSHOT_DIR = path.join(here, "../auth/.snapshots");
export const READBACK_TRIES = 5;
export const SECRET_KEY = /secret|pass|key|token/i;
export const LONG_KEY = /_content$/;
// UpdateAuthConfigBody types these as strings (api.supabase.com/api/v1-json); live reads null
// before the first set, so the coercion can't learn the type from the live value.
export const STRING_KEYS = new Set(["smtp_port"]);
const API = "https://api.supabase.com/v1/projects";

export class UsageError extends Error {}

export function parseArgs(argv) {
  const changes = [];
  let apply = false;
  const pair = (flag, s) => {
    const i = typeof s === "string" ? s.indexOf("=") : -1;
    if (i <= 0) throw new UsageError(`${flag} needs <key>=<value>`);
    return [s.slice(0, i), s.slice(i + 1)];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") apply = true;
    else if (a === "--add-to-list" || a === "--set" || a === "--set-from-env" || a === "--set-from-file") {
      const [key, value] = pair(a, argv[++i]);
      if (a === "--add-to-list") {
        if (!value || value.includes(",")) throw new UsageError(`${a} ${key}: one non-empty entry, no commas`);
        changes.push({ kind: "add", key, entry: value });
      } else if (a === "--set") {
        if (SECRET_KEY.test(key)) throw new UsageError(`--set ${key}: secret keys need --set-from-env ${key}=<ENV>`);
        changes.push({ kind: "set", key, raw: value });
      } else if (a === "--set-from-file") {
        if (SECRET_KEY.test(key)) throw new UsageError(`--set-from-file ${key}: secret keys need --set-from-env ${key}=<ENV>`);
        if (!value) throw new UsageError(`--set-from-file ${key}: needs a path`);
        changes.push({ kind: "file", key, path: value });
      } else {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new UsageError(`--set-from-env ${key}: bad env var name`);
        changes.push({ kind: "env", key, env: value });
      }
    } else throw new UsageError(`unknown argument ${a}`);
  }
  if (changes.length === 0) throw new UsageError("no change given");
  const keys = changes.map((c) => c.key);
  if (new Set(keys).size !== keys.length) throw new UsageError("a key appears twice");
  return { changes, apply };
}

const split = (s) => String(s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

function coerce(raw, live, key) {
  if (STRING_KEYS.has(key)) return raw;
  if (typeof live === "boolean" || (live == null && (raw === "true" || raw === "false"))) {
    if (raw !== "true" && raw !== "false") throw new UsageError(`--set ${key}: expected true or false`);
    return raw === "true";
  }
  if (typeof live === "number" || (live == null && /^-?\d+$/.test(raw))) {
    const n = Number(raw);
    if (!Number.isFinite(n) || raw.trim() === "") throw new UsageError(`--set ${key}: expected a number`);
    return n;
  }
  return raw;
}

/** The PATCH body: only the changed keys, built from the live config. */
export function buildPatch(live, changes, env) {
  const body = {};
  for (const c of changes) {
    if (c.kind === "add") {
      const cur = live[c.key];
      if (cur != null && typeof cur !== "string") throw new UsageError(`${c.key}: live value is not a list`);
      const items = split(cur);
      if (!items.includes(c.entry)) body[c.key] = [...items, c.entry].join(",");
    } else if (c.kind === "set") {
      const v = coerce(c.raw, live[c.key], c.key);
      if (live[c.key] !== v) body[c.key] = v;
    } else if (c.kind === "file") {
      if (typeof c.value !== "string") throw new UsageError(`--set-from-file ${c.key}: file not read`);
      if (live[c.key] !== c.value) body[c.key] = c.value;
    } else {
      const v = env[c.env];
      if (typeof v !== "string" || v === "") throw new UsageError(`--set-from-env ${c.key}: ${c.env} is not set`);
      if (live[c.key] !== v) body[c.key] = v;
    }
  }
  return body;
}

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** sha256 of the config with `keys` removed. Only the hash ever leaves this function. */
export function othersHash(raw, keys) {
  const rest = { ...raw };
  for (const k of keys) delete rest[k];
  return createHash("sha256").update(canonical(rest)).digest("hex");
}

const isSet = (v) => !(v == null || v === "");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

export function showValue(key, v) {
  if (SECRET_KEY.test(key)) return isSet(v) ? "<set>" : "<unset>";
  if (v === undefined) return "<absent>";
  if (LONG_KEY.test(key) && typeof v === "string") return `len=${v.length} sha256=${sha256(v)}`;
  return typeof v === "string" ? v : JSON.stringify(v);
}

/** The whole config, filtered like the preview: no secret or template body survives. */
export function snapshotOf(cfg) {
  const out = {};
  for (const [k, v] of Object.entries(cfg)) {
    out[k] = SECRET_KEY.test(k) || (LONG_KEY.test(k) && typeof v === "string") ? showValue(k, v) : v;
  }
  return out;
}

const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

function view(cfg, keys) {
  return keys.map((k) => `  ${k} = ${showValue(k, cfg[k])}`);
}

export async function run({
  argv = [],
  env = process.env,
  fetchImpl = fetch,
  readFile = (p) => fsReadFileSync(p, "utf8"),
  cwd = process.cwd(),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  writeFile = (p, data, opts) => fsWriteFileSync(p, data, opts),
  mkdir = (p, opts) => fsMkdirSync(p, opts),
  now = () => new Date(),
  stdout = (s) => process.stdout.write(s + "\n"),
  stderr = (s) => process.stderr.write(s + "\n"),
  spec,
} = {}) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    stderr(`usage error: ${e.message}`);
    return 2;
  }
  for (const c of parsed.changes) {
    if (c.kind !== "file") continue;
    try {
      c.value = readFile(path.resolve(cwd, c.path));
    } catch {
      stderr(`usage error: --set-from-file ${c.key}: cannot read ${c.path}`);
      return 2;
    }
  }
  spec ??= JSON.parse(fsReadFileSync(SPEC_PATH, "utf8"));
  const ref = spec.project_ref;
  // The apply lock comes before any call, so a refusal makes zero requests.
  if (parsed.apply && env.CONFIRM_PROD_AUTH !== ref) {
    stderr(`refusing to apply: set CONFIRM_PROD_AUTH=${ref}`);
    return 1;
  }
  if (!env.SUPABASE_ACCESS_TOKEN) {
    stderr("error: SUPABASE_ACCESS_TOKEN is not set");
    return 2;
  }
  const url = `${API}/${ref}/config/auth`;
  const headers = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` };
  const get = async () => {
    let res;
    try {
      res = await fetchImpl(url, { method: "GET", headers });
    } catch {
      throw new Error("GET failed");
    }
    if (res.status !== 200) throw new Error(`GET HTTP ${res.status}`);
    return res.json();
  };

  let before;
  let body;
  try {
    before = await get();
    body = buildPatch(before, parsed.changes, env);
  } catch (e) {
    stderr(e instanceof UsageError ? `usage error: ${e.message}` : `error: ${e.message}`);
    return 2;
  }
  const keys = parsed.changes.map((c) => c.key);
  const changed = Object.keys(body);
  const planned = { ...before, ...body };
  const othersBefore = othersHash(before, keys);

  stdout(`project ${ref}`);
  stdout("before:");
  for (const l of view(before, keys)) stdout(l);
  stdout("after:");
  for (const l of view(planned, keys)) stdout(l);
  stdout(`others_sha256=${othersBefore}`);

  if (changed.length === 0) {
    stdout("no change: the live config already holds every requested value");
    return 0;
  }
  if (!parsed.apply) {
    stdout(`dry run: nothing sent. To apply: CONFIRM_PROD_AUTH=${ref} and --apply (changes ${changed.join(", ")})`);
    return 0;
  }

  const when = stamp(now());
  const snap = (kind, cfg) => {
    const file = path.join(SNAPSHOT_DIR, `${ref}-${when}-${kind}.json`);
    mkdir(SNAPSHOT_DIR, { recursive: true });
    writeFile(file, JSON.stringify(snapshotOf(cfg), null, 2) + "\n", { mode: 0o600 });
    return file;
  };
  try {
    stdout(`snapshot: ${snap("before", before)}`);
  } catch {
    stderr("error: cannot write snapshot; nothing sent");
    return 1;
  }

  let res;
  try {
    res = await fetchImpl(url, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    stderr("error: PATCH failed; run auth-drift-check.mjs before retrying");
    return 1;
  }
  if (res.status < 200 || res.status >= 300) {
    stderr(`error: PATCH HTTP ${res.status}; run auth-drift-check.mjs before retrying`);
    return 1;
  }

  const matches = (cfg, k) => (SECRET_KEY.test(k) ? isSet(cfg[k]) === isSet(planned[k]) : canonical(cfg[k]) === canonical(planned[k]));
  let after;
  let lastError;
  let tries = 0;
  let settled = false;
  while (tries < READBACK_TRIES && !settled) {
    if (tries > 0) await sleep(1000 * 2 ** (tries - 1));
    tries++;
    try {
      after = await get();
      lastError = undefined;
      settled = keys.every((k) => matches(after, k));
    } catch (e) {
      lastError = e;
    }
  }
  if (lastError || !after) {
    stderr(`error: ${(lastError ?? new Error("GET failed")).message} after PATCH; run auth-drift-check.mjs`);
    return 1;
  }
  try {
    stdout(`snapshot: ${snap("after", after)}`);
  } catch {
    stderr("warning: cannot write the after-snapshot");
  }
  if (settled) stdout(`read-back settled after ${tries} tries`);
  const othersAfter = othersHash(after, keys);
  stdout("applied; live after:");
  for (const l of view(after, keys)) stdout(l);
  stdout(`others_sha256=${othersAfter}`);

  let ok = true;
  for (const k of keys) {
    if (!matches(after, k)) {
      stderr(`mismatch: ${k} live differs from the reviewed after-view`);
      ok = false;
    }
  }
  if (othersAfter !== othersBefore) {
    const moved = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((k) => !keys.includes(k) && canonical(before[k]) !== canonical(after[k]))
      .sort();
    stderr(`others_sha256 changed (keys: ${moved.join(", ")}); run auth-drift-check.mjs, record it, do not revert`);
    ok = false;
  }
  return ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await run({ argv: process.argv.slice(2) });
}
