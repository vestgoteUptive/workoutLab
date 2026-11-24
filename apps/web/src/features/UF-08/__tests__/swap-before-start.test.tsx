// T-0303c UF-08.3 Swap before starting: the shared UF-05.1 SwapSheet, now opened from UF-08.6
// (T-0998). AC-3 keep, T-0580 a failed exclusion write, AC-6 bad URLs. The row Swap buttons on
// UF-08.2, the over-budget bar and the W5 stub went with the exercise list; the swap itself is
// covered in area-detail.test.tsx (T-0997 AC2). Real engine; the sheet is mocked where it says.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { applySwap, suggest } from "@workoutlab/engine";
import { SwapSheet } from "../../UF-05/index.js";
import { SessionSetup } from "../SessionSetup.js";
import { fitLine, screenIds, serveCache, setOnline } from "./harness.js";
import { fLibrary, fProfile } from "./fixtures.js";

const auth = vi.hoisted(() => ({ status: "signed-in" as const, userId: null as string | null }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: auth.status, userId: auth.userId }),
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
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest) };
});
vi.mock("../../UF-05/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../UF-05/index.js")>();
  return { SwapSheet: vi.fn(actual.SwapSheet) };
});

const suggestSpy = vi.mocked(suggest);
const sheet = vi.mocked(SwapSheet);

const NOW = "2026-09-27T10:00:00Z";
const props = { now: NOW, locale: "en-GB", timeZone: "UTC" };

let navigateRef: ReturnType<typeof useNavigate>;
const Probe = () => {
  const loc = useLocation();
  navigateRef = useNavigate();
  return <span data-testid="loc" data-at={loc.pathname + loc.search} />;
};
const at = () => screen.getByTestId("loc").getAttribute("data-at");
const button = (name: string) => screen.getByRole("button", { name });

function mount(start = "/session/setup") {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <Probe />
      <Routes>
        <Route path="/session/setup" element={<SessionSetup {...props} />} />
        <Route path="/" element={<span data-testid="home" />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** UF-08.1 → chip 30 → Suggest → UF-08.2 → the Back area (Inverted row) → UF-08.6. */
async function toBackArea(start?: string): Promise<void> {
  mount(start);
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits: |Nothing fits)/));
  fireEvent.click(button("30 minutes"));
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits: |Nothing fits)/));
  fireEvent.click(button("Suggest my workout"));
  expect(screenIds()).toEqual(["UF-08.2"]);
  fireEvent.click(
    document.querySelector<HTMLElement>(
      '[data-part="area-row"][data-area="back"] [data-part="area-open"]',
    )!,
  );
  expect(screenIds()).toEqual(["UF-08.6"]);
}

beforeEach(async () => {
  vi.clearAllMocks();
  const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  suggestSpy.mockImplementation(actual.suggest);
  const actualSheet = (
    await vi.importActual<typeof import("../../UF-05/index.js")>("../../UF-05/index.js")
  ).SwapSheet;
  sheet.mockImplementation(actualSheet);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  setOnline(false);
  serveCache();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AC-3 keep", () => {
  it.each([
    ["Close", () => fireEvent.click(screen.getByRole("button", { name: "Close" }))],
    ["Escape", () => fireEvent.keyDown(document.body, { key: "Escape" })],
  ])(
    "T-0303c AC-3 %s returns to UF-08.6 unchanged, focus on Swap, no new call",
    async (_n, leave) => {
      await toBackArea();
      const calls = suggestSpy.mock.calls.length;
      const rows = () =>
        Array.from(document.querySelectorAll('[data-part="detail-row"]')).map((r) =>
          r.getAttribute("data-id"),
        );
      const before = rows();
      fireEvent.click(button("Swap Inverted row"));
      await screen.findByRole("radiogroup", { name: "Replacement" });
      leave();
      await waitFor(() => expect(screenIds()).toEqual(["UF-08.6"]));
      expect(rows()).toEqual(before);
      expect(suggestSpy.mock.calls.length).toBe(calls);
      await waitFor(() => expect(button("Swap Inverted row")).toHaveFocus());
    },
  );
});

describe("T-0580 a failed exclusion write shows on UF-08.6 (mocked sheet)", () => {
  const region = () => document.querySelector<HTMLElement>('[data-part="exclusion-failed"]');

  async function applyMock(exclusionFailed: boolean): Promise<void> {
    await toBackArea();
    expect(region()).toHaveAttribute("aria-live", "assertive");
    expect(region()).toBeEmptyDOMElement();
    sheet.mockImplementationOnce((p) => (
      <button
        type="button"
        onClick={() => {
          const swapped = applySwap(
            p.workout,
            "inverted-row",
            "db-row",
            null,
            [],
            fProfile(),
            fLibrary(),
            NOW,
            "UTC",
          );
          void p.onApply(swapped, { exclusionFailed });
        }}
      >
        apply mock
      </button>
    ));
    fireEvent.click(button("Swap Inverted row"));
    fireEvent.click(button("apply mock"));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.6"]));
  }

  it("the alert is mounted and empty, then reads the message once the swap has left the sheet", async () => {
    await applyMock(true);
    expect(within(region()!).getByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
  });

  it("the pair: a swap with no failed exclusion leaves it empty", async () => {
    await applyMock(false);
    expect(region()).toBeEmptyDOMElement();
  });
});

describe("AC-6 bad URLs", () => {
  it("T-0303c AC-6 cold ?step=swap&item=1 renders UF-08.1 and replaces to /session/setup", async () => {
    mount("/session/setup?step=swap&item=1");
    expect(screenIds()).toEqual(["UF-08.1"]);
    await waitFor(() => expect(at()).toBe("/session/setup"));
    expect(screenIds()).toEqual(["UF-08.1"]);
  });

  it.each(["&item=x", "&item=-1", "&item=3", "", "&item=1.5"])(
    "T-0303c AC-6 with a Workout, '%s' replaces the URL with ?step=suggested",
    async (q) => {
      mount();
      await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits: |Nothing fits)/));
      fireEvent.click(button("30 minutes"));
      await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits: |Nothing fits)/));
      fireEvent.click(button("Suggest my workout"));
      await act(async () => void navigateRef(`/session/setup?step=swap${q}`));
      await waitFor(() => expect(at()).toBe("/session/setup?step=suggested"));
      expect(screenIds()).toEqual(["UF-08.2"]);
    },
  );
});
