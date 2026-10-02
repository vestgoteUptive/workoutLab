// T-0310c AC11 (import boundaries, principle 5) and AC12 (strings, D-0136 §6).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/en.js";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Specifiers of every static `import … from "x"` / `export … from "x"` / `import "x"`. */
export function staticSpecifiers(source: string): string[] {
  const out: string[] = [];
  const re = /^\s*(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/gm;
  for (const m of source.matchAll(re)) out.push(m[1]!);
  return out;
}

describe("T-0310c AC11 import boundaries", () => {
  it("T-0310c AC11 the scanner sees a static import of lib/account (guards the scan itself)", () => {
    expect(staticSpecifiers('import { x } from "../lib/account/index.js";')).toEqual([
      "../lib/account/index.js",
    ]);
    expect(staticSpecifiers('import {\n  a,\n  b,\n} from "../../lib/account/delete.js";')).toEqual(
      ["../../lib/account/delete.js"],
    );
  });

  it("T-0310c AC11 no static import of lib/account in app/**, components/** or lib/auth/**", () => {
    const files = ["app", "components", "lib/auth"].flatMap((d) => walk(join(SRC, d)));
    expect(files.length).toBeGreaterThan(10);
    // `lib/account/…` from anywhere, or `../account/…` from inside `lib/auth`.
    const LIB_ACCOUNT = /(^|\/)lib\/account(\/|$)|^\.\.\/account(\/|$)/;
    expect(LIB_ACCOUNT.test("../../lib/account/index.js")).toBe(true);
    expect(LIB_ACCOUNT.test("../account/wipe.js")).toBe(true);
    expect(LIB_ACCOUNT.test("../components/account-deleted-notice/AccountDeletedNotice.js")).toBe(
      false,
    );
    const offenders = files.filter((f) =>
      staticSpecifiers(readFileSync(f, "utf8")).some((s) => LIB_ACCOUNT.test(s)),
    );
    expect(offenders).toEqual([]);
  });

  it("T-0310c AC11 AccountDeletedNotice imports only react, auth-context and the catalogue", () => {
    const source = readFileSync(
      join(SRC, "components/account-deleted-notice/AccountDeletedNotice.tsx"),
      "utf8",
    );
    expect(staticSpecifiers(source).sort()).toEqual(
      ["../../lib/auth/auth-context.js", "../../lib/i18n/en.js", "react"].sort(),
    );
    expect(source).not.toMatch(/import\(/);
  });

  it("T-0310c AC11 lib/account/index.ts has exactly the 7 runtime exports", async () => {
    const mod = await import("../index.js");
    expect(Object.keys(mod).sort()).toEqual(
      [
        "ACCOUNT_DELETED_KEY",
        "deleteAccountAndSignOut",
        "downloadAccountExport",
        "exportAccountData",
        "exportFileName",
        "requestAccountDeletion",
        "wipeLocalUserData",
      ].sort(),
    );
    expect(mod.ACCOUNT_DELETED_KEY).toBe("wl-account-deleted");
  });

  it("T-0310c AC11 the notice's key literal matches ACCOUNT_DELETED_KEY", async () => {
    const { ACCOUNT_DELETED_KEY } = await import("../index.js");
    const source = readFileSync(
      join(SRC, "components/account-deleted-notice/AccountDeletedNotice.tsx"),
      "utf8",
    );
    expect(source).toContain(`const KEY = "${ACCOUNT_DELETED_KEY}";`);
  });
});

describe("T-0310c AC12 strings", () => {
  it("T-0310c AC12 en.screens.accountSettings and en.accountDeleted (D-0136 §6 copy)", () => {
    expect(en.screens.accountSettings).toBe("Account settings");
    expect(Object.keys(en.accountDeleted).sort()).toEqual(["dismiss", "done", "partial"]);
    expect(en.accountDeleted.done).toBe("Your account and all your data are deleted.");
    expect(en.accountDeleted.partial).toBe(
      "Your account is deleted. Some data may still be on this device: clear this site's data in your browser settings.",
    );
    expect(en.accountDeleted.dismiss).toBe("Dismiss");
  });
});
