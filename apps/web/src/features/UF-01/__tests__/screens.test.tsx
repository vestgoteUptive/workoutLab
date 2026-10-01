// T-0301b AC-1..AC-7 (UF-01.1, UF-01.2, UF-01.3, UF-01.4 placeholder): the nested `/welcome/*`
// views, the pending-plan record they write and the onboarding start time (D-0064 §1–§3, §6–§7,
// D-0097 §1, D-0098).
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
vi.mock("../../../lib/auth/client.js", async () => (await import("./client-mock.js")).clientMock());

const { KEY, findScreen, mountAt, progressText, screenId, settle, stored, where } =
  await import("./harness.js");

const DAY = 86_400_000;
let now = 0;

function setNow(ms: number) {
  now = ms;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockClear();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  setNow(0);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function radios(groupName: RegExp | string) {
  const group = screen.getByRole("radiogroup", { name: groupName });
  return within(group).getAllByRole("radio") as HTMLInputElement[];
}

function checkedName(groupName: RegExp | string): string | undefined {
  return radios(groupName)
    .filter((r) => r.checked)
    .map((r) => r.value)[0];
}

const RECORD_AC5 = {
  version: 1,
  goal: "get_stronger",
  level: "advanced",
  equipmentProfile: "dumbbells",
  rhythmMin: 3,
  rhythmMax: 4,
  startedAtMs: null,
  timingMs: null,
  planShown: false,
  savedAtMs: 5_000_000,
};

describe("AC-1 UF-01.1 Welcome (principle 5)", () => {
  it("renders on the first commit with fetch never resolving: name, h1, both links", () => {
    mountAt("/welcome");
    // Synchronous: UF-01.1 is in the splat's first chunk and waits on nothing.
    const root = document.querySelector('[data-screen-id="UF-01.1"]') as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.textContent).toContain("workout LAB");
    expect(within(root).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(root.querySelectorAll("h1")).toHaveLength(1);
    expect(within(root).getByRole("link", { name: "Get started" })).toHaveAttribute(
      "href",
      "/welcome/goal",
    );
    expect(within(root).getByRole("link", { name: "I already have an account" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(document.body.textContent).not.toContain("[APP NAME]");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the illustration is decorative", () => {
    mountAt("/welcome");
    const svg = document.querySelector('[data-screen-id="UF-01.1"] svg');
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("Get started leads to UF-01.2", async () => {
    mountAt("/welcome");
    fireEvent.click(screen.getByRole("link", { name: "Get started" }));
    await findScreen("UF-01.2");
    expect(where.current).toBe("/welcome/goal");
  });

  it("I already have an account leads to /account", async () => {
    mountAt("/welcome");
    fireEvent.click(screen.getByRole("link", { name: "I already have an account" }));
    await findScreen("UF-01.5");
    expect(where.current).toBe("/account");
  });
});

describe("AC-2 sub-path screen ids (D-0097 §1)", () => {
  it.each([
    ["/welcome", "UF-01.1"],
    ["/welcome/goal", "UF-01.2"],
    ["/welcome/level", "UF-01.3"],
    ["/welcome/schedule", "UF-01.4"],
    ["/welcome/save", "UF-01.1"],
    ["/welcome/xyz", "UF-01.1"],
  ])("%s renders %s and stays put", async (path, id) => {
    mountAt(path);
    await findScreen(id);
    await settle();
    expect(screenId()).toBe(id);
    expect(document.querySelectorAll("[data-screen-id]")).toHaveLength(1);
    expect(where.current).toBe(path);
  });

  // T-0301d replaced T-0301b's heading-only placeholder with the designed UF-01.4
  // (`schedule.test.tsx` covers it in full).
  it("UF-01.4 is the designed screen: one h1, the four steppers, Back and Save my plan", async () => {
    mountAt("/welcome/schedule");
    const root = await findScreen("UF-01.4");
    expect(within(root).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(root).getAllByRole("button")).toHaveLength(4);
    expect(within(root).getByRole("link", { name: "Back" })).toHaveAttribute(
      "href",
      "/welcome/level",
    );
    expect(within(root).getByRole("link", { name: "Save my plan" })).toBeInTheDocument();
    expect(progressText()).toBe("3/3");
  });
});

describe("AC-3 UF-01.2 Goal (D-0064 §1–§2)", () => {
  it("one radiogroup, 3 goals in enum order, Build muscle checked, no Lose fat, 1/3", async () => {
    mountAt("/welcome/goal");
    await findScreen("UF-01.2");
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    const list = within(screen.getByRole("radiogroup")).getAllByRole("radio") as HTMLInputElement[];
    expect(list).toHaveLength(3);
    expect(list.map((r) => r.value)).toEqual(["build_muscle", "get_stronger", "general_fitness"]);
    // The accessible names, in that same order.
    expect([
      screen.getByRole("radio", { name: "Build muscle" }),
      screen.getByRole("radio", { name: "Get stronger" }),
      screen.getByRole("radio", { name: "General fitness" }),
    ]).toEqual(list);
    expect(list.map((r) => r.checked)).toEqual([true, false, false]);
    expect(screen.getByRole("radio", { name: "Build muscle" })).toBeChecked();
    expect(document.body.textContent).not.toContain("Lose fat");
    expect(progressText()).toBe("1/3");
  });

  it("Back goes to /welcome (UF-01.1)", async () => {
    mountAt("/welcome/goal");
    await findScreen("UF-01.2");
    const back = screen.getByRole("link", { name: "Back" });
    expect(back).toHaveAttribute("href", "/welcome");
    fireEvent.click(back);
    await findScreen("UF-01.1");
    expect(where.current).toBe("/welcome");
  });

  it("Continue goes to /welcome/level (UF-01.3)", async () => {
    mountAt("/welcome/goal");
    await findScreen("UF-01.2");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await findScreen("UF-01.3");
    expect(where.current).toBe("/welcome/level");
  });
});

describe("AC-4 UF-01.3 Level & equipment (D-0061 §3, D-0064 §2–§3)", () => {
  it("level and equipment groups with their defaults, 2/3", async () => {
    mountAt("/welcome/level");
    await findScreen("UF-01.3");
    expect(screen.getAllByRole("radiogroup")).toHaveLength(2);
    const level = radios("Training experience");
    expect(level.map((r) => r.labels?.[0]?.textContent)).toEqual([
      "Beginner",
      "Intermediate",
      "Advanced",
    ]);
    expect(level.map((r) => r.checked)).toEqual([true, false, false]);
    const equipment = radios("Where do you train?");
    expect(equipment.map((r) => r.labels?.[0]?.textContent)).toEqual([
      "Bodyweight",
      "Dumbbells",
      "Full gym",
    ]);
    expect(equipment.map((r) => r.checked)).toEqual([false, false, true]);
    expect(screen.getByRole("radio", { name: "Beginner" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Full gym" })).toBeChecked();
    expect(progressText()).toBe("2/3");
  });

  it("Back goes to /welcome/goal (UF-01.2)", async () => {
    mountAt("/welcome/level");
    await findScreen("UF-01.3");
    const back = screen.getByRole("link", { name: "Back" });
    expect(back).toHaveAttribute("href", "/welcome/goal");
    fireEvent.click(back);
    await findScreen("UF-01.2");
    expect(where.current).toBe("/welcome/goal");
  });

  it("Continue goes to /welcome/schedule (UF-01.4)", async () => {
    mountAt("/welcome/level");
    await findScreen("UF-01.3");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await findScreen("UF-01.4");
    expect(where.current).toBe("/welcome/schedule");
  });

  it("the level hint follows the checked level", async () => {
    mountAt("/welcome/level");
    await findScreen("UF-01.3");
    expect(document.body.textContent).toContain("Under 6 months.");
    fireEvent.click(screen.getByRole("radio", { name: "Advanced" }));
    expect(document.body.textContent).toContain("2+ years.");
    expect(document.body.textContent).not.toContain("Under 6 months.");
  });
});

describe("AC-5 the record is written (D-0064 §6, D-0098)", () => {
  it("the picked answers, with startedAtMs null when UF-01.1 was never visited", async () => {
    setNow(5_000_000);
    mountAt("/welcome/goal");
    await findScreen("UF-01.2");
    expect(stored()).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Get stronger" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await findScreen("UF-01.3");
    fireEvent.click(screen.getByRole("radio", { name: "Advanced" }));
    fireEvent.click(screen.getByRole("radio", { name: "Dumbbells" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await findScreen("UF-01.4");
    // UF-01.4 showed its plan, so the record is now saveable (D-0098, T-0301d AC-3).
    expect(stored()).toEqual({ ...RECORD_AC5, planShown: true });
  });

  it("each radio change rewrites the key and savedAtMs", async () => {
    setNow(1_000);
    mountAt("/welcome/goal");
    await findScreen("UF-01.2");
    fireEvent.click(screen.getByRole("radio", { name: "Get stronger" }));
    expect(stored()).toMatchObject({ goal: "get_stronger", savedAtMs: 1_000 });
    setNow(2_000);
    fireEvent.click(screen.getByRole("radio", { name: "General fitness" }));
    expect(stored()).toMatchObject({ goal: "general_fitness", savedAtMs: 2_000 });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await findScreen("UF-01.3");
    setNow(3_000);
    fireEvent.click(screen.getByRole("radio", { name: "Intermediate" }));
    expect(stored()).toMatchObject({ level: "intermediate", savedAtMs: 3_000 });
    setNow(4_000);
    fireEvent.click(screen.getByRole("radio", { name: "Bodyweight" }));
    expect(stored()).toMatchObject({
      goal: "general_fitness",
      level: "intermediate",
      equipmentProfile: "bodyweight",
      savedAtMs: 4_000,
    });
  });

  it("no radio change, no write: mounting UF-01.2 and UF-01.3 alone leaves the key absent", async () => {
    mountAt("/welcome/goal");
    await findScreen("UF-01.2");
    await settle();
    expect(stored()).toBeNull();
  });

  it("Continue with the untouched defaults writes them", async () => {
    setNow(7_000);
    mountAt("/welcome/goal");
    await findScreen("UF-01.2");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await findScreen("UF-01.3");
    expect(stored()).toEqual({
      ...RECORD_AC5,
      goal: "build_muscle",
      level: "beginner",
      equipmentProfile: "full-gym",
      savedAtMs: 7_000,
    });
    setNow(8_000);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await findScreen("UF-01.4");
    expect(stored()).toEqual({
      ...RECORD_AC5,
      goal: "build_muscle",
      level: "beginner",
      equipmentProfile: "full-gym",
      planShown: true,
      savedAtMs: 8_000,
    });
  });
});

describe("AC-6 restore and expiry (D-0064 §6)", () => {
  const NOW = 100 * DAY;

  it("a record exactly 24 h old preselects its answers on UF-01.2 and UF-01.3", async () => {
    setNow(NOW);
    window.localStorage.setItem(KEY, JSON.stringify({ ...RECORD_AC5, savedAtMs: NOW - DAY }));
    const first = mountAt("/welcome/goal");
    await findScreen("UF-01.2");
    expect(checkedName(/main goal/)).toBe("get_stronger");
    first.unmount();
    mountAt("/welcome/level");
    await findScreen("UF-01.3");
    expect(checkedName("Training experience")).toBe("advanced");
    expect(checkedName("Where do you train?")).toBe("dumbbells");
  });

  it("a record 24 h + 1 ms old is removed and the defaults show", async () => {
    setNow(NOW);
    window.localStorage.setItem(KEY, JSON.stringify({ ...RECORD_AC5, savedAtMs: NOW - DAY - 1 }));
    const first = mountAt("/welcome/goal");
    await findScreen("UF-01.2");
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(checkedName(/main goal/)).toBe("build_muscle");
    first.unmount();
    mountAt("/welcome/level");
    await findScreen("UF-01.3");
    expect(checkedName("Training experience")).toBe("beginner");
    expect(checkedName("Where do you train?")).toBe("full-gym");
  });
});

describe("AC-7 start time (D-0064 §7)", () => {
  it("the first UF-01.1 commit sets startedAtMs, planShown false", () => {
    setNow(1_000_000);
    mountAt("/welcome");
    expect(stored()).toEqual({
      version: 1,
      goal: "build_muscle",
      level: "beginner",
      equipmentProfile: "full-gym",
      rhythmMin: 3,
      rhythmMax: 4,
      startedAtMs: 1_000_000,
      timingMs: null,
      planShown: false,
      savedAtMs: 1_000_000,
    });
  });

  it("Back to UF-01.1 later keeps the first startedAtMs", async () => {
    setNow(1_000_000);
    mountAt("/welcome");
    fireEvent.click(screen.getByRole("link", { name: "Get started" }));
    await findScreen("UF-01.2");
    setNow(1_010_000);
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await findScreen("UF-01.1");
    await settle();
    expect(stored()).toMatchObject({ startedAtMs: 1_000_000, savedAtMs: 1_000_000 });
  });

  it("an expired record restarts the clock", () => {
    setNow(2_000_000);
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ ...RECORD_AC5, startedAtMs: 10, savedAtMs: 2_000_000 - DAY - 1 }),
    );
    mountAt("/welcome");
    expect(stored()).toMatchObject({
      startedAtMs: 2_000_000,
      goal: "build_muscle",
      planShown: false,
    });
  });

  it("a record created on UF-01.2 (startedAtMs null) gets it at the first UF-01.1 commit", async () => {
    setNow(3_000_000);
    const view = mountAt("/welcome/goal");
    await findScreen("UF-01.2");
    fireEvent.click(screen.getByRole("radio", { name: "Get stronger" }));
    expect(stored()).toMatchObject({ startedAtMs: null });
    view.unmount();

    setNow(3_050_000);
    mountAt("/welcome");
    await act(async () => {});
    expect(stored()).toMatchObject({ startedAtMs: 3_050_000, goal: "get_stronger" });

    setNow(3_090_000);
    fireEvent.click(screen.getByRole("link", { name: "Get started" }));
    await findScreen("UF-01.2");
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await findScreen("UF-01.1");
    expect(stored()).toMatchObject({ startedAtMs: 3_050_000 });
  });
});
