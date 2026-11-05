// T-0685 AC1..AC5 (UF-01.3): the static "You can change this later in Plan." line in the
// "Training experience" radiogroup's description, the D-0233 §3 Advanced hint, and the unchanged
// Beginner preselect and 3-activation path (D-0232, D-0233, D-0064 §2/§6, D-0014; spec
// docs/specs/editable-level.md AC14).
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseFrom = vi.fn();
vi.mock("../../../lib/auth/client.js", async () =>
  (await import("./client-mock.js")).clientMock(supabaseFrom),
);

const { KEY, findScreen, mountAt, setOnline, targetRows } = await import("./harness.js");

const LATER = "You can change this later in Plan.";
const BEGINNER = "Under 6 months. We start with form-first variations like the goblet squat.";
const INTERMEDIATE = "6 months to 2 years. Barbell basics plus targeted accessories.";
const ADVANCED = "2+ years. Adds the most demanding lifts, like the barbell deadlift.";
const OLD_ADVANCED = "Higher volume and advanced progression schemes.";

const fetchSpy = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));

beforeEach(() => {
  window.localStorage.clear();
  setOnline(true);
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockClear();
  supabaseFrom.mockClear();
  vi.spyOn(Date, "now").mockReturnValue(9_000_000);
});
afterEach(() => {
  setOnline(true);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const group = () => screen.getByRole("radiogroup", { name: "Training experience" });
const hint = () => document.getElementById("wl-uf01-level-hint")!;
const later = () => screen.getByText(LATER);

/** AC1's assertions, shared with AC5. */
function expectLineOnFreshScreen() {
  expect(screen.getByRole("radio", { name: "Beginner" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Intermediate" })).not.toBeChecked();
  expect(screen.getByRole("radio", { name: "Advanced" })).not.toBeChecked();
  const line = later();
  expect(line.id).toBe("wl-uf01-level-later");
  expect(line).toHaveClass("wl-type-label");
  // A separate element from the per-level hint, after it in DOM order.
  expect(hint()).not.toContainElement(line);
  expect(hint().textContent).toBe(BEGINNER);
  expect(hint().compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(group()).toHaveAttribute("aria-describedby", "wl-uf01-level-hint wl-uf01-level-later");
  expect(group()).toHaveAccessibleDescription(`${BEGINNER} ${LATER}`);
  // Static, not announced.
  expect(line.closest("[aria-live], [role=status], [role=alert]")).toBeNull();
  expect(line).not.toHaveAttribute("aria-live");
}

describe("T-0685 UF-01.3 'You can change this later in Plan.' (D-0232, D-0233)", () => {
  it("T-0685 AC1 a new visitor: Beginner preselected, the line after the hint and in the description", async () => {
    mountAt("/welcome/level");
    await findScreen("UF-01.3");
    expectLineOnFreshScreen();
  });

  it("T-0685 AC1 (review) the line sits directly under the level hint, in the level group, before the equipment group", async () => {
    mountAt("/welcome/level");
    await findScreen("UF-01.3");
    const line = later();
    // "Under the level hint" (D-0232 §2, spec AC14): the hint's next sibling, not merely later.
    expect(hint().nextElementSibling).toBe(line);
    expect(line.parentElement).toBe(group().parentElement);
    const equipment = screen.getByRole("radiogroup", { name: "Where do you train?" });
    expect(line.compareDocumentPosition(equipment) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("T-0685 AC2 picking Advanced shows the D-0233 §3 copy; the line stays; Intermediate unchanged", async () => {
    mountAt("/welcome/level");
    await findScreen("UF-01.3");
    fireEvent.click(screen.getByRole("radio", { name: "Advanced" }));
    expect(hint().textContent).toBe(ADVANCED);
    expect(later().id).toBe("wl-uf01-level-later");
    expect(group()).toHaveAccessibleDescription(`${ADVANCED} ${LATER}`);
    expect(document.body.textContent).not.toContain(OLD_ADVANCED);

    fireEvent.click(screen.getByRole("radio", { name: "Intermediate" }));
    expect(hint().textContent).toBe(INTERMEDIATE);
    expect(group()).toHaveAccessibleDescription(`${INTERMEDIATE} ${LATER}`);
    expect(screen.getAllByText(LATER)).toHaveLength(1);
  });

  it("T-0685 AC3 a restored pending plan with level advanced: Advanced checked, the line shown", async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        goal: "get_stronger",
        level: "advanced",
        equipmentProfile: "dumbbells",
        rhythmMin: 3,
        rhythmMax: 4,
        startedAtMs: null,
        timingMs: null,
        planShown: false,
        savedAtMs: 9_000_000,
      }),
    );
    mountAt("/welcome/level");
    await findScreen("UF-01.3");
    expect(screen.getByRole("radio", { name: "Advanced" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Beginner" })).not.toBeChecked();
    expect(hint().textContent).toBe(ADVANCED);
    expect(later()).toBeVisible();
    expect(group()).toHaveAccessibleDescription(`${ADVANCED} ${LATER}`);
  });

  it("T-0685 AC4 Get started, Continue, Continue reaches UF-01.4 with a plan (3 activations)", async () => {
    mountAt("/welcome");
    await findScreen("UF-01.1");
    fireEvent.click(screen.getByRole("link", { name: "Get started" }));
    await findScreen("UF-01.2");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await findScreen("UF-01.3");
    expect(screen.getByRole("radio", { name: "Beginner" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await findScreen("UF-01.4");
    expect(targetRows()).toHaveLength(9);
  });

  it.each([false, true])(
    "T-0685 AC5 navigator.onLine=%s: AC1 holds and the screen makes no request",
    async (online) => {
      setOnline(online);
      mountAt("/welcome/level");
      await findScreen("UF-01.3");
      expectLineOnFreshScreen();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(supabaseFrom).not.toHaveBeenCalled();
    },
  );
});
