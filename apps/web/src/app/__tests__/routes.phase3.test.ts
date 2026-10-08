// T-0318 AC-1: the 6 Phase 3 sub-routes are in the table with exactly the path, screen id,
// guard and tab-bar values from the ticket's Scope table (D-0071 §2), every pre-existing
// entry is untouched, and each new `load` is a dynamic import() of the feature's index.js.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { routes, type RouteConfig } from "../routes.js";

type Shape = Pick<RouteConfig, "path" | "screenId" | "showTabBar" | "guard">;

function shape(route: RouteConfig): Shape {
  const { path, screenId, showTabBar, guard } = route;
  return { path, screenId, showTabBar, guard };
}

// The ticket's Scope table, verbatim.
const NEW_ROUTES: readonly Shape[] = [
  {
    path: "/session/:sessionId/summary",
    screenId: "UF-03.3",
    showTabBar: false,
    guard: "session",
  },
  {
    path: "/library/:exerciseId/compare/:otherId",
    screenId: "UF-04.3",
    showTabBar: true,
    guard: "protected",
  },
  { path: "/progress/:exerciseId", screenId: "UF-06.2", showTabBar: true, guard: "protected" },
  { path: "/plan/edit", screenId: "UF-11.3", showTabBar: false, guard: "protected" },
  { path: "/plan/account", screenId: "UF-11.4", showTabBar: false, guard: "protected" },
  { path: "/plan/excluded", screenId: "UF-11.5", showTabBar: false, guard: "protected" },
  { path: "/plan/routines/new", screenId: "UF-07.1", showTabBar: false, guard: "protected" },
  {
    path: "/plan/routines/:routineId",
    screenId: "UF-07.1",
    showTabBar: false,
    guard: "protected",
  },
] as const;

/**
 * The route table as T-0300a/T-0300b left it (the pre-T-0318 tree). Pinned here rather than
 * with `toMatchSnapshot`, so a reviewer can see what "unchanged" means without a `.snap` file
 * and an accidental `-u` cannot rewrite it.
 */
const PRE_EXISTING_ROUTES: readonly Shape[] = [
  { path: "/welcome/*", screenId: "UF-01.1", showTabBar: false, guard: "guest-only" },
  { path: "/account", screenId: "UF-01.5", showTabBar: false, guard: "guest-only" },
  {
    path: "/auth/callback",
    screenId: "UF-01.5-auth-callback",
    showTabBar: false,
    guard: "public",
  },
  { path: "/", screenId: "UF-02.1", showTabBar: true, guard: "protected" },
  { path: "/library", screenId: "UF-04.1", showTabBar: true, guard: "protected" },
  { path: "/library/:exerciseId", screenId: "UF-04.2", showTabBar: true, guard: "protected" },
  { path: "/progress", screenId: "UF-06.1", showTabBar: true, guard: "protected" },
  { path: "/balance", screenId: "UF-10.1", showTabBar: true, guard: "protected" },
  { path: "/balance/:area", screenId: "UF-10.2", showTabBar: true, guard: "protected" },
  { path: "/plan", screenId: "UF-11.2", showTabBar: true, guard: "protected" },
  { path: "/session/setup", screenId: "UF-08.1", showTabBar: false, guard: "session" },
  { path: "/session/:sessionId", screenId: "UF-09", showTabBar: false, guard: "session" },
] as const;

describe("AC-1 route table", () => {
  it.each(NEW_ROUTES)("$path is registered as $screenId", (expected) => {
    const found = routes.filter((r) => r.path === expected.path);
    expect(found).toHaveLength(1);
    expect(shape(found[0]!)).toEqual(expected);
  });

  it("holds exactly the pre-existing entries plus the 7 new ones, and nothing else", () => {
    expect(routes.map(shape)).toEqual(
      expect.arrayContaining([...PRE_EXISTING_ROUTES, ...NEW_ROUTES]),
    );
    expect(routes).toHaveLength(PRE_EXISTING_ROUTES.length + NEW_ROUTES.length);
  });

  it("leaves every pre-existing entry unchanged", () => {
    for (const before of PRE_EXISTING_ROUTES) {
      const found = routes.filter((r) => r.path === before.path);
      expect(found, before.path).toHaveLength(1);
      expect(shape(found[0]!)).toEqual(before);
    }
  });

  it("does not add /session/:sessionId/list (dropped, D-0071 §2)", () => {
    expect(routes.some((r) => r.path.endsWith("/list"))).toBe(false);
  });

  it("ranks /plan/routines/new before /plan/routines/:routineId", () => {
    const paths = routes.map((r) => r.path);
    expect(paths.indexOf("/plan/routines/new")).toBeLessThan(
      paths.indexOf("/plan/routines/:routineId"),
    );
  });
});

// AC-1, the source test (the T-0300a AC-A6 pattern): every new entry must stay a lazy
// `import()` of the feature's `index.js`, or the chunk lands in the initial bundle.
describe("AC-1 each new load() is a dynamic import of the feature index", () => {
  const source = readFileSync(resolve(__dirname, "../routes.ts"), "utf8");

  const EXPECTED_LOADS: ReadonlyArray<readonly [string, string, string]> = [
    ["/session/:sessionId/summary", "UF-03", "Summary"],
    ["/library/:exerciseId/compare/:otherId", "UF-04", "Compare"],
    ["/progress/:exerciseId", "UF-06", "ExerciseHistory"],
    ["/plan/edit", "UF-11", "EditPlan"],
    ["/plan/account", "UF-11", "AccountSettings"],
    ["/plan/excluded", "UF-11", "ExcludedExercises"],
    ["/plan/routines/new", "UF-07", "RoutineEditor"],
    ["/plan/routines/:routineId", "UF-07", "RoutineEditor"],
  ];

  it.each(EXPECTED_LOADS)("%s lazily imports features/%s (%s)", (path, flow, exportName) => {
    const entry = source.slice(source.indexOf(`path: "${path}"`));
    const load = entry.slice(entry.indexOf("load:"), entry.indexOf("},"));
    expect(load).toContain(`import("../features/${flow}/index.js")`);
    expect(load).toContain(`default: m.${exportName}`);
  });

  it("uses no static import of a feature module", () => {
    expect(source).not.toMatch(/^import .*features\//m);
  });
});
