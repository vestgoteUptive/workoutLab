// T-0998 AC1 UF-08.2 (D-0274 §3-§7): the controls of the old exercise list are gone in every state.
// Each case asserts the area rows still render (a text-absence check on an empty page proves
// nothing), then that no Reorder, Move up / Move down, Shuffle, Other suggestions or Suggestions
// text or control is on UF-08.2 or UF-08.6.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { fitLine, renderSetup, screenIds, serveCache, setOnline, settle } from "./harness.js";

vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", userId: undefined }),
}));
vi.mock("../../../lib/offline/history.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/history.js")>();
  return {
    ...actual,
    loadLibrary: vi.fn(),
    loadTargets: vi.fn(),
    loadProfile: vi.fn(),
    refreshAll: vi.fn(async () => {}),
    lastSyncedAt: vi.fn(async () => null),
  };
});
vi.mock("../../../lib/offline/engine-feed.js", () => ({ loadEngineHistory: vi.fn() }));

beforeEach(() => {
  setOnline(false);
  serveCache();
});
afterEach(() => {
  cleanup();
});

const RETIRED = /Reorder|Move up|Move down|Shuffle|Other suggestions|Suggestions/;
const areaRows = () => document.querySelectorAll('[data-part="area-row"]');

async function toPlan(how: "Suggest my workout" | "Start empty"): Promise<void> {
  renderSetup();
  await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits/));
  fireEvent.click(screen.getByRole("button", { name: "30 minutes" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: how }));
  expect(screenIds()).toEqual(["UF-08.2"]);
}

function expectNoRetired(): void {
  expect(document.body.textContent).not.toMatch(RETIRED);
  for (const el of document.querySelectorAll("button, [aria-label]")) {
    expect(el.getAttribute("aria-label") ?? el.textContent ?? "").not.toMatch(RETIRED);
  }
}

describe("T-0998 AC1 no retired control or text", () => {
  it("T-0998 AC1 UF-08.2 from Suggest my workout: area rows render, none of the retired words", async () => {
    await toPlan("Suggest my workout");
    expect(areaRows().length).toBeGreaterThan(0);
    expectNoRetired();
  });

  it("T-0998 AC1 UF-08.2 from Start empty: no area rows yet, none of the retired words", async () => {
    await toPlan("Start empty");
    expect(areaRows()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Start workout" })).toBeInTheDocument();
    expectNoRetired();
  });

  it("T-0998 AC1 UF-08.2 after Fill the rest for me, and UF-08.6: area rows render, none of the words", async () => {
    await toPlan("Start empty");
    fireEvent.click(screen.getByRole("button", { name: "Fill the rest for me" }));
    expect(areaRows().length).toBeGreaterThan(0);
    expectNoRetired();
    fireEvent.click(document.querySelector('[data-part="area-row"] [data-part="area-open"]')!);
    expect(screenIds()).toEqual(["UF-08.6"]);
    expect(document.querySelectorAll('[data-part="detail-row"]').length).toBeGreaterThan(0);
    expectNoRetired();
  });
});
