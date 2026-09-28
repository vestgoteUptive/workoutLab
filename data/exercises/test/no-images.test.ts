import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadLibrary } from "../src/index.js";
import { pkgRoot } from "./helpers.js";

const IMAGE_EXT = /\.(png|jpg|jpeg|gif|webp|svg)$/i;
const URL_RE = /^https?:\/\//;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".turbo") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

describe("AC9 no third-party images or links", () => {
  it("has no image files anywhere in data/exercises", () => {
    const files = walk(pkgRoot);
    for (const f of files) expect(f, f).not.toMatch(IMAGE_EXT);
  });

  it("no string value other than source_url matches a URL", () => {
    for (const e of loadLibrary()) {
      const rest = { ...(e as unknown as Record<string, unknown>) };
      delete rest.source_url;
      const walkValue = (v: unknown): void => {
        if (typeof v === "string") expect(v, e.id).not.toMatch(URL_RE);
        else if (Array.isArray(v)) v.forEach(walkValue);
        else if (v && typeof v === "object") Object.values(v).forEach(walkValue);
      };
      walkValue(rest);
    }
  });
});
