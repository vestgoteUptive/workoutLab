// T-0203c integration tests (CI only): POST /sessions/{id}/finish against a real
// `supabase functions serve` + seeded local stack. Covers D-0053 §7 (the latest endedAt wins),
// §8 (the summary is a pure function of the stored row) and the ticket's fixture session S:
// startedAt 2026-09-28T07:00:00Z, timeBudgetMin 30, 3 live hard sets (2 x barbell-back-squat,
// 1 x push-up), 1 warm-up set (jumping-jacks) and 1 tombstoned hard set.
// 30 x 60 + 120 = 1920 s (the withinBudget boundary, AC25).
import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Ajv2020 } from "npm:ajv@8.20.0/dist/2020.js";
import { parse as parseYaml } from "npm:yaml@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.58.0";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  callFunction as callFunctionRaw,
  createTestUser as createTestUserRaw,
  seedFullProfile,
} from "./helpers.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..");
const SPEC_PATH = join(REPO_ROOT, "api", "openapi.yaml");

const REQUEST_ID_RE = /^req_[0-9a-f-]{36}$/;

async function loadSpec(): Promise<Record<string, unknown>> {
  const text = await Deno.readTextFile(SPEC_PATH);
  return parseYaml(text) as Record<string, unknown>;
}

async function schemaValidator(schemaName: string) {
  const spec = await loadSpec();
  const ajv = new Ajv2020({ strict: false });
  const schemas = (spec.components as Record<string, unknown>).schemas as Record<string, unknown>;
  for (const [name, schema] of Object.entries(schemas)) {
    ajv.addSchema(schema as object, `#/components/schemas/${name}`);
  }
  return ajv.getSchema(`#/components/schemas/${schemaName}`)!;
}

async function assertValidatesAgainst(schemaName: string, body: unknown): Promise<void> {
  const validate = await schemaValidator(schemaName);
  const ok = validate(body);
  assert(ok, `body did not validate against ${schemaName}: ${JSON.stringify(validate.errors)}`);
}

/** Compares two ISO instants by their millisecond value, not their exact string form — Postgres
 * returns `timestamptz` values as `...+00:00` while requests use `Z`, and both are the same
 * instant. `expected: null` requires `actual` to literally be `null` (unset). */
function assertInstantEquals(actual: string | null, expected: string | null): void {
  if (expected === null) {
    assertEquals(actual, null);
    return;
  }
  assert(actual !== null, `expected ${expected}, got null`);
  assertEquals(new Date(actual).getTime(), new Date(expected).getTime());
}

/** Asserts a session's `ended_at`/`effort_rating` are still the untouched defaults (null),
 * used by every AC30 case to prove a validation failure never reaches the write (D-0053 §7). */
async function assertSessionUnfinished(client: SupabaseClient, sessionId: string): Promise<void> {
  const { data: row, error } = await client
    .from("sessions")
    .select("ended_at, effort_rating")
    .eq("id", sessionId)
    .single();
  if (error) throw error;
  assertInstantEquals(row.ended_at, null);
  assertEquals(row.effort_rating, null);
}

function assertEnvelope(body: unknown, code: string, namedField?: string): void {
  const err = (body as { error: { code: string; message: string; requestId: string } }).error;
  assertEquals(err.code, code);
  assertMatch(err.requestId, REQUEST_ID_RE);
  if (namedField !== undefined) {
    assert(
      err.message.includes(namedField),
      `expected the message to name "${namedField}": ${err.message}`,
    );
  }
}

const knownIdentities: string[] = [];
const errorResponseBodies: string[] = [];

async function createTestUser(): ReturnType<typeof createTestUserRaw> {
  const user = await createTestUserRaw();
  knownIdentities.push(user.userId);
  return user;
}

async function callFunction(...args: Parameters<typeof callFunctionRaw>): Promise<Response> {
  const res = await callFunctionRaw(...args);
  if (res.status >= 400) {
    const raw = await res.clone().text();
    errorResponseBodies.push(raw);
  }
  return res;
}

const TZ = "Europe/Stockholm";
const STARTED_AT = "2026-09-28T07:00:00Z";

/** Inserts the ticket's fixture session S (started_at, time_budget_min 30) with 3 live hard sets
 * (2 x barbell-back-squat, 1 x push-up), 1 warm-up set and 1 tombstoned hard set, and returns the
 * session id. */
