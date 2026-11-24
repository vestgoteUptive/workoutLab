// T-1005 UF-11.4 "Learning from your edits" (D-0277, D-0281 §4). The real ledger, cache and
// edit-ledger-sync run over fake-indexeddb against the in-memory account fake of T-1008; only
// `supabase`, `useAuth` and `lib/account` are replaced.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { en } from "../../../lib/i18n/en.js";
import { AccountSettings } from "../index.js";
import { NOW } from "./fixtures.js";
import { TEST_USER, freshDb, signIn, signOut } from "./test-helpers.js";
import { createAccountFake } from "../../../lib/offline/__tests__/edit-signals-fake.js";

const h = vi.hoisted(() => ({ fake: null as unknown }));
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: {
    from: (t: string) => (h.fake as { from: (t: string) => unknown }).from(t),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  },
}));
vi.mock("../../../lib/account/index.js", () => ({
  exportAccountData: vi.fn(),
  downloadAccountExport: vi.fn(),
  deleteAccountAndSignOut: vi.fn(),
  hasUnsyncedWork: vi.fn(async () => false),
  signOutAndClearDevice: vi.fn(),
}));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    status: "signed-in",
    userId: "11111111-1111-4111-8111-111111111111",
    redirectTarget: "/welcome",
    signOut: vi.fn(),
  }),
}));

import * as ledger from "../../../lib/offline/edit-ledger.js";
import { offlineDb } from "../../../lib/offline/db.js";
import { refreshProfile } from "../../../lib/offline/history.js";

const l = en.uf11.account.learning;
const WAIT = { timeout: 5_000 };
let fake: ReturnType<typeof createAccountFake>;

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}
const toggle = () => screen.getByRole("checkbox", { name: l.toggle }) as HTMLInputElement;
const forget = () => screen.getByRole("button", { name: l.forget });
const status = () => within(toggle().closest("section")!).getByRole("status");
const writes = (table: string) =>
  fake.log.filter((r) => r.table === table && (r.op === "update" || r.op === "delete"));
const signalRow = (device: string) => ({
  id: `id-${device}`,
  user_id: TEST_USER,
  device_id: device,
  key: "swap:X:Y",
  kind: "swap",
  exercise_id: "X",
  to_exercise_id: "Y",
  count: 2,
  window_start: NOW.toISOString(),
  last_seen: NOW.toISOString(),
  asked_at: null,
});
async function swaps(n: number) {
  for (let i = 0; i < n; i++) await ledger.recordSwap("X", "Y", null, `v${i}`, NOW);
}

async function mount() {
  render(
    <MemoryRouter>
      <AccountSettings now={() => NOW} />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: l.heading });
  await waitFor(() => expect(toggle()).toBeTruthy());
}

beforeEach(async () => {
  setOnline(true);
  fake = createAccountFake();
  h.fake = fake;
  freshDb();
  signIn();
  await refreshProfile();
  fake.log.length = 0;
});
afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

describe("T-1005 UF-11.4 placement and copy", () => {
  it("sits between Your data and Delete account, with the account line as the toggle's description", async () => {
    await mount();
    const heads = screen.getAllByRole("heading", { level: 2 }).map((n) => n.textContent);
    const i = heads.indexOf(l.heading);
    expect(heads[i - 1]).toBe(en.uf11.account.dataHeading);
    expect(heads[i + 1]).toBe(en.uf11.account.deleteHeading);
    expect(screen.getByText(l.line)).toBeTruthy();
    expect(toggle().getAttribute("aria-describedby")).toContain(
      screen.getByText(l.line).getAttribute("id"),
    );
  });
});

describe("T-1005 AC1 on and off", () => {
  it("is on by default, off deletes the rows and clears the ledger, on writes true again", async () => {
    fake.rows.set("a", signalRow("dev-other"));
    await swaps(3);
    expect((await ledger.pending([], NOW)).length).toBe(1);
    await mount();
    expect(toggle().checked).toBe(true);
    fireEvent.click(toggle());
    await waitFor(() => expect(status().textContent).toBe(l.isOff), WAIT);
    expect(toggle().checked).toBe(false);
    expect(fake.profile.learn_from_edits).toBe(false);
    expect(fake.rows.size).toBe(0);
    expect(await ledger.entries()).toEqual([]);
    expect(await ledger.pending([], NOW)).toEqual([]);

    fireEvent.click(toggle());
    await waitFor(() => expect(status().textContent).toBe(l.isOn), WAIT);
    expect(toggle().checked).toBe(true);
    expect(fake.profile.learn_from_edits).toBe(true);
  });
});

