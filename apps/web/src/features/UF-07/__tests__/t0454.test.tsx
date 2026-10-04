// T-0454 UF-07.1 (D-0164 §3-§4): unreadable cache, empty library, focus in the delete dialog.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { offlineDb } from "../../../lib/offline/db.js";
import { R, renderEditor, seed } from "./harness.js";
import { offline, setOnline } from "./spies.js";

vi.mock("../../../lib/auth/auth-context.js", async () => (await import("./spies.js")).mockedAuth());
vi.mock("../../../lib/auth/client.js", async () => (await import("./spies.js")).mockedClient());
vi.mock("../../../lib/offline/index.js", async (importActual) =>
  (await import("./spies.js")).mockedOffline(importActual),
);

const button = (name: string) => screen.getByRole("button", { name });
const pause = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const loc = () => screen.getByTestId("location").textContent;
const ALERT = "Couldn't read your routines on this device.";
const LIB_EMPTY =
  "The exercise library isn't on this device yet. Go online, then open this screen again.";

beforeEach(() => seed());

describe("AC-1 unreadable cache", () => {
  for (const online of [true, false]) {
    it(`first read throws (${online ? "online" : "offline"}): alert and link, no form`, async () => {
      offline.throwRoutines = true;
      setOnline(online);
      renderEditor(`/plan/routines/${R}`);
      expect(await screen.findByRole("alert")).toHaveTextContent(ALERT);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Edit routine");
      expect(screen.getByRole("link", { name: "Back to Plan" })).toHaveAttribute("href", "/plan");
      expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
      expect(screen.queryByLabelText("Name")).toBeNull();
      fireEvent.click(screen.getByRole("link", { name: "Back to Plan" }));
      expect(loc()).toBe("/plan");
    });
  }

  it("after the refresh: second read throws, same state, no redirect", async () => {
    await seed({ routines: false });
    offline.refreshRoutines = vi.fn(async () => {
      offline.throwRoutines = true;
    });
    renderEditor(`/plan/routines/${R}`);
    expect(await screen.findByRole("alert")).toHaveTextContent(ALERT);
    await pause();
    expect(loc()).toBe(`/plan/routines/${R}`);
  });

  it("pair: a read with R renders the form and no alert", async () => {
    renderEditor(`/plan/routines/${R}`);
    await screen.findByLabelText("Name");
    await pause();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("pair: a read without R redirects to /plan, no alert", async () => {
    await seed({ routines: false });
    renderEditor(`/plan/routines/${R}`);
    await waitFor(() => expect(loc()).toBe("/plan"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("AC-2 /new ignores a throwing routines read", () => {
  it("renders the form with no alert", async () => {
    offline.throwRoutines = true;
    renderEditor("/plan/routines/new");
    await screen.findByLabelText("Name");
    await pause();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("AC-3 empty library", () => {
  async function openPicker() {
    renderEditor("/plan/routines/new");
    await screen.findByLabelText("Name");
    await waitFor(() => expect(offline.loadLibraryCalls).toBeGreaterThan(0));
    await pause();
    fireEvent.click(button("Add exercise"));
  }

  it("an empty cache: own copy, kept while searching", async () => {
    await offlineDb().libraryCache.clear();
    await openPicker();
    expect(await screen.findByText(LIB_EMPTY)).toBeInTheDocument();
    expect(screen.queryByText(/No exercises match/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Search exercises"), { target: { value: "squat" } });
    expect(screen.getByText(LIB_EMPTY)).toBeInTheDocument();
    expect(screen.queryByText(/No exercises match/)).toBeNull();
  });

  it("a throwing loader: same copy", async () => {
    offline.throwLibrary = true;
    await openPicker();
    expect(await screen.findByText(LIB_EMPTY)).toBeInTheDocument();
  });

  it("only warm-ups: same copy", async () => {
    const db = offlineDb();
    const rows = await db.libraryCache.toArray();
    await db.libraryCache.clear();
    await db.libraryCache.bulkPut(rows.filter((r) => r.exercise.kind === "warmup"));
    await openPicker();
    expect(await screen.findByText(LIB_EMPTY)).toBeInTheDocument();
  });

  it("pair: seeded library, search zzz reads No exercises match", async () => {
    await openPicker();
    fireEvent.change(await screen.findByLabelText("Search exercises"), {
      target: { value: "zzz" },
    });
    expect(screen.getByText('No exercises match "zzz"')).toBeInTheDocument();
    expect(screen.queryByText(LIB_EMPTY)).toBeNull();
  });
});

const tab = (shift = false) =>
  fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: shift });
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const goOffline = () => {
  setOnline(false);
  act(() => {
    window.dispatchEvent(new Event("offline"));
  });
};
const goOnline = () => {
  setOnline(true);
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
};

async function openDialog() {
  renderEditor(`/plan/routines/${R}`);
  await screen.findByText(/^1\. /);
  fireEvent.click(button("Delete routine"));
}

describe("AC-4 offline with focus on Delete", () => {
  it("focus moves to Keep routine; Tab and Shift+Tab stay; back online Delete is reachable", async () => {
    await openDialog();
    tab();
    expect(document.activeElement).toBe(button("Delete"));
    goOffline();
    const keep = button("Keep routine");
    expect(button("Delete")).toBeDisabled();
    expect(document.activeElement).toBe(keep);
    tab();
    expect(document.activeElement).toBe(keep);
    tab(true);
    expect(document.activeElement).toBe(keep);
    goOnline();
    tab();
    expect(document.activeElement).toBe(button("Delete"));
  });

  it("pair: focus already on Keep routine stays there", async () => {
    await openDialog();
    expect(document.activeElement).toBe(button("Keep routine"));
    goOffline();
    expect(document.activeElement).toBe(button("Keep routine"));
  });
});

describe("AC-5 Tab from no button", () => {
  it("online: Shift+Tab -> last (Keep routine), Tab -> first (Delete)", async () => {
    await openDialog();
    expect(dialog()).toHaveAttribute("tabindex", "-1");
    dialog().focus();
    tab(true);
    expect(document.activeElement).toBe(button("Keep routine"));
    dialog().focus();
    tab();
    expect(document.activeElement).toBe(button("Delete"));
  });

  it("offline: both land on Keep routine", async () => {
    await openDialog();
    goOffline();
    dialog().focus();
    tab(true);
    expect(document.activeElement).toBe(button("Keep routine"));
    dialog().focus();
    tab();
    expect(document.activeElement).toBe(button("Keep routine"));
  });
});
