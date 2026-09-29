// T-0203b row-cap fix: PostgREST's `max_rows` (supabase/config.toml, currently 1000) silently
// truncates a single `select`, so `_shared/repo.ts` pages the 56-day `session_sets` history query
// in chunks via `pageAll`. This test exercises `pageAll` directly against a fake `.range()`
// query builder — no Docker, no live Supabase client — with more than 1000 fake rows so a single
// unpaged fetch would visibly lose data.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { AuthContext } from "../../../functions/_shared/auth.ts";
import {
  HISTORY_PAGE_SIZE,
  pageAll,
  writeSessionFinish,
  type RangeQuery,
} from "../../../functions/_shared/repo.ts";

/** A fake supabase-js client that records the payload passed to `.update()`. It implements only
 * the chain `writeSessionFinish` uses: from().update().eq().select().maybeSingle(). */
function fakeUpdateClient(
  row: Record<string, unknown> = {
    id: "s1",
    started_at: "2026-09-28T07:00:00+00:00",
    ended_at: "2026-09-28T07:40:00+00:00",
    time_budget_min: 30,
    effort_rating: null,
  },
) {
  const updates: Record<string, unknown>[] = [];
  const client = {
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        updates.push(payload);
        const chain = {
          eq: () => chain,
          select: () => chain,
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        };
        return chain;
      },
    }),
  };
  return { updates, ctx: { userId: "u", supabase: client as never } as AuthContext };
}

Deno.test(
  "T-0208 D-0058: writeSessionFinish turns an explicit effortRating: null into effort_rating = null",
  async () => {
    const { updates, ctx } = fakeUpdateClient();
    await writeSessionFinish(ctx, "s1", { endedAt: "2026-09-28T07:40:00Z", effortRating: null });
    assertEquals(updates, [{ ended_at: "2026-09-28T07:40:00Z", effort_rating: null }]);
  },
);

Deno.test(
  "T-0208 D-0058: writeSessionFinish leaves effort_rating out of the update when effortRating is absent",
  async () => {
    const { updates, ctx } = fakeUpdateClient();
    await writeSessionFinish(ctx, "s1", { endedAt: "2026-09-28T07:40:00Z" });
    assertEquals(updates, [{ ended_at: "2026-09-28T07:40:00Z" }]);
    assert(!("effort_rating" in updates[0]!));
  },
);

Deno.test(
  "T-0208 D-0058 rule 4: writeSessionFinish returns the row as the database stored it, not the patch",
  async () => {
    // The DB row keeps a rating the patch didn't name, and echoes ended_at in its own +00:00 form.
    const { ctx } = fakeUpdateClient({
      id: "s1",
      started_at: "2026-09-28T07:00:00+00:00",
      ended_at: "2026-09-28T07:40:00+00:00",
      time_budget_min: 30,
      effort_rating: 3,
    });
    const row = await writeSessionFinish(ctx, "s1", { endedAt: "2026-09-28T09:40:00+02:00" });
    assertEquals(row, {
      id: "s1",
      startedAt: "2026-09-28T07:00:00+00:00",
      endedAt: "2026-09-28T07:40:00+00:00",
      timeBudgetMin: 30,
      effortRating: 3,
    });
  },
);

function fakeRangeQuery<Row>(allRows: Row[]): RangeQuery<Row> & { calls: number } {
  const query = {
    calls: 0,
    range(from: number, to: number) {
      query.calls++;
      const page = allRows.slice(from, to + 1);
      return Promise.resolve({ data: page, error: null });
    },
  };
  return query;
}

Deno.test(
  "pageAll: 2500 rows (more than one max_rows page) are all returned, none lost",
  async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
    const query = fakeRangeQuery(rows);
    const result = await pageAll(query, HISTORY_PAGE_SIZE);
    assertEquals(result.length, 2500);
    assertEquals(
      result.map((r) => r.id),
      rows.map((r) => r.id),
    );
  },
);

Deno.test(
  "pageAll: exactly N * pageSize rows still terminates (one extra empty fetch confirms exhaustion)",
  async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => ({ id: i }));
    const query = fakeRangeQuery(rows);
    const result = await pageAll(query, 1000);
    assertEquals(result.length, 2000);
    // 2 full pages (1000, 1000) + 1 empty page to confirm exhaustion = 3 range() calls.
    assertEquals(query.calls, 3);
  },
);

Deno.test("pageAll: fewer rows than one page makes exactly one range() call", async () => {
  const rows = Array.from({ length: 42 }, (_, i) => ({ id: i }));
  const query = fakeRangeQuery(rows);
  const result = await pageAll(query, 1000);
  assertEquals(result.length, 42);
  assertEquals(query.calls, 1);
});

Deno.test("pageAll: zero rows returns an empty array with one range() call", async () => {
  const query = fakeRangeQuery<{ id: number }>([]);
  const result = await pageAll(query, 1000);
  assertEquals(result.length, 0);
  assertEquals(query.calls, 1);
});

Deno.test(
  "pageAll: an error from a later page is mapped to internalError (500), not thrown raw",
  async () => {
    let calls = 0;
    const query: RangeQuery<{ id: number }> = {
      range(from: number, to: number) {
        calls++;
        if (calls === 1) {
          return Promise.resolve({
            data: Array.from({ length: 1000 }, (_, i) => ({ id: from + i })),
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: { message: "db down: user@example.com" } });
      },
    };
    let threw = false;
    try {
      await pageAll(query, 1000);
    } catch (err) {
      threw = true;
      assertEquals((err as { status?: number }).status, 500);
      assertEquals((err as { code?: string }).code, "internal");
      assertEquals((err as Error).message, "Something went wrong");
    }
    assertEquals(threw, true);
  },
);
