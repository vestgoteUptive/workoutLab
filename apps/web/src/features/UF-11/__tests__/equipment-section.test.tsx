// T-0216 UF-11.4 Equipment section: a checklist of the 9 real equipment items on Account
// settings, saved online to `profiles.equipment` ("none" always first).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { isEligible } from "@workoutlab/engine";
import type { LibraryExercise } from "@workoutlab/shared";
import { en } from "../../../lib/i18n/en.js";
import { loadProfile } from "../../../lib/offline/index.js";
import { AccountSettings } from "../index.js";
import { NOW, profileF } from "./fixtures.js";
import { TEST_USER, createFromSpy, freshDb, seedCache, signIn, signOut } from "./test-helpers.js";
import { CHECKLIST_LABELS, checkbox, equipmentGroup, saveButton } from "./equipment-helpers.js";

const a = en.uf11.account.equipment;

const auth = vi.hoisted(() => ({
  value: {
    status: "signed-in" as "signed-in" | "signed-out",
    userId: "11111111-1111-4111-8111-111111111111" as string | null,
    redirectTarget: "/welcome",
    signOut: vi.fn(async () => undefined),
  },
}));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => auth.value,
}));

const account = vi.hoisted(() => ({
  exportAccountData: vi.fn(),
  downloadAccountExport: vi.fn(),
  deleteAccountAndSignOut: vi.fn(),
  wipeLocalUserData: vi.fn(),
  requestAccountDeletion: vi.fn(),
}));
vi.mock("../../../lib/account/index.js", () => account);

const spy = createFromSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => spy.from(table) },
  isSupabaseConfigured: () => true,
}));

type RefreshAll = typeof import("../../../lib/offline/index.js").refreshAll;
type RefreshProfile = typeof import("../../../lib/offline/index.js").refreshProfile;
const refreshAllMock = vi.fn<RefreshAll>(async () => undefined);
const refreshProfileMock = vi.fn<RefreshProfile>(async () => undefined);
vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return {
    ...actual,
    refreshAll: (...args: Parameters<RefreshAll>) => refreshAllMock(...args),
    refreshProfile: (...args: Parameters<RefreshProfile>) => refreshProfileMock(...args),
  };
});

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

function mount() {
  return render(
    <MemoryRouter initialEntries={["/plan/account"]}>
      <AccountSettings now={() => NOW} />
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  setOnline(true);
  signIn();
  spy.reset();
  refreshAllMock.mockClear();
  refreshAllMock.mockResolvedValue(undefined);
  refreshProfileMock.mockClear();
  refreshProfileMock.mockResolvedValue(undefined);
  auth.value = {
    ...auth.value,
    status: "signed-in",
    userId: TEST_USER,
    signOut: vi.fn(async () => undefined),
  };
  Object.values(account).forEach((f) => f.mockReset());
});

afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

async function mountWithCache(equipment: string[]) {
  const db = freshDb();
  await seedCache(db, { profile: profileF({ equipment }) });
  const view = mount();
  await screen.findByRole("group", { name: a.legend });
  return { db, view };
}

