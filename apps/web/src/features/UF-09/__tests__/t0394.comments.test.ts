// T-0394 AC-8 (T-0438, D-0162 §2, D-0153 §6): the two comments about a plan write that lands
// after finish() started no longer say it "moves nothing".
// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

describe("T-0394 AC-8 comment drift", () => {
  it.each(["session.tsx", "host.tsx"])(
    "%s doesn't say 'moves nothing' about the plan write",
    (f) => {
      expect(read(f)).not.toMatch(/plan write[^.]*moves nothing/s);
    },
  );
  it("the SessionWrites docblock cites D-0153 §6", () => {
    const s = read("session.tsx");
    const doc = s.slice(
      s.indexOf("The session-row writes"),
      s.indexOf("export function createSessionWrites"),
    );
    expect(doc).toContain("D-0153 §6");
    expect(doc).toContain("landed");
  });
  it("the comment above createSessionWrites() in host.tsx cites D-0153 §6", () => {
    const h = read("host.tsx");
    const at = h.indexOf("createSessionWrites(), [");
    expect(h.slice(at - 400, at)).toContain("D-0153 §6");
  });
});
