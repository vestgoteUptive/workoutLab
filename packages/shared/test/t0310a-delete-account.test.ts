// T-0310a (D-0135 §1, UF-11.4, NFR-PRIV-5): DELETE /account is the fourth Edge Function path.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT, spec } from "./support/spec.js";

type Obj = Record<string, unknown>;
const account = spec.paths["/account"] as Record<string, Obj> | undefined;
const op = (account?.["delete"] ?? {}) as Obj;
const responses = (op["responses"] ?? {}) as Record<string, Obj>;

describe("T-0310a AC1 the deleteAccount operation", () => {
  it("T-0310a AC1 /account has exactly one method, delete, with the D-0135 §1 fields", () => {
    expect(account, "spec.paths['/account']").toBeDefined();
    expect(Object.keys(account ?? {})).toEqual(["delete"]);
    expect(op["operationId"]).toBe("deleteAccount");
    expect(op["tags"]).toEqual(["account"]);
    expect(op["summary"]).toBe(
      "Delete the caller's account and every row they own (UF-11.4, NFR-PRIV-5)",
    );
    expect(op["summary"]).toContain("UF-11.4");
    expect(op["summary"]).toContain("NFR-PRIV-5");
  });

  it("T-0310a AC1 has no request body, no parameters and no operation-level security", () => {
    expect(account).toBeDefined();
    expect(op).not.toHaveProperty("requestBody");
    expect(op).not.toHaveProperty("parameters");
    expect(op).not.toHaveProperty("security");
    expect(spec["security"]).toEqual([{ bearerAuth: [] }]);
  });

  it("T-0310a AC1 the top-level tags include account", () => {
    const tags = spec["tags"] as { name: string; description?: string }[];
    const tag = tags.find((t) => t.name === "account");
    expect(tag).toBeDefined();
    expect(tag?.description).toBe("The caller's own account (NFR-PRIV-4, NFR-PRIV-5).");
  });
});

describe("T-0310a AC2 responses", () => {
  it("T-0310a AC2 the response keys are exactly 204, 401, 500", () => {
    expect(Object.keys(responses).sort()).toEqual(["204", "401", "500"]);
  });

  it("T-0310a AC2 204 has a description and no content", () => {
    expect(responses["204"]?.["description"]).toBe("Deleted. No body.");
    expect(responses["204"]).not.toHaveProperty("content");
  });

  it("T-0310a AC2 401 and 500 reference the shared responses", () => {
    expect(responses["401"]).toEqual({ $ref: "#/components/responses/Unauthorized" });
    expect(responses["500"]).toEqual({ $ref: "#/components/responses/Internal" });
  });

  it("T-0310a AC2 contrast: no 400, 403 or 404", () => {
    expect(Object.keys(responses).length).toBeGreaterThan(0);
    for (const status of ["400", "403", "404"]) expect(responses).not.toHaveProperty(status);
  });
});

describe("T-0310a AC3 description", () => {
  it("T-0310a AC3 the operation description names the cascade and the repeat-call 401", () => {
    const d = String(op["description"] ?? "");
    expect(d).toContain("on delete cascade");
    expect(d).toContain("D-0020");
    expect(d).toContain("A repeat call with the same token is 401");
    expect(d).toContain("never 404");
  });

  it("T-0310a AC3 info.description says four server-side functions", () => {
    const d = (spec["info"] as { description: string }).description;
    expect(d).toContain("four server-side functions");
    expect(d).not.toContain("three server-side functions");
  });
});

describe("T-0310a AC5 generated types", () => {
  const gen = readFileSync(path.join(REPO_ROOT, "packages/shared/src/api.gen.ts"), "utf8");

  it("T-0310a AC5 api.gen.ts has the /account delete path and operations.deleteAccount", () => {
    const pathBlock = gen.slice(gen.indexOf('"/account": {'));
    expect(gen).toContain('"/account": {');
    expect(pathBlock).toMatch(/delete: operations\["deleteAccount"\];/);
    expect(gen).toMatch(/\n {2}deleteAccount: \{/);
  });
});

describe("T-0310a AC6 no other contract moves", () => {
  it("T-0310a AC6 no new ApiError code and exactly four paths", () => {
    const apiError = spec.components.schemas["ApiError"] as {
      properties: { error: { properties: { code: { enum: string[] } } } };
    };
    expect(apiError.properties.error.properties.code.enum).toEqual([
      "invalid_request",
      "unauthorized",
      "not_found",
      "profile_missing",
      "internal",
    ]);
    expect(Object.keys(spec.paths).sort()).toEqual([
      "/account",
      "/balance",
      "/sessions/{id}/finish",
      "/workouts/suggest",
    ]);
  });
});
