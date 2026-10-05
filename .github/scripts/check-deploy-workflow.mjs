// T-0402a: static checks for .github/workflows/deploy.yml (D-0184 §5, D-0186 §1).
// No YAML dependency (check-all AC23: .github/scripts import only node: built-ins), so a small
// parser for the subset our workflows use: block maps, block lists, flow lists, | scalars.
// Exports check(dir) -> string[] of problems. CLI: node check-deploy-workflow.mjs [workflowsDir]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultDir = path.resolve(here, "..", "workflows");

// Built by concatenation so this file doesn't contain the ref itself.
const PROD_REF = ["csgjsdwuxqtuqpu", "azzpz"].join("");
const BANNED = [
  ["prod project ref", new RegExp(PROD_REF)],
  ["service_role", /service_role/],
  ["supabase link", /supabase\s+link\b/],
  ["db push", /supabase\s+db\s+push\b/],
  ["functions deploy", /supabase\s+functions\s+deploy\b/],
];


function scalar(v) {
  v = v.trim();
  if (v.startsWith("[") && v.endsWith("]"))
    return v.slice(1, -1).split(",").map((x) => scalar(x)).filter((x) => x !== "");
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

export function parse(text) {
  const lines = [];
  for (const raw of text.split("\n")) {
    if (/^\s*(#.*)?$/.test(raw)) {
      lines.push({ blank: true, raw });
      continue;
    }
    lines.push({ indent: raw.match(/^ */)[0].length, text: raw.trim(), raw });
  }
  let i = 0;
  const skip = () => {
    while (i < lines.length && lines[i].blank && /^\s*#/.test(lines[i].raw)) i++;
    while (i < lines.length && lines[i].blank) i++;
  };
  function block(indent) {
    skip();
    if (i >= lines.length || lines[i].indent < indent) return null;
    return lines[i].text.startsWith("- ") ? list(lines[i].indent) : map(lines[i].indent);
  }
  function entry(obj, text, indent) {
    const m = text.match(/^("[^"]*"|[^\s:][^:]*?):(?:\s+(.*))?$/);
    if (!m) throw new Error("cannot parse line: " + text);
    const key = m[1].replace(/^"|"$/g, "");
    const val = (m[2] ?? "").replace(/\s+#.*$/, "");
    if (val === "|" || val === ">") {
      const body = [];
      let bi = null;
      while (i < lines.length && (lines[i].blank || lines[i].indent > indent)) {
        if (!lines[i].blank) bi ??= lines[i].indent;
        body.push(lines[i].blank ? "" : lines[i].raw.slice(bi));
        i++;
      }
      obj[key] = body.join("\n").replace(/\n+$/, "") + "\n";
    } else if (val === "") {
      const child = block(indent + 1);
      obj[key] = child ?? null;
    } else obj[key] = scalar(val);
  }
  function map(indent) {
    const obj = {};
    for (;;) {
      skip();
      if (i >= lines.length || lines[i].indent !== indent || lines[i].text.startsWith("- ")) return obj;
      const { text } = lines[i++];
      entry(obj, text, indent);
    }
  }
  function list(indent) {
    const out = [];
    for (;;) {
      skip();
      if (i >= lines.length || lines[i].indent !== indent || !lines[i].text.startsWith("- ")) return out;
      const first = lines[i].text.slice(2);
      // Treat "- key: v" as a map whose later keys sit at indent + 2.
      if (/^[^\s:][^:]*:(\s|$)/.test(first)) {
        lines[i] = { indent: indent + 2, text: first, raw: " ".repeat(indent + 2) + first };
        out.push(map(indent + 2));
      } else {
        i++;
        out.push(scalar(first));
      }
    }
  }
  return block(0);
}

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const deploys = (job) =>
  (job.steps ?? []).filter((s) => /pages\s+deploy/.test(s.run ?? "")).flatMap((s) =>
    (s.run ?? "").split("\n").filter((l) => /pages\s+deploy/.test(l)).map((l) => ({ line: l, step: s })),
  );

export function check(dir = defaultDir) {
  const errs = [];
  const raw = readFileSync(path.join(dir, "deploy.yml"), "utf8");
  const wf = parse(raw);
  const jobs = wf.jobs ?? {};
  const on = wf.on ?? wf.true ?? {};
  const pv = jobs.preview;
  const pr = jobs.production;

  // AC-1
  if (!pv) errs.push("AC-1: no preview job");
  else {
    if (!on.push || !(on.push["branches-ignore"] ?? []).includes("main"))
      errs.push("AC-1: on.push must have branches-ignore containing main");
    const cond = norm(pv.if);
    if (!/github\.event_name == 'push'/.test(cond)) errs.push("AC-1: preview if must restrict to push");
    if (!cond.includes("vars.PREVIEWS_ENABLED == 'true'")) errs.push("AC-1: preview if lacks PREVIEWS_ENABLED");
    if (!cond.includes("refs/heads/main")) errs.push("AC-1: preview if lacks refs/heads/main exclusion");
    const ds = deploys(pv);
    const hasWeb = ds.some((d) => /apps\/web\/dist/.test(d.line) && /--project-name\s+workoutlab-web\b/.test(d.line));
    const hasLanding = ds.some(
      (d) => /apps\/landing\/dist/.test(d.line) && /--project-name\s+workoutlab-landing\b/.test(d.line),
    );
    if (!hasWeb) errs.push("AC-1: preview must deploy apps/web/dist to workoutlab-web");
    if (!hasLanding) errs.push("AC-1: preview must deploy apps/landing/dist to workoutlab-landing");
    for (const d of ds) {
      const m = d.line.match(/--branch\s+("[^"]*"|\S+)/);
      if (!m) errs.push(`AC-1: pages deploy without --branch: ${d.line.trim()}`);
      else {
        const v = m[1].replace(/^"|"$/g, "");
        if (v === "main") errs.push("AC-1: preview --branch must not be the literal main");
        const env = /^\$\{?(\w+)\}?$/.exec(v);
        if (env && norm(d.step.env?.[env[1]]) === "main") errs.push("AC-1: preview branch env must not be main");
      }
    }
  }

  // AC-2
  if (!pr) errs.push("AC-2: no production job");
  else {
    const wr = on.workflow_run;
    const triggers = Object.keys(on);
    if (!wr || !(wr.workflows ?? []).includes("CI") || !(wr.branches ?? []).includes("main"))
      errs.push("AC-2: workflow_run must be of CI on main");
    if (!(wr?.types ?? []).includes("completed")) errs.push("AC-2: workflow_run types must include completed");
    if (triggers.some((t) => !["push", "workflow_run"].includes(t)))
      errs.push("AC-2: unexpected triggers " + triggers.join(","));
    if (norm(pr.if).indexOf("github.event.workflow_run.conclusion == 'success'") < 0)
      errs.push("AC-2: production if lacks conclusion == 'success'");
    if (norm(pr.if).indexOf("vars.PROD_DEPLOY_ENABLED == 'true'") < 0)
      errs.push("AC-2: production if lacks PROD_DEPLOY_ENABLED");
    if (/--branch\s+(?!main\b)/.test(deploys(pr).map((d) => d.line).join("\n")))
      errs.push("AC-2: production must deploy with --branch main");
  }

  // AC-3
  const secrets = [...raw.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  for (const s of secrets) if (s !== "CLOUDFLARE_PAGES_TOKEN") errs.push(`AC-3: unexpected secret ${s}`);
  if (!secrets.includes("CLOUDFLARE_PAGES_TOKEN")) errs.push("AC-3: secrets.CLOUDFLARE_PAGES_TOKEN not used");
  for (const v of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"])
    if (!raw.includes(`${v}: \${{ vars.${v} }}`)) errs.push(`AC-3: ${v} must come from vars.${v}`);
  for (const [name, re] of BANNED) if (re.test(raw)) errs.push(`AC-3: banned pattern ${name}`);
  const pins = [...raw.matchAll(/wrangler@(\S+?)(?=\s|$)/g)].map((m) => m[1]);
  const envPin = wf.env?.WRANGLER_VERSION;
  for (const p of pins) {
    const v = p === "${WRANGLER_VERSION}" ? envPin : p;
    if (!/^\d+\.\d+\.\d+$/.test(String(v ?? ""))) errs.push(`AC-3: wrangler version not exact: ${p}`);
  }
  if (!pins.length) errs.push("AC-3: wrangler not invoked with a pinned version");
  if (JSON.stringify(wf.permissions) !== JSON.stringify({ contents: "read" }))
    errs.push("AC-3: permissions must be exactly contents: read");
  // Token env only on deploy steps.
  for (const job of Object.values(jobs))
    for (const s of job.steps ?? [])
      if (s.env?.CLOUDFLARE_API_TOKEN && !/pages\s+deploy/.test(s.run ?? ""))
        errs.push("AC-3: CLOUDFLARE_API_TOKEN set on a non-deploy step");

  // AC-4
  const ci = parse(readFileSync(path.join(dir, "ci.yml"), "utf8"));
  if (ci.name !== "CI") errs.push("AC-4: ci.yml name must stay CI");
  if (ci.jobs?.deploy) errs.push("AC-4: ci.yml still has a deploy job");
  for (const j of ["checks", "supabase", "e2e"]) if (!ci.jobs?.[j]) errs.push(`AC-4: ci.yml lost job ${j}`);
  return errs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errs = check(process.argv[2] ? path.resolve(process.argv[2]) : defaultDir);
  if (errs.length) {
    console.error(errs.join("\n"));
    process.exit(1);
  }
  console.log("deploy workflow checks passed");
}