async function seedSessionS(client: SupabaseClient): Promise<string> {
  const { data: session, error: sessionError } = await client
    .from("sessions")
    .insert({ started_at: STARTED_AT, time_budget_min: 30 })
    .select("id")
    .single();
  if (sessionError) throw sessionError;
  const sessionId = session.id as string;

  const rows = [
    {
      client_id: crypto.randomUUID(),
      session_id: sessionId,
      exercise_id: "barbell-back-squat",
      set_index: 0,
      kind: "reps",
      reps: 5,
      weight_kg: 80,
      is_warmup: false,
      completed_at: STARTED_AT,
      edited_at: STARTED_AT,
    },
    {
      client_id: crypto.randomUUID(),
      session_id: sessionId,
      exercise_id: "barbell-back-squat",
      set_index: 1,
      kind: "reps",
      reps: 5,
      weight_kg: 80,
      is_warmup: false,
      completed_at: STARTED_AT,
      edited_at: STARTED_AT,
    },
    {
      client_id: crypto.randomUUID(),
      session_id: sessionId,
      exercise_id: "push-up",
      set_index: 2,
      kind: "reps",
      reps: 15,
      is_warmup: false,
      completed_at: STARTED_AT,
      edited_at: STARTED_AT,
    },
    {
      client_id: crypto.randomUUID(),
      session_id: sessionId,
      exercise_id: "jumping-jacks",
      set_index: 3,
      kind: "reps",
      reps: 20,
      is_warmup: true,
      completed_at: STARTED_AT,
      edited_at: STARTED_AT,
    },
    // Tombstoned hard set: must not count toward hardSets/exerciseCount/weightedSetsByArea.
    {
      client_id: crypto.randomUUID(),
      session_id: sessionId,
      exercise_id: "barbell-back-squat",
      set_index: 4,
      kind: "reps",
      reps: 5,
      weight_kg: 80,
      is_warmup: false,
      completed_at: STARTED_AT,
      edited_at: STARTED_AT,
      deleted_at: STARTED_AT,
    },
  ];
  const { error: setsError } = await client.from("session_sets").insert(rows);
  if (setsError) throw setsError;

  return sessionId;
}

