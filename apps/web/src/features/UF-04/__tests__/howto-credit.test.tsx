// T-0364 UF-09.9 / UF-03.1 / UF-04.2: ExerciseHowTo shows a link-free inline credit for
// third-party text (D-0089). AC1-AC10.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createSelectSpy } from "../../../lib/offline/__tests__/select-spy.js";
import { NOW, TZ, USER, seedSpy } from "./l1plus.js";

const spy = createSelectSpy();
const hoisted = vi.hoisted(() => ({ refreshAll: vi.fn() }));
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: spy.from } }));
vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));
vi.mock("../../../lib/offline/history.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  refreshAll: (...args: unknown[]) => hoisted.refreshAll(...args),
}));

const { refreshAll } = await vi.importActual<typeof import("../../../lib/offline/history.js")>(
  "../../../lib/offline/history.js",
);
const { freshOfflineDb, signIn, signOut } =
  await import("../../../lib/offline/__tests__/test-helpers.js");
const mod = await import("../index.js");
const { ExerciseHowTo } = mod;
const { mountAt, setOnline } = await import("./harness.js");

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

const WGER = {
  source: "wger",
  license: "CC-BY-SA-4.0",
  attribution: "wger.de contributors",
  source_url: "https://wger.de/en/exercise/1/view",
};

async function seed(options: Parameters<typeof seedSpy>[1] = {}): Promise<void> {
  spy.reset();
  seedSpy(spy, options);
  await refreshAll(NOW, TZ);
  spy.reset();
}
const seedWger = (overrides: Partial<typeof WGER> | { attribution: null } = {}) =>
  seed({ details: { "back-squat": { ...WGER, ...overrides } } });

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  setOnline(false);
  hoisted.refreshAll.mockReset();
  hoisted.refreshAll.mockResolvedValue(undefined);
});
afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

function Host({ exerciseId }: { exerciseId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? <ExerciseHowTo exerciseId={exerciseId} onClose={() => setOpen(false)} /> : null}
    </main>
  );
}

async function openDialog(exerciseId = "back-squat", name = "How to: Back squat") {
  const view = render(<Host exerciseId={exerciseId} />);
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("dialog", { name });
  return { view, dialog };
}
const credits = (root: ParentNode) => root.querySelectorAll('[data-field="inline-credit"]');
const follows = (a: Node, b: Node) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe("AC1 wger row, full credit", () => {
  it("renders exactly one credit after the steps and before Close", async () => {
    await seedWger();
    const { dialog } = await openDialog();
    await within(dialog).findByText("Chest up");
    const found = credits(dialog);
    expect(found).toHaveLength(1);
    const credit = found[0]!;
    expect(credit.tagName).toBe("P");
    expect(credit.textContent).toBe("Text: wger.de contributors · CC BY-SA 4.0");
    const list = dialog.querySelector("ol")!;
    const close = within(dialog).getByRole("button", { name: "Close" });
    expect(follows(list, credit)).toBe(true);
    expect(follows(credit, close)).toBe(true);
  });
});

describe("AC2 still no link out (principle 1)", () => {
  it("has zero a[href], only Close, and no source URL text", async () => {
    await seedWger();
    const { dialog } = await openDialog();
    await within(dialog).findByText("Chest up");
    expect(credits(dialog)).toHaveLength(1);
    expect(dialog.querySelectorAll("a[href]")).toHaveLength(0);
    expect(dialog.querySelectorAll("a")).toHaveLength(0);
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Close"]);
    expect(dialog.textContent).not.toContain("wger.de/en/exercise");
    expect(dialog.textContent).not.toContain("creativecommons");
  });
});

