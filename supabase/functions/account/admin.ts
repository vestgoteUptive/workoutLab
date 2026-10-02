// The one service-role reader under supabase/functions/ (D-0135 §3). It exports a single function,
// `deleteAuthUser(userId)`, which hard-deletes the auth user with the Auth admin API; the
// `on delete cascade` FKs (D-0020) remove every row the user owns in the same step. The caller
// (`core.ts`) passes only the id from the verified JWT. This file makes no table, RPC, storage or
// schema call: the admin client is used for that one delete and nothing else. A static test
// (`supabase/tests/scripts/functions-platform.test.mjs`) fences the key to this file.
import { createClient } from "@supabase/supabase-js";

/** Hard-deletes the auth user `userId` (shouldSoftDelete false). Rejects when SUPABASE_URL or the
 * service-role key is missing (before any network call) or when the admin API returns an error.
 * The thrown messages carry no user id, so they are safe even if logged; `createHandler` maps
 * any throw to 500 `internal` with the fixed message anyway (D-0053 §5). */
export async function deleteAuthUser(userId: string): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("account: admin environment is not configured");
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.auth.admin.deleteUser(userId, false);
  if (error) {
    throw new Error("account: auth admin delete failed");
  }
}
