// @vitest-environment node
// T-0902 AC1: a fresh clone can find out which env vars the web app needs, and where they come
// from, without reading source. AC5: the build-time guard in vite.config.ts stays, so a *build*
// still fails loudly (the CSP connect-src derives from the URL) while only dev degrades.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(webRoot, "../..");
const envExample = readFileSync(resolve(webRoot, ".env.example"), "utf8");

describe("apps/web/.env.example (T-0902 AC1)", () => {
  it("declares both variables the browser bundle needs", () => {
    expect(envExample).toMatch(/^VITE_SUPABASE_URL=\s*$/m);
    expect(envExample).toMatch(/^VITE_SUPABASE_ANON_KEY=\s*$/m);
  });

  it("says where the values come from and where the file goes", () => {
    expect(envExample).toContain("apps/web/.env.local");
    expect(envExample).toMatch(/Project Settings > API/);
    expect(envExample).toMatch(/supabase status -o env/);
  });

  it("contains no values, only names and placeholders", () => {
    for (const line of envExample.split("\n")) {
      if (!line.startsWith("VITE_")) continue;
      const [, value] = line.split("=", 2);
      expect(value?.trim()).toBe("");
    }
    // Nothing JWT- or key-shaped anywhere in the file.
    expect(envExample).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(envExample).not.toMatch(/\bsb_(secret|publishable)_/);
  });

  it("is tracked, unlike .env.local which .gitignore excludes", () => {
    const gitignore = readFileSync(resolve(repoRoot, ".gitignore"), "utf8");
    expect(gitignore).toMatch(/^\.env\.local$/m);
    expect(envExample).not.toMatch(/^\.env\.example$/m);
  });

  it("the README documents both variable names too", () => {
    const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");
    expect(readme).toContain("VITE_SUPABASE_URL");
    expect(readme).toContain("VITE_SUPABASE_ANON_KEY");
    expect(readme).toContain("apps/web/.env.local");
  });
});

describe("vite.config.ts build guard (T-0902 AC5)", () => {
  const config = readFileSync(resolve(webRoot, "vite.config.ts"), "utf8");

  it("still throws for a build when either variable is missing", () => {
    expect(config).toContain('command === "build" && !supabaseUrl');
    expect(config).toContain('command === "build" && !process.env.VITE_SUPABASE_ANON_KEY');
  });

  it("still derives the CSP connect-src from the Supabase origin", () => {
    expect(config).toContain("new URL(supabaseUrl).origin");
  });

  it("does not guard dev: only `build` is gated", () => {
    const guards = config.match(/command === "build"/g) ?? [];
    expect(guards.length).toBe(2);
    expect(config).not.toContain('command === "serve" && !supabaseUrl');
  });
});
