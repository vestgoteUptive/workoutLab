// T-0392 (UF-01.5, UF-01.5-auth-callback): consumeReturnTo() returns only same-origin app paths.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { consumeReturnTo } from "./return-to.js";

const KEY = "wl-return-to";

const SAFE = [
  "/library",
  "/",
  "/session/setup?step=ready",
  "/progress#week",
  "/%2F%2Fevil.example",
];

const UNSAFE: Array<[string, string]> = [
  ["protocol-relative", "//evil.example"],
  ["protocol-relative with path", "//evil.example/library"],
  ["slash-backslash", "/\\evil.example"],
  ["double backslash", "\\\\evil.example"],
  ["real tab", "/\t/evil.example"],
  ["real newline", "/\n/evil.example"],
  ["carriage return", "/\r/evil.example"],
  ["NUL", "/\u0000/evil.example"],
  ["DEL", "/\u007f/evil.example"],
  ["space", "/ /x"],
  ["https URL", "https://evil.example/"],
  ["single-slash http", "http:/evil.example"],
  ["javascript scheme", "javascript:alert(1)"],
  ["mixed-case javascript scheme", "JaVaScRiPt:alert(1)"],
  ["data scheme", "data:text/html,x"],
  ["relative", "library"],
  ["empty", ""],
  ["leading space", " /library"],
  ["trailing backslash", "/library\\"],
];

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("consumeReturnTo", () => {
  it.each(SAFE)("T-0392 AC1 passes through %j (AC4: key consumed)", (value) => {
    window.sessionStorage.setItem(KEY, value);
    expect(consumeReturnTo()).toBe(value);
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    expect(consumeReturnTo()).toBe("/");
  });

  it.each(UNSAFE)('T-0392 AC2 rejects %s → "/" (AC4: key consumed)', (_label, value) => {
    window.sessionStorage.setItem(KEY, value);
    expect(consumeReturnTo()).toBe("/");
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    expect(consumeReturnTo()).toBe("/");
  });

  it('T-0392 AC3 no stored key → "/" (AC4: second call still "/")', () => {
    expect(consumeReturnTo()).toBe("/");
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    expect(consumeReturnTo()).toBe("/");
  });

  it('T-0392 AC3 getItem throws → "/" without throwing (AC4: key still removed)', () => {
    window.sessionStorage.setItem(KEY, "/library");
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => consumeReturnTo()).not.toThrow();
    getItem.mockRestore();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    expect(consumeReturnTo()).toBe("/");
  });

  it('T-0392 AC3 getItem throws → returns exactly "/"', () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(consumeReturnTo()).toBe("/");
  });
});
