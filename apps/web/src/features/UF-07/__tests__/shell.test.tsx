// T-0308a UF-07.1: AC-A15 (exports, the heading on the first render in every state) and the
// mount through the real route with no injected props, counting loader calls (render-loop guard).
import { Suspense, lazy } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { Shell } from "../../../app/App.js";
import { en } from "../../../lib/i18n/en.js";
import { R, seed } from "./harness.js";
import { offline } from "./spies.js";

// A supabase mock with no `from` at all: the screen must still render its heading.
vi.mock("../../../lib/auth/client.js", () => ({ supabase: {} }));
vi.mock("../../../lib/offline/index.js", async (importActual) =>
  (await import("./spies.js")).mockedOffline(importActual),
);
vi.mock("../../../lib/auth/auth-context.js", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: "signed-in" as const, redirectTarget: "/welcome", signOut: vi.fn() }),
}));

const LazyEditor = lazy(() => import("../index.js").then((m) => ({ default: m.RoutineEditor })));

function mountLazy(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/plan/routines/new" element={<LazyEditor />} />
          <Route path="/plan/routines/:routineId" element={<LazyEditor />} />
        </Routes>
      </Suspense>
    </MemoryRouter>,
  );
}

describe("AC-A15 exports", () => {
  it("index.tsx exports exactly RoutineEditor", async () => {
    expect(Object.keys(await import("../index.js"))).toEqual(["RoutineEditor"]);
  });
});

describe("AC-A15 the heading is there on the first render", () => {
  beforeEach(async () => {
    await seed();
  });

  it.each(["/plan/routines/new", "/plan/routines/X"])(
    "%s has the host and <h1> before any IndexedDB read settles",
    async (path) => {
      offline.gate = new Promise(() => {});
      mountLazy(path);
      const heading = await screen.findByRole("heading", { level: 1 });
      expect(heading).toHaveTextContent("Edit routine");
      expect(heading).toHaveTextContent(en.screens.routineEditor);
      const host = document.querySelector('[data-screen-id="UF-07.1"]');
      expect(host).toContainElement(heading);
      expect(document.querySelectorAll("[data-screen-id]")).toHaveLength(1);
    },
  );

  it("renders with no user id in the session (no cache, nothing to read)", async () => {
    window.localStorage.clear();
    mountLazy("/plan/routines/X");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Edit routine");
  });
});

describe("mount through the real route", () => {
  beforeEach(() => seed());

  it("/plan/routines/:id renders the routine and reads each cache once (no render loop)", async () => {
    render(
      <MemoryRouter initialEntries={[`/plan/routines/${R}`]}>
        <Shell />
      </MemoryRouter>,
    );
    expect(await screen.findByText("1. Barbell back squat")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Lower A");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(offline.loadRoutinesCalls).toBe(1);
    expect(offline.loadLibraryCalls).toBe(1);
    expect(offline.refreshRoutines).not.toHaveBeenCalled();
  });

  it("/plan/routines/new renders an empty editor through the shell", async () => {
    render(
      <MemoryRouter initialEntries={["/plan/routines/new"]}>
        <Shell />
      </MemoryRouter>,
    );
    expect(await screen.findByLabelText("Name")).toHaveValue("");
    await waitFor(() => expect(offline.loadLibraryCalls).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(offline.loadLibraryCalls).toBe(1);
    expect(offline.loadRoutinesCalls).toBe(0);
  });
});
