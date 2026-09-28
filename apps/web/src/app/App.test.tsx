import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Shell } from "./App.js";

// AC-A6/A7 are about the route table and the tab bar, not auth (that's AC-B5/B7, in
// auth-guard.test.tsx). This mock keeps every route reachable directly, using the same
// signed-out-only-under-/welcome-and-/account rule the real guard enforces, so the route
// table itself doesn't need a real Supabase session.
let mockStatus: "signed-in" | "signed-out" = "signed-in";
vi.mock("../lib/auth/auth-context.js", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    status: mockStatus,
    redirectTarget: "/welcome" as const,
    signOut: vi.fn(),
  }),
}));

function statusFor(path: string): "signed-in" | "signed-out" {
  return path.startsWith("/welcome") || path === "/account" || path.startsWith("/auth/")
    ? "signed-out"
    : "signed-in";
}

async function screenIdFor(path: string): Promise<string> {
  mockStatus = statusFor(path);
  render(
    <MemoryRouter initialEntries={[path]}>
      <Shell />
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(document.querySelector("[data-screen-id]")).toBeInTheDocument();
  });
  return document.querySelector("[data-screen-id]")!.getAttribute("data-screen-id")!;
}

// AC-A6: the route table maps each path to the right v2 screen id (D-0002, D-0045 §2).
describe("route table (AC-A6)", () => {
  it.each([
    ["/welcome", "UF-01.1"],
    ["/account", "UF-01.5"],
    ["/", "UF-02.1"],
    ["/library", "UF-04.1"],
    ["/library/back-squat", "UF-04.2"],
    ["/progress", "UF-06.1"],
    ["/balance", "UF-10.1"],
    ["/balance/hamstrings", "UF-10.2"],
    ["/plan", "UF-11.2"],
    ["/session/setup", "UF-08.1"],
    ["/session/0b9ecb1e-0000-0000-0000-000000000000", "UF-09"],
  ])("%s renders %s", async (path, expected) => {
    expect(await screenIdFor(path)).toBe(expected);
  });

  it("redirects an unknown path to /", async () => {
    expect(await screenIdFor("/nope")).toBe("UF-02.1");
  });

  it("redirects an unknown balance area to /balance", async () => {
    expect(await screenIdFor("/balance/neck")).toBe("UF-10.1");
  });
});

// AC-A7: C-02 (the tab bar) shows only on the 4 tabbed routes, in a fixed order, and hides
// on onboarding, account, auth callback and workout routes (principle 1).
describe("C-02 tab bar (AC-A7)", () => {
  it("shows exactly 4 links, in order, on /", async () => {
    mockStatus = "signed-in";
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Shell />
      </MemoryRouter>,
    );
    const nav = await screen.findByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Today", "Library", "Progress", "Plan"]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/",
      "/library",
      "/progress",
      "/plan",
    ]);
    expect(links[0]).toHaveAttribute("aria-current", "page");
  });

  it("marks Progress current on /balance/core", async () => {
    mockStatus = "signed-in";
    render(
      <MemoryRouter initialEntries={["/balance/core"]}>
        <Shell />
      </MemoryRouter>,
    );
    const nav = await screen.findByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link");
    expect(links[2]).toHaveAttribute("aria-current", "page");
  });

  it.each(["/welcome", "/account", "/auth/callback", "/session/setup"])(
    "hides the tab bar on %s",
    async (path) => {
      mockStatus = statusFor(path);
      render(
        <MemoryRouter initialEntries={[path]}>
          <Shell />
        </MemoryRouter>,
      );
      await waitFor(() => {
        expect(document.querySelector("[data-screen-id]")).toBeInTheDocument();
      });
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    },
  );

  it("hides the tab bar on /session/:id", async () => {
    mockStatus = "signed-in";
    render(
      <MemoryRouter initialEntries={["/session/abc"]}>
        <Shell />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(document.querySelector("[data-screen-id]")).toBeInTheDocument();
    });
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