describe("T-1005 AC2 offline and online", () => {
  it("offline: both aria-disabled with the caption, taps write and delete nothing", async () => {
    await mount();
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    await waitFor(() => expect(toggle().getAttribute("aria-disabled")).toBe("true"));
    expect(forget().getAttribute("aria-disabled")).toBe("true");
    const caption = screen.getByText(l.connect);
    expect(toggle().getAttribute("aria-describedby")).toContain(caption.id);
    expect(forget().getAttribute("aria-describedby")).toBe(caption.id);
    fake.log.length = 0;
    fireEvent.click(toggle());
    fireEvent.click(forget());
    await act(async () => undefined);
    expect(toggle().checked).toBe(true);
    expect(fake.log).toEqual([]);
    expect(status().textContent).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("online: neither is aria-disabled, no caption, and both work", async () => {
    await mount();
    expect(toggle().getAttribute("aria-disabled")).toBeNull();
    expect(forget().getAttribute("aria-disabled")).toBeNull();
    expect(screen.queryByText(l.connect)).toBeNull();
    fireEvent.click(forget());
    await waitFor(() => expect(status().textContent).toBe(l.counts), WAIT);
    fireEvent.click(toggle());
    await waitFor(() => expect(status().textContent).toBe(l.isOff), WAIT);
  });
});

describe("T-1005 AC3 forget", () => {
  it("clears the local ledger and every row, changes learn_reset_at, leaves the toggle", async () => {
    fake.rows.set("a", signalRow("dev-other"));
    fake.rows.set("b", { ...signalRow("dev-third"), key: "swap:P:Q" });
    await swaps(3);
    await mount();
    const before = fake.profile.learn_reset_at;
    fireEvent.click(forget());
    await waitFor(() => expect(status().textContent).toBe(l.counts), WAIT);
    expect(fake.rows.size).toBe(0);
    expect(await ledger.entries()).toEqual([]);
    expect(await offlineDb().editSignalsCache.count()).toBe(0);
    expect(fake.profile.learn_reset_at).not.toBe(before);
    expect(toggle().checked).toBe(true);
    expect(fake.profile.learn_from_edits).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("a failed row delete shows the alert and changes nothing else", async () => {
    fake.rows.set("a", signalRow("dev-other"));
    await swaps(3);
    await mount();
    const before = fake.profile.learn_reset_at;
    fake.state.failDeleteSignals = true;
    fireEvent.click(forget());
    expect((await screen.findByRole("alert")).textContent).toBe(l.saveFailed);
    expect(fake.rows.size).toBe(1);
    expect((await ledger.entries()).length).toBe(1);
    expect(fake.profile.learn_reset_at).toBe(before);
    expect(writes("profiles")).toEqual([]);
    expect(status().textContent).toBe("");
    expect(toggle().checked).toBe(true);
  });
});

describe("T-1005 AC4 write fails", () => {
  it("turning off: the toggle returns to on, the alert shows", async () => {
    await mount();
    fake.state.failProfileUpdate = true;
    fireEvent.click(toggle());
    expect((await screen.findByRole("alert")).textContent).toBe(l.saveFailed);
    await waitFor(() => expect(toggle().checked).toBe(true));
    expect(fake.profile.learn_from_edits).toBe(true);
    expect(status().textContent).toBe("");
  });
  it("turning on: the toggle returns to off, the alert shows", async () => {
    await mount();
    fireEvent.click(toggle());
    await waitFor(() => expect(status().textContent).toBe(l.isOff), WAIT);
    fake.state.failProfileUpdate = true;
    fireEvent.click(toggle());
    expect((await screen.findByRole("alert")).textContent).toBe(l.saveFailed);
    await waitFor(() => expect(toggle().checked).toBe(false));
    expect(fake.profile.learn_from_edits).toBe(false);
  });
  it("the alert clears on the next successful change", async () => {
    await mount();
    fake.state.failProfileUpdate = true;
    fireEvent.click(toggle());
    await screen.findByRole("alert");
    fake.state.failProfileUpdate = false;
    fireEvent.click(toggle());
    await waitFor(() => expect(status().textContent).toBe(l.isOff), WAIT);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("T-1005 AC5 plan untouched and changed-field-only writes", () => {
  it("off, on and forget send only the changed learning field and never touch the plan", async () => {
    await mount();
    const planChangedAt = fake.profile.plan_changed_at;
    const level = fake.profile.level;
    fireEvent.click(toggle());
    await waitFor(() => expect(status().textContent).toBe(l.isOff), WAIT);
    fireEvent.click(toggle());
    await waitFor(() => expect(status().textContent).toBe(l.isOn), WAIT);
    fireEvent.click(forget());
    await waitFor(() => expect(status().textContent).toBe(l.counts), WAIT);
    const bodies = writes("profiles").map((r) => Object.keys(r.body as object));
    expect(bodies).toEqual([["learn_from_edits"], ["learn_from_edits"], ["learn_reset_at"]]);
    expect(
      writes("profiles").map((r) => (r.body as Record<string, unknown>).learn_from_edits),
    ).toEqual([false, true, undefined]);
    expect(fake.profile.plan_changed_at).toBe(planChangedAt);
    expect(fake.profile.level).toBe(level);
    expect(fake.log.some((r) => r.op === "upsert")).toBe(false);
  });
});

describe("T-1005 AC6 accessibility", () => {
  it("native checkbox, the state in words, and busy while a write runs", async () => {
    await mount();
    expect(toggle().tagName).toBe("INPUT");
    expect(toggle().type).toBe("checkbox");
    expect(within(toggle().closest("section")!).getByText(l.on)).toBeTruthy();
    let release!: () => void;
    fake.state.hold = null;
    const gate = new Promise<void>((r) => (release = r));
    const realFrom = fake.from;
    h.fake = {
      ...fake,
      from: (t: string) => {
        const q = realFrom(t) as Record<string, unknown>;
        if (t !== "profiles") return q;
        return {
          ...q,
          update: (b: unknown) => {
            const u = (q.update as (x: unknown) => { eq: () => unknown })(b);
            return {
              eq: () => {
                const e = u.eq() as { select: () => { single: () => Promise<unknown> } };
                return {
                  select: () => ({ single: async () => (await gate, e.select().single()) }),
                  then: (res: (v: unknown) => unknown) => gate.then(() => res({ error: null })),
                };
              },
            };
          },
        };
      },
    };
    fireEvent.click(toggle());
    await waitFor(() => expect(toggle().getAttribute("aria-disabled")).toBe("true"));
    expect(toggle().closest("[aria-busy]")?.getAttribute("aria-busy")).toBe("true");
    expect(forget().getAttribute("aria-disabled")).toBe("true");
    release();
    await waitFor(() => expect(status().textContent).toBe(l.isOff), WAIT);
    expect(within(toggle().closest("section")!).getByText(l.off)).toBeTruthy();
    expect(toggle().checked).toBe(false);
  });
});
