// T-0633 UF-11.4 "Bar and plates" section (D-0217 §1, D-0218): bar weight input and plate
// checkboxes on Account settings, saved online to `profiles.bar_kg` / `plates_kg`.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { en } from "../../../lib/i18n/en.js";
import { AccountSettings } from "../index.js";
import { NOW, profileF } from "./fixtures.js";
import { TEST_USER, createFromSpy, freshDb, seedCache, signIn, signOut } from "./test-helpers.js";

const a = en.uf11.account.barPlates;

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

type Axe = { run: (ctx: Element, opts: object) => Promise<{ violations: { id: string }[] }> };
let axe: Axe;
beforeAll(async () => {
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
  const mod = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
  axe = mod.default ?? mod;
});

const KNOWN = ["25 kg", "20 kg", "15 kg", "10 kg", "5 kg", "2.5 kg", "1.25 kg", "0.5 kg"];

async function mountWith(barbell?: { barKg: number; platesKg: number[] }) {
  const db = freshDb();
  await seedCache(db, { profile: profileF({}) });
  if (barbell) await db.profileCache.update(TEST_USER, { barbell });
  const view = mount();
  await screen.findByRole("group", { name: a.legend });
  return { db, view };
}

const group = () => screen.getByRole("group", { name: a.legend });
const bar = () => screen.getByRole("textbox", { name: a.barLabel }) as HTMLInputElement;
const plate = (n: string) => within(group()).getByRole("checkbox", { name: n }) as HTMLInputElement;
const plateNames = () =>
  within(group())
    .getAllByRole("checkbox")
    .map((c) => c.closest("label")!.textContent);
const checkedNames = () =>
  within(group())
    .getAllByRole("checkbox")
    .filter((c) => (c as HTMLInputElement).checked)
    .map((c) => c.closest("label")!.textContent);
const save = () =>
  within(section()).getByRole("button", { name: /^Save bar and plates$|^Saving bar and plates$/ });
const section = () => group().closest("section")!;
const type = (v: string) => act(async () => void fireEvent.change(bar(), { target: { value: v } }));
const profileUpdates = () =>
  spy.calls.filter((c) => c.table === "profiles" && c.method === "update");

describe("T-0633 AC1 pre-fill", () => {
  it("shows the cached bar and plates, with an unknown size between its neighbours", async () => {
    await mountWith({ barKg: 15, platesKg: [20, 10, 0.75] });
    expect(bar().value).toBe("15");
    expect(checkedNames()).toEqual(["20 kg", "10 kg", "0.75 kg"]);
    expect(plateNames()).toEqual([
      "25 kg",
      "20 kg",
      "15 kg",
      "10 kg",
      "5 kg",
      "2.5 kg",
      "1.25 kg",
      "0.75 kg",
      "0.5 kg",
    ]);
    expect(plate("0.75 kg").checked).toBe(true);
    expect(bar()).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByText(a.hint)).toBeInTheDocument();
  });
});

describe("T-0633 AC2 defaults", () => {
  it("a cached profile without a barbell reads 20 and the default plates", async () => {
    await mountWith();
    expect(bar().value).toBe("20");
    expect(plateNames()).toEqual(KNOWN);
    expect(checkedNames()).toEqual(KNOWN.slice(0, 7));
    expect(plate("0.5 kg").checked).toBe(false);
  });
});

