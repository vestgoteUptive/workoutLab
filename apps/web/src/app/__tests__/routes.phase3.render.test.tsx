// T-0318 AC-2 (stubs render), AC-3 (route ranking) and AC-4 (C-02 active tab by prefix).
// Auth is mocked the same way as `App.test.tsx` (AC-A6/A7): the guards themselves are
// AC-5's job, in `auth-guard.phase3.test.tsx`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Shell } from "../App.js";
import { en } from "../../lib/i18n/en.js";

vi.mock("../../lib/auth/auth-context.js", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: "signed-in" as const, redirectTarget: "/welcome", signOut: vi.fn() }),
}));

/** The one exercise `/progress/back-squat` needs; its `name` is UF-06.2's `<h1>`. */
const BACK_SQUAT = {
  id: "back-squat",
  name: "Back squat",
  kind: "exercise",
  type: "compound",
  level: "beginner",
  equipment: [],
  areas: { quads: 1 },
  timed: false,
  defaultDurationS: null,
  incrementKg: 2.5,
  externalLoad: true,
};

// UF-06.2 redirects an unknown exercise id to `/progress` (D-0079 §4), so with the empty cache
// a stub never touched it would render UF-06.1 and the row below would assert the wrong screen.
// Seeding keeps the row testing the route (D-0088 §2). Only the UF-06 loaders are overridden.
vi.mock("../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/offline/index.js")>();
  return {
    ...actual,
    loadSessions: vi.fn(async () => []),
    loadEngineHistory: vi.fn(async () => []),
    loadLibrary: vi.fn(async () => [BACK_SQUAT]),
    loadTargets: vi.fn(async () => []),
    refreshAll: vi.fn(async () => undefined),
  };
});

// T-0408 (D-0096): local budgets on waits for lazy route chunks (the --concurrency=1 gate).
const LAZY_WAIT_MS = 5_000;
const LAZY_TEST_MS = 15_000;

async function renderAt(path: string) {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Shell />
    </MemoryRouter>,
  );
  await waitFor(
    () => {
      expect(document.querySelector("[data-screen-id]")).toBeInTheDocument();
    },
    { timeout: LAZY_WAIT_MS },
  );
  return view;
}

/** The Scope table: path → [screen id, tab bar, `<h1>` text]. A screen still on its T-0318
 *  stub reads `en.screens.*`; a built screen whose heading is its own data reads that data
 *  (UF-06.2's `<h1>` is the exercise name, D-0088 §2). */
const NEW_SCREENS: ReadonlyArray<readonly [string, string, boolean, string]> = [
  ["/session/S1/summary", "UF-03.3", false, en.screens.sessionSummary],
  ["/library/back-squat/compare/leg-press", "UF-04.3", true, en.screens.libraryCompare],
  ["/progress/back-squat", "UF-06.2", true, BACK_SQUAT.name],
  ["/plan/edit", "UF-11.3", false, en.screens.editPlan],
  ["/plan/routines/new", "UF-07.1", false, en.screens.routineEditor],
  ["/plan/routines/R1", "UF-07.1", false, en.screens.routineEditor],
];

