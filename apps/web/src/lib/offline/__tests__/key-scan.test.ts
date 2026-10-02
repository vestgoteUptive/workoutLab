// @vitest-environment node
// T-0372 (UF-04.1, D-0091): `findHandBuiltKeys` catches every shape of a hand-built
// `userId:id` key, ignores comments, and isn't fooled by comment-like text inside strings.
import { describe, expect, it } from "vitest";
import { findHandBuiltKeySpans, findHandBuiltKeys } from "./key-scan";

describe("T-0372 findHandBuiltKeys", () => {
  it.each([
    "const k = `${userId}:${id}`;",
    "const k = `${row.userId}:${row.id}`;",
    'const k = userId + ":" + id;',
    "const k = userId + `:` + id;",
    "const k = user.id + ':' + exercise.id;",
  ])("AC-1 detects %s", (source) => {
    expect(findHandBuiltKeys(source)).toHaveLength(1);
  });

  it.each([
    "// `${userId}:${id}`",
    "/* `${userId}:${id}` */",
    '/** userId + ":" + id */',
    'const s = "u1:back-squat";',
    'id.split(":")',
  ])("AC-2 ignores %s", (source) => {
    expect(findHandBuiltKeys(source)).toEqual([]);
  });

  it.each([
    'const g = "src/**/*.ts"; const k = `${u}:${id}`; // */',
    'const s = "a // b"; const k = `${u}:${id}`;',
    'const t = `/*`; const k = u + ":" + id; const e = `*/`;',
  ])("AC-3 strings don't hide code: %s", (source) => {
    expect(findHandBuiltKeys(source)).toHaveLength(1);
  });

  it("reports a chained key once, with its offset", () => {
    const source = 'const k = a + ":" + b + ":" + c;';
    expect(findHandBuiltKeySpans(source)).toEqual([
      { text: 'a + ":" + b + ":" + c', start: source.indexOf("a +") },
    ]);
  });
});
