// T-0310d AC-D1 (route) and AC-D2 (the Account link on UF-11.2), through the real route table.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Shell } from "../../../app/App.js";
import { routes } from "../../../app/routes.js";
import { en } from "../../../lib/i18n/en.js";
import { TZ, profileF, targetsF } from "./fixtures.js";
import { freshDb, seedCache, signIn, signOut, useTimeZone } from "./test-helpers.js";

const auth = vi.hoisted(() => ({ status: "signed-in" as "signed-in" | "signed-out" }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    status: auth.status,
    userId: "11111111-1111-4111-8111-111111111111",
    redirectTarget: "/welcome",
    signOut: vi.fn(),
  }),
}));
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: {},
  isSupabaseConfigured: () => true,
}));
vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return { ...actual, refreshAll: vi.fn(async () => undefined) };
});

const WAIT = { timeout: 5_000 };
const TEST_MS = 15_000;

function mountAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Shell />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.status = "signed-in";
  signIn();
  useTimeZone(TZ);
});
afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

describe("T-0310d AC-D1 the route", () => {
  it("T-0310d AC-D1 has one /plan/account entry right after /plan/edit", () => {
    const paths = routes.map((r) => r.path);
    expect(paths.filter((p) => p === "/plan/account")).toHaveLength(1);
    expect(paths.indexOf("/plan/account")).toBe(paths.indexOf("/plan/edit") + 1);
    const row = routes.find((r) => r.path === "/plan/account")!;
    expect({ s: row.screenId, t: row.showTabBar, g: row.guard }).toEqual({
      s: "UF-11.4",
      t: false,
      g: "protected",
    });
  });

  it(
    "T-0310d AC-D1 renders the screen with no tab bar, signed in",
    async () => {
      mountAt("/plan/account");
      await waitFor(
        () => expect(document.querySelector('[data-screen-id="UF-11.4"]')).toBeInTheDocument(),
        WAIT,
      );
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Account settings");
      expect(screen.queryByRole("navigation", { name: en.tabBar.nav })).toBeNull();
    },
    TEST_MS,
  );

  it(
    "T-0310d AC-D1 signed out redirects and never renders the screen",
    async () => {
      auth.status = "signed-out";
      mountAt("/plan/account");
      await waitFor(
        () => expect(document.querySelector("[data-screen-id]")).toBeInTheDocument(),
        WAIT,
      );
      expect(document.querySelector('[data-screen-id="UF-11.4"]')).toBeNull();
      expect(screen.queryByText("Account settings")).toBeNull();
    },
    TEST_MS,
  );
});

describe("T-0310d AC-D2 the Account link", () => {
  it(
    "T-0310d AC-D2 shows on a seeded plan and leads to UF-11.4",
    async () => {
      const db = freshDb();
      await seedCache(db, { profile: profileF(), targets: targetsF() });
      mountAt("/plan");
      const link = await screen.findByRole("link", { name: "Account" }, WAIT);
      expect(link).toHaveAttribute("href", "/plan/account");
      fireEvent.click(link);
      await waitFor(
        () => expect(document.querySelector('[data-screen-id="UF-11.4"]')).toBeInTheDocument(),
        WAIT,
      );
    },
    TEST_MS,
  );

  it(
    "T-0310d AC-D2 shows in the cold-cache offline state",
    async () => {
      freshDb();
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      try {
        mountAt("/plan");
        await screen.findByText(en.uf11.coldCache, undefined, WAIT);
        expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute(
          "href",
          "/plan/account",
        );
      } finally {
        Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
      }
    },
    TEST_MS,
  );
});
