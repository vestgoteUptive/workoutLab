// T-0459 (D-0164 §7): a per-route error boundary around each lazy route chunk.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

let mockStatus: "signed-in" | "signed-out" = "signed-in";
vi.mock("../../lib/auth/auth-context.js", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: mockStatus, redirectTarget: "/welcome" as const, signOut: vi.fn() }),
}));

type Load = () => Promise<{ default: React.ComponentType }>;
const overrides = new Map<string, Load>();
vi.mock("../routes.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../routes.js")>();
  return {
    ...actual,
    routes: actual.routes.map((r) => ({
      ...r,
      load: () => (overrides.get(r.path) ?? r.load)(),
    })),
  };
});

const staleChunk = () =>
  vi.fn<Load>(() => Promise.reject(new TypeError("Failed to fetch dynamically imported module")));

// Real route chunks are transformed on first import, which can exceed testing-library's 1s default.
const SLOW = { timeout: 25000 };
const SLOW_TEST = 30000;
const reload = vi.fn();
const realLocation = window.location;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockStatus = "signed-in";
  overrides.clear();
  reload.mockClear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...realLocation, reload },
  });
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  errorSpy.mockRestore();
  Object.defineProperty(window, "location", { configurable: true, value: realLocation });
});

// React.lazy caches a rejected import for good, and App.tsx builds its lazy components at module
// load. A fresh module graph per test keeps one test's rejection from leaking into the next.
let Shell: typeof import("../App.js").Shell;
beforeEach(async () => {
  vi.resetModules();
  ({ Shell } = await import("../App.js"));
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Shell />
    </MemoryRouter>,
  );
}

describe("route chunk boundary (T-0459)", () => {
  it("AC-1: a rejecting chunk shows the alert and Reload, no screen", async () => {
    overrides.set("/progress", staleChunk());
    renderAt("/progress");
    const alert = await screen.findByRole("alert", {}, SLOW);
    expect(alert).toHaveTextContent("Couldn't load this screen.");
    expect(screen.getAllByRole("button", { name: "Reload" })).toHaveLength(1);
    expect(document.querySelector("[data-screen-id]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it(
    "AC-1 pair: the real load renders UF-06.1 and no alert",
    async () => {
      renderAt("/progress");
      await waitFor(
        () => expect(document.querySelector('[data-screen-id="UF-06.1"]')).toBeInTheDocument(),
        SLOW,
      );
      expect(screen.queryByRole("alert")).toBeNull();
    },
    SLOW_TEST,
  );

  it(
    "AC-2: another route renders from the fallback; coming back shows the fallback again",
    async () => {
      overrides.set("/progress", staleChunk());
      renderAt("/progress");
      await screen.findByRole("alert", {}, SLOW);
      const nav = screen.getByRole("navigation", { name: "Main" });
      fireEvent.click(nav.querySelector('a[href="/library"]')!);
      await waitFor(
        () => expect(document.querySelector('[data-screen-id="UF-04.1"]')).toBeInTheDocument(),
        SLOW,
      );
      expect(screen.queryByRole("alert")).toBeNull();
      fireEvent.click(
        screen.getByRole("navigation", { name: "Main" }).querySelector('a[href="/progress"]')!,
      );
      expect(await screen.findByRole("alert", {}, SLOW)).toHaveTextContent(
        "Couldn't load this screen.",
      );
    },
    SLOW_TEST,
  );

  it("AC-3 signed out: the guard redirects and the chunk is never requested", async () => {
    mockStatus = "signed-out";
    const spy = staleChunk();
    overrides.set("/progress", spy);
    renderAt("/progress");
    await waitFor(() => expect(document.querySelector("[data-screen-id]")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("AC-3 mid-workout: no tab bar, and a later sign-out does not redirect", async () => {
    overrides.set("/session/:sessionId", staleChunk());
    const view = renderAt("/session/S1");
    await screen.findByRole("alert", {}, SLOW);
    expect(screen.queryByRole("navigation")).toBeNull();
    mockStatus = "signed-out";
    view.rerender(
      <MemoryRouter initialEntries={["/session/S1"]}>
        <Shell />
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load this screen.");
    expect(document.querySelector("[data-screen-id]")).toBeNull();
  });

  it("AC-4: a component that throws while rendering shows the same fallback", async () => {
    const Boom = () => {
      throw new Error("render failed");
    };
    overrides.set("/progress", () => Promise.resolve({ default: Boom }));
    renderAt("/progress");
    expect(await screen.findByRole("alert", {}, SLOW)).toHaveTextContent(
      "Couldn't load this screen.",
    );
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  describe("AC-5 a11y", () => {
    type Axe = {
      run: (c: Element, o: object) => Promise<{ violations: { id: string }[] }>;
    };
    let axe: Axe;
    beforeAll(async () => {
      const req = createRequire(resolve(process.cwd(), "package.json"));
      const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
      const mod = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
      axe = mod.default ?? mod;
    });

    it("the fallback has 0 axe violations and Reload is reachable by Tab", async () => {
      overrides.set("/session/:sessionId", staleChunk());
      const { container } = renderAt("/session/S1");
      await screen.findByRole("alert", {}, SLOW);
      const res = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
      expect(res.violations).toEqual([]);
      // jsdom has no Tab key handling: Reload is a native, non-negative-tabindex button.
      const button = screen.getByRole("button", { name: "Reload" });
      expect(button.tabIndex).toBe(0);
      button.focus();
      expect(button).toHaveFocus();
    });
  });
});
