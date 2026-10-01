// T-0357 UF-04.2 / UF-09.9 / UF-03.1 (folds in T-0368): the licence lookups in InlineCredit
// (D-0089) and Attribution (D-0069 §2, D-0005) ignore Object.prototype keys, and a blank
// attribution (null, "", whitespace) is treated as absent. AC-5 to AC-8.
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createSelectSpy } from "../../../lib/offline/__tests__/select-spy.js";
import { NOW, TZ, USER, seedSpy } from "./l1plus.js";

const spy = createSelectSpy();
const hoisted = vi.hoisted(() => ({ refreshAll: vi.fn() }));
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: spy.from } }));
vi.mock("../../../lib/offline/history.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  refreshAll: (...args: unknown[]) => hoisted.refreshAll(...args),
}));

const { refreshAll } = await vi.importActual<typeof import("../../../lib/offline/history.js")>(
  "../../../lib/offline/history.js",
);
const { freshOfflineDb, signIn, signOut } =
  await import("../../../lib/offline/__tests__/test-helpers.js");
const { ExerciseHowTo } = await import("../index.js");
const { mountAt, setOnline } = await import("./harness.js");

const WGER = {
  source: "wger",
  license: "CC-BY-SA-4.0",
  attribution: "wger.de contributors" as string | null,
  source_url: "https://wger.de/en/exercise/1/view",
};
const SOURCE_URL = WGER.source_url;

async function seedWger(overrides: Partial<typeof WGER>): Promise<void> {
  spy.reset();
  seedSpy(spy, { details: { "back-squat": { ...WGER, ...overrides } } });
  await refreshAll(NOW, TZ);
  spy.reset();
}

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  setOnline(false);
  hoisted.refreshAll.mockReset();
  hoisted.refreshAll.mockResolvedValue(undefined);
  consoleError = vi.spyOn(console, "error");
});
afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

function Host() {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? <ExerciseHowTo exerciseId="back-squat" onClose={() => setOpen(false)} /> : null}
    </main>
  );
}

async function inlineCredit(): Promise<string> {
  const view = render(<Host />);
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("dialog", { name: "How to: Back squat" });
  await within(dialog).findByText("Chest up");
  const found = dialog.querySelectorAll('[data-field="inline-credit"]');
  expect(found).toHaveLength(1);
  const text = found[0]!.textContent ?? "";
  view.unmount();
  return text;
}

async function attributionLine(): Promise<Element> {
  await mountAt("/library/back-squat");
  await screen.findByRole("heading", { level: 1, name: "Back squat" });
  await waitFor(() => expect(document.querySelector('[data-field="attribution"]')).not.toBeNull());
  return document.querySelector('[data-field="attribution"]')!;
}

describe("T-0357 AC-5 InlineCredit ignores prototype licence keys", () => {
  it.each(["constructor", "toString"])("license %s prints as raw text", async (license) => {
    await seedWger({ license });
    expect(await inlineCredit()).toBe(`Text: wger.de contributors · ${license}`);
  });

  it("contrast: a mapped licence still uses its label", async () => {
    await seedWger({});
    expect(await inlineCredit()).toBe("Text: wger.de contributors · CC BY-SA 4.0");
  });
});

describe("T-0357 AC-6 Attribution ignores prototype licence keys", () => {
  it.each(["constructor", "toString"])(
    "license %s is plain text and only Source links",
    async (license) => {
      await seedWger({ license });
      const line = await attributionLine();
      expect(line.textContent).toBe(`Text: wger.de contributors · ${license} · Source`);
      const links = line.querySelectorAll("a[href]");
      expect(links).toHaveLength(1);
      expect(links[0]!.textContent).toBe("Source");
      expect(links[0]!.getAttribute("href")).toBe(SOURCE_URL);
      expect(line.querySelectorAll("a")).toHaveLength(1);
      expect(consoleError).not.toHaveBeenCalled();
    },
  );

  it("contrast: a mapped licence still links", async () => {
    await seedWger({});
    const line = await attributionLine();
    expect(line.querySelectorAll("a[href]")).toHaveLength(2);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("T-0357 AC-7 InlineCredit treats a blank attribution as absent", () => {
  it.each([
    ["empty", ""],
    ["whitespace", "   "],
  ])("%s attribution reads Text: CC BY-SA 4.0", async (_name, attribution) => {
    await seedWger({ attribution });
    const text = await inlineCredit();
    expect(text).toBe("Text: CC BY-SA 4.0");
    expect(text).not.toContain(" · ");
  });

  it("contrast: a real attribution splits into exactly 2 parts, stored as is", async () => {
    await seedWger({ attribution: "wger.de contributors" });
    expect((await inlineCredit()).split(" · ")).toHaveLength(2);
    await seedWger({ attribution: " wger.de contributors " });
    expect(await inlineCredit()).toBe("Text:  wger.de contributors  · CC BY-SA 4.0");
  });
});

describe("T-0357 AC-8 Attribution treats a blank attribution as absent", () => {
  it.each([
    ["empty", ""],
    ["whitespace", "   "],
  ])("%s attribution reads Text: CC-BY-SA-4.0 · Source", async (_name, attribution) => {
    await seedWger({ attribution });
    const line = await attributionLine();
    expect(line.textContent).toBe("Text: CC-BY-SA-4.0 · Source");
    const spans = [...line.querySelectorAll(":scope > span")];
    expect(spans.map((s) => s.textContent)).toEqual(["CC-BY-SA-4.0", " · Source"]);
    expect(line.querySelectorAll("a[href]")).toHaveLength(2);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("contrast: a real attribution is its own first part, stored as is", async () => {
    await seedWger({ attribution: " wger.de contributors " });
    const line = await attributionLine();
    expect(line.textContent).toBe("Text:  wger.de contributors  · CC-BY-SA-4.0 · Source");
    expect(line.querySelectorAll(":scope > span")).toHaveLength(3);
  });
});
