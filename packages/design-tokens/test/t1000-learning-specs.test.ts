// T-1000 (D-0277, D-0281): the learn-from-edits screen specs, checked as text.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./helpers";

const read = (f: string) =>
  readFileSync(resolve(repoRoot, "Design-docs/docs/design/screens", f), "utf8");

function section(md: string, heading: string): string {
  const lines = md.split("\n");
  const start = lines.indexOf(heading);
  if (start < 0) throw new Error(`no heading ${heading}`);
  const level = (/^#+/.exec(heading) as RegExpExecArray)[0].length;
  const end = lines.findIndex(
    (l, i) => i > start && /^#+ /.test(l) && (/^#+/.exec(l) as RegExpExecArray)[0].length <= level,
  );
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

const card = section(read("UF-08.2.md"), "## Learning prompt card (T-1000, D-0277, D-0281)");
const learn = section(
  read("UF-11.4.md"),
  "### 5b. Learning from your edits card (T-1000, D-0277, D-0281)",
);

describe("T-1000 AC1 card states", () => {
  it("lists every state", () => {
    for (const s of [
      "| Swap pending |",
      "| Removal pending |",
      "| Two pending |",
      "| After yes |",
      "| After no |",
      "| Offline |",
      "| Learning off (UF-11.4) |",
      "oldest first",
      '`aria-disabled="true"`',
      "Connect to change favorites",
      "Connect to change excluded exercises",
      "Prefer {Dumbbell bench press} for {Chest}?",
      "Stop suggesting {Cable crunch}?",
      "No thanks",
      "Undo",
    ])
      expect(card).toContain(s);
  });
});

describe("T-1000 AC2 card rules", () => {
  it("uses only variables, 44 px, contrast, no timeout, absent from UF-08.1 and UF-09", () => {
    for (const s of [
      'role="status"',
      "present on mount",
      "no raw colour",
      "at least 44 px",
      "6.2:1",
      "No timeout",
      "never over another control",
      "Absent from UF-08.1 and UF-09",
    ])
      expect(card.toLowerCase()).toContain(s.toLowerCase());
    expect(card).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("T-1000 AC3 Learning section", () => {
  it("specifies toggle, sentence, Forget, offline and status lines", () => {
    for (const s of [
      "on by default",
      "Suggest preferences from my swaps and removals",
      "Counts are saved with your account, only you can see them, and they are included when you export your data. A preference is saved only when you say yes.",
      "Forget what was counted",
      "on every device",
      "Connect to change this",
      '`aria-disabled="true"`',
      "Counts cleared.",
      "Couldn't save. Try again.",
      "Online:",
      "Offline:",
    ])
      expect(learn).toContain(s);
  });
  it("sits in the UF-11.4 order", () => {
    expect(read("UF-11.4.md")).toContain("Your data → Learning from your edits → Delete account");
  });
});

describe("T-1000 AC4 focus", () => {
  it("answer goes to Undo, Forget stays on the button", () => {
    expect(card).toContain("**focus moves to Undo**");
    expect(learn).toContain("focus **stays on the button**");
  });
});

describe("T-1000 sibling lines", () => {
  it("UF-11.5 and UF-11.6 say a learned preference is an ordinary row", () => {
    expect(read("UF-11.5.md")).toContain("A learned preference is an ordinary row");
    expect(read("UF-11.6.md")).toContain("A learned preference is an ordinary row");
  });
});
