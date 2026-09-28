// Bearer-JWT auth (D-0053 §4). `verify_jwt = false` in config.toml, so the gateway never answers
// with a non-ApiError 401: each function checks the token itself and returns 401 `unauthorized`
// in the envelope when it's missing, malformed or expired. Every DB call uses a client that
// carries the caller's JWT, so RLS applies; this file never reads SUPABASE_SERVICE_ROLE_KEY.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@workoutlab/shared";
import { internalError, unauthorized } from "./errors.ts";

export interface AuthContext {
  userId: string;
  /** A client authenticated as the caller (RLS applies). Never the service-role key. */
  supabase: SupabaseClient<Database>;
}

function bearerToken(req: Request): string {
  const header = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (header === null) throw unauthorized();
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (match === null || match[1].trim().length === 0) throw unauthorized();
  return match[1].trim();
}

function base64UrlDecode(segment: string): string {
  const padded = segment
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(segment.length / 4) * 4, "=");
  return atob(padded);
}

/** A cheap local check of the JWT's `exp` claim, ahead of the network round-trip to
 * `auth.getUser`. Never trusts the token's signature (that's still `auth.getUser`'s job) — this
 * only rejects a token that is unambiguously expired, so an expired token gets 401 even if the
 * claim can't be parsed (fails closed, not open). */
export function isExpired(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false; // malformed shape: let auth.getUser reject it as garbage
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as { exp?: unknown };
    if (typeof payload.exp !== "number") return false;
    return payload.exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}

/** Verifies the bearer token and returns an authenticated Supabase client. Throws 401 on any
 * caller-side failure: missing header, malformed header, or a token `auth.getUser` rejects
 * (garbage or expired). Throws 500 `internal` when the platform itself is misconfigured (missing
 * SUPABASE_URL or SUPABASE_ANON_KEY) — that is never the caller's fault, so it must not be
 * reported as 401. Reads SUPABASE_URL and SUPABASE_ANON_KEY only (never the service-role key). */
export async function authenticate(req: Request): Promise<AuthContext> {
  const token = bearerToken(req);
  if (isExpired(token)) throw unauthorized();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (supabaseUrl === undefined || anonKey === undefined) {
    throw internalError();
  }
  const supabase = createClient<Database>(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || data.user === null) {
    throw unauthorized();
  }
  return { userId: data.user.id, supabase };
}
