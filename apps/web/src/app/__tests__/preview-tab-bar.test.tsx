// T-0666 UF-02.2: `/?view=preview` has no tab bar (Start sits at the viewport bottom); Back to `/`
// brings it back. The shell decides, from the route and the `view` query.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router";
import { Shell } from "../App.js";

vi.mock("../../lib/auth/auth-context.js", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    status: "signed-in" as const,
    userId: "u1",
    redirectTarget: "/welcome",
    signOut: vi.fn(),
  }),
}));
vi.mock("../../lib/profile/ProfileGate.js", () => ({
  ProfileGate: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../../features/UF-02/index.js", () => ({
  Today: () => (
    <div data-screen-id="UF-02.x">
      <Link to="/?view=preview">See all</Link>
      <Link to="/">Back</Link>
    </div>
  ),
}));

const bar = () => screen.queryByRole("navigation");

describe("T-0666 the tab bar on the preview view", () => {
  it("is not rendered on /?view=preview and is on /", async () => {
    render(
      <MemoryRouter initialEntries={["/?view=preview"]}>
        <Shell />
      </MemoryRouter>,
    );
    await screen.findByRole("link", { name: "Back" });
    expect(bar()).toBeNull();
    expect(screen.getByRole("main")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await waitFor(() => expect(bar()).not.toBeNull());
  });

  it("the pair: /?view=other keeps it, and opening the preview from / removes it", async () => {
    render(
      <MemoryRouter initialEntries={["/?view=other"]}>
        <Shell />
      </MemoryRouter>,
    );
    await screen.findByRole("link", { name: "See all" });
    expect(bar()).not.toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "See all" }));
    await waitFor(() => expect(bar()).toBeNull());
  });
});
