// Shared helpers for the T-0203b integration tests (CI only — real local stack).
// Env (from `supabase status -o env`, D-0053):
//   API_URL           e.g. http://127.0.0.1:54321
//   ANON_KEY          the local anon JWT
//   SERVICE_ROLE_KEY  admin key, used only from test code to provision fixture users/data —
//                      never from function code (D-0053 §4).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not set (expected from \`supabase status -o env\`)`);
  }
  return value;
}

export function adminClient(): SupabaseClient {
  return createClient(requireEnv("API_URL"), requireEnv("SERVICE_ROLE_KEY"));
}

export function anonClient(): SupabaseClient {
  return createClient(requireEnv("API_URL"), requireEnv("ANON_KEY"));
}

let counter = 0;

/** Creates a confirmed test user via the admin API and returns their id + a signed-in access
 * token (used as the bearer token against the functions under test). */
export async function createTestUser(): Promise<{
  userId: string;
  accessToken: string;
  client: SupabaseClient;
}> {
  counter += 1;
  const email = `t0203b-${Date.now()}-${counter}@test.local`;
  const password = "correct horse battery staple 1!";
  const admin = adminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw createError ?? new Error("createUser returned no user");
  }

  const anon = anonClient();
  const { data: signedIn, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !signedIn.session) {
    throw signInError ?? new Error("signInWithPassword returned no session");
  }

  const client = createClient(requireEnv("API_URL"), requireEnv("ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${signedIn.session.access_token}` } },
  });

  return { userId: created.user.id, accessToken: signedIn.session.access_token, client };
}

export const AREAS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
] as const;

const BASE_TARGETS: Record<(typeof AREAS)[number], number> = {
  chest: 20,
  back: 20,
  shoulders: 16,
  arms: 12,
  core: 12,
  glutes: 20,
  quads: 20,
  hamstrings: 16,
  calves: 12,
};

/** Inserts a complete profile (goal build_muscle, level intermediate, the ticket's fixture
 * equipment, rhythm 3–4) and 9 area_targets for the given authenticated client (RLS: `auth.uid()`
 * defaults `user_id`, so no explicit user id is passed). */
export async function seedFullProfile(client: SupabaseClient, areaCount = 9): Promise<void> {
  const { error: profileError } = await client.from("profiles").insert({
    goal: "build_muscle",
    level: "intermediate",
    equipment: ["barbell", "rack", "bench", "dumbbell"],
    rhythm_min: 3,
    rhythm_max: 4,
  });
  if (profileError) throw profileError;

  const rows = AREAS.slice(0, areaCount).map((area) => ({
    area_id: area,
    sets_per_14d: BASE_TARGETS[area],
  }));
  const { error: targetsError } = await client.from("area_targets").insert(rows);
  if (targetsError) throw targetsError;
}

/**
 * Calls the local functions gateway at the given OpenAPI path (e.g. `/workouts/suggest`,
 * `/balance?tz=...`). Supabase dispatches `/functions/v1/<path>` to whichever function is named
 * by the path's first segment (D-0053 §3), so the path alone is enough — it never repeats the
 * function name.
 */
export async function callFunction(
  path: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<Response> {
  const { accessToken, headers, ...rest } = init;
  const finalHeaders = new Headers(headers);
  if (accessToken !== undefined) finalHeaders.set("Authorization", `Bearer ${accessToken}`);
  const apiUrl = requireEnv("API_URL");
  return fetch(`${apiUrl}/functions/v1${path}`, { ...rest, headers: finalHeaders });
}
