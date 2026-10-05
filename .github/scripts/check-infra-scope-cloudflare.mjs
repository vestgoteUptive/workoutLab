// T-0401: scope check for the Cloudflare Terraform config. Node built-ins only.
//   node check-infra-scope-cloudflare.mjs            static mode: parse the real .tf files
//   terraform show -json plan | node check-infra-scope-cloudflare.mjs --plan
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOWED_TYPES = ["cloudflare_pages_project", "cloudflare_pages_domain", "cloudflare_dns_record"];
export const ALLOWED_HOSTS = ["workout.vestgote.com", "app.workout.vestgote.com"];
const FORBIDDEN_PREFIXES = [
  "cloudflare_zone",
  "cloudflare_ruleset",
  "cloudflare_page_rule",
  "cloudflare_certificate_pack",
  "cloudflare_total_tls",
  "cloudflare_workers",
];
const SIX = ["app", "landing"].flatMap((m) => ALLOWED_TYPES.map((t) => `module.${m}.${t}.this`));

function tfFiles(dir) {
  const out = [];
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === ".terraform") continue;
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) out.push(...tfFiles(full));
    else if (e.endsWith(".tf")) out.push(full);
  }
  return out;
}

/** Returns a list of problem strings (empty = ok) for the given .tf directories. */
export function checkStatic(dirs) {
  const problems = [];
  for (const file of dirs.flatMap(tfFiles)) {
    const text = readFileSync(file, "utf8").replace(/#.*$/gm, "");
    for (const m of text.matchAll(/^\s*(resource|data)\s+"([^"]+)"/gm)) {
      const [, kind, type] = m;
      if (FORBIDDEN_PREFIXES.some((p) => type.startsWith(p)))
        problems.push(`${file}: forbidden ${kind} type ${type}`);
      else if (kind === "data" && type.startsWith("cloudflare_"))
        problems.push(`${file}: data source ${type} not allowed`);
      else if (kind === "resource" && !ALLOWED_TYPES.includes(type))
        problems.push(`${file}: resource type ${type} is not one of ${ALLOWED_TYPES.join(", ")}`);
    }
    for (const m of text.matchAll(/^\s*hostname\s*=\s*"([^"]*)"/gm)) {
      if (!ALLOWED_HOSTS.includes(m[1])) problems.push(`${file}: hostname "${m[1]}" is not an allowed hostname`);
    }
    for (const m of text.matchAll(/^\s*hostname\s*=\s*(?!")(\S.*)$/gm)) {
      if (!/^var\.hostname\b/.test(m[1])) problems.push(`${file}: hostname must be a string literal`);
    }
    for (const m of text.matchAll(/"([A-Za-z0-9_-]{37,})"/g)) {
      problems.push(`${file}: literal looks like a token (${m[1].length} chars)`);
    }
  }
  return problems;
}

/** Returns a list of problem strings for a `terraform show -json` plan. */
export function checkPlan(plan) {
  const problems = [];
  const changes = plan.resource_changes ?? [];
  for (const rc of changes) {
    const actions = rc.change?.actions ?? [];
    if (actions.length === 1 && actions[0] === "no-op" && !rc.change?.importing) continue;
    if (!SIX.includes(rc.address)) problems.push(`${rc.address}: not one of the six allowed addresses`);
    if (!ALLOWED_TYPES.includes(rc.type)) problems.push(`${rc.address}: type ${rc.type} not allowed`);
    if (actions.includes("delete")) problems.push(`${rc.address}: plan deletes (${actions.join(",")})`);
    else if (actions.includes("update")) problems.push(`${rc.address}: plan updates (${actions.join(",")})`);
    else if (!(actions.length === 1 && (actions[0] === "create" || actions[0] === "no-op")))
      problems.push(`${rc.address}: unexpected actions ${actions.join(",")}`);
    const after = rc.change?.after ?? {};
    if (rc.type === "cloudflare_dns_record" || rc.type === "cloudflare_pages_domain") {
      if (!ALLOWED_HOSTS.includes(after.name))
        problems.push(`${rc.address}: name "${after.name}" is not an allowed hostname`);
    }
  }
  return problems;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let problems;
  if (process.argv.includes("--plan")) {
    problems = checkPlan(JSON.parse(readFileSync(0, "utf8")));
  } else {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    problems = checkStatic([
      path.join(root, "infra/terraform/cloudflare"),
      path.join(root, "infra/terraform/modules/cloudflare_site"),
    ]);
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log("check-infra-scope-cloudflare: ok");
}
