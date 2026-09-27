#!/usr/bin/env node
// Generates every agent and flow from one source:
//   agents/roles/*.md  →  .claude/agents/<role>.md          (Claude Code sub-agents)
//                      →  .agentlab/agents/wl-<role>[-<mode>].json (AgentLab local agents)
//   agents/flows.json  →  .agentlab/flows/<flow>.json        (AgentLab flow files)
// Then installs them into AgentLab: agents are copied into its local-agents folder and flow files are
// registered in its editor-config.json. Only local stores are touched; nothing goes to MongoDB.
//
// Usage: node scripts/sync-agents.mjs [--no-install]
// Env:   AGENTLAB_LOCAL_AGENTS_DIR, AGENTLAB_EDITOR_CONFIG  (override the auto-detected install targets)

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rolesDir = path.join(repo, "agents", "roles");
const out = {
  claude: path.join(repo, ".claude", "agents"),
  agents: path.join(repo, ".agentlab", "agents"),
  flows: path.join(repo, ".agentlab", "flows"),
};
const PREFIX = "wl-";

/** Minimal frontmatter parser: `key: value` and `key: [a, b]` lines only. */
function parseRole(file) {
  const text = readFileSync(file, "utf8");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`${file}: missing frontmatter`);
  const meta = {};
  for (const line of match[1].split("\n")) {
    const kv = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    const [, key, raw] = kv;
    meta[key] = raw.startsWith("[") ? raw.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean) : raw;
  }
  for (const key of ["name", "title", "description", "model", "role"]) {
    if (!meta[key]) throw new Error(`${file}: frontmatter needs ${key}`);
  }
  return { ...meta, tools: meta.tools ?? [], body: match[2].trim() };
}

const common = readFileSync(path.join(rolesDir, "_common.md"), "utf8").trim();
const roles = new Map(
  readdirSync(rolesDir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .map((f) => parseRole(path.join(rolesDir, f)))
    .map((r) => [r.name, r]),
);

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["done", "blocked", "needs-triage", "failed"] },
    ticket: { type: "string" },
    summary: { type: "string" },
    filesChanged: { type: "array", items: { type: "string" } },
    testsRun: { type: "string" },
    decisions: { type: "array", items: { type: "string" } },
    followUps: {
      type: "array",
      items: { type: "object", properties: { title: { type: "string" }, lane: { type: "string" } }, required: ["title", "lane"] },
    },
    triage: { type: ["string", "null"] },
    notes: { type: "string" },
  },
  required: ["status", "summary"],
};

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    repoPath: { type: "string", description: "Absolute path of the workoutLab worktree to work in (also pass it as the run's folder)." },
    ticket: { type: "string", description: "Ticket id, e.g. T-0002. Its file is docs/tickets/T-NNNN-*.md." },
    task: { type: "string", description: "Extra instructions from the orchestrator: rework notes, an idea, apply: true, …" },
  },
  required: ["repoPath"],
};

function resetDir(dir, keep = () => false) {
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (!keep(f)) rmSync(path.join(dir, f), { recursive: true, force: true });
}

// 1. Claude Code sub-agents
resetDir(out.claude);
for (const r of roles.values()) {
  const fm = [`name: ${r.name}`, `description: ${r.description}`, `model: ${r.model}`, `tools: ${r.tools.join(", ")}`];
  writeFileSync(path.join(out.claude, `${r.name}.md`), `---\n${fm.join("\n")}\n---\n<!-- Generated from agents/roles/${r.name}.md by scripts/sync-agents.mjs. Edit the source, not this file. -->\n\n${r.body}\n\n${common}\n`);
}

// 2. AgentLab agents (one per role, plus one per role#mode used by a flow)
const flowSource = JSON.parse(readFileSync(path.join(repo, "agents", "flows.json"), "utf8"));
const agentId = (ref) => PREFIX + ref.replace("#", "-");

function agentlabAgent(ref) {
  const [roleName, mode] = ref.split("#");
  const r = roles.get(roleName);
  if (!r) throw new Error(`flows.json references unknown role "${roleName}"`);
  const modeText = mode ? flowSource.modes?.[ref] : undefined;
  if (mode && !modeText) throw new Error(`flows.json: no text for mode "${ref}"`);
  return {
    id: agentId(ref),
    name: `WL ${r.title}${mode ? ` (${mode})` : ""}`,
    description: r.description,
    role: r.role,
    status: "active",
    systemInstructions: [r.body, modeText, common].filter(Boolean).join("\n\n"),
    model: r.model,
    modelSettings: { effort: r.effort ?? "medium", maxTurns: 200 },
    tools: r.tools.map((t) => ({ id: t, name: t, kind: "builtin" })),
    inputSchema: INPUT_SCHEMA,
    outputSchema: RESULT_SCHEMA,
    limits: { maxCostUsd: Number(r.maxCostUsd ?? 2) },
  };
}

