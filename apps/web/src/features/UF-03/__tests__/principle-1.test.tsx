// T-0416 AC-8 (T-0360): the cross-screen principle-1 render assertion. A lint ban can't see a
// hard-coded `<a href="/library">`; only a render of the real session screens can. Through the
// real `<Shell>` in a `MemoryRouter`, S1 in IndexedDB, a paused focus state and the real module
// seam arrays: UF-09.9, the List view overlay and the How-to overlay have no link into the tab
// areas, no `nav` and no C-01. The summary has exactly one link out, "See balance".
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Shell } from "../../../app/App.js";
import { L1, NOW, S1 } from "./fixtures.js";
import {
  freshDb,
  seedAll,
  seedLibraryAndTargets,
  seedSession,
  signIn,
  signOut,
  waitReal,
} from "./helpers.js";
import { findEl, pausedState, settle, writeFocus } from "./list-helpers.js";

vi.mock("../../../lib/auth/auth-context.js", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: "signed-in" as const, redirectTarget: "/welcome", signOut: vi.fn() }),
}));
vi.mock("../../../lib/offline/history.js", (orig) =>
  import("./mocks.js").then((m) => m.historySpies(orig)),
);

const nowMs = Date.parse("2026-09-27T10:00:00.000Z");
const LAZY_TEST_MS = 20_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  signIn();
  window.localStorage.removeItem(`wl-focus:${S1}`);
});

afterEach(async () => {
  await waitReal(50);
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  signOut();
});

const FORBIDDEN = [
  'a[href^="/library"]',
  'a[href^="/progress"]',
  'a[href^="/plan"]',
  'a[href^="/balance"]',
  "nav",
  '[data-component="C-01"]',
];

function found(selector: string): number {
  return document.querySelectorAll(selector).length;
}

function expectNoWayOut(): void {
  for (const selector of FORBIDDEN) expect(found(selector), selector).toBe(0);
}

async function mountPaused(): Promise<void> {
  const db = freshDb();
  await seedLibraryAndTargets(db, L1);
  await seedSession(db, { endedAt: null });
  writeFocus(pausedState(nowMs));
  render(
    <MemoryRouter initialEntries={[`/session/${S1}`]}>
      <Shell />
    </MemoryRouter>,
  );
  await findEl(() => document.querySelector('[data-screen-id="UF-09.9"]'));
}

describe("AC-8 the session screens have no way out", () => {
  it(
    "UF-09.9, the List view overlay and the How-to overlay: 0 tab-area links, no nav, no C-01",
    async () => {
      await mountPaused();
      expectNoWayOut();

      fireEvent.click(screen.getByRole("button", { name: "List view" }));
      await findEl(() => document.querySelector('[data-screen-id="UF-03.1"]'));
      await screen.findByRole("button", { name: /Romanian deadlift/ });
      expectNoWayOut();
      expect(found("a[href]")).toBe(0);

      fireEvent.click(screen.getByRole("button", { name: "Focus mode" }));
      await findEl(() => document.querySelector('[data-screen-id="UF-09.3"]'));
      fireEvent.click(screen.getByRole("button", { name: "Pause workout" }));
      await findEl(() => document.querySelector('[data-screen-id="UF-09.9"]'));

      fireEvent.click(screen.getByRole("button", { name: "How to" }));
      await screen.findByRole("dialog", { name: "How to: Back squat" });
      expectNoWayOut();
      expect(found("a[href]")).toBe(0);
    },
    LAZY_TEST_MS,
  );

  it(
    "CONTRAST: a planted <a href=/library/back-squat> inside the List view overlay is found (1)",
    async () => {
      await mountPaused();
      fireEvent.click(screen.getByRole("button", { name: "List view" }));
      const overlay = await findEl(() => document.querySelector('[data-screen-id="UF-03.1"]'));
      await screen.findByRole("button", { name: /Romanian deadlift/ });
      const link = document.createElement("a");
      link.setAttribute("href", "/library/back-squat");
      overlay.append(link);
      expect(found('a[href^="/library"]')).toBe(1);
      expect(() => expectNoWayOut()).toThrow();
    },
    LAZY_TEST_MS,
  );

  it(
    "the summary of S1 ended: 0 library, progress and plan links, no nav, exactly one /balance link",
    async () => {
      const db = freshDb();
      await seedAll(db);
      render(
        <MemoryRouter initialEntries={[`/session/${S1}/summary`]}>
          <Shell />
        </MemoryRouter>,
      );
      await findEl(() => document.querySelector('[data-screen-id="UF-03.3"]'));
      const link = await screen.findByRole("link", { name: "See balance" });
      await settle();
      for (const selector of [
        'a[href^="/library"]',
        'a[href^="/progress"]',
        'a[href^="/plan"]',
        "nav",
      ]) {
        expect(found(selector), selector).toBe(0);
      }
      expect(found('a[href="/balance"]')).toBe(1);
      expect(link).toHaveAttribute("href", "/balance");
      expect(within(document.body).getAllByRole("link")).toHaveLength(1);
    },
    LAZY_TEST_MS,
  );

  it(
    "CONTRAST: /library with a seeded cache has at least one a[href^=/library/] row",
    async () => {
      const db = freshDb();
      await seedLibraryAndTargets(db, L1);
      render(
        <MemoryRouter initialEntries={["/library"]}>
          <Shell />
        </MemoryRouter>,
      );
      await findEl(() => document.querySelector('a[href^="/library/"]'));
      expect(found('a[href^="/library/"]')).toBeGreaterThanOrEqual(1);
    },
    LAZY_TEST_MS,
  );
});
