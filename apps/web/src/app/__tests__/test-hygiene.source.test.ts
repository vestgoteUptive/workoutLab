// @vitest-environment node
// T-0443 AC-1/AC-2: no file under apps/web/src resets the DOM by assigning to the body's innerHTML.
// That leaves the React root mounted on a detached node (T-0424). Use `cleanup()` or remove the
// nodes you appended. Same walk as `profile-gate.source.test.ts`. The regex's escaped dots mean
// this file doesn't match itself; reads such as `expect(document.body.innerHTML)` stay allowed.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__e2e__" || entry === "node_modules") continue;
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const RESET = /document\.body\.innerHTML\s*=(?!=)/;

describe("test hygiene (source)", () => {
  it("T-0443 AC-1 no file in apps/web/src assigns document.body.innerHTML", () => {
    const files = walk(SRC);
    expect(files.length).toBeGreaterThan(400);
    const offenders = files
      .filter((f) => RESET.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f))
      .sort();
    expect(offenders).toEqual([]);
  });
});
