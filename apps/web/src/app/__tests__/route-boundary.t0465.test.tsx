// T-0465 (D-0167 §5): RouteBoundary focuses Reload, and resets on a pathname change.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";

vi.mock("../../lib/auth/auth-context.js", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: "signed-in", redirectTarget: "/welcome" as const, signOut: vi.fn() }),
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

const SLOW = { timeout: 25000 };
const SLOW_TEST = 30000;
let mounts = 0;
let go: (to: string) => void = () => {};
let errorSpy: ReturnType<typeof vi.spyOn>;

async function useParamsComponent() {
  const { useParams } = await import("react-router");
  return function Detail() {
    const { exerciseId } = useParams();
    useEffect(() => {
      mounts += 1;
    }, []);
    if (exerciseId === "bad") throw new Error("render boom");
    return <p data-testid="detail">{exerciseId}</p>;
  };
}

function Nav() {
  const navigate = useNavigate();
  go = (to) => act(() => void navigate(to));
  return null;
}

let Shell: typeof import("../App.js").Shell;
beforeEach(async () => {
  mounts = 0;
  overrides.clear();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.resetModules();
  ({ Shell } = await import("../App.js"));
});
afterEach(() => {
  cleanup();
  errorSpy.mockRestore();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Nav />
      <Shell />
    </MemoryRouter>,
  );
}
const reloadBtn = () => screen.getByRole("button", { name: "Reload" });

describe("RouteBoundary focus and reset (T-0465)", () => {
  it(
    "AC-1: focus lands on Reload at first render and after a tab navigation",
    async () => {
      overrides.set("/progress", () => Promise.reject(new TypeError("Failed to fetch")));
      renderAt("/progress");
      await screen.findByRole("alert", {}, SLOW);
      expect(document.activeElement).toBe(reloadBtn());
      cleanup();

      renderAt("/library");
      await waitFor(
        () => expect(document.querySelector('[data-screen-id="UF-04.1"]')).toBeInTheDocument(),
        SLOW,
      );
      fireEvent.click(
        screen.getByRole("navigation", { name: "Main" }).querySelector('a[href="/progress"]')!,
      );
      await screen.findByRole("alert", {}, SLOW);
      expect(document.activeElement).toBe(reloadBtn());
    },
    SLOW_TEST,
  );

  it(
    "AC-1 pair: a normal route leaves focus on body, and on the tab link after a tab click",
    async () => {
      renderAt("/library");
      await waitFor(
        () => expect(document.querySelector('[data-screen-id="UF-04.1"]')).toBeInTheDocument(),
        SLOW,
      );
      expect(document.activeElement).toBe(document.body);
      const link = screen
        .getByRole("navigation", { name: "Main" })
        .querySelector<HTMLElement>('a[href="/progress"]')!;
      link.focus();
      fireEvent.click(link);
      await waitFor(
        () => expect(document.querySelector('[data-screen-id="UF-06.1"]')).toBeInTheDocument(),
        SLOW,
      );
      expect(document.activeElement).toBe(link);
      expect(screen.queryByRole("alert")).toBeNull();
    },
    SLOW_TEST,
  );

  it(
    "AC-2: a render error on /library/bad resets on /library/good, and returns on bad",
    async () => {
      const D = await useParamsComponent();
      overrides.set("/library/:exerciseId", () => Promise.resolve({ default: D }));
      renderAt("/library/bad");
      await screen.findByRole("alert", {}, SLOW);
      go("/library/good");
      expect(await screen.findByTestId("detail", {}, SLOW)).toHaveTextContent("good");
      expect(screen.queryByRole("alert")).toBeNull();
      go("/library/bad");
      await screen.findByRole("alert", {}, SLOW);
      expect(document.activeElement).toBe(reloadBtn());
    },
    SLOW_TEST,
  );

  it(
    "AC-2 pair: a chunk failure across ids shows one fallback, no load loop",
    async () => {
      const load = vi.fn<Load>(() => Promise.reject(new TypeError("Failed to fetch")));
      overrides.set("/library/:exerciseId", load);
      renderAt("/library/a");
      await screen.findByRole("alert", {}, SLOW);
      const before = load.mock.calls.length;
      go("/library/b");
      await screen.findByRole("alert", {}, SLOW);
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(document.activeElement).toBe(reloadBtn());
      expect(load.mock.calls.length).toBeLessThanOrEqual(before + 1);
      await new Promise((r) => setTimeout(r, 50));
      expect(load.mock.calls.length).toBeLessThanOrEqual(before + 1);
    },
    SLOW_TEST,
  );

  it(
    "AC-3: a working route is not remounted on a param change",
    async () => {
      const D = await useParamsComponent();
      overrides.set("/library/:exerciseId", () => Promise.resolve({ default: D }));
      renderAt("/library/good");
      expect(await screen.findByTestId("detail", {}, SLOW)).toHaveTextContent("good");
      go("/library/other");
      await waitFor(() => expect(screen.getByTestId("detail")).toHaveTextContent("other"));
      expect(mounts).toBe(1);
    },
    SLOW_TEST,
  );

  it(
    "AC-4: the fallback has no axe violations",
    async () => {
      overrides.set("/progress", () => Promise.reject(new TypeError("Failed to fetch")));
      renderAt("/progress");
      await screen.findByRole("alert", {}, SLOW);
      const req = createRequire(resolve(__dirname, "../../../package.json"));
      const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
      const mod = (await import(/* @vite-ignore */ axePath)) as { default?: unknown };
      const axe = (mod.default ?? mod) as {
        run: (c: Element) => Promise<{ violations: unknown[] }>;
      };
      const res = await axe.run(document.body);
      expect(res.violations).toEqual([]);
    },
    SLOW_TEST,
  );
});
