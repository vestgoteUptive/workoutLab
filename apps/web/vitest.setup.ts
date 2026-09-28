import "@testing-library/jest-dom/vitest";
// Polyfills `indexedDB` globally (T-0300c, AC-C1 etc.): Dexie needs a real IndexedDB, and jsdom
// doesn't provide one. Each offline test gets isolation by opening a fresh, uniquely named
// Dexie database (see `freshOfflineDb()` in `lib/offline/__tests__/test-helpers.ts`).
import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
