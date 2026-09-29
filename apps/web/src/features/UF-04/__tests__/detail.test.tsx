// T-0306a UF-04.2 Exercise detail: AC-7, AC-8, AC-9, the variants half of AC-11 and the
// detail half of AC-13.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { createSelectSpy } from "../../../lib/offline/__tests__/select-spy.js";
import { NOW, TZ, USER, seedSpy } from "./l1plus.js";

const spy = createSelectSpy();
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: spy.from } }));

const { refreshAll } = await import("../../../lib/offline/history.js");
const { offlineDb } = await import("../../../lib/offline/index.js");
const { freshOfflineDb, signIn, signOut } =
  await import("../../../lib/offline/__tests__/test-helpers.js");
const { currentUrl, mountAt, screenId, setOnline } = await import("./harness.js");

async function seed(options: Parameters<typeof seedSpy>[1] = {}): Promise<void> {
  spy.reset();
  seedSpy(spy, options);
  await refreshAll(NOW, TZ);
}

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  setOnline(false);
});
afterEach(() => signOut());

const texts = (selector: string) =>
  [...document.querySelectorAll(selector)].map((n) => n.textContent);

describe("AC-7 detail content", () => {
  it("shows the name, tag line, ordered pills, instructions, mistakes, cue and history link", async () => {
    await seed();
    await mountAt("/library/back-squat");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Back squat" }),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-field="tagline"]')?.textContent).toBe(
      "Compound · Beginner · Barbell, Rack",
    );
    expect(texts('[data-weight="primary"]')).toEqual(["Glutes", "Quads"]);
    expect(texts('[data-weight="secondary"]')).toEqual(["Core", "Hamstrings"]);
    const list = document.querySelector("ol")!;
    expect([...list.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "Brace",
      "Sit down between your heels",
      "Drive up",
    ]);
    const mistakes = screen.getByRole("heading", { name: "Common mistakes" }).closest("section")!;
    expect(within(mistakes).getAllByRole("listitem")).toHaveLength(1);
    expect(within(mistakes).getByText("Knees caving in")).toBeInTheDocument();
    expect(screen.getByText("Chest up")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My history" })).toHaveAttribute(
      "href",
      "/progress/back-squat",
    );
  });

  it("contrast: no mistakes hides the heading, a null cue renders no cue element", async () => {
    await seed({ details: { "back-squat": { mistakes: [], cue: null } } });
    await mountAt("/library/back-squat");
    await screen.findByRole("heading", { level: 1, name: "Back squat" });
    expect(screen.queryByRole("heading", { name: "Common mistakes" })).not.toBeInTheDocument();
    expect(document.querySelector('[data-field="cue"]')).toBeNull();
  });

  it("contrast: a bodyweight tag line, and an unknown equipment value prints raw", async () => {
    await seed({
      extra: [
        {
          id: "trx-row",
          name: "Trx row",
          type: "compound",
          equipment: ["trx"],
          areas: { back: 1 },
        },
      ],
    });
    const view = await mountAt("/library/push-up");
    await screen.findByRole("heading", { level: 1, name: "Push-up" });
    expect(document.querySelector('[data-field="tagline"]')?.textContent).toBe(
      "Compound · Beginner · Bodyweight",
    );
    view.unmount();
    await mountAt("/library/trx-row");
    await screen.findByRole("heading", { level: 1, name: "Trx row" });
    expect(document.querySelector('[data-field="tagline"]')?.textContent).toBe(
      "Compound · Beginner · trx",
    );
  });
});