describe("T-0633 AC3 save", () => {
  it("types 17,5, unticks 25 kg, saves once, shows Saving then Saved, refreshes once", async () => {
    await mountWith();
    const gate = deferred<void>();
    refreshAllMock.mockReturnValueOnce(gate.promise);
    await type("17,5");
    await act(async () => fireEvent.click(plate("25 kg")));
    expect(save()).not.toHaveAttribute("aria-disabled", "true");
    await act(async () => fireEvent.click(save()));
    await waitFor(() => expect(save()).toHaveTextContent("Saving"));
    expect(save()).toHaveAttribute("aria-disabled", "true");
    // a second tap while in flight does not send a second write
    await act(async () => fireEvent.click(save()));
    expect(profileUpdates()).toHaveLength(1);
    await act(async () => gate.resolve());
    await waitFor(() => expect(section()).toHaveTextContent(a.saved));
    expect(save()).toHaveTextContent("Save");
    expect(profileUpdates()).toHaveLength(1);
    expect(profileUpdates()[0]!.payload).toEqual({
      bar_kg: 17.5,
      plates_kg: [20, 15, 10, 5, 2.5, 1.25],
    });
    expect(profileUpdates()[0]!.filters).toEqual([
      { op: "eq", column: "user_id", value: TEST_USER },
    ]);
    expect(refreshAllMock).toHaveBeenCalledTimes(1);
    expect(save()).toHaveAttribute("aria-disabled", "true");
  });

  it("two taps in the same tick send one write", async () => {
    await mountWith();
    await type("17");
    const button = save();
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await waitFor(() => expect(section()).toHaveTextContent(a.saved));
    expect(profileUpdates()).toHaveLength(1);
  });

  it("plates go out largest first whatever order they were ticked in", async () => {
    await mountWith();
    await act(async () => fireEvent.click(plate("25 kg")));
    await act(async () => fireEvent.click(plate("25 kg")));
    await act(async () => fireEvent.click(plate("0.5 kg")));
    await act(async () => fireEvent.click(plate("5 kg")));
    await act(async () => fireEvent.click(plate("5 kg")));
    await act(async () => fireEvent.click(save()));
    await waitFor(() => expect(profileUpdates()).toHaveLength(1));
    expect(profileUpdates()[0]!.payload).toEqual({
      bar_kg: 20,
      plates_kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5],
    });
  });

  it("a failed re-read still shows Saved", async () => {
    await mountWith();
    refreshAllMock.mockRejectedValueOnce(new Error("offline"));
    await type("18");
    await act(async () => fireEvent.click(save()));
    await waitFor(() => expect(section()).toHaveTextContent(a.saved));
  });
});

describe("T-0633 AC4 unknown size kept", () => {
  it("saving after changing only the bar sends the stored plates", async () => {
    await mountWith({ barKg: 15, platesKg: [20, 10, 0.75] });
    await type("16");
    await act(async () => fireEvent.click(save()));
    await waitFor(() => expect(profileUpdates()).toHaveLength(1));
    expect(profileUpdates()[0]!.payload).toEqual({ bar_kg: 16, plates_kg: [20, 10, 0.75] });
  });

  it("an unticked unknown size is dropped but its box stays", async () => {
    await mountWith({ barKg: 15, platesKg: [20, 10, 0.75] });
    await act(async () => fireEvent.click(plate("0.75 kg")));
    expect(plate("0.75 kg").checked).toBe(false);
    await act(async () => fireEvent.click(save()));
    await waitFor(() => expect(profileUpdates()).toHaveLength(1));
    expect(profileUpdates()[0]!.payload).toEqual({ bar_kg: 15, plates_kg: [20, 10] });
  });
});

