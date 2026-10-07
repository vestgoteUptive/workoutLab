// T-0529 AC-1 UF-11.2: the header row (h1, then the "Account and sign out" link) is the first
// child of the screen in every Plan state (D-0195 §1). Mocks mirror plan.render.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { en } from "../../../lib/i18n/en.js";
import { profileF, targetsF, TZ } from "./fixtures.js";
import {
  createFromSpy,
  freshDb,
  renderPlan,
  seedCache,
  signIn,
  signOut,
  useTimeZone,
} from "./test-helpers.js";

vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return {
    ...actual,
    refreshAll: vi.fn(async () => undefined),
    refreshRoutines: vi.fn(async () => undefined),
  };
});

const checkinSpy = createFromSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => checkinSpy.from(table) },
  isSupabaseConfigured: () => true,
}));

const u = en.uf11;

beforeEach(() => {
  signIn();
  checkinSpy.reset();
  useTimeZone(TZ);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

function expectHeader() {
  const root = document.querySelector('[data-screen-id="UF-11.2"]')!;
  const header = root.firstElementChild!;
  expect(header.className).toBe("wl-plan__header");
  expect(header.children[0]!.tagName).toBe("H1");
  expect(header.children[0]!.textContent).toBe(en.screens.plan);
  const link = header.children[1]!;
  expect(link.tagName).toBe("A");
  expect(screen.getByRole("link", { name: "Account and sign out" })).toBe(link);
  expect(link.getAttribute("href")).toBe("/plan/account");
  expect(root.querySelectorAll('a[href="/plan/account"]')).toHaveLength(1);
  return header;
}

describe("T-0529 AC-1 Plan header link", () => {
  it("T-0529 AC-1 is there in the loading state", () => {
    freshDb();
    renderPlan();
    expectHeader();
  });

  it("T-0529 AC-1 is there in the cold-cache state", async () => {
    freshDb();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderPlan();
    await screen.findByText(u.coldCache);
    expectHeader();
  });

  it("T-0529 AC-1 is there when ready, and the check-in card follows the header", async () => {
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    renderPlan();
    await waitFor(() =>
      expect(document.querySelector('[data-part="checkin-card"]')).not.toBeNull(),
    );
    const header = expectHeader();
    expect(header.nextElementSibling).toBe(document.querySelector('[data-part="checkin-card"]'));
  });
});
