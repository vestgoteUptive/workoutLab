// T-0308a UF-07.1: the write path. AC-A1 (create), A2 (id reuse), A3 (edit), A5 (trim),
// A7 (sets never carried through), A8 (delete), A10 (errors, both forms), A13 (cancel, double
// submit).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { R, R2, UUID_V4, itemRow, putRoutine, renderEditor, seed } from "./harness.js";
import { offline, spy } from "./spies.js";

vi.mock("../../../lib/auth/client.js", async () => (await import("./spies.js")).mockedClient());
vi.mock("../../../lib/offline/index.js", async (importActual) =>
  (await import("./spies.js")).mockedOffline(importActual),
);

const NAME = "Name";
const location = () => screen.getByTestId("location");

async function ready(path: string, rows: number) {
  const view = renderEditor(path);
  await screen.findByLabelText(NAME);
  if (rows > 0) await screen.findByText(/^1\. /);
  return view;
}

async function addFromPicker(...names: string[]) {
  fireEvent.click(screen.getByRole("button", { name: "Add exercise" }));
  for (const name of names) {
    fireEvent.click(await screen.findByRole("button", { name: `Add ${name}` }));
  }
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));

beforeEach(() => seed());

describe("AC-A1 create", () => {
  it("records exactly three calls, in order, then refreshes and goes to /plan", async () => {
    await ready("/plan/routines/new", 0);
    fireEvent.change(screen.getByLabelText(NAME), { target: { value: "Lower A" } });
    await addFromPicker("Barbell back squat", "Romanian deadlift (barbell)");
    save();
    await waitFor(() => expect(location()).toHaveTextContent("/plan"));
    await waitFor(() => expect(location().textContent).toBe("/plan"));

    expect(spy.calls).toHaveLength(3);
    const [routine, del, items] = spy.calls;
    expect(routine).toMatchObject({ table: "routines", method: "upsert" });
    const payload = routine!.payload as { id: string; name: string };
    expect(Object.keys(payload).sort()).toEqual(["id", "name"]);
    expect(payload.name).toBe("Lower A");
    expect(payload.id).toMatch(UUID_V4);

    expect(del).toMatchObject({ table: "routine_items", method: "delete" });
    expect(del!.filters).toEqual([
      ["eq", "routine_id", payload.id],
      ["gte", "position", 2],
    ]);

    expect(items).toMatchObject({ table: "routine_items", method: "upsert" });
    expect(items!.payload).toEqual([
      itemRow(payload.id, 0, "barbell-back-squat"),
      itemRow(payload.id, 1, "romanian-deadlift-barbell"),
    ]);
    expect(items!.options).toEqual({ onConflict: "routine_id,position" });
    expect(offline.refreshRoutines).toHaveBeenCalledTimes(1);
  });

  it("contrast: two separate mounts produce two different ids", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const view = await ready("/plan/routines/new", 0);
      fireEvent.change(screen.getByLabelText(NAME), { target: { value: "A" } });
      await addFromPicker("Plank");
      save();
      await waitFor(() => expect(location().textContent).toBe("/plan"));
      ids.push(
        (spy.calls.filter((c) => c.table === "routines").at(-1)!.payload as { id: string }).id,
      );
      view.unmount();
    }
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe("AC-A2 a retry reuses the new routine's id", () => {
  it.each(["reject", "error"] as const)("(%s) both attempts carry one id", async (mode) => {
    spy.fail("routine_items.upsert", mode, "ok");
    await ready("/plan/routines/new", 0);
    fireEvent.change(screen.getByLabelText(NAME), { target: { value: "Push" } });
    await addFromPicker("Bench press");
    save();
    await screen.findByText("Couldn't save your routine. Try again.");
    save();
    await waitFor(() => expect(location().textContent).toBe("/plan"));
    const routineCalls = spy.calls.filter((c) => c.table === "routines");
    expect(routineCalls).toHaveLength(2);
    const ids = new Set(routineCalls.map((c) => (c.payload as { id: string }).id));
    expect(ids.size).toBe(1);
  });
});

describe("AC-A3 edit, reorder, remove", () => {
  it("saves the edited order with a server-wins rewrite", async () => {
    await ready(`/plan/routines/${R}`, 3);
    fireEvent.click(screen.getByRole("button", { name: "Move Leg curl (machine) up" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Barbell back squat" }));
    expect(screen.getByText("1. Leg curl (machine)")).toBeInTheDocument();
    expect(screen.getByText("2. Romanian deadlift (barbell)")).toBeInTheDocument();
    save();
    await waitFor(() => expect(location().textContent).toBe("/plan"));
    expect(spy.calls[0]).toMatchObject({ table: "routines", payload: { id: R, name: "Lower A" } });
    expect(spy.calls[1]!.filters).toEqual([
      ["eq", "routine_id", R],
      ["gte", "position", 2],
    ]);
    expect(spy.calls[2]!.payload).toEqual([
      itemRow(R, 0, "leg-curl-machine"),
      itemRow(R, 1, "romanian-deadlift-barbell"),
    ]);
  });

  it("contrast: a save with no edits still sends all three calls, order unchanged", async () => {
    await ready(`/plan/routines/${R}`, 3);
    save();
    await waitFor(() => expect(location().textContent).toBe("/plan"));
    expect(spy.calls.map((c) => `${c.table}.${c.method}`)).toEqual([
      "routines.upsert",
      "routine_items.delete",
      "routine_items.upsert",
    ]);
    expect(spy.calls[1]!.filters).toContainEqual(["gte", "position", 3]);
    expect(
      (spy.calls[2]!.payload as Array<{ exercise_id: string }>).map((r) => r.exercise_id),
    ).toEqual(["barbell-back-squat", "romanian-deadlift-barbell", "leg-curl-machine"]);
  });
});

describe("AC-A5 name is trimmed on save", () => {
  it("'  Lower A  ' is saved as 'Lower A'", async () => {
    await ready(`/plan/routines/${R}`, 3);
    fireEvent.change(screen.getByLabelText(NAME), { target: { value: "  Lower A  " } });
    save();
    await waitFor(() => expect(location().textContent).toBe("/plan"));
    expect(spy.calls[0]!.payload).toEqual({ id: R, name: "Lower A" });
  });
});

describe("AC-A7 sets are never carried through", () => {
  it("a cached item carrying sets: 5 is rewritten with sets: 3", async () => {
    await putRoutine(R2, "Legacy", ["plank"], { sets: 5 });
    await ready(`/plan/routines/${R2}`, 1);
    save();
    await waitFor(() => expect(location().textContent).toBe("/plan"));
    const rows = spy.calls[2]!.payload as Array<{ sets: number }>;
    expect(rows.map((r) => r.sets)).toEqual([3]);
  });
});

describe("AC-A8 delete", () => {
  it("Delete routine, dialog, Delete: one routines.delete by id, refresh, /plan", async () => {
    await ready(`/plan/routines/${R}`, 3);
    fireEvent.click(screen.getByRole("button", { name: "Delete routine" }));
    expect(screen.getByRole("dialog", { name: "Delete Lower A?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(location().textContent).toBe("/plan"));
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]).toMatchObject({ table: "routines", method: "delete" });
    expect(spy.calls[0]!.filters).toEqual([["eq", "id", R]]);
    expect(offline.refreshRoutines).toHaveBeenCalledTimes(1);
    for (const table of ["session_sets", "sessions", "routine_items"]) {
      expect(spy.tables).not.toContain(table);
    }
  });

  it("Keep routine closes the dialog with no call", async () => {
    await ready(`/plan/routines/${R}`, 3);
    fireEvent.click(screen.getByRole("button", { name: "Delete routine" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep routine" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(spy.calls).toHaveLength(0);
  });

  it("contrast: /plan/routines/new has no Delete routine control", async () => {
    await ready("/plan/routines/new", 0);
    expect(screen.queryByRole("button", { name: "Delete routine" })).not.toBeInTheDocument();
  });
});

describe("AC-A10 errors", () => {
  const MSG = "Couldn't save your routine. Try again.";
  const modes = ["reject", "error"] as const;

  it.each(modes)("(%s) routines.upsert fails: no routine_items call", async (mode) => {
    spy.fail("routines.upsert", mode);
    await ready(`/plan/routines/${R}`, 3);
    save();
    const message = await screen.findByText(MSG);
    expect(spy.calls.map((c) => c.table)).toEqual(["routines"]);
    expect(message.closest("form")).toHaveAttribute("data-region", "routine-form");
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });

  it.each(modes)("(%s) the delete fails: the items upsert is not made", async (mode) => {
    spy.fail("routine_items.delete", mode);
    await ready(`/plan/routines/${R}`, 3);
    save();
    await screen.findByText(MSG);
    expect(spy.calls.map((c) => `${c.table}.${c.method}`)).toEqual([
      "routines.upsert",
      "routine_items.delete",
    ]);
  });

  it.each(modes)("(%s) the items upsert fails: draft stays, location unchanged", async (mode) => {
    spy.fail("routine_items.upsert", mode);
    await ready(`/plan/routines/${R}`, 3);
    fireEvent.click(screen.getByRole("button", { name: "Move Leg curl (machine) up" }));
    fireEvent.change(screen.getByLabelText(NAME), { target: { value: "Lower B" } });
    save();
    await screen.findByText(MSG);
    expect(screen.getByLabelText(NAME)).toHaveValue("Lower B");
    expect(screen.getByText("2. Leg curl (machine)")).toBeInTheDocument();
    expect(location()).toHaveTextContent(`/plan/routines/${R}`);
    expect(offline.refreshRoutines).not.toHaveBeenCalled();
  });

  it.each(modes)("(%s) routines.delete fails: message, dialog closed, no move", async (mode) => {
    spy.fail("routines.delete", mode);
    await ready(`/plan/routines/${R}`, 3);
    fireEvent.click(screen.getByRole("button", { name: "Delete routine" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const message = await screen.findByText("Couldn't delete your routine. Try again.");
    expect(message.closest("form")).toHaveAttribute("data-region", "routine-form");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(location()).toHaveTextContent(`/plan/routines/${R}`);
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });

  it("a retry re-runs the full sequence from step 1", async () => {
    spy.fail("routine_items.delete", "error", "ok");
    await ready(`/plan/routines/${R}`, 3);
    save();
    await screen.findByText(MSG);
    save();
    await waitFor(() => expect(location().textContent).toBe("/plan"));
    expect(spy.calls.map((c) => `${c.table}.${c.method}`)).toEqual([
      "routines.upsert",
      "routine_items.delete",
      "routines.upsert",
      "routine_items.delete",
      "routine_items.upsert",
    ]);
  });

  it("a failed refreshRoutines after a landed write shows no error and still goes to /plan", async () => {
    offline.refreshRoutines.mockRejectedValueOnce(new Error("offline"));
    await ready(`/plan/routines/${R}`, 3);
    save();
    await waitFor(() => expect(location().textContent).toBe("/plan"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("AC-A13 cancel and double submit", () => {
  it("Cancel after edits goes to /plan with no call", async () => {
    await ready(`/plan/routines/${R}`, 3);
    fireEvent.click(screen.getByRole("button", { name: "Remove Leg curl (machine)" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(location().textContent).toBe("/plan"));
    expect(spy.calls).toHaveLength(0);
    expect(offline.refreshRoutines).not.toHaveBeenCalled();
  });

  it("a double click on Save produces exactly one routines.upsert", async () => {
    await ready(`/plan/routines/${R}`, 3);
    const button = screen.getByRole("button", { name: "Save" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(location().textContent).toBe("/plan"));
    expect(spy.calls.filter((c) => c.table === "routines" && c.method === "upsert")).toHaveLength(
      1,
    );
  });

  it("Save is disabled while a save is in flight", async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    const original = spy.settle;
    spy.settle = (call) =>
      call.table === "routines" ? hold.then(() => original(call)) : original(call);
    try {
      await ready(`/plan/routines/${R}`, 3);
      save();
      await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeDisabled());
      release();
      await waitFor(() => expect(location().textContent).toBe("/plan"));
    } finally {
      spy.settle = original;
    }
  });
});