describe("AC-2 the new stubs render", () => {
  it.each(NEW_SCREENS)(
    "%s renders exactly one %s with an <h1>",
    async (path, screenId, _showTabBar, title) => {
      await renderAt(path);
      const hosts = document.querySelectorAll("[data-screen-id]");
      expect(hosts).toHaveLength(1);
      expect(hosts[0]!.getAttribute("data-screen-id")).toBe(screenId);
      const heading = within(hosts[0] as HTMLElement).getByRole("heading", { level: 1 });
      expect(heading).toHaveTextContent(title);
    },
    LAZY_TEST_MS,
  );

  it.each(NEW_SCREENS)(
    "%s shows the tab bar only when the table says so",
    async (path, _id, showTabBar) => {
      await renderAt(path);
      const nav = screen.queryByRole("navigation", { name: en.tabBar.nav });
      if (showTabBar) expect(nav).toBeInTheDocument();
      else expect(nav).not.toBeInTheDocument();
    },
    LAZY_TEST_MS,
  );

  // Guards against a stub whose <h1> happens to read right but hard-codes the string
  // instead of reading `en.screens` (NFR-I18N-1). `jsx-no-literals` also catches a bare
  // literal, but not, say, a second catalogue or a constant in the feature folder.
  it.each([
    ["UF-03", "Summary", "sessionSummary"],
    ["UF-04", "Compare", "libraryCompare"],
    ["UF-07", "RoutineEditor", "routineEditor"],
    ["UF-11", "EditPlan", "editPlan"],
  ])("features/%s %s reads its title from en.screens.%s", (flow, exportName, key) => {
    const source = readFileSync(resolve(__dirname, `../../features/${flow}/index.tsx`), "utf8");
    const fn = source.slice(source.indexOf(`export function ${exportName}(`));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain(`<h1>{en.screens.${key}}</h1>`);
  });

  // UF-06.2 is built, so its heading is the exercise's own name rather than a catalogue
  // entry, and its component lives in its own module instead of `index.tsx` (D-0088 §2:
  // point the scan at the built heading). The NFR-I18N-1 guarantee is unchanged and still
  // the point: the <h1> must be an expression, never a hard-coded or duplicated string.
  it("features/UF-06 ExerciseHistory renders the exercise name as its <h1>", () => {
    const source = readFileSync(
      resolve(__dirname, "../../features/UF-06/ExerciseHistory.tsx"),
      "utf8",
    );
    expect(source).toContain('<h1 className="wl-progress__title">{history.exercise.name}</h1>');
    // No literal or second catalogue standing in for the heading.
    expect(source).not.toMatch(/<h1[^>]*>[^{<]/);
    expect(source).not.toContain("en.screens.exerciseHistory");
    // `index.tsx` only re-exports, so nothing there can shadow the heading above.
    const index = readFileSync(resolve(__dirname, "../../features/UF-06/index.tsx"), "utf8");
    expect(index).not.toContain("<h1");
  });
});

describe("AC-3 route ranking", () => {
  it.each([
    ["/session/setup", "UF-08.1"],
    ["/session/S1", "UF-09"],
    ["/session/S1/summary", "UF-03.3"],
    ["/library/back-squat", "UF-04.2"],
    ["/progress", "UF-06.1"],
    ["/plan", "UF-11.2"],
  ])(
    "%s renders %s",
    async (path, expected) => {
      await renderAt(path);
      expect(document.querySelector("[data-screen-id]")!.getAttribute("data-screen-id")).toBe(
        expected,
      );
    },
    LAZY_TEST_MS,
  );

  it(
    "/session/setup never renders the summary or the UF-09 host",
    async () => {
      await renderAt("/session/setup");
      expect(document.querySelector('[data-screen-id="UF-03.3"]')).not.toBeInTheDocument();
      expect(document.querySelector('[data-screen-id="UF-09"]')).not.toBeInTheDocument();
    },
    LAZY_TEST_MS,
  );
});

describe("AC-4 C-02 active tab follows the path prefix", () => {
  async function currentTabs(path: string): Promise<string[]> {
    await renderAt(path);
    const nav = await screen.findByRole(
      "navigation",
      { name: en.tabBar.nav },
      { timeout: LAZY_WAIT_MS },
    );
    return within(nav)
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page")
      .map((l) => l.textContent!);
  }

  it.each([
    ["/", [en.tabBar.today]],
    ["/library", [en.tabBar.library]],
    ["/library/back-squat", [en.tabBar.library]],
    ["/library/back-squat/compare/leg-press", [en.tabBar.library]],
    ["/progress", [en.tabBar.progress]],
    ["/progress/back-squat", [en.tabBar.progress]],
    ["/balance", [en.tabBar.progress]],
    ["/balance/core", [en.tabBar.progress]],
    ["/plan", [en.tabBar.plan]],
  ])(
    "%s marks exactly %s current",
    async (path, expected) => {
      expect(await currentTabs(path)).toEqual(expected);
    },
    LAZY_TEST_MS,
  );
});
