// Bearer-JWT auth (D-0053 §4). `verify_jwt = false` in config.toml, so the gateway never answers
// with a non-ApiError 401: each function checks the token itself and returns 401 `unauthorized`
// in the envelope when it's missing, malformed or expired. Every DB call uses a client that
// carries the caller's JWT, so RLS applies; this file never reads SUPABASE_SERVICE_ROLE_KEY.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@workoutlab/shared";
import { unauthorized } from "./errors.ts";

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

/** Verifies the bearer token and returns an authenticated Supabase client. Throws 401 on any
 * failure: missing header, malformed header, or a token `auth.getUser` rejects (garbage or
 * expired). Reads SUPABASE_URL and SUPABASE_ANON_KEY only (never the service-role key). */
export async function authenticate(req: Request): Promise<AuthContext> {
  const token = bearerToken(req);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (supabaseUrl === undefined || anonKey === undefined) {
    throw unauthorized();
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
