// T-0550 UF-11.4 Account settings rework (D-0203 §4, D-0195 §1). Mirrors account-settings.test's
// mocks; each test names the AC it covers.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AccountSettings } from "../index.js";
import { NOW, TZ } from "./fixtures.js";
import { profileF } from "./fixtures.js";
import {
  TEST_USER,
  createFromSpy,
  freshDb,
  seedCache,
  signIn,
  signOut as clearSession,
  useTimeZone,
} from "./test-helpers.js";

const account = vi.hoisted(() => ({
  exportAccountData: vi.fn(),
  downloadAccountExport: vi.fn(),
  deleteAccountAndSignOut: vi.fn(),
  wipeLocalUserData: vi.fn(),
  requestAccountDeletion: vi.fn(),
  signOutAndClearDevice: vi.fn(),
  hasUnsyncedWork: vi.fn(),
}));
vi.mock("../../../lib/account/index.js", () => account);
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

const spy = createFromSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => spy.from(table) },
  isSupabaseConfigured: () => true,
}));
vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return { ...actual, refreshAll: async () => undefined, refreshProfile: async () => undefined };
});

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}
function storeEmail(email: string | null) {
  window.localStorage.setItem(
    "sb-abc-auth-token",
    JSON.stringify({ access_token: "t", user: { id: TEST_USER, email } }),
  );
}
async function mount() {
  const r = render(
    <MemoryRouter initialEntries={["/plan", "/plan/account"]} initialIndex={1}>
      <Routes>
        <Route path="/plan/account" element={<AccountSettings now={() => NOW} />} />
        <Route path="/plan" element={<span data-testid="plan" />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => undefined);
  return r;
}
function follows(a: Node, b: Node): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}
function root(): HTMLElement {
  return document.querySelector('[data-screen-id="UF-11.4"]')!;
}

beforeEach(async () => {
  setOnline(true);
  useTimeZone(TZ);
  signIn();
  spy.reset();
  await seedCache(freshDb(), { profile: profileF({ equipment: ["none", "barbell", "bench"] }) });
  auth.value = { ...auth.value, status: "signed-in", userId: TEST_USER };
  Object.values(account).forEach((f) => f.mockReset());
  account.hasUnsyncedWork.mockResolvedValue(false);
});
afterEach(() => {
  cleanup();
  clearSession();
  vi.restoreAllMocks();
});

