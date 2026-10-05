#!/usr/bin/env node
// T-0405: read-only cost guard (D-0012, D-0186 §6). GET only. Prints metric rows,
// never a response body or a token. Exit 0 ok, 2 alert (>= 80 %), 3 API error.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const QUOTAS_PATH = path.join(here, "../costs/quotas.json");
export const DOC_PATH = path.join(here, "../../docs/infra-costs.md");
export const PROJECT_REF = "csgjsdwuxqtuqpuazzpz";
export const THRESHOLD = 80;

/** usage: metric -> number | {error: httpStatus}. Returns {rows, alerts}. */
export function evaluate(usage, quotas) {
  const rows = [];
  const alerts = [];
  const metrics = quotas.metrics ?? quotas;
  const names = [...Object.keys(metrics), ...Object.keys(usage).filter((k) => !(k in metrics))];
  for (const name of names) {
    const q = metrics[name] ?? { quota: null };
    const u = usage[name];
    const where = q.where ?? "provider dashboard";
    if (q.manual || u === undefined || typeof u === "object") {
      const why = u && typeof u === "object" ? ` (HTTP ${u.error})` : "";
      rows.push(`${name} check by hand: ${where}${why}`);
    } else if (q.quota == null) {
      rows.push(`${name} ${u} (no quota)`);
    } else {
      const pct = Math.floor((u / q.quota) * 100);
      rows.push(`${name} ${u}/${q.quota} ${pct}%`);
      if ((u / q.quota) * 100 >= THRESHOLD) alerts.push(`${name} ${u}/${q.quota} ${pct}%`);
    }
  }
  return { rows, alerts };
}

const monthStart = (now) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

export async function run({ fetchImpl = fetch, env = process.env, stdout = (s) => process.stdout.write(s + "\n"), now = new Date(), quotas, doc } = {}) {
  quotas ??= JSON.parse(readFileSync(QUOTAS_PATH, "utf8"));
  doc ??= readFileSync(DOC_PATH, "utf8");
  for (const k of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_ORG_ID"]) {
    if (!env[k]) {
      stdout(`error: ${k} is not set`);
      return 3;
    }
  }
  // GET only; returns {status, json} and never throws.
  const get = async (url, token) => {
    try {
      const res = await fetchImpl(url, { method: "GET", headers: { Authorization: `Bearer ${token}` } });
      if (res.status !== 200) return { status: res.status };
      return { status: 200, json: await res.json() };
    } catch {
      return { status: 0 };
    }
  };
  const sb = (p) => get(`https://api.supabase.com/v1/${p}`, env.SUPABASE_ACCESS_TOKEN);

  const org = await sb(`organizations/${env.SUPABASE_ORG_ID}`);
  const proj = await sb(`projects/${PROJECT_REF}`);
  for (const [what, r] of [["org plan", org], ["project status", proj]]) {
    if (r.status !== 200) {
      stdout(`error: supabase ${what} HTTP ${r.status}`);
      return 3;
    }
  }
  const plan = String(org.json.plan);
  const status = String(proj.json.status);
  const lines = [`supabase_plan ${plan}`, `supabase_project_status ${status}`];
  const alerts = [];
  if (status !== "ACTIVE_HEALTHY") alerts.push(`status ${status}`);
  if (plan !== "free" && /build phase/i.test(doc)) alerts.push(`plan is ${plan}, the doc says Free`);

  const usage = {};
  const req = await sb(`projects/${PROJECT_REF}/analytics/endpoints/usage.api-requests-count`);
  if (req.status === 200) {
    const n = Number(req.json?.result?.[0]?.count);
    usage.supabase_api_requests = Number.isFinite(n) ? n : { error: 200 };
  } else usage.supabase_api_requests = { error: req.status };

  if (env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID) {
    const base = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects`;
    const cf = (p) => get(base + p, env.CLOUDFLARE_API_TOKEN);
    const list = await cf("");
    if (list.status !== 200) {
      usage.cloudflare_pages_builds_month = { error: list.status };
    } else {
      const names = (list.json.result ?? []).map((p) => p.name);
      lines.push(`cloudflare_pages_projects ${names.length}`);
      const since = monthStart(now);
      let total = 0;
      let failed = null;
      for (const n of names) {
        let count = 0;
        for (let page = 1; page <= 20; page++) {
          const d = await cf(`/${encodeURIComponent(n)}/deployments?per_page=25&page=${page}`);
          if (d.status !== 200) {
            failed = d.status;
            break;
          }
          const items = d.json.result ?? [];
          const inMonth = items.filter((x) => new Date(x.created_on) >= since);
          count += inMonth.length;
          if (items.length < 25 || inMonth.length < items.length) break;
        }
        lines.push(`cloudflare_deployments_month ${n} ${count}`);
        total += count;
      }
      usage.cloudflare_pages_builds_month = failed ? { error: failed } : total;
    }
  } else usage.cloudflare_pages_builds_month = { error: 0 };

  const ev = evaluate(usage, quotas);
  for (const l of [...lines, ...ev.rows]) stdout(l);
  alerts.push(...ev.alerts);
  if (alerts.length) {
    stdout(`ALERT: ${alerts.join("; ")}`);
    return 2;
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await run();
}
