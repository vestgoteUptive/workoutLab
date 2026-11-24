// T-0216 UF-11.4 Equipment section test helpers. Imports only from this ticket's own file plus
// the UF-11 `test-helpers.tsx` and `fixtures.ts`, which it leaves unmodified.
import { screen, within } from "@testing-library/react";

/** The 9 checkbox labels, in the fixed checklist order (D-0064 §3 minus "none"). */
export const CHECKLIST_LABELS = [
  "Dumbbell",
  "Bench",
  "Barbell",
  "Rack",
  "Cable",
  "Machine",
  "Pull-up bar",
  "Kettlebell",
  "Band",
] as const;

export function equipmentGroup(): HTMLElement {
  return screen.getByRole("group", { name: "Your equipment" });
}

export function checkbox(label: string): HTMLInputElement {
  return screen.getByRole("checkbox", { name: label }) as HTMLInputElement;
}

export function allCheckboxes(): HTMLInputElement[] {
  // Scoped to the equipment group: other cards (T-1005 learning) have their own checkbox.
  return within(equipmentGroup()).getAllByRole("checkbox") as HTMLInputElement[];
}

export function saveButton(): HTMLElement {
  return screen.getByRole("button", { name: /^Save$|^Saving$/ });
}

/** The equipment section's own live region (the learning card has another, T-1005). */
export function equipmentStatus(): HTMLElement {
  return within(equipmentGroup().closest("section")!).getByRole("status");
}
