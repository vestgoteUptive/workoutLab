// T-0514a (go-live review F-4): the public bundle must never carry a secret Supabase key.
// Dependency-free: vite.config.ts loads this through Node's native ESM loader.
// The error messages never contain the key or any part of it.

import { Buffer } from "node:buffer";

const SECRET_PREFIX = "sb_secret_";

/** @param {string} value */
function isServiceRoleJwt(value) {
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload === "object" && payload !== null && payload.role === "service_role";
  } catch {
    return false;
  }
}

/**
 * Throws when `value` is a Supabase secret key: an `sb_secret_` key (prefix at the start,
 * followed by a key body) or a JWT whose payload role is `service_role`.
 * @param {string} value
 */
export function assertPublicAnonKey(value) {
  if (value.startsWith(SECRET_PREFIX) && value.length > SECRET_PREFIX.length) {
    throw new Error(
      "@workoutlab/web build refuses VITE_SUPABASE_ANON_KEY: it is a Supabase secret key (sb_secret_). " +
        "Use the publishable or anon key; a secret key would ship in the public bundle.",
    );
  }
  if (isServiceRoleJwt(value)) {
    throw new Error(
      "@workoutlab/web build refuses VITE_SUPABASE_ANON_KEY: it is a service_role JWT. " +
        "Use the publishable or anon key; a service_role key would ship in the public bundle.",
    );
  }
}
