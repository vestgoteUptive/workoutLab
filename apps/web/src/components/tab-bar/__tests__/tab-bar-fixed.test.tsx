// T-0527 C-02 (D-0196): AC-5 (no bar, no spacer) and AC-6 (CSS and viewport source checks).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Shell } from "../../../app/App.js";

const auth = vi.hoisted(() => ({ status: "signed-in" as "signed-in" | "signed-out" }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: auth.status, redirectTarget: "/welcome", signOut: vi.fn() }),
}));

vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return {
    ...actual,
    loadSessions: vi.fn(async () => []),
    loadEngineHistory: vi.fn(async () => []),
    loadLibrary: vi.fn(async () => []),
    loadTargets: vi.fn(async () => []),
    refreshAll: vi.fn(async () => undefined),
  };
});

async function renderAt(path: string) {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Shell />
    </MemoryRouter>,
  );
  await waitFor(() => expect(document.querySelector("[data-screen-id]")).toBeInTheDocument(), {
    timeout: 5_000,
  });
  return view;
}

describe("T-0527 AC-5 no bar, no spacer on focus and editing routes", () => {
  it.each(["/session/setup", "/plan/account", "/welcome"])(
    "T-0527 AC-5 %s renders neither",
    async (path) => {
      auth.status = path === "/welcome" ? "signed-out" : "signed-in";
      await renderAt(path);
      expect(document.querySelectorAll("nav.wl-tab-bar")).toHaveLength(0);
      expect(document.querySelectorAll(".wl-tab-bar__spacer")).toHaveLength(0);
    },
    15_000,
  );

  it("T-0527 AC-5 / renders exactly one bar and one aria-hidden spacer", async () => {
    auth.status = "signed-in";
    await renderAt("/");
    expect(document.querySelectorAll("nav.wl-tab-bar")).toHaveLength(1);
    const spacers = document.querySelectorAll(".wl-tab-bar__spacer");
    expect(spacers).toHaveLength(1);
    expect(spacers[0]!.getAttribute("aria-hidden")).toBe("true");
  }, 15_000);
});

describe("T-0527 AC-6 CSS and viewport source", () => {
  const css = readFileSync(resolve(__dirname, "../tab-bar.css"), "utf8");
  const html = readFileSync(resolve(__dirname, "../../../../index.html"), "utf8");
  const rule = (selector: string) => {
    const i = css.indexOf(`${selector} {`);
    expect(i).toBeGreaterThanOrEqual(0);
    return css.slice(i, css.indexOf("}", i));
  };

  it("T-0527 AC-6 the bar is fixed, safe-area padded and sized by the property", () => {
    const bar = rule(".wl-tab-bar");
    expect(bar).toContain("position: fixed");
    expect(bar).toContain("env(safe-area-inset-bottom");
    expect(bar).toContain("--wl-tab-bar-block-size");
  });

  it("T-0527 AC-6 the spacer and scroll padding use the same property", () => {
    expect(rule(".wl-tab-bar__spacer")).toContain("--wl-tab-bar-block-size");
    const sp = rule("html:has(.wl-tab-bar)");
    expect(sp).toMatch(/scroll-padding-(block-end|bottom)/);
    expect(sp).toContain("--wl-tab-bar-block-size");
  });

  it("T-0527 AC-6 the viewport meta has viewport-fit=cover and no interactive-widget", () => {
    const content = /<meta[^>]*name="viewport"[^>]*content="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(content).toContain("viewport-fit=cover");
    expect(content).not.toContain("interactive-widget");
  });
});
