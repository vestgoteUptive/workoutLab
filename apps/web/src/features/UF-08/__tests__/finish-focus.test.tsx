// T-0386 AC5-AC8 (UF-08.1, D-0115 §5, WCAG 2.4.3): focus order around the finish-time input.
// Opening moves focus into "Finish by"; a conversion that closes it returns focus to
// "Set a finish time"; a rejected or partial value keeps focus in the input; mount moves none.
// `fireEvent.click` never moves focus in jsdom, so every focus change seen here is the host's.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { fitLine, minutes, renderSetup, serveCache, setOnline, settle } from "./harness.js";

const auth = vi.hoisted(() => ({ status: "signed-in" as "signed-in" | "stale" | "signed-out" }));
vi.mock("../../../lib/auth/auth-context.js", () => ({ useAuth: () => ({ status: auth.status }) }));
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
  auth.status = "signed-in";
  vi.clearAllMocks();
  setOnline(false);
  serveCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const setFinish = () => screen.getByRole("button", { name: "Set a finish time" });
const finishInput = () => screen.getByLabelText("Finish by");

async function loaded(): Promise<void> {
  await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits: /));
}

describe("AC5 opening the finish-time input", () => {
  it("activating 'Set a finish time' focuses the input labelled 'Finish by'", async () => {
    renderSetup();
    await loaded();
    const opener = setFinish();
    opener.focus();
    expect(document.activeElement).toBe(opener);
    fireEvent.click(opener);
    expect(opener).not.toBeInTheDocument();
    expect(document.activeElement).toBe(finishInput());
  });

  it("contrast: while closed, the input doesn't exist and focus isn't moved to it", async () => {
    renderSetup();
    await loaded();
    expect(screen.queryByLabelText("Finish by")).toBeNull();
    expect(document.activeElement).not.toBe(setFinish());
  });
});

describe("AC6 a valid conversion closes the input", () => {
  it("13:07 at 12:00: the input is gone and focus is on 'Set a finish time'", async () => {
    renderSetup();
    await loaded();
    fireEvent.click(setFinish());
    expect(document.activeElement).toBe(finishInput());
    fireEvent.change(finishInput(), { target: { value: "13:07" } });
    expect(minutes()).toBe("67");
    expect(screen.queryByLabelText("Finish by")).toBeNull();
    expect(document.activeElement).toBe(setFinish());
    expect(document.activeElement).not.toBe(document.body);
  });

  it("re-opening after a conversion focuses the new input again", async () => {
    renderSetup();
    await loaded();
    fireEvent.click(setFinish());
    fireEvent.change(finishInput(), { target: { value: "13:07" } });
    fireEvent.click(setFinish());
    expect(document.activeElement).toBe(finishInput());
  });
});

describe("AC7 a rejected or partial value keeps focus in the input", () => {
  it.each([
    ["11:00", "rejected"],
    ["12:00", "rejected"],
    ["1", "partial"],
    ["13:", "partial"],
  ])("%s (%s): the input stays open and focused", async (value) => {
    renderSetup();
    await loaded();
    fireEvent.click(setFinish());
    fireEvent.change(finishInput(), { target: { value } });
    await settle();
    expect(minutes()).toBe("45");
    expect(document.activeElement).toBe(finishInput());
    expect(screen.queryByRole("button", { name: "Set a finish time" })).toBeNull();
  });

  it("a rejected value, then a valid one: focus goes to 'Set a finish time' only on the valid one", async () => {
    renderSetup();
    await loaded();
    fireEvent.click(setFinish());
    fireEvent.change(finishInput(), { target: { value: "11:00" } });
    expect(document.activeElement).toBe(finishInput());
    fireEvent.change(finishInput(), { target: { value: "13:00" } });
    expect(document.activeElement).toBe(setFinish());
  });
});

describe("AC8 the effect runs on open and close only", () => {
  it("a fresh mount moves no focus, at the first commit and after the data lands", async () => {
    renderSetup();
    expect(document.activeElement).toBe(document.body);
    expect(document.activeElement).not.toBe(setFinish());
    expect(screen.queryByLabelText("Finish by")).toBeNull();
    await loaded();
    await settle();
    expect(document.activeElement).toBe(document.body);
  });

  it("an unrelated re-render while open doesn't pull focus back into the input", async () => {
    renderSetup();
    await loaded();
    fireEvent.click(setFinish());
    const chip = screen.getByRole("button", { name: "30 minutes" });
    chip.focus();
    fireEvent.click(chip);
    await settle();
    expect(minutes()).toBe("30");
    expect(document.activeElement).toBe(chip);
  });

  it("an unrelated re-render while closed doesn't move focus to 'Set a finish time'", async () => {
    renderSetup();
    await loaded();
    const more = screen.getByRole("button", { name: "5 minutes more" });
    more.focus();
    fireEvent.click(more);
    await settle();
    expect(minutes()).toBe("50");
    expect(document.activeElement).toBe(more);
  });
});