describe("T-0633 AC5 validation", () => {
  it.each(["51", "-1", "abc", "", "20.555"])("%j is invalid", async (value) => {
    await mountWith();
    await type(value);
    expect(save()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(a.barInvalid)).toBeInTheDocument();
    expect(bar()).toHaveAttribute("aria-invalid", "true");
    expect(bar().getAttribute("aria-describedby")).toBe(screen.getByText(a.barInvalid).id);
    await act(async () => fireEvent.click(save()));
    expect(profileUpdates()).toHaveLength(0);
  });

  it.each(["0", "50", "17.25", "17,25"])("%j is valid", async (value) => {
    await mountWith();
    await type(value);
    expect(screen.queryByText(a.barInvalid)).toBeNull();
    expect(bar()).not.toHaveAttribute("aria-invalid");
    expect(save()).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("T-0633 AC6 unchanged", () => {
  it("Save is disabled when equal to stored; changing and changing back disables it again", async () => {
    await mountWith({ barKg: 15, platesKg: [20, 10] });
    expect(save()).toHaveAttribute("aria-disabled", "true");
    await type("16");
    expect(save()).not.toHaveAttribute("aria-disabled", "true");
    await type("15");
    expect(save()).toHaveAttribute("aria-disabled", "true");
    await act(async () => fireEvent.click(plate("5 kg")));
    expect(save()).not.toHaveAttribute("aria-disabled", "true");
    await act(async () => fireEvent.click(plate("5 kg")));
    expect(save()).toHaveAttribute("aria-disabled", "true");
    await act(async () => fireEvent.click(save()));
    expect(profileUpdates()).toHaveLength(0);
  });
});

describe("T-0633 AC7 failure", () => {
  it.each(["reject", "error"] as const)(
    "a %s shows the message, keeps the edits, and a second Save retries",
    async (mode) => {
      await mountWith();
      await type("17");
      await act(async () => fireEvent.click(plate("1.25 kg")));
      spy.failOn("profiles", mode);
      await act(async () => fireEvent.click(save()));
      await waitFor(() => expect(section()).toHaveTextContent(a.saveFailed));
      expect(bar().value).toBe("17");
      expect(plate("1.25 kg").checked).toBe(false);
      expect(refreshAllMock).not.toHaveBeenCalled();
      await act(async () => fireEvent.click(save()));
      await waitFor(() => expect(section()).toHaveTextContent(a.saved));
      expect(section()).not.toHaveTextContent(a.saveFailed);
      expect(profileUpdates()).toHaveLength(2);
      expect(profileUpdates()[1]!.payload).toEqual({
        bar_kg: 17,
        plates_kg: [25, 20, 15, 10, 5, 2.5],
      });
    },
  );
});

describe("T-0633 AC8 offline", () => {
  it("is readable, Save is disabled and described by Connect to save; going online enables it", async () => {
    setOnline(false);
    await mountWith({ barKg: 15, platesKg: [20, 10] });
    await type("16");
    expect(bar().value).toBe("16");
    expect(save()).toHaveAttribute("aria-disabled", "true");
    const hint = section().querySelector("#wl-barplates-offline")!;
    expect(hint.textContent).toBe(a.connectToSave);
    expect(save().getAttribute("aria-describedby")).toBe(hint.id);
    await act(async () => fireEvent.click(save()));
    expect(profileUpdates()).toHaveLength(0);
    await act(async () => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(save()).not.toHaveAttribute("aria-disabled", "true");
    expect(section().querySelector("#wl-barplates-offline")).toBeNull();
  });

  it("offline with an unchanged value stays disabled after going online", async () => {
    setOnline(false);
    await mountWith({ barKg: 15, platesKg: [20, 10] });
    await act(async () => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(save()).toHaveAttribute("aria-disabled", "true");
  });
});

describe("T-0633 AC9 cold cache", () => {
  it("with no cached profile it shows the notice and no Save or input", async () => {
    freshDb();
    mount();
    await screen.findByText(a.coldCache);
    expect(screen.queryByRole("group", { name: a.legend })).toBeNull();
    expect(screen.queryByRole("textbox", { name: a.barLabel })).toBeNull();
  });
});

describe("T-0633 AC10 a11y", () => {
  const axeIds = async (el: Element) =>
    (await axe.run(el, { rules: { "color-contrast": { enabled: false } } })).violations.map(
      (v) => v.id,
    );

  it("axe finds nothing valid or invalid; every box and the fieldset are named", async () => {
    await mountWith({ barKg: 15, platesKg: [20, 10, 0.75] });
    expect(await axeIds(section())).toEqual([]);
    for (const n of [...KNOWN, "0.75 kg"]) expect(plate(n)).toBeInTheDocument();
    expect(group()).toBeInTheDocument();
    await type("99");
    expect(screen.getByText(a.barInvalid)).toBeInTheDocument();
    expect(await axeIds(section())).toEqual([]);
  });

  it("the result line is a live region that is always in the DOM", async () => {
    await mountWith();
    const live = section().querySelector("[aria-live]")!;
    expect(live).not.toBeNull();
    expect(live.textContent).toBe("");
    expect(getComputedStyle(live).display).not.toBe("none");
    await type("17");
    await act(async () => fireEvent.click(save()));
    await waitFor(() => expect(live.textContent).toBe(a.saved));
    expect(getComputedStyle(live).display).not.toBe("none");
    expect(section().querySelector("[aria-live]")).toBe(live);
  });
});

describe("T-0633 layout", () => {
  it("sits directly under the equipment section", async () => {
    await mountWith();
    const equipment = screen.getByRole("group", { name: "Your equipment" }).closest("section")!;
    expect(equipment.nextElementSibling).toBe(section());
  });
});