describe("T-0216 AC-1 the section", () => {
  it("T-0216 AC-1 shows 9 checkboxes in order, checked from the cache; no none/Bodyweight box", async () => {
    await mountWithCache(["none", "dumbbell", "bench"]);
    const group = equipmentGroup();
    const boxes = group.querySelectorAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(9);
    for (const [i, label] of CHECKLIST_LABELS.entries()) {
      const input = boxes[i] as HTMLInputElement;
      const name = input.closest("label")?.textContent;
      expect(name).toBe(label);
    }
    expect(checkbox("Dumbbell").checked).toBe(true);
    expect(checkbox("Bench").checked).toBe(true);
    expect(checkbox("Barbell").checked).toBe(false);
    expect(screen.queryByRole("checkbox", { name: /none/i })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Bodyweight/i })).toBeNull();
  });

  it("T-0216 AC-1 red on main: with a stored email, sits after Signed in as and before Your data", async () => {
    window.localStorage.setItem(
      "sb-abc-auth-token",
      JSON.stringify({ access_token: "t", user: { id: TEST_USER, email: "u@test.local" } }),
    );
    await mountWithCache(["none"]);
    const h1 = screen.getByRole("heading", { level: 1 });
    const signedIn = screen.getByText("Signed in as");
    const group = equipmentGroup();
    const dataHeading = screen.getByRole("heading", { level: 2, name: "Your data" });
    const order = [h1, signedIn, group, dataHeading];
    for (let i = 0; i < order.length - 1; i++) {
      // Each element precedes the next in document order.
      expect(
        order[i]!.compareDocumentPosition(order[i + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("T-0529 AC-2 email and Sign out share a section, before Equipment, Your data, Delete", async () => {
    window.localStorage.setItem(
      "sb-abc-auth-token",
      JSON.stringify({ access_token: "t", user: { id: TEST_USER, email: "u@test.local" } }),
    );
    await mountWithCache(["none"]);
    const email = screen.getByText("u@test.local");
    const btn = screen.getByRole("button", { name: "Sign out" });
    const group = equipmentGroup();
    const data = screen.getByRole("heading", { level: 2, name: "Your data" });
    const del = screen.getByRole("heading", { level: 2, name: "Delete account" });
    expect(email.closest(".wl-card")).not.toBeNull();
    expect(email.closest(".wl-card")).toBe(btn.closest(".wl-card"));
    const order = [email, btn, group, data, del];
    for (let i = 0; i < order.length - 1; i++) {
      expect(
        order[i]!.compareDocumentPosition(order[i + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("T-0216 AC-1 with no stored email: the group follows the Sign out section after the h1", async () => {
    await mountWithCache(["none"]);
    const h1 = screen.getByRole("heading", { level: 1 });
    const host = h1.parentElement!;
    const children = Array.from(host.children);
    const h1Index = children.indexOf(h1);
    const group = equipmentGroup().closest(".wl-card")!;
    // T-0529 (D-0195 §4): the Sign out section now sits between the h1 and the group.
    const signOutSection = children[h1Index + 1]!;
    expect(signOutSection.querySelector("button")?.textContent).toBe("Sign out");
    expect(children[h1Index + 2]).toBe(group);
  });
});

describe("T-0216 AC-2 save writes the list", () => {
  it("T-0216 AC-2 ticks Barbell and Rack, unticks Bench, saves, refreshes, shows Saved", async () => {
    await mountWithCache(["none", "dumbbell", "bench"]);
    await act(async () => fireEvent.click(checkbox("Barbell")));
    await act(async () => fireEvent.click(checkbox("Rack")));
    await act(async () => fireEvent.click(checkbox("Bench")));
    expect(saveButton()).toBeEnabled();
    await act(async () => fireEvent.click(saveButton()));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(a.saved));
    const updates = spy.calls.filter((c) => c.table === "profiles" && c.method === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]!.payload).toEqual({ equipment: ["none", "dumbbell", "barbell", "rack"] });
    expect(updates[0]!.filters).toEqual([{ op: "eq", column: "user_id", value: TEST_USER }]);
    expect(refreshAllMock).toHaveBeenCalledTimes(1);
    expect(saveButton()).toBeDisabled();
  });
});

describe("T-0216 AC-3 both edges", () => {
  it("T-0216 AC-3 untick everything saves [none]", async () => {
    await mountWithCache(["none", "dumbbell"]);
    await act(async () => fireEvent.click(checkbox("Dumbbell")));
    await act(async () => fireEvent.click(saveButton()));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(a.saved));
    const update = spy.calls.find((c) => c.table === "profiles" && c.method === "update");
    expect(update!.payload).toEqual({ equipment: ["none"] });
  });

  it("T-0216 AC-3 tick all 9 from [none] saves the full D-0064 §3 array", async () => {
    await mountWithCache(["none"]);
    for (const label of CHECKLIST_LABELS) {
      await act(async () => fireEvent.click(checkbox(label)));
    }
    await act(async () => fireEvent.click(saveButton()));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(a.saved));
    const update = spy.calls.find((c) => c.table === "profiles" && c.method === "update");
    expect(update!.payload).toEqual({
      equipment: [
        "none",
        "dumbbell",
        "bench",
        "barbell",
        "rack",
        "cable",
        "machine",
        "pullup-bar",
        "kettlebell",
        "band",
      ],
    });
  });
});

describe("T-0216 AC-4 unknown items survive", () => {
  it("T-0216 AC-4 keeps a stored unknown item (trx), appended after the known ones", async () => {
    await mountWithCache(["none", "dumbbell", "trx"]);
    expect(equipmentGroup().querySelectorAll('input[type="checkbox"]')).toHaveLength(9);
    await act(async () => fireEvent.click(checkbox("Band")));
    await act(async () => fireEvent.click(saveButton()));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(a.saved));
    const update = spy.calls.find((c) => c.table === "profiles" && c.method === "update");
    expect(update!.payload).toEqual({ equipment: ["none", "dumbbell", "band", "trx"] });
  });
});

describe("T-0216 AC-5 Save enabled only when it can do something", () => {
  it("T-0216 AC-5 disabled initially, enabled after a change, disabled again after undoing it", async () => {
    await mountWithCache(["none", "dumbbell"]);
    expect(saveButton()).toBeDisabled();
    await act(async () => fireEvent.click(checkbox("Barbell")));
    expect(saveButton()).toBeEnabled();
    await act(async () => fireEvent.click(checkbox("Barbell")));
    expect(saveButton()).toBeDisabled();
  });

  it("T-0216 AC-5 offline: disabled with Connect to save even after a change; no supabase call", async () => {
    setOnline(false);
    await mountWithCache(["none", "dumbbell"]);
    expect(screen.getByText(a.connectToSave)).toBeInTheDocument();
    await act(async () => fireEvent.click(checkbox("Barbell")));
    expect(saveButton()).toBeDisabled();
    fireEvent.click(saveButton());
    expect(spy.calls).toHaveLength(0);
  });

  it("T-0216 AC-5 the online event enables it without a remount", async () => {
    setOnline(false);
    await mountWithCache(["none", "dumbbell"]);
    const button = saveButton();
    await act(async () => fireEvent.click(checkbox("Barbell")));
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(saveButton()).toBe(button);
    expect(saveButton()).toBeEnabled();
  });

  it("T-0216 AC-5 while a save is pending, a second click makes no second call", async () => {
    await mountWithCache(["none", "dumbbell"]);
    const d = deferred<{ error: null }>();
    const originalImpl = spy.from.getMockImplementation()!;
    spy.from.mockImplementation((table: string) => {
      if (table !== "profiles") return originalImpl(table);
      return {
        upsert: () => d.promise,
        update: () => ({
          eq: () => d.promise,
        }),
        insert: () => d.promise,
        delete: () => d.promise,
        select: () => d.promise,
      };
    });
    try {
      await act(async () => fireEvent.click(checkbox("Barbell")));
      const button = saveButton();
      fireEvent.click(button);
      fireEvent.click(button);
      await act(async () => d.resolve({ error: null }));
      expect(spy.from).toHaveBeenCalledTimes(1);
    } finally {
      spy.from.mockImplementation(originalImpl);
    }
  });
});

describe("T-0216 AC-6 failure", () => {
  it("T-0216 AC-6 a rejection shows the failure, keeps the draft, re-enables Save, retry succeeds", async () => {
    await mountWithCache(["none", "dumbbell"]);
    spy.failOn("profiles", "reject");
    await act(async () => fireEvent.click(checkbox("Barbell")));
    await act(async () => fireEvent.click(saveButton()));
    expect(await screen.findByRole("alert")).toHaveTextContent(a.saveFailed);
    expect(checkbox("Barbell").checked).toBe(true);
    expect(saveButton()).toBeEnabled();
    expect(refreshAllMock).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(saveButton()));
    const updates = spy.calls.filter((c) => c.table === "profiles" && c.method === "update");
    expect(updates).toHaveLength(2);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(a.saved));
  });

  it("T-0216 AC-6 a resolved {error} shows the same failure and refreshAll is not called", async () => {
    await mountWithCache(["none", "dumbbell"]);
    spy.failOn("profiles", "error");
    await act(async () => fireEvent.click(checkbox("Barbell")));
    await act(async () => fireEvent.click(saveButton()));
    expect(await screen.findByRole("alert")).toHaveTextContent(a.saveFailed);
    expect(refreshAllMock).not.toHaveBeenCalled();
  });
});

describe("T-0216 AC-7 the engine sees it (principle 3)", () => {
  const pushUp: LibraryExercise = {
    id: "push-up",
    name: "Push-up",
    kind: "exercise",
    type: "compound",
    level: "beginner",
    equipment: ["none"],
    areas: { chest: 1 },
    timed: false,
    incrementKg: 0,
    defaultDurationS: null,
    externalLoad: false,
  };
  const benchPress: LibraryExercise = {
    id: "bench-press",
    name: "Bench press",
    kind: "exercise",
    type: "compound",
    level: "beginner",
    equipment: ["barbell", "bench", "rack"],
    areas: { chest: 1 },
    timed: false,
    incrementKg: 2.5,
    defaultDurationS: null,
    externalLoad: true,
  };

  it("T-0216 AC-7 before save (full gym) accepts both; after saving [none] only push-up", async () => {
    const fullGym = [
      "none",
      "dumbbell",
      "bench",
      "barbell",
      "rack",
      "cable",
      "machine",
      "pullup-bar",
      "kettlebell",
      "band",
    ];
    const { db } = await mountWithCache(fullGym);
    const before = await loadProfile();
    expect(isEligible(pushUp, before!)).toBe(true);
    expect(isEligible(benchPress, before!)).toBe(true);

    refreshAllMock.mockImplementation(async () => {
      await db.profileCache.put({
        userId: TEST_USER,
        profile: { ...before!, equipment: ["none"] },
      });
    });

    for (const label of CHECKLIST_LABELS) {
      await act(async () => fireEvent.click(checkbox(label)));
    }
    await act(async () => fireEvent.click(saveButton()));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(a.saved));

    const after = await loadProfile();
    expect(after!.equipment).toEqual(["none"]);
    expect(isEligible(pushUp, after!)).toBe(true);
    expect(isEligible(benchPress, after!)).toBe(false);
  });
});

describe("T-0216 AC-8 cold cache", () => {
  it("T-0216 AC-8 offline with no cached profile: the cold-cache message, no checkboxes", async () => {
    setOnline(false);
    freshDb();
    const view = mount();
    expect(await screen.findByText(a.coldCache)).toBeInTheDocument();
    expect(view.container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });

  it("T-0216 AC-8 then online with refreshProfile filling the cache: the 9 checkboxes appear", async () => {
    const db = freshDb();
    setOnline(false);
    const view = mount();
    await screen.findByText(a.coldCache);
    refreshProfileMock.mockImplementation(async () => {
      await db.profileCache.put({
        userId: TEST_USER,
        profile: profileF({ equipment: ["none", "dumbbell"] }),
      });
    });
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    await screen.findByRole("group", { name: a.legend });
    expect(checkbox("Dumbbell").checked).toBe(true);
    void view;
  });

  it("T-0216 AC-8 a draft change before the refresh resolves is not overwritten", async () => {
    const db = freshDb();
    await seedCache(db, { profile: profileF({ equipment: ["none", "dumbbell"] }) });
    const d = deferred<void>();
    refreshProfileMock.mockReturnValue(d.promise);
    mount();
    await screen.findByRole("group", { name: a.legend });
    await act(async () => fireEvent.click(checkbox("Barbell")));
    expect(checkbox("Barbell").checked).toBe(true);
    await act(async () => {
      await db.profileCache.put({ userId: TEST_USER, profile: profileF({ equipment: ["none"] }) });
      d.resolve();
      await Promise.resolve();
    });
    // The user's in-progress tick must survive the refresh resolving underneath it.
    expect(checkbox("Barbell").checked).toBe(true);
    expect(checkbox("Dumbbell").checked).toBe(true);
  });
});
