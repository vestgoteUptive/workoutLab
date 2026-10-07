#!/usr/bin/env node
// T-0515: read-only CORS probe of the prod Edge Functions (go-live review F-6, D-0190 §4).
// Sends OPTIONS (no auth header, no body) for each function x origin and records whether
// access-control-allow-origin echoes the origin. Expected: only the app host is echoed.
// A wildcard "*" counts as reflecting every origin. Exit 1 plus a table on any other result.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SPEC_PATH = path.join(here, "../auth/expected-auth.json");
export const FUNCTIONS = ["workouts", "balance", "sessions", "account"];
export const APP_ORIGIN = "https://app.workout.vestgote.com";
export const ORIGINS = [
  APP_ORIGIN,
  "http://localhost:5173",
  "http://localhost:3000",
  "https://probe.workoutlab-web.pages.dev",
  "https://evil.example",
];

export async function run({
  fetchImpl = fetch,
  stdout = (s) => process.stdout.write(s + "\n"),
  spec,
} = {}) {
  spec ??= JSON.parse(readFileSync(SPEC_PATH, "utf8"));
  const rows = [];
  let bad = false;
  for (const fn of FUNCTIONS) {
    for (const origin of ORIGINS) {
      let reflected = false;
      let note = "";
      try {
        const res = await fetchImpl(`https://${spec.project_ref}.supabase.co/functions/v1/${fn}`, {
          method: "OPTIONS",
          headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
        });
        const acao = res.headers.get("access-control-allow-origin");
        reflected = acao === origin || acao === "*";
        if (acao === "*") note = " (wildcard)";
      } catch {
        note = " (request failed)";
        bad = true;
      }
      const want = origin === APP_ORIGIN;
      if (reflected !== want) bad = true;
      rows.push(`${fn} ${origin} ${reflected ? "reflected" : "not-reflected"}${note}`);
    }
  }
  if (bad) {
    for (const r of rows) stdout(r);
    stdout("cors-probe: FAIL (only " + APP_ORIGIN + " may be reflected)");
    return 1;
  }
  stdout(`cors-probe: ok (${rows.length} OPTIONS requests; only ${APP_ORIGIN} reflected)`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await run();
}