async function finish(
  accessToken: string,
  sessionId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return callFunction(`/sessions/${sessionId}/finish`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// --- AC24: basic finish + schema validity --------------------------------------------------

Deno.test(
  "AC24: finishing S at 07:31 gives durationS 1860, hardSets 3, exerciseCount 2, quads>=2 chest=1, schema-valid",
  async () => {
    const user = await createTestUser();
    await seedFullProfile(user.client);
    const sessionId = await seedSessionS(user.client);

    const res = await finish(user.accessToken, sessionId, {
      endedAt: "2026-09-28T07:31:00Z",
      effortRating: 4,
      tz: TZ,
    });
    assertEquals(res.status, 200);
    const summary = await res.json();
    await assertValidatesAgainst("SessionSummary", summary);
    assertEquals(summary.durationS, 1860);
    assertEquals(summary.timeBudgetMin, 30);
    assertEquals(summary.withinBudget, true);
    assertEquals(summary.hardSets, 3);
    assertEquals(summary.exerciseCount, 2);
    assertEquals(Object.keys(summary.weightedSetsByArea).length, 9);
    assert(summary.weightedSetsByArea.quads >= 2);
    assertEquals(summary.weightedSetsByArea.chest, 1);
    await assertValidatesAgainst("BalanceResult", summary.balance);

    const { data: row, error } = await user.client
      .from("sessions")
      .select("ended_at, effort_rating")
      .eq("id", sessionId)
      .single();
    if (error) throw error;
    assertInstantEquals(row.ended_at, "2026-09-28T07:31:00Z");
    assertEquals(row.effort_rating, 4);
  },
);

// --- AC25: withinBudget boundary -------------------------------------------------------------

Deno.test("AC25: finishing at exactly 1920s (07:32:00) is withinBudget true", async () => {
  const user = await createTestUser();
  await seedFullProfile(user.client);
  const sessionId = await seedSessionS(user.client);
  const res = await finish(user.accessToken, sessionId, {
    endedAt: "2026-09-28T07:32:00Z",
    tz: TZ,
  });
  assertEquals(res.status, 200);
  const summary = await res.json();
  assertEquals(summary.durationS, 1920);
  assertEquals(summary.withinBudget, true);
});

Deno.test("AC25: finishing at 1921s (07:32:01) is 200 with withinBudget false", async () => {
  const user = await createTestUser();
  await seedFullProfile(user.client);
  const sessionId = await seedSessionS(user.client);
  const res = await finish(user.accessToken, sessionId, {
    endedAt: "2026-09-28T07:32:01Z",
    tz: TZ,
  });
  assertEquals(res.status, 200);
  const summary = await res.json();
  assertEquals(summary.durationS, 1921);
  assertEquals(summary.withinBudget, false);
});

// --- AC26: idempotent ------------------------------------------------------------------------

Deno.test("AC26: repeating the identical finish returns a deep-equal body; the row is unchanged", async () => {
  const user = await createTestUser();
  await seedFullProfile(user.client);
  const sessionId = await seedSessionS(user.client);

  const first = await finish(user.accessToken, sessionId, {
    endedAt: "2026-09-28T07:31:00Z",
    effortRating: 4,
    tz: TZ,
  });
  assertEquals(first.status, 200);
  const firstBody = await first.json();

  const second = await finish(user.accessToken, sessionId, {
    endedAt: "2026-09-28T07:31:00Z",
    effortRating: 4,
    tz: TZ,
  });
  assertEquals(second.status, 200);
  const secondBody = await second.json();
  assertEquals(secondBody, firstBody);

  const { data: row, error } = await user.client
    .from("sessions")
    .select("ended_at, effort_rating")
    .eq("id", sessionId)
    .single();
  if (error) throw error;
  assertInstantEquals(row.ended_at, "2026-09-28T07:31:00Z");
  assertEquals(row.effort_rating, 4);
});

// --- AC27: the latest endedAt wins -----------------------------------------------------------

Deno.test(
  "AC27: a later finish (07:40) overwrites 07:31; an older retry (07:31) with a new rating is a no-op on ended_at/effort_rating but returns the 07:40 summary",
  async () => {
    const user = await createTestUser();
    await seedFullProfile(user.client);
    const sessionId = await seedSessionS(user.client);

    await finish(user.accessToken, sessionId, {
      endedAt: "2026-09-28T07:31:00Z",
      effortRating: 4,
      tz: TZ,
    });
    const at0740 = await finish(user.accessToken, sessionId, {
      endedAt: "2026-09-28T07:40:00Z",
      tz: TZ,
    });
    assertEquals(at0740.status, 200);
    const at0740Body = await at0740.json();
    assertInstantEquals(at0740Body.endedAt, "2026-09-28T07:40:00Z");
    assertEquals(at0740Body.durationS, 2400);
    assertEquals(at0740Body.withinBudget, false);

    const retryOlder = await finish(user.accessToken, sessionId, {
      endedAt: "2026-09-28T07:31:00Z",
      effortRating: 2,
      tz: TZ,
    });
    assertEquals(retryOlder.status, 200);
    const retryOlderBody = await retryOlder.json();
    assertEquals(retryOlderBody, at0740Body);

    const { data: row, error } = await user.client
      .from("sessions")
      .select("ended_at, effort_rating")
      .eq("id", sessionId)
      .single();
    if (error) throw error;
    assertInstantEquals(row.ended_at, "2026-09-28T07:40:00Z");
    // D-0058 rule 1: the unrated 07:40 win owns the whole row and clears the 07:31 finish's
    // rating; rule 3 then makes the older rated retry a complete no-op, so the column stays null.
    assertEquals(row.effort_rating, null);
  },
);

Deno.test(
  "AC27 (D-0058 rule 2): an equal-endedAt retry adds a rating over the wire and an unrated retry never clears it",
  async () => {
    const user = await createTestUser();
    await seedFullProfile(user.client);
    const sessionId = await seedSessionS(user.client);

    await finish(user.accessToken, sessionId, { endedAt: "2026-09-28T07:31:00Z", tz: TZ });
    await finish(user.accessToken, sessionId, {
      endedAt: "2026-09-28T07:31:00Z",
      effortRating: 3,
      tz: TZ,
    });
    // A duplicate delivery of the original unrated finish, arriving after the user rated it.
    const lastRes = await finish(user.accessToken, sessionId, {
      endedAt: "2026-09-28T07:31:00Z",
      tz: TZ,
    });
    assertEquals(lastRes.status, 200);

    const { data: row, error } = await user.client
      .from("sessions")
      .select("ended_at, effort_rating")
      .eq("id", sessionId)
      .single();
    if (error) throw error;
    assertInstantEquals(row.ended_at, "2026-09-28T07:31:00Z");
    assertEquals(row.effort_rating, 3, "rule 2: a retry may add a rating, never clear one");
  },
);

// --- AC28: offline replay order (commutativity) ------------------------------------------------

Deno.test(
  "AC28: replaying [07:40, 07:31] and [07:31, 07:40] on fresh copies both end at ended_at=07:40 with deep-equal last responses",
  async () => {
    // Two independent users, each with their own copy of fixture S: the "fresh copies" the AC
    // calls for must not share one 14-day history. A single user with two sessions would leak
    // session A's live hard sets into session B's `balance` (and vice versa, once both exist),
    // which is a fixture-isolation bug, not the commutativity this AC is testing (D-0053 §8 scopes
    // `SessionSummary.balance` to the caller's whole history, matching `GET /balance` — see
    // `buildSummary` in `supabase/functions/sessions/core.ts`).
    // Exactly ONE of the two finishes carries a rating (D-0058): A = rated 07:31, B = unrated
    // 07:40 — a rating given on one device, a later correction from another. A rating-free pair
    // cannot detect an order-dependent `effort_rating`, which is why the original green AC28
    // missed the defect.
    const RATED_0731 = { endedAt: "2026-09-28T07:31:00Z", effortRating: 4, tz: TZ } as const;
    const UNRATED_0740 = { endedAt: "2026-09-28T07:40:00Z", tz: TZ } as const;

    const userA = await createTestUser();
    await seedFullProfile(userA.client);
    const sessionA = await seedSessionS(userA.client);
    await finish(userA.accessToken, sessionA, UNRATED_0740);
    const lastA = await finish(userA.accessToken, sessionA, RATED_0731);
    assertEquals(lastA.status, 200);
    const lastABody = await lastA.json();

    const userB = await createTestUser();
    await seedFullProfile(userB.client);
    const sessionB = await seedSessionS(userB.client);
    await finish(userB.accessToken, sessionB, RATED_0731);
    const lastB = await finish(userB.accessToken, sessionB, UNRATED_0740);
    assertEquals(lastB.status, 200);
    const lastBBody = await lastB.json();

    // Strip fields that are legitimately caller-specific or now-dependent rather than a function
    // of the (identical) finish history: `sessionId` (each user's own session row) and each area's
    // `targetUpdatedAt` (written at profile-seed time, which differs by milliseconds between
    // userA and userB — same pattern as AC22's `computedAt` strip above). Every other field —
    // area order, counts, deficits, endedAt, durationS, withinBudget — must still match exactly.
    const strip = (b: Record<string, unknown>) => {
      const { sessionId: _sessionId, ...rest } = b;
      const balanceResult = rest.balance as { areas: Array<Record<string, unknown>> };
      return {
        ...rest,
        balance: {
          ...balanceResult,
          areas: balanceResult.areas.map(({ targetUpdatedAt: _targetUpdatedAt, ...area }) => area),
        },
      };
    };
    assertEquals(strip(lastABody), strip(lastBBody));

    const rows: Array<{ client: SupabaseClient; id: string }> = [
      { client: userA.client, id: sessionA },
      { client: userB.client, id: sessionB },
    ];
    // The FULL row must converge, not just `ended_at`. Before D-0058, `ended_at` was 07:40 in
    // both orders while `effort_rating` was 4 for one user and null for the other. The convergent
    // value is null: the winning 07:40 finish carries no rating, so it clears the one the
    // superseded 07:31 finish left behind (rule 1).
    for (const { client, id } of rows) {
      const { data: row, error } = await client
        .from("sessions")
        .select("ended_at, effort_rating")
        .eq("id", id)
        .single();
      if (error) throw error;
      assertInstantEquals(row.ended_at, "2026-09-28T07:40:00Z");
      assertEquals(row.effort_rating, null);
    }
  },
);

Deno.test(
  "AC28: the same two finishes converge in both orders with the rating on the LATER (winning) finish",
  async () => {
    // Mirror of the test above: the rating rides the winning 07:40 finish, so it survives in both
    // orders. Together the two pin that the row follows the *winning* endedAt rather than
    // "whichever rating arrived last" or "any rating ever seen" (D-0058's rejected alternative).
    const UNRATED_0731 = { endedAt: "2026-09-28T07:31:00Z", tz: TZ } as const;
    const RATED_0740 = { endedAt: "2026-09-28T07:40:00Z", effortRating: 5, tz: TZ } as const;

    const userA = await createTestUser();
    await seedFullProfile(userA.client);
    const sessionA = await seedSessionS(userA.client);
    await finish(userA.accessToken, sessionA, RATED_0740);
    const lastA = await finish(userA.accessToken, sessionA, UNRATED_0731);
    assertEquals(lastA.status, 200);

    const userB = await createTestUser();
    await seedFullProfile(userB.client);
    const sessionB = await seedSessionS(userB.client);
    await finish(userB.accessToken, sessionB, UNRATED_0731);
    const lastB = await finish(userB.accessToken, sessionB, RATED_0740);
    assertEquals(lastB.status, 200);

    const rows: Array<{ client: SupabaseClient; id: string }> = [
      { client: userA.client, id: sessionA },
      { client: userB.client, id: sessionB },
    ];
    for (const { client, id } of rows) {
      const { data: row, error } = await client
        .from("sessions")
        .select("ended_at, effort_rating")
        .eq("id", id)
        .single();
      if (error) throw error;
      assertInstantEquals(row.ended_at, "2026-09-28T07:40:00Z");
      assertEquals(row.effort_rating, 5);
    }
  },
);

// --- AC29: a rating-only retry never moves endedAt ----------------------------------------------

Deno.test("AC29: posting the same endedAt with a new rating updates effort_rating, not ended_at", async () => {
  const user = await createTestUser();
  await seedFullProfile(user.client);
  const sessionId = await seedSessionS(user.client);

  await finish(user.accessToken, sessionId, { endedAt: "2026-09-28T07:31:00Z", tz: TZ });
  await finish(user.accessToken, sessionId, {
    endedAt: "2026-09-28T07:31:00Z",
    effortRating: 5,
    tz: TZ,
  });

  const { data: row, error } = await user.client
    .from("sessions")
    .select("ended_at, effort_rating")
    .eq("id", sessionId)
    .single();
  if (error) throw error;
  assertInstantEquals(row.ended_at, "2026-09-28T07:31:00Z");
  assertEquals(row.effort_rating, 5);
});

// --- AC30: validation, one call per case, row unchanged -----------------------------------------

Deno.test("AC30: endedAt before startedAt is 400 invalid_request, row unchanged", async () => {
  const user = await createTestUser();
  await seedFullProfile(user.client);
  const sessionId = await seedSessionS(user.client);
  const res = await finish(user.accessToken, sessionId, {
    endedAt: "2026-09-28T06:59:59Z",
    tz: TZ,
  });
  assertEquals(res.status, 400);
  assertEnvelope(await res.json(), "invalid_request", "endedAt");
  await assertSessionUnfinished(user.client, sessionId);
});

Deno.test("AC30: path id not-a-uuid is 400 invalid_request", async () => {
  const user = await createTestUser();
  await seedFullProfile(user.client);
  const res = await finish(user.accessToken, "not-a-uuid", {
    endedAt: "2026-09-28T07:31:00Z",
    tz: TZ,
  });
  assertEquals(res.status, 400);
  assertEnvelope(await res.json(), "invalid_request");
});

Deno.test("AC30: effortRating 0, 6 and 3.5 are all 400 invalid_request, row unchanged", async () => {
  const user = await createTestUser();
  await seedFullProfile(user.client);
  const sessionId = await seedSessionS(user.client);
  for (const effortRating of [0, 6, 3.5]) {
    const res = await finish(user.accessToken, sessionId, {
      endedAt: "2026-09-28T07:31:00Z",
      effortRating,
      tz: TZ,
    });
    assertEquals(res.status, 400);
    assertEnvelope(await res.json(), "invalid_request", "effortRating");
  }
  await assertSessionUnfinished(user.client, sessionId);
});

Deno.test("AC30: endedAt with no offset is 400 invalid_request, row unchanged", async () => {
  const user = await createTestUser();
  await seedFullProfile(user.client);
  const sessionId = await seedSessionS(user.client);
  const res = await finish(user.accessToken, sessionId, {
    endedAt: "2026-09-28T07:31:00",
    tz: TZ,
  });
  assertEquals(res.status, 400);
  assertEnvelope(await res.json(), "invalid_request", "endedAt");
  await assertSessionUnfinished(user.client, sessionId);
});

Deno.test("AC30: tz Mars/Base is 400 invalid_request, row unchanged", async () => {
  const user = await createTestUser();
  await seedFullProfile(user.client);
  const sessionId = await seedSessionS(user.client);
  const res = await finish(user.accessToken, sessionId, {
    endedAt: "2026-09-28T07:31:00Z",
    tz: "Mars/Base",
  });
  assertEquals(res.status, 400);
  assertEnvelope(await res.json(), "invalid_request", "tz");
  await assertSessionUnfinished(user.client, sessionId);
});

Deno.test("AC30: an extra body key is 400 invalid_request, row unchanged", async () => {
  const user = await createTestUser();
  await seedFullProfile(user.client);
  const sessionId = await seedSessionS(user.client);
  const res = await finish(user.accessToken, sessionId, {
    endedAt: "2026-09-28T07:31:00Z",
    tz: TZ,
    foo: "bar",
  });
  assertEquals(res.status, 400);
  assertEnvelope(await res.json(), "invalid_request");
  await assertSessionUnfinished(user.client, sessionId);
});

// --- AC31: not found -------------------------------------------------------------------------

Deno.test("AC31: a random uuid is 404 not_found", async () => {
  const user = await createTestUser();
  await seedFullProfile(user.client);
  const res = await finish(user.accessToken, crypto.randomUUID(), {
    endedAt: "2026-09-28T07:31:00Z",
    tz: TZ,
  });
  assertEquals(res.status, 404);
  assertEnvelope(await res.json(), "not_found");
});

Deno.test("AC31: user D's session is 404 for A, and D's row is unchanged", async () => {
  const userA = await createTestUser();
  await seedFullProfile(userA.client);
  const userD = await createTestUser();
  await seedFullProfile(userD.client);
  const sessionD = await seedSessionS(userD.client);

  const res = await finish(userA.accessToken, sessionD, {
    endedAt: "2026-09-28T07:31:00Z",
    tz: TZ,
  });
  assertEquals(res.status, 404);
  assertEnvelope(await res.json(), "not_found");

  const { data: row, error } = await userD.client
    .from("sessions")
    .select("ended_at")
    .eq("id", sessionD)
    .single();
  if (error) throw error;
  assertInstantEquals(row.ended_at, null);
});

Deno.test("AC31: GET /sessions/{id}/finish is 404 not_found", async () => {
  const user = await createTestUser();
  await seedFullProfile(user.client);
  const sessionId = await seedSessionS(user.client);
  const res = await callFunction(`/sessions/${sessionId}/finish`, {
    method: "GET",
    accessToken: user.accessToken,
  });
  assertEquals(res.status, 404);
  assertEnvelope(await res.json(), "not_found");
});

// --- AC32: zero sets -------------------------------------------------------------------------

Deno.test("AC32: a session with no sets finishes with hardSets 0, exerciseCount 0, all 9 areas 0", async () => {
  const user = await createTestUser();
  await seedFullProfile(user.client);
  const { data: session, error: sessionError } = await user.client
    .from("sessions")
    .insert({ started_at: STARTED_AT, time_budget_min: 30 })
    .select("id")
    .single();
  if (sessionError) throw sessionError;

  const res = await finish(user.accessToken, session.id, {
    endedAt: "2026-09-28T07:31:00Z",
    tz: TZ,
  });
  assertEquals(res.status, 200);
  const summary = await res.json();
  assertEquals(summary.hardSets, 0);
  assertEquals(summary.exerciseCount, 0);
  for (const v of Object.values(summary.weightedSetsByArea as Record<string, number>)) {
    assertEquals(v, 0);
  }
});

// --- AC33: no 422 on finish for a caller with only 8 targets -------------------------------------

Deno.test(
  "AC33: user C (8 area_targets) finishing their own session is 200, never 422, balance uses source default",
  async () => {
    const userC = await createTestUser();
    await seedFullProfile(userC.client, 8);
    const sessionId = await seedSessionS(userC.client);

    const res = await finish(userC.accessToken, sessionId, {
      endedAt: "2026-09-28T07:31:00Z",
      tz: TZ,
    });
    assertEquals(res.status, 200);
    const summary = await res.json();
    await assertValidatesAgainst("SessionSummary", summary);
    for (const area of summary.balance.areas) {
      assertEquals(area.targetSource, "default");
    }
  },
);

// --- no leak sweep ----------------------------------------------------------------------------

Deno.test(
  "sweep: no error response produced by this suite leaks any user id, email, or a stack trace",
  () => {
    assert(errorResponseBodies.length > 0, "expected this suite to have produced error responses");
    assert(knownIdentities.length > 0, "expected this suite to have provisioned test users");
    for (const raw of errorResponseBodies) {
      for (const userId of knownIdentities) {
        assert(!raw.includes(userId), `error body leaked a user id: ${raw}`);
      }
      assert(!raw.includes("@test.local"), `error body leaked a test email: ${raw}`);
      assert(
        !/at\s+\S+\s+\(.*:\d+:\d+\)/.test(raw),
        `error body looks like it contains a stack trace: ${raw}`,
      );
    }
  },
);