// 3. Flows
function expandFlow(f) {
  if (f.template !== "build") return f;
  const id = f.id ?? `${PREFIX}build-${f.lane}`;
  return {
    id,
    name: f.name ?? `WL · Build (${f.lane})`,
    description: f.description ?? `${f.agent} implements the ticket, QA and code review verify in parallel, product owner accepts.`,
    tags: ["workoutlab", "build", f.lane],
    nodes: [
      { id: "build", agent: f.agent, dependsOn: [] },
      { id: "qa", agent: "qa-tester", dependsOn: ["build"] },
      { id: "review", agent: "code-reviewer", dependsOn: ["build"] },
      { id: "accept", agent: "product-owner#accept", dependsOn: ["build", "qa", "review"] },
    ],
  };
}

const flows = flowSource.flows.map(expandFlow).map((f, i) => ({
  id: f.id,
  name: f.name,
  description: f.description,
  tags: f.tags,
  nodes: f.nodes.map((n, j) => ({
    id: n.id,
    agentId: agentId(n.agent),
    label: n.id,
    dependsOn: n.dependsOn,
    inputMapping: Object.fromEntries([
      ["repoPath", "$input.repoPath"],
      ["ticket", "$input.ticket"],
      ["task", "$input.task"],
      ...n.dependsOn.map((d) => [d, d]),
    ]),
    position: { x: 80 + 260 * depth(f.nodes, n), y: 80 + 140 * j },
  })),
}));

function depth(nodes, node) {
  if (!node.dependsOn.length) return 0;
  return 1 + Math.max(...node.dependsOn.map((d) => depth(nodes, nodes.find((n) => n.id === d))));
}

// Every role gets an agent; each role#mode used by a flow gets its own.
const refs = new Map([...roles.keys(), ...flowSource.flows.map(expandFlow).flatMap((f) => f.nodes.map((n) => n.agent))].map((ref) => [agentId(ref), ref]));
resetDir(out.agents);
for (const [id, ref] of refs) writeFileSync(path.join(out.agents, `${id}.json`), JSON.stringify(agentlabAgent(ref), null, 2) + "\n");
resetDir(out.flows);
for (const f of flows) writeFileSync(path.join(out.flows, `${f.id}.json`), JSON.stringify(f, null, 2) + "\n");

console.log(`generated ${roles.size} Claude Code agents, ${refs.size} AgentLab agents, ${flows.length} flows`);

// 4. Install into AgentLab (local stores only)
if (process.argv.includes("--no-install")) process.exit(0);

const appSupport = path.join(os.homedir(), "Library", "Application Support");
const agentlabRepo = process.env.AGENTLAB_REPO ?? path.resolve(repo, "..", "Uptive-AgentLab");
const agentDirs = process.env.AGENTLAB_LOCAL_AGENTS_DIR
  ? [process.env.AGENTLAB_LOCAL_AGENTS_DIR]
  : [path.join(agentlabRepo, "data", "local-agents"), path.join(appSupport, "AgentLab", "local-agents")].filter((d) => existsSync(path.dirname(d)));
const configs = process.env.AGENTLAB_EDITOR_CONFIG
  ? [process.env.AGENTLAB_EDITOR_CONFIG]
  : [path.join(appSupport, "@agentlab", "desktop", "editor-config.json"), path.join(appSupport, "AgentLab", "editor-config.json")].filter((c) => existsSync(path.dirname(c)));

for (const dir of agentDirs) {
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (f.startsWith(PREFIX) && f.endsWith(".json")) rmSync(path.join(dir, f));
  for (const f of readdirSync(out.agents)) copyFileSync(path.join(out.agents, f), path.join(dir, f));
  console.log(`installed agents → ${dir}`);
}

const flowPaths = readdirSync(out.flows).map((f) => path.join(out.flows, f));
for (const file of configs) {
  const config = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { version: 1, flows: [] };
  const others = (config.flows ?? []).filter((f) => !f.filePath.startsWith(out.flows + path.sep));
  config.flows = [...others, ...flowPaths.map((filePath) => ({ filePath }))];
  writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
  console.log(`registered ${flowPaths.length} flows → ${file}`);
}
if (configs.length) console.log("Restart AgentLab so it rereads its editor config and local agents (or press Refresh in Agents).");