describe("AC3 null attribution", () => {
  it("reads Text: CC BY-SA 4.0 with no stray separator", async () => {
    await seedWger({ attribution: null });
    const { dialog } = await openDialog();
    await within(dialog).findByText("Chest up");
    const credit = credits(dialog)[0]!;
    expect(credit.textContent).toBe("Text: CC BY-SA 4.0");
    expect(credit.textContent).not.toContain(" · ");
  });

  it("contrast: with an attribution the separator is present once", async () => {
    await seedWger();
    const { dialog } = await openDialog();
    await within(dialog).findByText("Chest up");
    expect(credits(dialog)[0]!.textContent!.split(" · ")).toHaveLength(2);
  });
});

describe("AC4 unmapped licence", () => {
  it("renders the raw licence value", async () => {
    await seedWger({ license: "CC-BY-4.0" });
    const { dialog } = await openDialog();
    await within(dialog).findByText("Chest up");
    expect(credits(dialog)[0]!.textContent).toBe("Text: wger.de contributors · CC-BY-4.0");
  });
});

describe("AC5 own text, no line", () => {
  it("a workoutlab row has no credit and the AC-14 content is unchanged", async () => {
    await seed();
    const { dialog } = await openDialog();
    expect(await within(dialog).findByText("Chest up")).toBeInTheDocument();
    expect(credits(dialog)).toHaveLength(0);
    expect(dialog.textContent).not.toContain("Text: ");
    expect([...dialog.querySelectorAll("ol > li")].map((li) => li.textContent)).toEqual([
      "Brace",
      "Sit down between your heels",
      "Drive up",
    ]);
    expect(dialog.querySelectorAll("a[href]")).toHaveLength(0);
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Close"]);
    expect(dialog.textContent).toBe(
      "How to: Back squatCueChest upInstructionsBraceSit down between your heelsDrive upClose",
    );
  });
});

describe("AC6 missing detail", () => {
  it("an unknown id shows the download line and Close, and no credit", async () => {
    await seedWger();
    const { dialog } = await openDialog("nope", "How to");
    expect(
      await within(dialog).findByText("Instructions download the next time you're online."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(credits(dialog)).toHaveLength(0);
  });
});

describe("AC7 offline, cache only", () => {
  it("opening and closing a wger row makes zero refresh, supabase and fetch calls", async () => {
    await seedWger();
    setOnline(true);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { dialog } = await openDialog();
    await within(dialog).findByText("Chest up");
    expect(credits(dialog)[0]!.textContent).toBe("Text: wger.de contributors · CC BY-SA 4.0");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(hoisted.refreshAll).not.toHaveBeenCalled();
    expect(spy.from).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("AC8 a11y", () => {
  it("has no axe violations with the credit shown", async () => {
    await seedWger();
    const { view, dialog } = await openDialog();
    await within(dialog).findByText("Chest up");
    expect(credits(dialog)).toHaveLength(1);
    const results = await axe.run(view.container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("AC9 UF-04.2 unchanged", () => {
  it("keeps the Attribution block with its links and has no inline credit", async () => {
    await seedWger();
    await mountAt("/library/back-squat");
    await screen.findByRole("heading", { level: 1, name: "Back squat" });
    await waitFor(() =>
      expect(document.querySelector('[data-field="attribution"]')?.textContent).toBe(
        "Text: wger.de contributors · CC-BY-SA-4.0 · Source",
      ),
    );
    expect(screen.getByRole("link", { name: "CC-BY-SA-4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by-sa/4.0/",
    );
    expect(screen.getByRole("link", { name: "Source" })).toHaveAttribute(
      "href",
      "https://wger.de/en/exercise/1/view",
    );
    expect(credits(document)).toHaveLength(0);
  });
});

describe("AC10 exports pinned", () => {
  it("index exports exactly Compare, ExerciseHowTo, Library, LibraryDetail", () => {
    expect(Object.keys(mod).sort()).toEqual([
      "Compare",
      "ExerciseHowTo",
      "Library",
      "LibraryDetail",
    ]);
  });

  it("InlineCredit is exported from InlineCredit.tsx, not from index.tsx", async () => {
    const own = await import("../InlineCredit.js");
    expect(typeof own.InlineCredit).toBe("function");
    expect("InlineCredit" in mod).toBe(false);
  });
});
