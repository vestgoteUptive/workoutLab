// T-0306a ExerciseHowTo: AC-14 (dialog, no link out, focus, axe) and AC-15 (cache only).
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
vi.mock("../../../lib/offline/index.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  refreshAll: (...args: unknown[]) => hoisted.refreshAll(...args),
}));

const { refreshAll } = await import("../../../lib/offline/history.js");
const { freshOfflineDb, signIn, signOut } = await import("../../../lib/offline/__tests__/test-helpers.js");
const { ExerciseHowTo } = await import("../index.js");
const { mountAt, setOnline } = await import("./harness.js");

interface Axe {
  run: (ctx: Element, opts: object) => Promise<{ violations: { id: string }[] }>;
}
let axe: Axe;
beforeAll(async () => {
  // `vitest-axe` isn't a dependency; this is the same engine, resolved the way the C-01 test does.
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
  const mod = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
  axe = mod.default ?? mod;
});

beforeEach(async () => {
  freshOfflineDb();
  signIn(USER);
  setOnline(false);
  spy.reset();
  seedSpy(spy);
  await refreshAll(NOW, TZ);
  spy.reset();
  hoisted.refreshAll.mockReset();
  hoisted.refreshAll.mockResolvedValue(undefined);
});
afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

function Host({
  exerciseId,
  onClose,
  removeOpenerOnClose = false,
}: {
  exerciseId: string;
  onClose: () => void;
  removeOpenerOnClose?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [openerShown, setOpenerShown] = useState(true);
  return (
    <main>
      {openerShown ? (
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
      ) : null}
      {open ? (
        <ExerciseHowTo
          exerciseId={exerciseId}
          onClose={() => {
            onClose();
            if (removeOpenerOnClose) setOpenerShown(false);
            setOpen(false);
          }}
        />
      ) : null}
    </main>
  );
}

function openDialog(): HTMLElement {
  const opener = screen.getByRole("button", { name: "Open" });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe("AC-14 the dialog", () => {
  it("is one modal dialog named How to: Back squat with the cue, steps and only a Close button", async () => {
    render(<Host exerciseId="back-squat" onClose={vi.fn()} />);
    openDialog();
    const dialog = await screen.findByRole("dialog", { name: "How to: Back squat" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(await within(dialog).findByText("Chest up")).toBeInTheDocument();
    expect([...dialog.querySelectorAll("ol > li")].map((li) => li.textContent)).toEqual([
      "Brace",
      "Sit down between your heels",
      "Drive up",
    ]);
    expect(dialog.querySelectorAll("a[href]")).toHaveLength(0);
    expect(within(dialog).getAllByRole("button").map((b) => b.textContent)).toEqual(["Close"]);
  });

  it("Escape and Close each call onClose once", async () => {
    const onClose = vi.fn();
    const view = render(<Host exerciseId="back-squat" onClose={onClose} />);
    openDialog();
    await screen.findByRole("dialog", { name: "How to: Back squat" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();

    const onClose2 = vi.fn();
    render(<Host exerciseId="back-squat" onClose={onClose2} />);
    openDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(onClose2).toHaveBeenCalledTimes(1);
  });

  it("moves focus in and restores it to the opener when the caller unmounts it", async () => {
    render(<Host exerciseId="back-squat" onClose={vi.fn()} />);
    const opener = openDialog();
    await screen.findByRole("dialog");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(opener);
  });

  it("closing with the opener removed from the DOM does not throw", async () => {
    render(<Host exerciseId="back-squat" onClose={vi.fn()} removeOpenerOnClose />);
    openDialog();
    await screen.findByRole("dialog");
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Close" }))).not.toThrow();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a warm-up id renders the warm-up's how-to", async () => {
    render(<Host exerciseId="wu-cat-cow" onClose={vi.fn()} />);
    openDialog();
    const dialog = await screen.findByRole("dialog", { name: "How to: Cat cow" });
    expect(await within(dialog).findByText("Move slowly")).toBeInTheDocument();
    expect(dialog.querySelectorAll("ol > li")).toHaveLength(2);
  });

  it("an unknown id renders a dialog named How to with the download line and Close", async () => {
    render(<Host exerciseId="nope" onClose={vi.fn()} />);
    openDialog();
    const dialog = await screen.findByRole("dialog", { name: "How to" });
    expect(await within(dialog).findByText("Instructions download the next time you're online.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("has no axe violations while open", async () => {
    const { container } = render(<Host exerciseId="back-squat" onClose={vi.fn()} />);
    openDialog();
    await screen.findByText("Chest up");
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("AC-15 the dialog reads the cache only", () => {
  it("opening and closing makes zero refresh, supabase and fetch calls", async () => {
    setOnline(true);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<Host exerciseId="back-squat" onClose={vi.fn()} />);
    openDialog();
    await screen.findByText("Chest up");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(hoisted.refreshAll).not.toHaveBeenCalled();
    expect(spy.from).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("contrast: LibraryDetail under the same conditions does call refreshAll once", async () => {
    setOnline(true);
    await mountAt("/library/back-squat");
    await screen.findByRole("heading", { level: 1, name: "Back squat" });
    await waitFor(() => expect(hoisted.refreshAll).toHaveBeenCalledTimes(1));
  });
});

