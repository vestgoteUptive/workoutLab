// T-0371 UF-10.1 / UF-10.2: `seedCache` must seed the cache shape production writes (D-0091 §1).
// The UF-10 loaders read by the `userId` index, so a seed with drifted keys would still pass
// them while any keyed `get` missed. These tests pin the seeded keys to the production builders.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setKey, userScopedKey, type OfflineDb } from "../../../lib/offline/db.js";
import { BACK_SQUAT, defaultTargets } from "./fixtures.js";
import { freshDb, seedCache } from "./test-helpers.js";

const HELPER = resolve(process.cwd(), "src/features/UF-10/__tests__/test-helpers.tsx");

/** Drops block and line comments, so a comment that quotes the old format can't fail AC-1. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("AC-1 test-helpers.tsx builds no cache key by hand", () => {
  const source = stripComments(readFileSync(HELPER, "utf8"));

  it('has no `${…}:${…}` template literal and no `+ ":" +` concatenation', () => {
    expect(source).not.toMatch(/\$\{[^}]*\}:\$\{[^}]*\}/);
    expect(source).not.toMatch(/\+\s*(["'`]):\1\s*\+/);
  });

  it("calls userScopedKey( and setKey(", () => {
    expect(source).toContain("userScopedKey(");
    expect(source).toContain("setKey(");
  });
});

describe("AC-2 seeded keys are the production keys", () => {
  let db: OfflineDb | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it("each keyed get finds the row seedCache wrote", async () => {
    db = freshDb();
    const chest = defaultTargets().find((t) => t.area === "chest")!;
    await seedCache(db, {
      userId: "u1",
      sets: [{ id: "S-1", exerciseId: "back-squat", completedAt: "2026-09-25T10:00:00+02:00" }],
      queuedSets: [
        { id: "Q-1", exerciseId: "back-squat", completedAt: "2026-09-26T10:00:00+02:00" },
      ],
      library: [BACK_SQUAT],
      targets: [chest],
    });

    const history = await db.historyCache.get(userScopedKey("u1", "S-1"));
    expect(history, "historyCache").toMatchObject({ userId: "u1", clientId: "S-1" });

    const queued = await db.sets.get(setKey("u1", "Q-1"));
    expect(queued, "sets").toMatchObject({ userId: "u1", clientId: "Q-1", status: "queued" });

    const library = await db.libraryCache.get(userScopedKey("u1", "back-squat"));
    expect(library, "libraryCache").toMatchObject({ userId: "u1", exercise: BACK_SQUAT });

    const target = await db.targetCache.get(userScopedKey("u1", "chest"));
    expect(target, "targetCache").toMatchObject({ userId: "u1", target: chest });
  });

  it("seedCache(db, {}) writes nothing to the four tables", async () => {
    db = freshDb();
    await seedCache(db, {});
    expect(await db.historyCache.count()).toBe(0);
    expect(await db.sets.count()).toBe(0);
    expect(await db.libraryCache.count()).toBe(0);
    expect(await db.targetCache.count()).toBe(0);
  });
});
