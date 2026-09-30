// T-0306a: mounts through the real Shell and lazy routes, with no injected props, and counts
// loader calls. A per-render `new Date()` or unstable dependency in an effect would show up here
// as a runaway count (the T-0307a render loop that every injected-`now` unit test hid).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { createSelectSpy } from "../../../lib/offline/__tests__/select-spy.js";
import { NOW, TZ, USER, seedSpy } from "./l1plus.js";

const spy = createSelectSpy();
const hoisted = vi.hoisted(() => ({
  refreshAll: vi.fn(),
  loadLibrary: vi.fn(),
  loadProfile: vi.fn(),
}));
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: spy.from } }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: "signed-in" as const, redirectTarget: "/welcome", signOut: vi.fn() }),
}));
vi.mock("../../../lib/offline/history.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/offline/history.js")>();
  hoisted.refreshAll.mockImplementation(real.refreshAll);
  hoisted.loadLibrary.mockImplementation(real.loadLibrary);
  hoisted.loadProfile.mockImplementation(real.loadProfile);
  return {
    ...real,
    refreshAll: (...a: Parameters<typeof real.refreshAll>) => hoisted.refreshAll(...a),
    loadLibrary: () => hoisted.loadLibrary(),
    loadProfile: () => hoisted.loadProfile(),
  };
});

const { refreshAll } = await vi.importActual<typeof import("../../../lib/offline/history.js")>(
  "../../../lib/offline/history.js",
);
const { freshOfflineDb, signIn, signOut } =
  await import("../../../lib/offline/__tests__/test-helpers.js");
const { Shell } = await import("../../../app/App.js");
const { setOnline } = await import("./harness.js");

beforeEach(async () => {
  freshOfflineDb();
  signIn(USER);
  setOnline(true);
  spy.reset();
  seedSpy(spy);
  await refreshAll(NOW, TZ);
  for (const fn of Object.values(hoisted)) fn.mockClear();
});
afterEach(signOut);

const PATHS: ReadonlyArray<readonly [string, string, number]> = [
  ["/library", "UF-04.1", 24],
  ["/library/back-squat", "UF-04.2", 0],
  ["/library/back-squat/compare/leg-press", "UF-04.3", 0],
];

describe("real-route mounts settle without a render loop", () => {
  it.each(PATHS)(
    "%s refreshes once, reads the cache at most twice, and stays put",
    async (path, id, rows) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <Shell />
        </MemoryRouter>,
      );
      await waitFor(() => {
        expect(document.querySelector(`[data-screen-id="${id}"]`)).toBeInTheDocument();
        expect(hoisted.refreshAll).toHaveBeenCalledTimes(1);
        expect(hoisted.loadLibrary.mock.calls.length).toBeGreaterThanOrEqual(2);
      });
      if (rows > 0) {
        await waitFor(() =>
          expect(document.querySelectorAll('[data-field="name"]')).toHaveLength(rows),
        );
      }
      await new Promise((r) => setTimeout(r, 150));
      expect(hoisted.refreshAll).toHaveBeenCalledTimes(1);
      expect(hoisted.loadLibrary.mock.calls.length).toBeLessThanOrEqual(2);
      expect(hoisted.loadProfile.mock.calls.length).toBeLessThanOrEqual(2);
      expect(document.querySelectorAll("[data-screen-id]")).toHaveLength(1);
    },
  );
});
