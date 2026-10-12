// T-0640 (D-0217 §1; UF-04.1): the "In plan", "Variant" and "Beginner" row tags.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { createSelectSpy } from "../../../lib/offline/__tests__/select-spy.js";
import { NOW, TZ, USER, seedSpy } from "./l1plus.js";

type Axe = { run: (ctx: Element, opts: object) => Promise<{ violations: { id: string }[] }> };
let axe: Axe;
beforeAll(async () => {
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
  const mod = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
  axe = mod.default ?? mod;
});

const spy = createSelectSpy();
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: spy.from } }));
vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));

const { refreshAll } = await import("../../../lib/offline/history.js");
const { offlineDb, userScopedKey } = await import("../../../lib/offline/db.js");
const { freshOfflineDb, signIn, signOut } =
  await import("../../../lib/offline/__tests__/test-helpers.js");
const { mountAt, rowNames, setOnline } = await import("./harness.js");

async function seed(routineIds: string[] | null, variants?: Array<[string, string]>) {
  spy.reset();
  seedSpy(spy, variants === undefined ? {} : { variants });
  await refreshAll(NOW, TZ);
  if (routineIds !== null)
    await offlineDb().routineCache.put({
      key: userScopedKey(USER, "r1"),
      userId: USER,
      id: "r1",
      name: "Legs",
      updatedAt: "2026-10-01T10:00:00Z",
      items: routineIds.map((exerciseId, position) => ({ position, exerciseId })),
    });
  spy.reset();
}
const stored = (id: string) => ({
  key: userScopedKey(USER, id),
  userId: USER,
  exerciseId: id,
  createdAt: "2026-09-01T10:00:00Z",
});

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  setOnline(false);
});
afterEach(() => {
  cleanup();
  signOut();
});

/** The tag text of the row named `name`, or null. */
function tagOf(name: string): string | null {
  const link = screen.getByRole("link", { name: new RegExp(`^${name}`) });
  return link.querySelector(".wl-uf04-browse__tag")?.textContent ?? null;
}
const ready = async () => waitFor(() => expect(rowNames()).toHaveLength(24));

describe("UF-04.1 plan tags", () => {
  it("AC1 + AC2 + AC3 + AC6: In plan, Variant, Beginner, none; offline, no network call", async () => {
    await seed(
      ["back-squat", "leg-press"],
      [
        ["back-squat", "leg-press"],
        ["back-squat", "goblet-squat"],
      ],
    );
    await mountAt("/library");
    await ready();
    await waitFor(() => expect(tagOf("Back squat")).toBe("In plan"));
    expect(screen.getByRole("link", { name: /^Back squat/ })).toHaveAccessibleName(
      /, in your routines/,
    );
    // Both in a routine and a variant: In plan wins.
    expect(tagOf("Leg press")).toBe("In plan");
    // Goblet squat is a variant of a routine exercise (and beginner): Variant wins.
    expect(tagOf("Goblet squat")).toBe("Variant");
    expect(screen.getByRole("link", { name: /^Goblet squat/ })).toHaveAccessibleName(
      /, variant of an exercise in your routines/,
    );
    // Beginner with nothing else; intermediate with nothing else: no tag.
    expect(tagOf("Bench press")).toBe("Beginner");
    expect(screen.getByRole("link", { name: /^Bench press/ })).toHaveAccessibleName(
      /, beginner level/,
    );
    expect(tagOf("Pull-up")).toBeNull();
    expect(spy.calls).toEqual([]);
  });

  it("AC3 a beginner exercise in no routine and no variant shows Beginner", async () => {
    await seed(["back-squat"], [["back-squat", "leg-press"]]);
    await mountAt("/library");
    await ready();
    await waitFor(() => expect(tagOf("Back squat")).toBe("In plan"));
    expect(tagOf("Goblet squat")).toBe("Beginner");
    expect(tagOf("Leg press")).toBe("Variant");
  });

  it("AC4 an excluded exercise in a routine shows only Not suggested", async () => {
    await seed(["back-squat"]);
    await offlineDb().excludedCache.put(stored("back-squat"));
    await mountAt("/library");
    await ready();
    await waitFor(() => expect(tagOf("Back squat")).toBe("Not suggested"));
    // Let the plan read settle, then re-check: still one tag.
    await waitFor(() => expect(tagOf("Goblet squat")).not.toBeNull());
    const link = screen.getByRole("link", { name: /^Back squat/ });
    expect(link.querySelectorAll(".wl-uf04-browse__tag")).toHaveLength(1);
    expect(tagOf("Back squat")).toBe("Not suggested");
  });

  it("AC4 a favorite beginner exercise shows only Favorite", async () => {
    await seed(null);
    await offlineDb().favoriteCache.put(stored("goblet-squat"));
    await mountAt("/library");
    await ready();
    await waitFor(() => expect(tagOf("Goblet squat")).toBe("Favorite"));
    const link = screen.getByRole("link", { name: /^Goblet squat/ });
    expect(link.querySelectorAll(".wl-uf04-browse__tag")).toHaveLength(1);
  });

  it("AC5 with no cached routines there is no In plan or Variant, and Beginner still shows", async () => {
    await seed(null);
    await mountAt("/library");
    await ready();
    await waitFor(() => expect(tagOf("Goblet squat")).toBe("Beginner"));
    expect(screen.queryByText("In plan")).not.toBeInTheDocument();
    expect(screen.queryByText("Variant")).not.toBeInTheDocument();
  });

  it("AC7 a cold cache shows the download line and no tag", async () => {
    await mountAt("/library");
    await screen.findByText(/downloads the first time you're online/);
    expect(document.querySelector(".wl-uf04-browse__tag")).toBeNull();
  });

  it("AC9 all five tags present: axe finds nothing and no tag is focusable", async () => {
    await seed(["back-squat"], [["back-squat", "leg-press"]]);
    await offlineDb().excludedCache.put(stored("hip-thrust"));
    await offlineDb().favoriteCache.put(stored("leg-curl"));
    await mountAt("/library");
    await ready();
    await waitFor(() => expect(tagOf("Back squat")).toBe("In plan"));
    await waitFor(() => expect(tagOf("Hip thrust")).toBe("Not suggested"));
    await waitFor(() => expect(tagOf("Leg curl")).toBe("Favorite"));
    const texts = new Set(
      [...document.querySelectorAll(".wl-uf04-browse__tag")].map((t) => t.textContent),
    );
    expect([...texts].sort()).toEqual(
      ["Beginner", "Favorite", "In plan", "Not suggested", "Variant"].sort(),
    );
    for (const tag of document.querySelectorAll(".wl-uf04-browse__tag")) {
      expect(tag.matches("a, button, input, [tabindex]")).toBe(false);
      expect(tag.querySelector("a, button, input, [tabindex]")).toBeNull();
    }
    const result = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
