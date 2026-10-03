// T-0307b: mounts through the real Shell and route table with NO injected props (no `now`, no
// `timeZone`, no `locale`), so a render loop that overrides would hide (a per-render `new Date()`
// in an effect dependency, T-0307a) shows up as growing loader counts. Also AC-13's render half.
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { freshOfflineDb, signIn, signOut } from "../../../lib/offline/__tests__/test-helpers.js";
import { Shell } from "../../../app/App.js";
import { USER, seed, set } from "./fixtures.js";

vi.mock("../../../lib/auth/auth-context.js", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: "signed-in" as const, redirectTarget: "/welcome", signOut: vi.fn() }),
}));
vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return {
    ...actual,
    loadSessions: vi.fn(actual.loadSessions),
    loadEngineHistory: vi.fn(actual.loadEngineHistory),
    loadLibrary: vi.fn(actual.loadLibrary),
    loadTargets: vi.fn(actual.loadTargets),
    refreshAll: vi.fn(async () => undefined),
  };
});

const loaders = () =>
  [
    offline.loadSessions,
    offline.loadEngineHistory,
    offline.loadLibrary,
    offline.loadTargets,
  ] as const;

/** Lets any runaway effect loop show itself before the counts are read. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  vi.mocked(offline.refreshAll).mockClear();
  for (const loader of loaders()) vi.mocked(loader).mockClear();
});
afterEach(() => signOut());

async function mount(path: string) {
  // A set "now": the fixture date is irrelevant, the host clock and zone decide the month.
  const nowIso = new Date().toISOString();
  await seed({
    history: [set("A", "back-squat", "2026-09-20 10:00", { w: 100, r: 8, editedAt: nowIso })],
    sessions: [{ id: "A", startedAt: "2026-09-20T08:00:00.000Z" }],
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Shell />
    </MemoryRouter>,
  );
}

describe("no-override mount through the real router", () => {
  it.each([
    ["/progress", "UF-06.1"],
    ["/progress/back-squat", "UF-06.2"],
  ])(
    "%s reads each cache twice (cache, then after the refresh) and refreshes once",
    async (path, id) => {
      await mount(path);
      await waitFor(() =>
        expect(document.querySelector(`[data-screen-id='${id}']`)).toBeInTheDocument(),
      );
      await settle();
      for (const loader of loaders()) expect(loader).toHaveBeenCalledTimes(2);
      expect(offline.refreshAll).toHaveBeenCalledTimes(1);
    },
  );
});

describe("AC-13 never reachable in a workout (render)", () => {
  it.each(["/session/0b9ecb1e-0000-0000-0000-000000000000", "/session/S1/summary"])(
    "%s has no link into /progress",
    async (path) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <Shell />
        </MemoryRouter>,
      );
      await waitFor(() => expect(document.querySelector("[data-screen-id]")).toBeInTheDocument());
      await settle();
      expect(document.querySelector("a[href^='/progress']")).toBeNull();
      expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
    },
  );
});
