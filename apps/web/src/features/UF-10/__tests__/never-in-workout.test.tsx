// T-0307a AC-A12 — principle 1: UF-10 Balance is never reachable during a workout.
//
// The AC has two halves BY DESIGN, and both are required:
//
//   lint   — `never-in-workout.lint.test.ts` (a `node`-environment file, because ESLint's
//            Node API needs it; this file is jsdom, hence the split).
//
//   render — no `a[href^="/balance"]` exists anywhere in the DOM on `/session/<id>` or on
//            `/session/<id>/summary`. This is the half lint cannot give: a hard-coded
//            `<a href="/balance">Balance</a>` in a UF-09 file imports nothing at all, so
//            `no-restricted-imports` sees a clean file and the user still gets a way out of
//            focus mode mid-workout.
//
// The `fatal` filter in `restricted()` guards the negative cases: without it, a parse error
// would make "reports nothing" pass vacuously (the D-0060 §8 pattern).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Shell } from "../../../app/App.js";
import { LIBRARY, defaultTargets } from "./fixtures.js";
import { freshDb, seedCache, signIn, signOut } from "./test-helpers.js";

vi.mock("../../../lib/auth/auth-context.js", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: "signed-in" as const, redirectTarget: "/welcome", signOut: vi.fn() }),
}));

// Every route is a lazy chunk (routes.ts). The first render in this file would otherwise pay the
// cold dynamic import of the UF-09 flow inside waitFor's 1 s budget, which under CPU load is not
// enough (T-0910). Await the chunks themselves so the render only waits on rendering.
// T-0629: the list must cover EVERY chunk a rendered route loads. UF-03 (the summary route) and
// the signed-in AutoSync chunk were missing, so `/session/S1/summary` still paid a cold import
// inside waitFor's 1 s budget (reproduced 8/8 with the CPU saturated).
beforeAll(async () => {
  await Promise.all([
    import("../../UF-09/index.js"),
    import("../../UF-10/index.js"),
    import("../../UF-01/index.js"),
    import("../../UF-03/index.js"),
    import("../../../lib/offline/AutoSync.js"),
  ]);
}, 60_000);

const SESSION_ROUTES = ["/session/S1", "/session/S1/summary"] as const;

async function renderShellAt(path: string) {
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

describe("AC-A12 render: no /balance link exists on a session route", () => {
  it.each(SESSION_ROUTES)("%s has no a[href^='/balance']", async (path) => {
    await renderShellAt(path);
    const links = Array.from(document.querySelectorAll('a[href^="/balance"]'));
    expect(links.map((l) => l.getAttribute("href"))).toEqual([]);
  });

  it.each(SESSION_ROUTES)(
    "%s has no C-01 body map either (its compact variant links to /balance)",
    async (path) => {
      await renderShellAt(path);
      expect(document.querySelector('[data-component="C-01"]')).toBeNull();
      expect(document.querySelector('[data-screen-id="UF-10.1"]')).toBeNull();
      expect(document.querySelector('[data-screen-id="UF-10.2"]')).toBeNull();
    },
  );

  it.each(SESSION_ROUTES)(
    "%s has no tab bar, so C-02 cannot lead out of the workout",
    async (path) => {
      // The tab bar's Progress tab treats `/balance*` as its own (TabBar.tsx), so a tab bar on a
      // session route would be a second route out of focus mode.
      await renderShellAt(path);
      expect(document.querySelector("nav")).toBeNull();
    },
  );

  it("CONTRAST: the very same query DOES find /balance links on /balance itself", async () => {
    // Without a positive case, "no link found" could just mean the selector never matches
    // anything, or that the shell failed to render at all. The real `/balance` route with a
    // seeded cache renders nine row links, all `/balance/<area>`.
    const db = freshDb();
    signIn();
    await seedCache(db, { library: LIBRARY, targets: defaultTargets() });
    await renderShellAt("/balance");
    await waitFor(() => {
      expect(document.querySelectorAll('a[href^="/balance"]').length).toBeGreaterThan(0);
    });
    const hrefs = Array.from(document.querySelectorAll('a[href^="/balance"]')).map((l) =>
      l.getAttribute("href"),
    );
    expect(hrefs).toHaveLength(9);
    expect(hrefs).toContain("/balance/hamstrings");
    expect(document.querySelector('[data-screen-id="UF-10.1"]')).toBeInTheDocument();
    signOut();
  });

  it("CONTRAST: the selector matches a bare hard-coded href, which is the case lint cannot see", async () => {
    // The whole reason AC-A12 has a render half: `<a href="/balance">` in a UF-09 file imports
    // nothing, so `no-restricted-imports` sees a clean file. This proves the query used in the
    // negative assertions above would catch exactly that shape.
    await renderShellAt("/session/S1");
    const host = document.querySelector('[data-screen-id="UF-09"]')!;
    const planted = document.createElement("a");
    planted.setAttribute("href", "/balance");
    host.append(planted);
    expect(document.querySelectorAll('a[href^="/balance"]')).toHaveLength(1);
    planted.remove();
    expect(document.querySelectorAll('a[href^="/balance"]')).toHaveLength(0);
  });
});
