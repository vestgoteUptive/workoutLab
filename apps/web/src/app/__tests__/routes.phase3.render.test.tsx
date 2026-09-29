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

async function renderAt(path: string) {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Shell />
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(document.querySelector("[data-screen-id]")).toBeInTheDocument();
  });
  return view;
}

/** The Scope table: path → [screen id, tab bar, stub title]. */
const NEW_SCREENS: ReadonlyArray<readonly [string, string, boolean, string]> = [
  ["/session/S1/summary", "UF-03.3", false, en.screens.sessionSummary],
  ["/library/back-squat/compare/leg-press", "UF-04.3", true, en.screens.libraryCompare],
  ["/progress/back-squat", "UF-06.2", true, en.screens.exerciseHistory],
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
  );

  it.each(NEW_SCREENS)(
    "%s shows the tab bar only when the table says so",
    async (path, _id, showTabBar) => {
      await renderAt(path);
      const nav = screen.queryByRole("navigation", { name: en.tabBar.nav });
      if (showTabBar) expect(nav).toBeInTheDocument();
      else expect(nav).not.toBeInTheDocument();
    },
  );

  // Guards against a stub whose <h1> happens to read right but hard-codes the string
  // instead of reading `en.screens` (NFR-I18N-1). `jsx-no-literals` also catches a bare
  // literal, but not, say, a second catalogue or a constant in the feature folder.
  it.each([
    ["UF-03", "Summary", "sessionSummary"],
    ["UF-04", "Compare", "libraryCompare"],
    ["UF-06", "ExerciseHistory", "exerciseHistory"],
    ["UF-07", "RoutineEditor", "routineEditor"],
    ["UF-11", "EditPlan", "editPlan"],
  ])("features/%s %s reads its title from en.screens.%s", (flow, exportName, key) => {
    const source = readFileSync(resolve(__dirname, `../../features/${flow}/index.tsx`), "utf8");
    const fn = source.slice(source.indexOf(`export function ${exportName}(`));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain(`<h1>{en.screens.${key}}</h1>`);
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
  ])("%s renders %s", async (path, expected) => {
    await renderAt(path);
    expect(document.querySelector("[data-screen-id]")!.getAttribute("data-screen-id")).toBe(
      expected,
    );
  });

  it("/session/setup never renders the summary or the UF-09 host", async () => {
    await renderAt("/session/setup");
    expect(document.querySelector('[data-screen-id="UF-03.3"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-screen-id="UF-09"]')).not.toBeInTheDocument();
  });
});

describe("AC-4 C-02 active tab follows the path prefix", () => {
  async function currentTabs(path: string): Promise<string[]> {
    await renderAt(path);
    const nav = await screen.findByRole("navigation", { name: en.tabBar.nav });
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
  ])("%s marks exactly %s current", async (path, expected) => {
    expect(await currentTabs(path)).toEqual(expected);
  });
});