describe("AC-8 attribution (D-0005)", () => {
  const wger = {
    source: "wger",
    license: "CC-BY-SA-4.0",
    attribution: "wger.de contributors",
    source_url: "https://wger.de/exercise/1",
  };
  const line = () => document.querySelector('[data-field="attribution"]');

  it("wger shows text, licence link and Source link, both opening safely", async () => {
    await seed({ details: { "back-squat": wger } });
    await mountAt("/library/back-squat");
    await screen.findByRole("heading", { level: 1, name: "Back squat" });
    expect(line()?.textContent).toBe("Text: wger.de contributors · CC-BY-SA-4.0 · Source");
    const licence = screen.getByRole("link", { name: "CC-BY-SA-4.0" });
    expect(licence).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0/");
    const source = screen.getByRole("link", { name: "Source" });
    expect(source).toHaveAttribute("href", "https://wger.de/exercise/1");
    for (const a of [licence, source]) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("workoutLab text reads exactly Text: workoutLab, with no licence link", async () => {
    await seed();
    await mountAt("/library/back-squat");
    await screen.findByRole("heading", { level: 1, name: "Back squat" });
    expect(line()?.textContent).toBe("Text: workoutLab");
    expect(document.querySelector('a[href*="creativecommons"]')).toBeNull();
  });

  it("a null sourceUrl hides only Source; a null attribution hides only the attribution", async () => {
    await seed({ details: { "back-squat": { ...wger, source_url: null } } });
    const view = await mountAt("/library/back-squat");
    await screen.findByRole("heading", { level: 1, name: "Back squat" });
    expect(line()?.textContent).toBe("Text: wger.de contributors · CC-BY-SA-4.0");
    view.unmount();
    await seed({ details: { "back-squat": { ...wger, attribution: null } } });
    await mountAt("/library/back-squat");
    await screen.findByRole("heading", { level: 1, name: "Back squat" });
    expect(line()?.textContent).toBe("Text: CC-BY-SA-4.0 · Source");
  });

  it("a licence outside the map prints as text, with no link", async () => {
    await seed({ details: { "back-squat": { ...wger, license: "CC0-1.0" } } });
    await mountAt("/library/back-squat");
    await screen.findByRole("heading", { level: 1, name: "Back squat" });
    expect(line()?.textContent).toBe("Text: wger.de contributors · CC0-1.0 · Source");
    expect(screen.queryByRole("link", { name: "CC0-1.0" })).not.toBeInTheDocument();
  });
});

describe("AC-9 detail missing", () => {
  it("stays put and renders what it has plus the download line", async () => {
    await seed();
    await offlineDb().exerciseDetails.clear();
    await mountAt("/library/back-squat");
    await screen.findByText("Instructions download the next time you're online.");
    expect(currentUrl()).toBe("/library/back-squat");
    expect(screen.getByRole("heading", { level: 1, name: "Back squat" })).toBeInTheDocument();
    expect(document.querySelector('[data-field="tagline"]')?.textContent).toBe(
      "Compound · Beginner · Barbell, Rack",
    );
    expect(texts('[data-weight="primary"]')).toEqual(["Glutes", "Quads"]);
    expect(document.querySelector("ol")).toBeNull();
    expect(screen.queryByText("Variations")).not.toBeInTheDocument();
    expect(document.querySelector('[data-field="attribution"]')).toBeNull();
    expect(screen.queryByText(/^Text:/)).not.toBeInTheDocument();
  });
});

describe("AC-11 variants link to compare", () => {
  const variantLinks = () => {
    const section = screen.getByRole("heading", { name: "Variations" }).closest("section")!;
    return within(section)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
  };

  it("lists the variants in loader order", async () => {
    await seed();
    await mountAt("/library/back-squat");
    await screen.findByRole("heading", { name: "Variations" });
    expect(variantLinks()).toEqual([
      "/library/back-squat/compare/goblet-squat",
      "/library/back-squat/compare/leg-press",
    ]);
  });

  it("skips an unknown variant id", async () => {
    await seed({
      variants: [
        ["back-squat", "goblet-squat"],
        ["back-squat", "nope"],
      ],
    });
    await mountAt("/library/back-squat");
    await screen.findByRole("heading", { name: "Variations" });
    expect(variantLinks()).toEqual(["/library/back-squat/compare/goblet-squat"]);
  });

  it("hides the heading when there are no variants", async () => {
    await seed({ variants: [] });
    await mountAt("/library/back-squat");
    await screen.findByRole("heading", { level: 1, name: "Back squat" });
    expect(screen.queryByRole("heading", { name: "Variations" })).not.toBeInTheDocument();
  });
});

describe("first visit on a deep link", () => {
  it("waits for the first download instead of redirecting an id the cache doesn't have yet", async () => {
    spy.reset();
    seedSpy(spy);
    setOnline(true);
    await mountAt("/library/back-squat");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Back squat" }),
    ).toBeInTheDocument();
    expect(currentUrl()).toBe("/library/back-squat");
    expect(await screen.findByText("Knees caving in")).toBeInTheDocument();
  });

  it("still redirects an unknown id once the download has finished", async () => {
    spy.reset();
    seedSpy(spy);
    setOnline(true);
    await mountAt("/library/nope");
    await waitFor(() => expect(currentUrl()).toBe("/library"));
    await waitFor(() => expect(screenId()).toBe("UF-04.1"));
  });
});

describe("AC-13 detail redirects", () => {
  for (const [path, target, id] of [
    ["/library/nope", "/library", "UF-04.1"],
    ["/library/wu-cat-cow", "/library", "UF-04.1"],
    ["/library/leg-press", "/library/leg-press", "UF-04.2"],
  ] as const) {
    it(`${path} → ${target} (${id}) by replace`, async () => {
      await seed();
      window.history.replaceState(null, "", "/library");
      const before = window.history.length;
      await mountAt(path);
      await waitFor(() => expect(screenId()).toBe(id));
      await waitFor(() => expect(currentUrl()).toBe(target));
      if (id === "UF-04.1") await screen.findByRole("searchbox");
      expect(window.history.length).toBe(before);
    });
  }
});
