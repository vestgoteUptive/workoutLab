// T-0541 UF-04.1 "Not suggested" tag and UF-04.2 "Don't suggest this" / "Suggest again"
// (D-0199 §10). Real Dexie for the caches; only the network helpers in lib/offline/excluded are
// replaced, and the stubs write the cache the way the real ones do after the server confirms.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createSelectSpy } from "../../../lib/offline/__tests__/select-spy.js";
import { NOW, TZ, USER, seedSpy } from "./l1plus.js";

const h = vi.hoisted(() => ({
  exclude: undefined as undefined | ((u: string, id: string) => Promise<void>),
  include: undefined as undefined | ((u: string, id: string) => Promise<void>),
}));
const spy = createSelectSpy();
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: spy.from } }));
vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));
vi.mock("../../../lib/offline/excluded.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/offline/excluded.js")>();
  return {
    ...real,
    refreshExcluded: vi.fn(async () => undefined),
    excludeExercise: vi.fn(async (u: string, id: string) => h.exclude?.(u, id)),
    includeExercise: vi.fn(async (u: string, id: string) => h.include?.(u, id)),
  };
});

const ex = await import("../../../lib/offline/excluded.js");
const { refreshAll } = await import("../../../lib/offline/history.js");
const { offlineDb, userScopedKey } = await import("../../../lib/offline/db.js");
const { freshOfflineDb, signIn, signOut } =
  await import("../../../lib/offline/__tests__/test-helpers.js");
const { mountAt, setOnline, rowNames } = await import("./harness.js");

interface Axe {
  run: (ctx: Element, opts: object) => Promise<{ violations: { id: string }[] }>;
}
let axe: Axe;
beforeAll(async () => {
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
  const loaded = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
  axe = loaded.default ?? loaded;
});

async function store(id: string): Promise<void> {
  await offlineDb().excludedCache.put({
    key: userScopedKey(USER, id),
    userId: USER,
    exerciseId: id,
    createdAt: "2026-09-01T10:00:00Z",
  });
}

beforeEach(async () => {
  freshOfflineDb();
  signIn(USER);
  setOnline(true);
  spy.reset();
  seedSpy(spy);
  await refreshAll(NOW, TZ);
  h.exclude = async (u, id) => {
    await store(id);
    void u;
  };
  h.include = async (u, id) => {
    await offlineDb().excludedCache.delete(userScopedKey(u, id));
  };
  vi.mocked(ex.excludeExercise).mockClear();
  vi.mocked(ex.includeExercise).mockClear();
});
afterEach(() => {
  cleanup();
  signOut();
});

const tags = () => [...document.querySelectorAll('[data-field="not-suggested"]')];
const dontSuggest = () => screen.findByRole("button", { name: /^Don't suggest this/ });
const suggestAgain = () => screen.findByRole("button", { name: /^Suggest again/ });
/** The button, once the cache read has answered and it is enabled. */
async function ready(find: typeof dontSuggest): Promise<HTMLElement> {
  const b = await find();
  await waitFor(() => expect(b).not.toHaveAttribute("aria-disabled"));
  return b;
}

describe("AC1 exclude", () => {
  it("calls excludeExercise once, swaps the state, and tags the UF-04.1 row", async () => {
    const view = await mountAt("/library/back-squat");
    fireEvent.click(await ready(dontSuggest));
    await suggestAgain();
    expect(ex.excludeExercise).toHaveBeenCalledTimes(1);
    expect(ex.excludeExercise).toHaveBeenCalledWith(USER, "back-squat");
    expect(screen.getByText("Not suggested")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Don't suggest/ })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Back squat won't be suggested");
    view.unmount();

    await mountAt("/library");
    await waitFor(() => expect(tags()).toHaveLength(1));
    const row = tags()[0]!.closest("li")!;
    expect(within(row).getByText("Back squat")).toBeInTheDocument();
    expect(row).toHaveTextContent(/Back squat.*not suggested/i);
  });

  it("an empty stored list leaves every library row without a tag", async () => {
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    expect(tags()).toHaveLength(0);
    expect(screen.queryByText("Not suggested")).not.toBeInTheDocument();
  });
});

describe("AC2 include", () => {
  it("calls includeExercise, shows Don't suggest this, and the tag is gone", async () => {
    await store("back-squat");
    const view = await mountAt("/library/back-squat");
    fireEvent.click(await ready(suggestAgain));
    await dontSuggest();
    expect(ex.includeExercise).toHaveBeenCalledWith(USER, "back-squat");
    expect(screen.queryByText("Not suggested")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Back squat will be suggested again");
    view.unmount();
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    expect(tags()).toHaveLength(0);
  });
});

describe("AC3 offline", () => {
  it("shows state from the cache, disables the button, re-enables on online", async () => {
    await store("back-squat");
    setOnline(false);
    const view = await mountAt("/library/back-squat");
    const button = await suggestAgain();
    expect(screen.getByText("Not suggested")).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("Connect to change excluded exercises");
    fireEvent.click(button);
    expect(ex.includeExercise).not.toHaveBeenCalled();

    await act(async () => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(button).not.toHaveAttribute("aria-disabled"));
    expect(screen.queryByText("Connect to change excluded exercises")).not.toBeInTheDocument();
    view.unmount();

    setOnline(false);
    await mountAt("/library");
    await waitFor(() => expect(tags()).toHaveLength(1));
  });
});

describe("AC4 failure", () => {
  it("shows a role=alert, keeps the state and re-enables the button", async () => {
    h.exclude = () => Promise.reject(new Error("server"));
    await mountAt("/library/back-squat");
    fireEvent.click(await ready(dontSuggest));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't save. Try again.");
    const button = await dontSuggest();
    expect(button).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByText("Not suggested")).not.toBeInTheDocument();
  });
});

describe("AC5 text tag, warm-up, axe", () => {
  it("the tag's text is 'Not suggested' and the row reads 'name, not suggested'", async () => {
    await store("back-squat");
    await mountAt("/library");
    await waitFor(() => expect(tags()).toHaveLength(1));
    expect(tags()[0]!.textContent).toBe("Not suggested");
    expect(tags()[0]!.closest("a")!.textContent).toContain("Back squat, not suggested");
  });

  it("a warm-up has no Don't suggest this button", async () => {
    await mountAt("/library/wu-leg-swing");
    await waitFor(() => expect(window.location.pathname).toBe("/library"));
    expect(screen.queryByRole("button", { name: /Don't suggest/ })).not.toBeInTheDocument();
  });

  it.each(["/library", "/library/back-squat"])(
    "%s with an excluded row has no axe violations",
    async (path) => {
      await store("back-squat");
      await mountAt(path);
      if (path === "/library") await waitFor(() => expect(tags()).toHaveLength(1));
      else await suggestAgain();
      const results = await axe.run(document.querySelector("[data-screen-id]")!, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results.violations.map((v) => v.id)).toEqual([]);
    },
  );
});
