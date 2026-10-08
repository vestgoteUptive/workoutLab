// T-0310b integration tests (real local stack, D-0135 §2, §5, UF-11.4, NFR-PRIV-5): DELETE
// /account through the `account` function deletes the caller's auth user, and the D-0020 cascade
// removes every owned row; another user's rows stay. Needs `supabase start` and the env from
// `supabase status -o env` (API_URL, ANON_KEY, SERVICE_ROLE_KEY). SERVICE_ROLE_KEY is used here,
// in test code only, to provision users and to count rows past RLS.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.58.0";
import {
  adminClient,
  callFunction,
  createTestUser,
  requireEnv,
  seedFullProfile,
} from "./helpers.ts";

const OWNED_TABLES = [
  "profiles",
  "area_targets",
  "sessions",
  "session_sets",
  "routines",
  "routine_items",
  "plan_checkins",
  "excluded_exercises",
  "favorite_exercises",
] as const;
type OwnedTable = (typeof OWNED_TABLES)[number];

async function countRows(table: OwnedTable, userId: string): Promise<number> {
  const { count, error } = await adminClient()
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

async function countAll(userId: string): Promise<Record<OwnedTable, number>> {
  const out = {} as Record<OwnedTable, number>;
  for (const table of OWNED_TABLES) out[table] = await countRows(table, userId);
  return out;
}

async function assertUserGone(userId: string): Promise<void> {
  const { data, error } = await adminClient().auth.admin.getUserById(userId);
  assert(error !== null || data.user === null, `auth user ${userId} still exists`);
}

function setRow(sessionId: string, index: number, at: string, deleted = false) {
  return {
    client_id: crypto.randomUUID(),
    session_id: sessionId,
    exercise_id: index % 2 === 0 ? "barbell-back-squat" : "push-up",
    set_index: index,
    kind: "reps",
    reps: 8,
    is_warmup: false,
    completed_at: at,
    edited_at: at,
    ...(deleted ? { deleted_at: at } : {}),
  };
}

async function insertSession(client: SupabaseClient, startedAt: string): Promise<string> {
  const { data, error } = await client
    .from("sessions")
    .insert({ started_at: startedAt, time_budget_min: 45 })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function insertRoutine(client: SupabaseClient, items: number): Promise<void> {
  const { data, error } = await client
    .from("routines")
    .insert({ name: "Lower A" })
    .select("id")
    .single();
  if (error) throw error;
  const rows = Array.from({ length: items }, (_, i) => ({
    routine_id: data.id as string,
    position: i,
    exercise_id: i % 2 === 0 ? "barbell-back-squat" : "push-up",
    sets: 3,
    reps_min: 6,
    reps_max: 10,
  }));
  const { error: itemsError } = await client.from("routine_items").insert(rows);
  if (itemsError) throw itemsError;
}

async function insertCheckin(client: SupabaseClient): Promise<void> {
  const { error } = await client.from("plan_checkins").insert({
    period_index: 3,
    completed_prev: 4,
    completed_last: 3,
    rhythm_min_before: 3,
    rhythm_max_before: 4,
    proposed_min: 2,
    proposed_max: 3,
    proposed_at: "2026-09-27T07:00:00Z",
  });
  if (error) throw error;
}

// T-0535 AC5 (D-0199 §4): the "never suggest" list goes with the auth user.
async function insertExclusions(client: SupabaseClient, ids: string[]): Promise<void> {
  const { error } = await client
    .from("excluded_exercises")
    .insert(ids.map((exercise_id) => ({ exercise_id })));
  if (error) throw error;
}

// T-0564 AC7 (D-0202 §5): the favorites list goes with the auth user too.
async function insertFavorites(client: SupabaseClient, ids: string[]): Promise<void> {
  const { error } = await client
    .from("favorite_exercises")
    .insert(ids.map((exercise_id) => ({ exercise_id })));
  if (error) throw error;
}

function deleteAccount(accessToken: string): Promise<Response> {
  return callFunction("/account", { method: "DELETE", accessToken });
}

// --- AC8 + AC9 (repeat call) -------------------------------------------------------------------

Deno.test(
  "T-0310b AC8: DELETE /account removes A's auth user and every owned row; B is untouched (AC9: a repeat call is 401)",
  async () => {
    const a = await createTestUser();
    const b = await createTestUser();

    // A: profile + 9 targets, 2 sessions with 6 sets (1 tombstoned), 1 routine with 2 items, 1 check-in,
    // 2 exclusions, 2 favorites (other exercises: a favorite removes the same exclusion, D-0202 §5).
    await seedFullProfile(a.client);
    const a1 = await insertSession(a.client, "2026-09-20T09:00:00Z");
    const a2 = await insertSession(a.client, "2026-09-22T09:00:00Z");
    const aSets = [0, 1, 2, 3, 4, 5].map((i) =>
      setRow(i < 3 ? a1 : a2, i, i < 3 ? "2026-09-20T10:00:00Z" : "2026-09-22T10:00:00Z", i === 5),
    );
    const { error: aSetsError } = await a.client.from("session_sets").insert(aSets);
    if (aSetsError) throw aSetsError;
    await insertRoutine(a.client, 2);
    await insertCheckin(a.client);
    await insertExclusions(a.client, ["barbell-back-squat", "push-up"]);
    await insertFavorites(a.client, ["barbell-bench-press", "plank"]);

    // B: one row of each kind (and the 9 targets seedFullProfile writes).
    await seedFullProfile(b.client);
    const b1 = await insertSession(b.client, "2026-09-22T09:00:00Z");
    const { error: bSetError } = await b.client
      .from("session_sets")
      .insert([setRow(b1, 0, "2026-09-22T10:00:00Z")]);
    if (bSetError) throw bSetError;
    await insertRoutine(b.client, 1);
    await insertCheckin(b.client);
    await insertExclusions(b.client, ["push-up"]);
    await insertFavorites(b.client, ["plank"]);

    const expectedA = {
      profiles: 1,
      area_targets: 9,
      sessions: 2,
      session_sets: 6,
      routines: 1,
      routine_items: 2,
      plan_checkins: 1,
      excluded_exercises: 2,
      favorite_exercises: 2,
    };
    const expectedB = {
      profiles: 1,
      area_targets: 9,
      sessions: 1,
      session_sets: 1,
      routines: 1,
      routine_items: 1,
      plan_checkins: 1,
      excluded_exercises: 1,
      favorite_exercises: 1,
    };
    assertEquals(await countAll(a.userId), expectedA, "A's fixture is in place");
    assertEquals(await countAll(b.userId), expectedB, "B's fixture is in place");

    const res = await deleteAccount(a.accessToken);
    assertEquals(res.status, 204);
    assertEquals(await res.text(), "");

    await assertUserGone(a.userId);
    assertEquals(await countAll(a.userId), {
      profiles: 0,
      area_targets: 0,
      sessions: 0,
      session_sets: 0,
      routines: 0,
      routine_items: 0,
      plan_checkins: 0,
      excluded_exercises: 0,
      favorite_exercises: 0,
    });
    assertEquals(await countAll(b.userId), expectedB, "B's counts are unchanged");

    const balance = await callFunction("/balance?tz=Europe/Stockholm", {
      accessToken: b.accessToken,
    });
    assertEquals(balance.status, 200);
    await balance.body?.cancel();

    // AC9: the same (now orphaned) token no longer verifies: 401, never 404 or 500.
    const repeat = await deleteAccount(a.accessToken);
    assertEquals(repeat.status, 401);
    assertEquals((await repeat.json()).error.code, "unauthorized");
  },
);

// --- AC9: zero history -------------------------------------------------------------------------

Deno.test("T-0310b AC9: a user with no profile and no rows is deleted (204)", async () => {
  const c = await createTestUser();
  assertEquals(
    Object.values(await countAll(c.userId)).reduce((x, y) => x + y, 0),
    0,
    "C has no rows",
  );
  const res = await deleteAccount(c.accessToken);
  assertEquals(res.status, 204);
  assertEquals(await res.text(), "");
  await assertUserGone(c.userId);
});

// --- T-0503 AC-3: the auth audit log is purged too (D-0188 §1) ---------------------------------

/** Runs one scalar `select` against the local database with psql (PostgREST doesn't expose
 * `auth`), the way seed-roundtrip.test.ts does. Values are passed as psql variables and quoted
 * by psql (`:'name'`), never spliced into the SQL text; the script goes in on stdin. */
async function psqlScalar(sql: string, vars: Record<string, string>): Promise<string> {
  const args = [requireEnv("DB_URL"), "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"];
  for (const [name, value] of Object.entries(vars)) args.push("-v", `${name}=${value}`);
  const child = new Deno.Command("psql", {
    args,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(`${sql}\n`));
  await writer.close();
  const { code, stdout, stderr } = await child.output();
  if (code !== 0) throw new Error(`psql exited ${code}: ${new TextDecoder().decode(stderr)}`);
  return new TextDecoder().decode(stdout).trim();
}

async function countAuditById(userId: string): Promise<number> {
  return Number(
    await psqlScalar(
      "select count(*) from auth.audit_log_entries where payload->>'actor_id' = :'uid';",
      { uid: userId },
    ),
  );
}

/** Any audit row that mentions the user's id or email anywhere in the payload. A substring match
 * is fine here (only in the test): the test emails and ids are unique. */
async function countAuditMentions(userId: string, email: string): Promise<number> {
  return Number(
    await psqlScalar(
      "select count(*) from auth.audit_log_entries" +
        " where payload::text like '%' || :'uid' || '%'" +
        " or payload::text ilike '%' || :'email' || '%';",
      { uid: userId, email },
    ),
  );
}

Deno.test(
  "T-0503 AC-3: DELETE /account also removes every auth.audit_log_entries row naming A; B's rows stay",
  async () => {
    const a = await createTestUser();
    const b = await createTestUser();

    // Precondition: GoTrue logs to Postgres locally (each createTestUser signs in with a password).
    const aBefore = await countAuditById(a.userId);
    assert(
      aBefore >= 1,
      "precondition: no audit row with actor_id = A; Postgres audit logging is off, test is void",
    );
    const bBefore = await countAuditById(b.userId);
    assert(bBefore >= 1, "precondition: B has a login audit row");

    const res = await deleteAccount(a.accessToken);
    assertEquals(res.status, 204);
    await res.body?.cancel();
    await assertUserGone(a.userId);

    assertEquals(
      await countAuditMentions(a.userId, a.email),
      0,
      "no audit row mentions A's id or email",
    );
    assertEquals(await countAuditById(b.userId), bBefore, "B's login rows are unchanged");
  },
);

// --- AC10: 2 years of data within 10 s -----------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSIONS = 400;
const SETS = 5000;
const BATCH = 500;

Deno.test({
  name: "T-0310b AC10: 400 sessions over 730 days and 5,000 sets are deleted within 10 s",
  // The seeding takes most of the time; the 10 s bound is measured around the DELETE call only.
  fn: async () => {
    const timeout = setTimeout(() => {
      throw new Error("T-0310b AC10: seeding + delete exceeded 120 s");
    }, 120_000);
    try {
      const d = await createTestUser();
      await seedFullProfile(d.client);

      const start = Date.parse("2024-10-01T07:00:00Z");
      const sessionRows = Array.from({ length: SESSIONS }, (_, i) => ({
        started_at: new Date(start + Math.floor((i * 730 * DAY_MS) / SESSIONS)).toISOString(),
        time_budget_min: 45,
      }));
      const sessionIds: Array<{ id: string; started_at: string }> = [];
      for (let i = 0; i < sessionRows.length; i += BATCH) {
        const { data, error } = await d.client
          .from("sessions")
          .insert(sessionRows.slice(i, i + BATCH))
          .select("id, started_at");
        if (error) throw error;
        sessionIds.push(...(data as Array<{ id: string; started_at: string }>));
      }
      assertEquals(sessionIds.length, SESSIONS);

      const setRows = Array.from({ length: SETS }, (_, i) => {
        const s = sessionIds[i % SESSIONS];
        return setRow(s.id, Math.floor(i / SESSIONS), s.started_at);
      });
      for (let i = 0; i < setRows.length; i += BATCH) {
        const { error } = await d.client.from("session_sets").insert(setRows.slice(i, i + BATCH));
        if (error) throw error;
      }
      assertEquals(await countRows("session_sets", d.userId), SETS);

      const t0 = performance.now();
      const res = await deleteAccount(d.accessToken);
      const elapsed = performance.now() - t0;
      await res.body?.cancel();
      assertEquals(res.status, 204);
      assert(elapsed < 10_000, `DELETE took ${Math.round(elapsed)} ms (limit 10,000 ms)`);
      console.error(`T-0310b AC10: DELETE /account took ${Math.round(elapsed)} ms`);

      assertEquals(await countRows("session_sets", d.userId), 0);
      await assertUserGone(d.userId);
    } finally {
      clearTimeout(timeout);
    }
  },
});