describe("T-0550 AC1 order and account card", () => {
  it("orders back link, h1, account card, equipment, data, delete; email and Sign out share a card", async () => {
    storeEmail("a@example.com");
    await mount();
    const back = screen.getByRole("link", { name: "Back to Plan" });
    const h1 = screen.getByRole("heading", { level: 1, name: "Account settings" });
    const email = screen.getByText("a@example.com");
    const signOut = screen.getByRole("button", { name: "Sign out" });
    const equipment = await screen.findByRole("group", { name: "Your equipment" });
    const data = screen.getByRole("heading", { level: 2, name: "Your data" });
    const del = screen.getByRole("heading", { level: 2, name: "Delete account" });
    expect(screen.getByRole("heading", { level: 2, name: "Signed in as" })).toBeInTheDocument();
    const order = [back, h1, email, signOut, equipment, data, del];
    for (let i = 0; i < order.length - 1; i++) expect(follows(order[i]!, order[i + 1]!)).toBe(true);
    expect(email.closest(".wl-card")).not.toBeNull();
    expect(email.closest(".wl-card")).toBe(signOut.closest(".wl-card"));
    expect(root().classList.contains("wl-page")).toBe(true);
  });

  it("no stored email: the card label is Account and there is no email line", async () => {
    storeEmail(null);
    await mount();
    expect(screen.getByRole("heading", { level: 2, name: "Account" })).toBeInTheDocument();
    expect(screen.queryByText("Signed in as")).toBeNull();
    expect(document.querySelector(".wl-account__email")).toBeNull();
  });

  it("unsynced: notice, focused Sign out anyway and Cancel render inside the same card", async () => {
    storeEmail("a@example.com");
    account.hasUnsyncedWork.mockResolvedValue(true);
    await mount();
    const card = screen.getByRole("button", { name: "Sign out" }).closest(".wl-card")!;
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign out" })));
    const anyway = screen.getByRole("button", { name: "Sign out anyway" });
    expect(card.contains(anyway)).toBe(true);
    expect(card.contains(screen.getByRole("button", { name: "Cancel" }))).toBe(true);
    expect(card.textContent).toMatch(/haven't synced/);
    expect(document.activeElement).toBe(anyway);
  });
});

describe("T-0550 AC2 back link", () => {
  it("is the first focusable element, named Back to Plan, shows Plan, links to /plan", async () => {
    await mount();
    const back = screen.getByRole("link", { name: "Back to Plan" });
    expect(back.getAttribute("href")).toBe("/plan");
    expect(back.textContent).toBe("Plan");
    expect(back.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    const focusable = root().querySelectorAll("a[href], button, input, select, textarea");
    expect(focusable[0]).toBe(back);
  });
});

describe("T-0550 AC3 equipment checkboxes", () => {
  it("renders nine C-03 checkboxes, a secondary Save, Save enabled after a toggle", async () => {
    storeEmail("a@example.com");
    await mount();
    const group = await screen.findByRole("group", { name: "Your equipment" });
    const boxes = group.querySelectorAll('label.wl-checkbox > input[type="checkbox"]');
    expect(boxes).toHaveLength(9);
    expect(group.querySelector(".wl-plan__radio")).toBeNull();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("checkbox", { name: "Dumbbell" }));
    expect(save).not.toHaveAttribute("aria-disabled", "true");
    // T-0613: Save is a secondary button (the screen has no primary); never the native attribute.
    expect(save).toHaveClass("wl-button--secondary");
    expect(save).not.toBeDisabled();
    expect(root().querySelectorAll(".wl-button--primary")).toHaveLength(0);
  });
});

describe("T-0550 AC4 offline captions", () => {
  it("offline: Sign out enabled; Save, Export, Delete disabled with described captions", async () => {
    setOnline(false);
    await mount();
    await screen.findByRole("group", { name: "Your equipment" });
    expect(screen.getByRole("button", { name: "Sign out" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    const cases: [string, string][] = [
      ["Save", "Connect to save"],
      ["Export my data", "Connect to export your data."],
      ["Delete account…", "Connect to delete your account."],
    ];
    for (const [name, caption] of cases) {
      const btn = screen.getByRole("button", { name });
      expect(btn).toHaveAttribute("aria-disabled", "true");
      const id = btn.getAttribute("aria-describedby")!;
      const el = document.getElementById(id)!;
      expect(el.textContent).toBe(caption);
      expect(btn.nextElementSibling).toBe(el);
    }
  });

  it("online: the three captions do not render", async () => {
    await mount();
    await screen.findByRole("group", { name: "Your equipment" });
    expect(screen.queryByText(/^Connect to/)).toBeNull();
    expect(screen.getByRole("button", { name: "Export my data" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: "Delete account…" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("T-0550 AC5 delete card", () => {
  it("is last, shows the caption; confirm is the secondary outline, never primary", async () => {
    await mount();
    const cards = [...root().querySelectorAll(".wl-card")];
    const last = cards[cards.length - 1]!;
    // T-0613: the legacy strong edge is gone; the delete card is marked by its own class.
    expect(last.classList.contains("wl-account__delete")).toBe(true);
    expect(last.querySelector("h2")?.textContent).toBe("Delete account");
    expect(cards.filter((c) => c.classList.contains("wl-account__delete"))).toHaveLength(1);
    expect(last.textContent).toContain("Permanently removes your account and all your data.");
    fireEvent.click(screen.getByRole("button", { name: "Delete account…" }));
    const input = screen.getByLabelText("Type delete to confirm") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.classList.contains("wl-input")).toBe(true);
    const confirm = screen.getByRole("button", { name: "Delete my account" });
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(input, { target: { value: "delete" } });
    expect(confirm).not.toHaveAttribute("aria-disabled", "true");
    expect(confirm.className).not.toMatch(/primary/);
    expect(follows(screen.getByText("Type delete to confirm"), input)).toBe(true);
  });
});

// T-0613 UF-11.4 in the Cobalt plan state.
const focusables = (el: Element) => [
  ...el.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea"),
];

describe("T-0613 AC1 state root", () => {
  it("is a plan state root with the page title role", async () => {
    storeEmail("a@example.com");
    await mount();
    expect(root()).toHaveAttribute("data-wl-state", "plan");
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("wl-title--stop");
    expect(screen.getByText("a@example.com")).toHaveClass("wl-type-row-title");
  });
});

describe("T-0613 AC2 unsynced paper panel", () => {
  it("queued sets: Sign out opens a .wl-paper panel with the confirm copy, focus on Sign out anyway", async () => {
    account.hasUnsyncedWork.mockResolvedValue(true);
    await mount();
    expect(root().querySelector(".wl-paper")).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign out" })));
    const panel = root().querySelector(".wl-paper")!;
    expect(panel).not.toBeNull();
    expect(panel.textContent).toMatch(/haven't synced/);
    const anyway = screen.getByRole("button", { name: "Sign out anyway" });
    expect(panel.contains(anyway)).toBe(true);
    // The paper action pill is not a primary or secondary; Cancel is a text button.
    expect(anyway).toHaveClass("wl-account__anyway");
    expect(anyway.className).not.toMatch(/wl-button--(primary|secondary)/);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("wl-button--text");
    expect(document.activeElement).toBe(anyway);
    expect(account.signOutAndClearDevice).not.toHaveBeenCalled();
  });

  it("empty queue: no panel, sign-out proceeds", async () => {
    account.hasUnsyncedWork.mockResolvedValue(false);
    account.signOutAndClearDevice.mockResolvedValue(undefined);
    await mount();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign out" })));
    expect(root().querySelector(".wl-paper")).toBeNull();
    expect(account.signOutAndClearDevice).toHaveBeenCalledTimes(1);
  });

  it("Cancel closes the panel and returns focus to Sign out", async () => {
    account.hasUnsyncedWork.mockResolvedValue(true);
    await mount();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign out" })));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(root().querySelector(".wl-paper")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Sign out" }));
  });
});

describe("T-0613 AC3 delete panel", () => {
  async function openPanel() {
    await mount();
    await screen.findByRole("group", { name: "Your equipment" });
    fireEvent.click(screen.getByRole("button", { name: "Delete account…" }));
    return screen.getByRole("button", { name: "Delete my account" });
  }

  it("Delete my account is the secondary outline, never primary; typed word enables it; Cancel is the last focusable control", async () => {
    const confirm = await openPanel();
    expect(confirm).toHaveClass("wl-button--secondary");
    expect(confirm).not.toHaveClass("wl-button--primary");
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    expect(confirm).not.toBeDisabled();
    const all = focusables(root());
    expect(all[all.length - 1]).toBe(screen.getByRole("button", { name: "Cancel" }));
    expect(all[all.length - 1]).toHaveClass("wl-button--text");
    fireEvent.change(screen.getByLabelText("Type delete to confirm"), {
      target: { value: "delete" },
    });
    expect(confirm).not.toHaveAttribute("aria-disabled", "true");
  });

  it("the shared secondary form carries the authored 1.5px plan-ink outline", () => {
    // Chrome snaps the computed width to 1px at DPR 1, so the authored value is pinned here.
    const main = readFileSync(resolve(__dirname, "../../../main.css"), "utf8");
    const at = main.indexOf(":is([data-wl-state], .wl-paper) .wl-button--secondary,");
    const rule = main.slice(main.indexOf("{", at), main.indexOf("}", at));
    expect(rule).toContain("border: 1.5px solid var(--wl-ink)");
  });

  it("a click on the aria-disabled Delete my account does nothing", async () => {
    account.deleteAccountAndSignOut.mockResolvedValue("deleted");
    const confirm = await openPanel();
    fireEvent.click(confirm);
    await act(async () => undefined);
    expect(account.deleteAccountAndSignOut).not.toHaveBeenCalled();
    // Typed but offline: still nothing.
    fireEvent.change(screen.getByLabelText("Type delete to confirm"), {
      target: { value: "delete" },
    });
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(confirm);
    await act(async () => undefined);
    expect(account.deleteAccountAndSignOut).not.toHaveBeenCalled();
  });

  it("offline the opener is unavailable with the existing line; online it opens", async () => {
    setOnline(false);
    await mount();
    const open = screen.getByRole("button", { name: "Delete account…" });
    expect(open).toHaveAttribute("aria-disabled", "true");
    expect(open).toHaveAccessibleDescription(/Connect to/);
    fireEvent.click(open);
    expect(screen.queryByLabelText("Type delete to confirm")).toBeNull();
    cleanup();
    setOnline(true);
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Delete account…" }));
    expect(screen.getByLabelText("Type delete to confirm")).toBeInTheDocument();
  });
});

describe("T-0613 AC5 aria-disabled controls ignore clicks", () => {
  it("Export offline and Save with no change do nothing", async () => {
    await mount();
    await screen.findByRole("group", { name: "Your equipment" });
    const save = screen.getByRole("button", { name: "Save" });
    fireEvent.click(save);
    await act(async () => undefined);
    expect(spy.from).not.toHaveBeenCalledWith("profiles");
    cleanup();
    setOnline(false);
    await mount();
    const exp = screen.getByRole("button", { name: "Export my data" });
    expect(exp).toHaveAttribute("aria-disabled", "true");
    expect(exp).not.toBeDisabled();
    fireEvent.click(exp);
    await act(async () => undefined);
    expect(account.exportAccountData).not.toHaveBeenCalled();
  });

  it("no migrated control carries the native disabled attribute", async () => {
    setOnline(false);
    await mount();
    expect(root().querySelectorAll("button[disabled]")).toHaveLength(0);
  });
});
