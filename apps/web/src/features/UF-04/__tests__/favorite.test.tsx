// T-0568 UF-04.1 "Favorite" tag and UF-04.2 toggle (D-0202 §8, §9). Real Dexie; only the
// network helpers are stubbed, and the stubs write the caches as the real ones do after a confirm.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { createSelectSpy } from "../../../lib/offline/__tests__/select-spy.js";
import { NOW, TZ, USER, seedSpy } from "./l1plus.js";

const h = vi.hoisted(() => ({
  fav: undefined as undefined | ((u: string, id: string) => Promise<void>),
  unfav: undefined as undefined | ((u: string, id: string) => Promise<void>),
  exclude: undefined as undefined | ((u: string, id: string) => Promise<void>),
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
  };
});
vi.mock("../../../lib/offline/favorites.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/offline/favorites.js")>();
  return {
    ...real,
    refreshFavorites: vi.fn(async () => undefined),
    favoriteExercise: vi.fn(async (u: string, id: string) => h.fav?.(u, id)),
    unfavoriteExercise: vi.fn(async (u: string, id: string) => h.unfav?.(u, id)),
  };
});

const fv = await import("../../../lib/offline/favorites.js");
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

const row = (id: string) => ({
  key: userScopedKey(USER, id),
  userId: USER,
  exerciseId: id,
  createdAt: "2026-09-01T10:00:00Z",
});
const putFav = (id: string) => offlineDb().favoriteCache.put(row(id));
const putExcl = (id: string) => offlineDb().excludedCache.put(row(id));

beforeEach(async () => {
  freshOfflineDb();
  signIn(USER);
  setOnline(true);
  spy.reset();
  seedSpy(spy);
  await refreshAll(NOW, TZ);
  h.fav = async (_u, id) => {
    await putFav(id);
    await offlineDb().excludedCache.delete(userScopedKey(USER, id));
  };
  h.unfav = async (_u, id) => {
    await offlineDb().favoriteCache.delete(userScopedKey(USER, id));
  };
  h.exclude = async (_u, id) => {
    await putExcl(id);
    await offlineDb().favoriteCache.delete(userScopedKey(USER, id));
  };
  vi.mocked(fv.favoriteExercise).mockClear();
  vi.mocked(fv.unfavoriteExercise).mockClear();
});
afterEach(() => {
  cleanup();
  signOut();
});

const favTags = () => [...document.querySelectorAll('[data-field="favorite"]')];
const toggle = async () => {
  const b = await screen.findByRole("button", { name: "Favorite Back squat" });
  await waitFor(() => expect(b).not.toHaveAttribute("aria-disabled"));
  return b;
};

describe("AC1 toggle on", () => {
  it("one favorite write, pressed, and the UF-04.1 row shows the tag", async () => {
    const view = await mountAt("/library/back-squat");
    const b = await toggle();
    expect(b).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(b);
    await waitFor(() => expect(b).toHaveAttribute("aria-pressed", "true"));
    expect(fv.favoriteExercise).toHaveBeenCalledTimes(1);
    expect(fv.favoriteExercise).toHaveBeenCalledWith(USER, "back-squat");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    view.unmount();
    await mountAt("/library");
    await waitFor(() => expect(favTags()).toHaveLength(1));
    expect(favTags()[0]!.closest("li")).toHaveTextContent(/Back squat.*favorite/i);
  });
});

describe("AC2 toggle off", () => {
  it("one unfavorite write, unpressed, no tag on UF-04.1", async () => {
    await putFav("back-squat");
    const view = await mountAt("/library/back-squat");
    const b = await toggle();
    await waitFor(() => expect(b).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(b);
    await waitFor(() => expect(b).toHaveAttribute("aria-pressed", "false"));
    expect(fv.unfavoriteExercise).toHaveBeenCalledTimes(1);
    expect(fv.unfavoriteExercise).toHaveBeenCalledWith(USER, "back-squat");
    view.unmount();
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    expect(favTags()).toHaveLength(0);
  });
});

describe("AC3 excluded to favorite", () => {
  it("moves it, drops the tag, shows Don't suggest this and the move line", async () => {
    await putExcl("back-squat");
    const view = await mountAt("/library/back-squat");
    fireEvent.click(await toggle());
    await screen.findByRole("button", { name: /^Don't suggest this/ });
    expect(screen.getByRole("button", { name: "Favorite Back squat" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByText("Not suggested")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Back squat is a favorite and will be suggested again.",
    );
    view.unmount();
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    expect(document.querySelectorAll('[data-field="not-suggested"]')).toHaveLength(0);
  });
});

describe("AC4 favorite to excluded", () => {
  it("excludes, unpresses the toggle and shows the move line", async () => {
    await putFav("bench-press");
    await mountAt("/library/bench-press");
    const b = await screen.findByRole("button", { name: "Favorite Bench press" });
    await waitFor(() => expect(b).toHaveAttribute("aria-pressed", "true"));
    const d = await screen.findByRole("button", { name: /^Don't suggest this/ });
    await waitFor(() => expect(d).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(d);
    await screen.findByRole("button", { name: /^Suggest again/ });
    await waitFor(() => expect(b).toHaveAttribute("aria-pressed", "false"));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Bench press won't be suggested. Removed from favorites.",
    );
  });
});

describe("AC5 offline and back", () => {
  it("is aria-disabled with the description, ignores taps, re-enables on online", async () => {
    await putFav("back-squat");
    setOnline(false);
    await mountAt("/library/back-squat");
    const b = await screen.findByRole("button", { name: "Favorite Back squat" });
    // The cache has answered (pressed state shows offline), so only offline keeps it disabled.
    await waitFor(() => expect(b).toHaveAttribute("aria-pressed", "true"));
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(b).toHaveAccessibleDescription("Connect to change favorites");
    fireEvent.click(b);
    expect(fv.favoriteExercise).not.toHaveBeenCalled();
    setOnline(true);
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(b).not.toHaveAttribute("aria-disabled"));
    expect(b).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText("Connect to change favorites")).not.toBeInTheDocument();
  });
});

describe("AC6 write failure", () => {
  it("keeps aria-pressed false, shows the alert and re-enables the toggle", async () => {
    h.fav = async () => {
      throw new Error("server");
    };
    await mountAt("/library/back-squat");
    const b = await toggle();
    fireEvent.click(b);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
    expect(b).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(b).not.toHaveAttribute("aria-disabled"));
  });
});

describe("AC7 both caches", () => {
  it("shows Not suggested and no Favorite tag", async () => {
    await putFav("back-squat");
    await putExcl("back-squat");
    await mountAt("/library");
    await waitFor(() =>
      expect(document.querySelectorAll('[data-field="not-suggested"]')).toHaveLength(1),
    );
    expect(favTags()).toHaveLength(0);
  });
});

describe("zero favorites and warm-ups", () => {
  it("no tag with an empty cache", async () => {
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    expect(favTags()).toHaveLength(0);
  });
});

describe("axe", () => {
  for (const pressed of [false, true]) {
    it(`UF-04.2 has no violations with the toggle ${pressed ? "pressed" : "unpressed"}`, async () => {
      if (pressed) await putFav("back-squat");
      await mountAt("/library/back-squat");
      const b = await toggle();
      await waitFor(() => expect(b).toHaveAttribute("aria-pressed", String(pressed)));
      const r = await axe.run(document.querySelector("[data-screen-id]")!, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(r.violations.map((v) => v.id)).toEqual([]);
    });
  }
});
