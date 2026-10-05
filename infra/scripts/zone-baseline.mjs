#!/usr/bin/env node
// T-0501: read-only Cloudflare zone baseline (D-0184 §3, D-0186 §5).
// Prints only `count=<n> sha256=<hex>` over every record outside the squad's subtree.
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const OWNED_ROOT = "workout.vestgote.com";

export function isOwned(name) {
  const n = String(name).toLowerCase();
  return n === OWNED_ROOT || n.endsWith("." + OWNED_ROOT);
}

export function toLine(r) {
  return [r.id, r.type, r.name, r.content, r.proxied ? "true" : "false", r.ttl, r.priority ?? "", r.modified_on].join("\t");
}

export function baselineOf(records) {
  const lines = records.filter((r) => !isOwned(r.name)).map(toLine).sort();
  return { count: lines.length, sha256: createHash("sha256").update(lines.map((l) => l + "\n").join(""), "utf8").digest("hex") };
}

export class ApiError extends Error {}

export async function fetchAll(fetchImpl, { zone, token }) {
  const all = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    const res = await fetchImpl(`https://api.cloudflare.com/client/v4/zones/${zone}/dns_records?per_page=100&page=${page}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    let body;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    if (res.status !== 200 || !body || body.success === false) {
      const codes = (body?.errors ?? []).map((e) => e.code).join(",");
      throw new ApiError(`HTTP ${res.status}${codes ? ` codes ${codes}` : ""}`);
    }
    all.push(...body.result);
    totalPages = body.result_info?.total_pages ?? 1;
  }
  return all;
}

export async function run({ fetchImpl = fetch, env = process.env, argv = [], stdout = (s) => process.stdout.write(s + "\n"), stderr = (s) => process.stderr.write(s + "\n") } = {}) {
  for (const v of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ZONE_ID"]) {
    if (!env[v]) {
      stderr(`error: ${v} is not set`);
      return 2;
    }
  }
  let records;
  try {
    records = await fetchAll(fetchImpl, { zone: env.CLOUDFLARE_ZONE_ID, token: env.CLOUDFLARE_API_TOKEN });
  } catch (e) {
    stderr(`error: ${e instanceof ApiError ? e.message : "request failed"}`);
    return 2;
  }
  const { count, sha256 } = baselineOf(records);
  const i = argv.indexOf("--expect");
  if (i >= 0) {
    const m = argv.slice(i + 1).join(" ").trim().match(/^count=(\d+) sha256=([0-9a-f]{64})$/);
    if (!m) {
      stderr("error: --expect needs `count=<n> sha256=<hex>`");
      return 2;
    }
    if (Number(m[1]) !== count || m[2] !== sha256) {
      stdout(`zone baseline changed: count ${m[1]} -> ${count}, sha256 differs`);
      return 1;
    }
    return 0;
  }
  stdout(`count=${count} sha256=${sha256}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await run({ argv: process.argv.slice(2) });
}
