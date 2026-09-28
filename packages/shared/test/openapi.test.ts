// T-0102a AC1–AC5: the OpenAPI v1 document itself (D-0037 §1–§4, gap B2).
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createConfig, lint } from "@redocly/openapi-core";
import { describe, expect, it } from "vitest";
import { OPERATIONS, REPO_ROOT, SPEC_PATH, SPEC_TEXT, isValid, spec } from "./support/spec.js";

describe("AC1 valid OpenAPI 3.1", () => {
  it("lints with 0 errors under the redocly recommended ruleset", async () => {
    const config = await createConfig({ extends: ["recommended"] });
    const problems = await lint({ ref: SPEC_PATH, config });
    const errors = problems
      .filter((p) => p.severity === "error")
      .map((p) => `${p.ruleId}: ${p.message}`);
    expect(errors).toEqual([]);
  });

  it("is openapi 3.1.0, info.version 1.0.0", () => {
    expect(spec["openapi"]).toBe("3.1.0");
    expect((spec["info"] as { version: string }).version).toBe("1.0.0");
  });
});

describe("AC2 exactly the three Edge Function paths (gap B2, D-0001)", () => {
  it("has only suggest, balance and finish", () => {
    const ops = OPERATIONS.map(({ method, path: p }) => `${method.toUpperCase()} ${p}`).sort();
    expect(ops).toEqual(["GET /balance", "POST /sessions/{id}/finish", "POST /workouts/suggest"]);
  });

  it("drops the plain-CRUD paths", () => {
    const paths = Object.keys(spec.paths);
    for (const gone of [
      "/profile",
      "/exercises",
      "/exercises/{id}",
      "/sessions",
      "/sessions/{id}/sets",
    ]) {
      expect(paths).not.toContain(gone);
    }
  });
});

describe("AC3 v2 screen IDs (D-0002, D-0023 §1)", () => {
  const summary = (p: string, m: string) => String(spec.paths[p]?.[m]?.["summary"] ?? "");

  it("uses UF-08.1 / UF-10.1 / UF-03.3 in the summaries and no v1 IDs", () => {
    const suggest = summary("/workouts/suggest", "post");
    expect(suggest).toContain("UF-08.1");
    expect(suggest).not.toContain("UF-04");
    const balance = summary("/balance", "get");
    expect(balance).toContain("UF-10.1");
    expect(balance).not.toMatch(/UF-03|UF-08/);
    const finish = summary("/sessions/{id}/finish", "post");
    expect(finish).toContain("UF-03.3");
    expect(finish).not.toContain("UF-07");
  });

  it("every UF-NN(.n) in the file exists in the user-flows v2 flow index", async () => {
    // Reuse the D-0023 §1 checker's parser so this test and `pnpm check:repo` agree.
    const checker = pathToFileURL(path.join(REPO_ROOT, ".github/scripts/check-screen-ids.mjs"));
    const { buildValidScreenIds } = (await import(checker.href)) as {
      buildValidScreenIds: (content: string) => {
        flows: Set<string>;
        steps: Map<string, Set<number>>;
      };
    };
    const { flows, steps } = buildValidScreenIds(
      readFileSync(path.join(REPO_ROOT, "Design-docs/docs/product/user-flows.md"), "utf8"),
    );
    const known = new Set<string>();
    for (const flow of flows) {
      known.add(`UF-${flow}`);
      for (const step of steps.get(flow) ?? []) known.add(`UF-${flow}.${step}`);
    }
    expect(known.has("UF-09.8")).toBe(true);
    const used = [...new Set(SPEC_TEXT.match(/UF-\d{2}(?:\.\d+)?/g) ?? [])];
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((id) => !known.has(id))).toEqual([]);
  });
});

describe("AC4 bearer auth on every operation (D-0037 §3)", () => {
  it("defines bearerAuth as HTTP bearer JWT and applies it globally", () => {
    const schemes = spec.components.securitySchemes;
    expect(schemes["bearerAuth"]).toMatchObject({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
    expect(spec["security"]).toEqual([{ bearerAuth: [] }]);
  });

  it("no operation is anonymous and each has the shared 401", () => {
    for (const { op } of OPERATIONS) {
      const security = op["security"];
      if (security !== undefined) expect(security).not.toEqual([]);
      const responses = op["responses"] as Record<string, { $ref?: string }>;
      expect(responses["401"]?.$ref).toBe("#/components/responses/Unauthorized");
    }
  });
});

describe("AC5 one error envelope (D-0037 §4, NFR-PRIV-7)", () => {
  const ok = { error: { code: "not_found", message: "Session not found", requestId: "req_01" } };

  it("accepts the envelope and rejects an unknown code or extra key", () => {
    expect(isValid("ApiError", ok)).toBe(true);
    expect(isValid("ApiError", { error: { ...ok.error, code: "forbidden" } })).toBe(false);
    expect(isValid("ApiError", { ...ok, email: "a@b.se" })).toBe(false);
  });

  const responseSchemaRef = (ref: string | undefined): string | undefined => {
    const name = ref?.replace("#/components/responses/", "") ?? "";
    const response = spec.components.responses[name] as
      { content?: { "application/json"?: { schema?: { $ref?: string } } } } | undefined;
    return response?.content?.["application/json"]?.schema?.$ref;
  };

  it("every operation has 400/401/500 ApiError, finish 404, suggest and balance 422", () => {
    const expected: Record<string, string[]> = {
      "POST /workouts/suggest": ["400", "401", "422", "500"],
      "GET /balance": ["400", "401", "422", "500"],
      "POST /sessions/{id}/finish": ["400", "401", "404", "500"],
    };
    for (const { method, path: p, op } of OPERATIONS) {
      const responses = op["responses"] as Record<string, { $ref?: string }>;
      for (const status of expected[`${method.toUpperCase()} ${p}`] ?? []) {
        expect(responseSchemaRef(responses[status]?.$ref), `${p} ${status}`).toBe(
          "#/components/schemas/ApiError",
        );
      }
    }
  });

  it("422 examples use profile_missing and every error example is valid and has no @", () => {
    const suggest = spec.paths["/workouts/suggest"]?.["post"]?.["responses"] as Record<
      string,
      { $ref: string }
    >;
    const balance = spec.paths["/balance"]?.["get"]?.["responses"] as Record<
      string,
      { $ref: string }
    >;
    for (const r of [suggest["422"], balance["422"]]) {
      const name = r?.$ref.replace("#/components/responses/", "") ?? "";
      const example = (
        spec.components.responses[name] as {
          content: { "application/json": { example: { error: { code: string } } } };
        }
      ).content["application/json"].example;
      expect(example.error.code).toBe("profile_missing");
    }
    for (const response of Object.values(spec.components.responses)) {
      const example = (response as { content?: { "application/json"?: { example?: unknown } } })
        .content?.["application/json"]?.example;
      expect(example).toBeDefined();
      expect(isValid("ApiError", example)).toBe(true);
      expect(JSON.stringify(example)).not.toContain("@");
    }
  });
});
