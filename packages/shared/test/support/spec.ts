// Loads api/openapi.yaml and compiles its component schemas with Ajv (JSON Schema 2020-12,
// strict mode, ajv-formats), as the T-0102 acceptance criteria require.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { parse } from "yaml";

export const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
export const SPEC_PATH = fileURLToPath(new URL("../../../../api/openapi.yaml", import.meta.url));
export const SPEC_TEXT = readFileSync(SPEC_PATH, "utf8");

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export const spec = parse(SPEC_TEXT) as JsonObject & {
  paths: Record<string, Record<string, JsonObject>>;
  components: {
    schemas: Record<string, JsonObject>;
    responses: Record<string, JsonObject>;
    securitySchemes: Record<string, JsonObject>;
  };
};

const SCHEMA_ID = "https://workoutlab.local/api";

/** Rewrites `#/components/schemas/X` refs to `#/$defs/X` so Ajv can resolve them. */
function rewriteRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewriteRefs);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] =
        k === "$ref" && typeof v === "string"
          ? v.replace("#/components/schemas/", "#/$defs/")
          : rewriteRefs(v);
    }
    return out;
  }
  return node;
}

// ajv-formats is CommonJS; under ESM its callable export may sit on `.default`.
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ??
  addFormatsModule) as unknown as (ajv: Ajv2020) => Ajv2020;

const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true });
addFormats(ajv);
// OpenAPI annotation keywords: `discriminator` is informative here (oneOf + const already
// discriminates), `x-engine-function` names the engine function (D-0037 §2).
ajv.addKeyword({ keyword: "discriminator" });
ajv.addKeyword({ keyword: "x-engine-function" });
ajv.addSchema({ $id: SCHEMA_ID, $defs: rewriteRefs(spec.components.schemas) as object });

/** Returns true when `value` is valid against the named component schema. */
export function isValid(component: string, value: unknown): boolean {
  const validate = ajv.getSchema(`${SCHEMA_ID}#/$defs/${component}`);
  if (!validate) throw new Error(`unknown component ${component}`);
  return validate(value) as boolean;
}

/** Ajv errors for debugging a failing fixture. */
export function errorsFor(component: string, value: unknown): unknown {
  const validate = ajv.getSchema(`${SCHEMA_ID}#/$defs/${component}`);
  validate?.(value);
  return validate?.errors ?? null;
}

/** Deep clone for building negative fixtures. */
export function clone<T>(value: T): T {
  return structuredClone(value);
}

/** The first `examples` entry of a component, deep-cloned. */
export function exampleOf<T = JsonObject>(component: string): T {
  const schema = spec.components.schemas[component];
  const examples = schema?.["examples"];
  if (!Array.isArray(examples) || examples.length === 0) {
    throw new Error(`${component} has no example`);
  }
  return clone(examples[0]) as T;
}

export const OPERATIONS = Object.entries(spec.paths).flatMap(([path, item]) =>
  Object.entries(item)
    .filter(([method]) => ["get", "post", "put", "patch", "delete"].includes(method))
    .map(([method, op]) => ({ path, method, op })),
);
