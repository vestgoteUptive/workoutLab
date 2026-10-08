// T-0550 UF-11.4 Account settings rework (D-0203 §4, D-0195 §1). Mirrors account-settings.test's
// mocks; each test names the AC it covers.
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
  it("renders nine C-03 checkboxes, one primary button, Save enabled after a toggle", async () => {
    storeEmail("a@example.com");
    await mount();
    const group = await screen.findByRole("group", { name: "Your equipment" });
    const boxes = group.querySelectorAll('label.wl-checkbox > input[type="checkbox"]');
    expect(boxes).toHaveLength(9);
    expect(group.querySelector(".wl-plan__radio")).toBeNull();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Dumbbell" }));
    expect(save).toBeEnabled();
    expect(root().querySelectorAll(".wl-button--primary")).toHaveLength(1);
    expect(root().querySelector(".wl-button--primary")).toBe(save);
  });
});

describe("T-0550 AC4 offline captions", () => {
  it("offline: Sign out enabled; Save, Export, Delete disabled with described captions", async () => {
    setOnline(false);
    await mount();
    await screen.findByRole("group", { name: "Your equipment" });
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    const cases: [string, string][] = [
      ["Save", "Connect to save"],
      ["Export my data", "Connect to export your data."],
      ["Delete account…", "Connect to delete your account."],
    ];
    for (const [name, caption] of cases) {
      const btn = screen.getByRole("button", { name });
      expect(btn).toBeDisabled();
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
    expect(screen.getByRole("button", { name: "Export my data" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete account…" })).toBeEnabled();
  });
});

describe("T-0550 AC5 delete card", () => {
  it("is last, has the strong edge, shows the caption; confirm is never primary", async () => {
    await mount();
    const cards = [...root().querySelectorAll(".wl-card")];
    const last = cards[cards.length - 1]!;
    expect(last.classList.contains("wl-card--strong")).toBe(true);
    expect(last.querySelector("h2")?.textContent).toBe("Delete account");
    expect(cards.filter((c) => c.classList.contains("wl-card--strong"))).toHaveLength(1);
    expect(last.textContent).toContain("Permanently removes your account and all your data.");
    fireEvent.click(screen.getByRole("button", { name: "Delete account…" }));
    const input = screen.getByLabelText("Type delete to confirm") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.classList.contains("wl-input")).toBe(true);
    const confirm = screen.getByRole("button", { name: "Delete my account" });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: "delete" } });
    expect(confirm).toBeEnabled();
    expect(confirm.className).not.toMatch(/primary/);
    expect(follows(screen.getByText("Type delete to confirm"), input)).toBe(true);
  });
});
