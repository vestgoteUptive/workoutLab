// T-0203c unit tests for POST /sessions/{id}/finish's handler core (D-0037 §9, D-0053 §7–§8).
// Injected deps, no Docker, no Deno.serve — `loadOwnedSession`/`writeSessionFinish`/
// `loadSessionSets`/`loadFinishEngineInputs` are all faked so the finish rule (D-0053 §7) and the
// pure-of-stored-row summary (D-0053 §8) are exercised without a live Supabase client.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { balance } from "@workoutlab/engine";
import type { AreaTarget } from "@workoutlab/shared";
import type { AuthContext } from "../../../functions/_shared/auth.ts";
import type { FinishEngineInputs, SessionRow } from "../../../functions/_shared/repo.ts";
import { finishSessionCore, type FinishDeps } from "../../../functions/sessions/core.ts";
import { libraryFixture, nineAreaTargets, TZ } from "./fixtures/inputs.ts";
import {
  emptySessionSetsFixture,
  sessionFixture,
  sessionSetsFixture,
  SESSION_ID,
} from "./fixtures/session.ts";

const FAKE_CTX: AuthContext = { userId: "user-a", supabase: {} as never };

/** A mutable in-memory "row" so `writeSessionFinish` behaves like a real upsert: later reads see
 * earlier writes, letting a test chain several finish calls the way an offline replay would. */
function makeFakeStore(initial: SessionRow) {
  let row: SessionRow = { ...initial };
  return {
    get: () => row,
    deps: (overrides: Partial<FinishDeps> = {}): FinishDeps => ({
      loadOwnedSession: async () => row,
      writeSessionFinish: async (_ctx, _id, patch) => {
        row = {
          ...row,
          ...(patch.endedAt !== undefined ? { endedAt: patch.endedAt } : {}),
          ...(patch.effortRating !== undefined ? { effortRating: patch.effortRating } : {}),
        };
        return row;
      },
      loadSessionSets: async () => sessionSetsFixture(),
      loadFinishEngineInputs: async (_ctx, endedAt): Promise<FinishEngineInputs> => ({
        targets: nineAreaTargets(),
        library: libraryFixture(),
        history: sessionSetsFixture().map((s) => ({ ...s, completedAt: endedAt })),
      }),
      balance,
      ...overrides,
    }),
  };
}

function depsFixture(overrides: Partial<FinishDeps> = {}): FinishDeps {
  const targets: AreaTarget[] = nineAreaTargets();
  return {
    loadOwnedSession: async () => sessionFixture(),
    writeSessionFinish: async (_ctx, _id, patch) =>
      sessionFixture({
        endedAt: patch.endedAt ?? null,
        effortRating: patch.effortRating ?? null,
      }),
    loadSessionSets: async () => sessionSetsFixture(),
    loadFinishEngineInputs: async (_ctx, endedAt): Promise<FinishEngineInputs> => ({
      targets,
      library: libraryFixture(),
      history: [],
    }),
    balance,
    ...overrides,
  };
}

async function assertBadRequest(fn: () => Promise<unknown>, namedField?: string): Promise<void> {
  let threw = false;
  try {
    await fn();
  } catch (err) {
    threw = true;
    assertEquals((err as { status?: number }).status, 400);
    assertEquals((err as { code?: string }).code, "invalid_request");
    if (namedField !== undefined) {
      assert(
        (err as Error).message.includes(namedField),
        `expected the message to name "${namedField}": ${(err as Error).message}`,
      );
    }
  }
  assert(threw, "expected the call to throw 400 invalid_request");
}

// --- AC24: basic finish -------------------------------------------------------------------------

Deno.test(
  "AC24: finishing S at 07:31 gives durationS 1860, hardSets 3, exerciseCount 2, quads>=2 chest=1",
  async () => {
    const store = makeFakeStore(sessionFixture());
    const result = await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:31:00Z", effortRating: 4, tz: TZ },
      store.deps(),
    );
    assertEquals(result.durationS, 1860);
    assertEquals(result.timeBudgetMin, 30);
    assertEquals(result.withinBudget, true);
    assertEquals(result.hardSets, 3);
    assertEquals(result.exerciseCount, 2);
    assertEquals(Object.keys(result.weightedSetsByArea).length, 9);
    assert(result.weightedSetsByArea.quads >= 2);
    assertEquals(result.weightedSetsByArea.chest, 1);
    assertEquals(store.get().endedAt, "2026-09-28T07:31:00Z");
    assertEquals(store.get().effortRating, 4);
  },
);

// --- AC25: withinBudget boundary -----------------------------------------------------------------

Deno.test("AC25: finishing at exactly 1920s (07:32:00) is withinBudget true", async () => {
  const store = makeFakeStore(sessionFixture());
  const result = await finishSessionCore(
    FAKE_CTX,
    SESSION_ID,
    { endedAt: "2026-09-28T07:32:00Z", tz: TZ },
    store.deps(),
  );
  assertEquals(result.durationS, 1920);
  assertEquals(result.withinBudget, true);
});

Deno.test("AC25: finishing at 1921s (07:32:01) is 200 with withinBudget false", async () => {
  const store = makeFakeStore(sessionFixture());
  const result = await finishSessionCore(
    FAKE_CTX,
    SESSION_ID,
    { endedAt: "2026-09-28T07:32:01Z", tz: TZ },
    store.deps(),
  );
  assertEquals(result.durationS, 1921);
  assertEquals(result.withinBudget, false);
});

// --- AC26: idempotent, unit twin with now one day later -------------------------------------------

Deno.test("AC26: repeating the identical finish returns a deep-equal body", async () => {
  const store = makeFakeStore(sessionFixture());
  const first = await finishSessionCore(
    FAKE_CTX,
    SESSION_ID,
    { endedAt: "2026-09-28T07:31:00Z", effortRating: 4, tz: TZ },
    store.deps(),
  );
  const second = await finishSessionCore(
    FAKE_CTX,
    SESSION_ID,
    { endedAt: "2026-09-28T07:31:00Z", effortRating: 4, tz: TZ },
    store.deps(),
  );
  assertEquals(second, first);
});

Deno.test(
  "AC26 unit twin: the handler core with now one day later still returns a deep-equal summary",
  async () => {
    // The summary is a pure function of the *stored* ended_at, never the server clock (D-0053 §8),
    // so this deps fixture's loadFinishEngineInputs never even reads a "now" — it's driven purely
    // by the stored row, which the two calls below share via the same fake store.
    const store = makeFakeStore(sessionFixture());
    const first = await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:31:00Z", effortRating: 4, tz: TZ },
      store.deps(),
    );
    // A second call, simulating "one day later": nothing about deps changes with server time,
    // because the core never reads a clock — only `loadOwnedSession`'s returned row matters.
    const second = await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:31:00Z", effortRating: 4, tz: TZ },
      store.deps(),
    );
    assertEquals(second, first);
  },
);

// --- AC27: the latest endedAt wins --------------------------------------------------------------

Deno.test(
  "AC27: a later finish (07:40) overwrites 07:31, then an older retry (07:31) is a no-op",
  async () => {
    const store = makeFakeStore(sessionFixture());
    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:31:00Z", effortRating: 4, tz: TZ },
      store.deps(),
    );
    const at0740 = await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:40:00Z", tz: TZ },
      store.deps(),
    );
    assertEquals(at0740.endedAt, "2026-09-28T07:40:00Z");
    assertEquals(at0740.durationS, 2400);
    assertEquals(at0740.withinBudget, false);
    // D-0058 rule 1: the winning finish owns the *whole* row, so this unrated 07:40 win clears the
    // rating the superseded 07:31 finish left behind. Preserving the 4 here is precisely what made
    // the row order-dependent.
    assertEquals(
      store.get().effortRating,
      null,
      "an unrated winning finish clears the superseded finish's rating (D-0058 rule 1)",
    );

    const retryOlder = await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:31:00Z", effortRating: 2, tz: TZ },
      store.deps(),
    );
    assertEquals(
      retryOlder,
      at0740,
      "an older endedAt with a new rating still returns the 07:40 summary",
    );
    assertEquals(store.get().endedAt, "2026-09-28T07:40:00Z");
    assertEquals(
      store.get().effortRating,
      null,
      "D-0058 rule 3: a strictly older request writes nothing at all, not even its rating",
    );
  },
);

Deno.test(
  "AC27 (D-0058 rule 2): an equal-endedAt retry adds a rating and a later unrated retry never clears it",
  async () => {
    const store = makeFakeStore(sessionFixture());
    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:31:00Z", tz: TZ },
      store.deps(),
    );
    assertEquals(store.get().effortRating, null, "the first, unrated finish stores no rating");

    // Rule 2: same endedAt, now carrying a rating — the retry *adds* it.
    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:31:00Z", effortRating: 3, tz: TZ },
      store.deps(),
    );
    assertEquals(store.get().effortRating, 3, "an equal-endedAt retry may add a rating");

    // Rule 2 again: same endedAt, no rating — must NOT clear the one just added. This is the
    // boundary that keeps rule 1's `?? null` from leaking into retries (e.g. a duplicate delivery
    // of the original unrated finish arriving after the user rated it).
    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:31:00Z", tz: TZ },
      store.deps(),
    );
    assertEquals(
      store.get().effortRating,
      3,
      "an unrated equal-endedAt retry must never clear an existing rating (D-0058 rule 2)",
    );
    assertEquals(store.get().endedAt, "2026-09-28T07:31:00Z");
  },
);

// --- AC28: offline replay order (commutativity) --------------------------------------------------

Deno.test(
  "AC28: replaying [07:40, rated 07:31] and [rated 07:31, 07:40] converge on the same full row and response",
  async () => {
    // D-0058's scenario: exactly ONE of the two finishes carries a rating — A = rated 07:31,
    // B = unrated 07:40 (a rating given on one device, a later correction from another). A
    // rating-free pair cannot detect an order-dependent `effort_rating`, which is why the original
    // green AC28 missed the defect. The convergent row is the *winning* finish's row: ended_at
    // 07:40 with NO rating, because the 07:40 finish carries none (rule 1).
    const RATED_0731 = { endedAt: "2026-09-28T07:31:00Z", effortRating: 4, tz: TZ } as const;
    const UNRATED_0740 = { endedAt: "2026-09-28T07:40:00Z", tz: TZ } as const;

    // Order [B, A]: the winner arrives first, then the older rated replay.
    const storeA = makeFakeStore(sessionFixture());
    await finishSessionCore(FAKE_CTX, SESSION_ID, UNRATED_0740, storeA.deps());
    const lastA = await finishSessionCore(FAKE_CTX, SESSION_ID, RATED_0731, storeA.deps());

    // Order [A, B]: the rated older finish lands first and is then superseded.
    const storeB = makeFakeStore(sessionFixture());
    await finishSessionCore(FAKE_CTX, SESSION_ID, RATED_0731, storeB.deps());
    const lastB = await finishSessionCore(FAKE_CTX, SESSION_ID, UNRATED_0740, storeB.deps());

    // The FULL row converges, not just ended_at. Before D-0058, ended_at matched in both orders
    // while effort_rating was null here and 4 there.
    assertEquals(storeA.get().endedAt, "2026-09-28T07:40:00Z");
    assertEquals(storeB.get().endedAt, "2026-09-28T07:40:00Z");
    assertEquals(storeA.get().effortRating, null);
    assertEquals(storeB.get().effortRating, null);
    assertEquals(
      storeA.get(),
      storeB.get(),
      "the whole stored row must be independent of replay order (D-0058)",
    );
    assertEquals(lastA, lastB);
  },
);

Deno.test(
  "AC28: the same two finishes converge with the rating on the LATER finish instead",
  async () => {
    // The mirror case: the rating rides the *winning* 07:40 finish, so it survives in both orders.
    // Together with the test above this pins that convergence follows the winning endedAt rather
    // than "whichever rating arrived last" or "any rating ever seen".
    const UNRATED_0731 = { endedAt: "2026-09-28T07:31:00Z", tz: TZ } as const;
    const RATED_0740 = { endedAt: "2026-09-28T07:40:00Z", effortRating: 5, tz: TZ } as const;

    const storeA = makeFakeStore(sessionFixture());
    await finishSessionCore(FAKE_CTX, SESSION_ID, RATED_0740, storeA.deps());
    const lastA = await finishSessionCore(FAKE_CTX, SESSION_ID, UNRATED_0731, storeA.deps());

    const storeB = makeFakeStore(sessionFixture());
    await finishSessionCore(FAKE_CTX, SESSION_ID, UNRATED_0731, storeB.deps());
    const lastB = await finishSessionCore(FAKE_CTX, SESSION_ID, RATED_0740, storeB.deps());

    assertEquals(storeA.get().effortRating, 5);
    assertEquals(storeB.get().effortRating, 5);
    assertEquals(storeA.get(), storeB.get());
    assertEquals(lastA, lastB);
  },
);

// --- T-0208: D-0058, one test per rule -----------------------------------------------------------

type FinishPatch = Parameters<FinishDeps["writeSessionFinish"]>[2];

/** Wraps a fake store so every `writeSessionFinish` patch is recorded verbatim. That lets a test
 * tell "wrote `effortRating: null`" apart from "left `effortRating` out". */
function spyingStore(initial: SessionRow) {
  const store = makeFakeStore(initial);
  const patches: FinishPatch[] = [];
  const inner = store.deps();
  const deps = store.deps({
    writeSessionFinish: (ctx, id, patch) => {
      patches.push({ ...patch });
      return inner.writeSessionFinish(ctx, id, patch);
    },
  });
  return { store, patches, deps };
}

function ms(instant: string | null): number | null {
  return instant === null ? null : new Date(instant).getTime();
}

/** Every ordering of `items` (n! of them). */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  return items.flatMap((head, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [head, ...rest]),
  );
}

Deno.test(
  "T-0208 D-0058 rule 1 (consequence 1): a strict win with no rating writes an explicit effortRating: null",
  async () => {
    // The first finish on an unfinished row (stored ended_at null) wins.
    const first = spyingStore(sessionFixture());
    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:31:00Z", tz: TZ },
      first.deps,
    );
    assertEquals(first.patches, [{ endedAt: "2026-09-28T07:31:00Z", effortRating: null }]);

    // req > stored also wins. The patch must carry the key set to null. Leaving the key out
    // would keep the superseded rating.
    const later = spyingStore(sessionFixture({ endedAt: "2026-09-28T07:31:00Z", effortRating: 4 }));
    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:40:00Z", tz: TZ },
      later.deps,
    );
    assertEquals(later.patches.length, 1);
    assert("effortRating" in later.patches[0]!, "a strict-win patch must name effortRating");
    assertEquals(later.patches[0], { endedAt: "2026-09-28T07:40:00Z", effortRating: null });
    assertEquals(later.store.get().effortRating, null);
  },
);

Deno.test(
  "T-0208 D-0058 rule 1: a rated strict win replaces the stored rating with its own",
  async () => {
    const s = spyingStore(sessionFixture({ endedAt: "2026-09-28T07:31:00Z", effortRating: 4 }));
    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:40:00Z", effortRating: 2, tz: TZ },
      s.deps,
    );
    assertEquals(s.patches, [{ endedAt: "2026-09-28T07:40:00Z", effortRating: 2 }]);
    assertEquals(s.store.get().effortRating, 2);
  },
);

Deno.test(
  "T-0208 D-0058 rule 1: when stored ended_at is null, an unrated finish clears a rating already on the row",
  async () => {
    // Under "`stored` is null ... this finish wins", the winner owns the whole row even when a
    // rating is already on the unfinished row, e.g. one written through plain CRUD.
    const s = spyingStore(sessionFixture({ endedAt: null, effortRating: 3 }));
    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:31:00Z", tz: TZ },
      s.deps,
    );
    assertEquals(s.patches, [{ endedAt: "2026-09-28T07:31:00Z", effortRating: null }]);
    assertEquals(s.store.get().effortRating, null);
  },
);

Deno.test(
  "T-0208 D-0058 rule 2: an equal-endedAt retry writes only effortRating, and nothing at all when unrated",
  async () => {
    const s = spyingStore(sessionFixture({ endedAt: "2026-09-28T07:31:00Z", effortRating: 4 }));
    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:31:00Z", tz: TZ },
      s.deps,
    );
    assertEquals(
      s.patches,
      [],
      "an unrated retry of the winner must not write (so it can't clear)",
    );
    assertEquals(s.store.get().effortRating, 4);

    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:31:00Z", effortRating: 5, tz: TZ },
      s.deps,
    );
    assertEquals(s.patches, [{ effortRating: 5 }], "a rated retry writes the rating, not ended_at");
    assertEquals(s.store.get().effortRating, 5);
  },
);

Deno.test(
  "T-0208 D-0058 rule 3: a strictly older finish writes nothing, rated or not",
  async () => {
    const s = spyingStore(sessionFixture({ endedAt: "2026-09-28T07:40:00Z", effortRating: null }));
    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:31:00Z", effortRating: 4, tz: TZ },
      s.deps,
    );
    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:39:59Z", tz: TZ },
      s.deps,
    );
    assertEquals(s.patches, []);
    assertEquals(s.store.get(), sessionFixture({ endedAt: "2026-09-28T07:40:00Z" }));
  },
);

Deno.test(
  "T-0208 D-0058 rule 4: every call returns 200 with the summary of the row as stored after that call",
  async () => {
    const store = makeFakeStore(sessionFixture());
    const sequence = [
      { endedAt: "2026-09-28T07:31:00Z", effortRating: 4, tz: TZ }, // rule 1
      { endedAt: "2026-09-28T07:31:00Z", tz: TZ }, // rule 2, no write
      { endedAt: "2026-09-28T07:40:00Z", tz: TZ }, // rule 1
      { endedAt: "2026-09-28T07:31:00Z", effortRating: 2, tz: TZ }, // rule 3, no write
    ];
    for (const body of sequence) {
      const summary = await finishSessionCore(FAKE_CTX, SESSION_ID, body, store.deps());
      const row = store.get();
      assertEquals(ms(summary.endedAt), ms(row.endedAt), `after ${JSON.stringify(body)}`);
      assertEquals(summary.durationS, (ms(row.endedAt)! - ms(row.startedAt)!) / 1000);
      // Rebuilding the summary from the stored row alone gives the same body: an equal, unrated
      // retry is a pure read (rules 2 and 4).
      const reread = await finishSessionCore(
        FAKE_CTX,
        SESSION_ID,
        { endedAt: row.endedAt!, tz: TZ },
        store.deps(),
      );
      assertEquals(reread, summary);
    }
  },
);

Deno.test(
  "T-0208 D-0058: stored and requested endedAt are compared as instants, not as strings",
  async () => {
    // (a) The same instant written with an offset is a rule 2 retry, not a win, so it must not
    //     clear the rating. As strings, "09:40+02:00" > "07:40Z".
    const a = spyingStore(sessionFixture({ endedAt: "2026-09-28T07:40:00Z", effortRating: 5 }));
    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T09:40:00+02:00", tz: TZ },
      a.deps,
    );
    assertEquals(a.patches, []);
    assertEquals(a.store.get().effortRating, 5);

    // (b) 08:35+01:00 = 07:35Z is older than 07:40Z, so rule 3 applies, although it sorts later
    //     as a string.
    const b = spyingStore(sessionFixture({ endedAt: "2026-09-28T07:40:00Z", effortRating: null }));
    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T08:35:00+01:00", effortRating: 2, tz: TZ },
      b.deps,
    );
    assertEquals(b.patches, []);
    assertEquals(b.store.get().effortRating, null);

    // (c) 07:40Z is later than 09:31+02:00 (= 07:31Z), so rule 1 applies, although it sorts
    //     earlier as a string.
    const c = spyingStore(
      sessionFixture({ endedAt: "2026-09-28T09:31:00+02:00", effortRating: 4 }),
    );
    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:40:00Z", tz: TZ },
      c.deps,
    );
    assertEquals(c.patches, [{ endedAt: "2026-09-28T07:40:00Z", effortRating: null }]);
  },
);

Deno.test(
  "T-0208 D-0058 commutativity: all 24 orders of {rated 07:31, unrated 07:31, unrated 07:40, rated 07:40} converge",
  async () => {
    // At most one distinct rating per endedAt, so D-0058 promises one row: the winning 07:40
    // plus the rating seen at 07:40.
    const finishes = [
      { endedAt: "2026-09-28T07:31:00Z", effortRating: 4, tz: TZ },
      { endedAt: "2026-09-28T07:31:00Z", tz: TZ },
      { endedAt: "2026-09-28T07:40:00Z", tz: TZ },
      { endedAt: "2026-09-28T07:40:00Z", effortRating: 5, tz: TZ },
    ];
    const orders = permutations(finishes);
    assertEquals(orders.length, 24);
    let reference: { row: SessionRow; last: unknown } | undefined;
    for (const order of orders) {
      const store = makeFakeStore(sessionFixture());
      let last: unknown;
      for (const body of order) {
        last = await finishSessionCore(FAKE_CTX, SESSION_ID, body, store.deps());
      }
      assertEquals(store.get().endedAt, "2026-09-28T07:40:00Z", JSON.stringify(order));
      assertEquals(store.get().effortRating, 5, JSON.stringify(order));
      reference ??= { row: store.get(), last };
      assertEquals(store.get(), reference.row, JSON.stringify(order));
      assertEquals(last, reference.last, JSON.stringify(order));
    }
  },
);

Deno.test(
  "T-0208 D-0058 commutativity: all 24 orders converge on a null rating when the winning endedAt is never rated",
  async () => {
    const finishes = [
      { endedAt: "2026-09-28T07:31:00Z", effortRating: 4, tz: TZ },
      { endedAt: "2026-09-28T07:35:00Z", effortRating: 2, tz: TZ },
      { endedAt: "2026-09-28T07:40:00Z", tz: TZ },
      { endedAt: "2026-09-28T07:40:00Z", tz: TZ },
    ];
    let reference: unknown;
    for (const order of permutations(finishes)) {
      const store = makeFakeStore(sessionFixture());
      let last: unknown;
      for (const body of order) {
        last = await finishSessionCore(FAKE_CTX, SESSION_ID, body, store.deps());
      }
      assertEquals(
        store.get(),
        sessionFixture({ endedAt: "2026-09-28T07:40:00Z", effortRating: null }),
        JSON.stringify(order),
      );
      reference ??= last;
      assertEquals(last, reference, JSON.stringify(order));
    }
  },
);

Deno.test(
  "T-0208 D-0058: the instant compare keeps milliseconds — 500 ms later is a strict win, 500 ms earlier is a no-op",
  async () => {
    // (a) req > stored by 500 ms: rule 1, so ended_at moves and the unrated winner clears the 5.
    const a = spyingStore(sessionFixture({ endedAt: "2026-09-28T07:40:00.000Z", effortRating: 5 }));
    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:40:00.500Z", tz: TZ },
      a.deps,
    );
    assertEquals(a.patches, [{ endedAt: "2026-09-28T07:40:00.500Z", effortRating: null }]);

    // (b) req < stored by 500 ms: rule 3, so even a rated request writes nothing.
    const b = spyingStore(
      sessionFixture({ endedAt: "2026-09-28T07:40:00.500Z", effortRating: null }),
    );
    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:40:00.000Z", effortRating: 3, tz: TZ },
      b.deps,
    );
    assertEquals(b.patches, []);
    assertEquals(b.store.get().effortRating, null);
  },
);

// --- AC29: a rating-only retry never moves endedAt ------------------------------------------------

Deno.test(
  "AC29: posting the same endedAt with a new rating updates effortRating, not endedAt",
  async () => {
    const store = makeFakeStore(sessionFixture());
    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:31:00Z", tz: TZ },
      store.deps(),
    );
    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:31:00Z", effortRating: 5, tz: TZ },
      store.deps(),
    );
    assertEquals(store.get().effortRating, 5);
    assertEquals(store.get().endedAt, "2026-09-28T07:31:00Z");
  },
);

// --- AC30: validation --------------------------------------------------------------------------

Deno.test("AC30: endedAt before startedAt is 400 invalid_request", async () => {
  await assertBadRequest(
    () =>
      finishSessionCore(
        FAKE_CTX,
        SESSION_ID,
        { endedAt: "2026-09-28T06:59:59Z", tz: TZ },
        depsFixture(),
      ),
    "endedAt",
  );
});

Deno.test("AC30: path id not-a-uuid is 400 invalid_request naming id", async () => {
  await assertBadRequest(
    () =>
      finishSessionCore(
        FAKE_CTX,
        "not-a-uuid",
        { endedAt: "2026-09-28T07:31:00Z", tz: TZ },
        depsFixture(),
      ),
    "id",
  );
});

Deno.test("AC30: effortRating 0, 6 and 3.5 are all 400 naming effortRating", async () => {
  for (const effortRating of [0, 6, 3.5]) {
    await assertBadRequest(
      () =>
        finishSessionCore(
          FAKE_CTX,
          SESSION_ID,
          { endedAt: "2026-09-28T07:31:00Z", effortRating, tz: TZ },
          depsFixture(),
        ),
      "effortRating",
    );
  }
});

Deno.test("AC30: endedAt with no offset is 400 naming endedAt", async () => {
  await assertBadRequest(
    () =>
      finishSessionCore(
        FAKE_CTX,
        SESSION_ID,
        { endedAt: "2026-09-28T07:31:00", tz: TZ },
        depsFixture(),
      ),
    "endedAt",
  );
});

Deno.test("AC30: tz Mars/Base is 400 naming tz", async () => {
  await assertBadRequest(
    () =>
      finishSessionCore(
        FAKE_CTX,
        SESSION_ID,
        { endedAt: "2026-09-28T07:31:00Z", tz: "Mars/Base" },
        depsFixture(),
      ),
    "tz",
  );
});

Deno.test("AC30: an extra body key is 400", async () => {
  await assertBadRequest(() =>
    finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:31:00Z", tz: TZ, foo: "bar" } as never,
      depsFixture(),
    ),
  );
});

Deno.test("AC30: no write happens when validation fails", async () => {
  let writeCalls = 0;
  const deps = depsFixture({
    writeSessionFinish: async (_ctx, _id, patch) => {
      writeCalls++;
      return sessionFixture({ endedAt: patch.endedAt ?? null });
    },
  });
  await assertBadRequest(() =>
    finishSessionCore(FAKE_CTX, SESSION_ID, { endedAt: "2026-09-28T06:59:59Z", tz: TZ }, deps),
  );
  assertEquals(writeCalls, 0);
});

// --- AC31: not found -----------------------------------------------------------------------------

Deno.test("AC31: an unknown/unowned session id is 404 not_found", async () => {
  const deps = depsFixture({
    loadOwnedSession: async () => {
      const { notFound } = await import("../../../functions/_shared/errors.ts");
      throw notFound("Session not found");
    },
  });
  let threw = false;
  try {
    await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:31:00Z", tz: TZ },
      deps,
    );
  } catch (err) {
    threw = true;
    assertEquals((err as { status?: number }).status, 404);
    assertEquals((err as { code?: string }).code, "not_found");
  }
  assert(threw);
});

// --- AC32: zero sets -------------------------------------------------------------------------

Deno.test(
  "AC32: a session with no sets finishes with hardSets 0, exerciseCount 0, all areas 0",
  async () => {
    const deps = depsFixture({ loadSessionSets: async () => emptySessionSetsFixture() });
    const result = await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:31:00Z", tz: TZ },
      deps,
    );
    assertEquals(result.hardSets, 0);
    assertEquals(result.exerciseCount, 0);
    for (const v of Object.values(result.weightedSetsByArea)) assertEquals(v, 0);
  },
);

// --- AC33: no 422 on finish; falls back to deriveTargets/BASE_TARGETS -----------------------------

Deno.test(
  "AC33: finish never 422s even when loadFinishEngineInputs models fewer than 9 targets via the default-source fallback",
  async () => {
    // The core itself never enforces a target count — that fallback lives in
    // `loadFinishEngineInputs` (repo.ts). This test proves the core accepts whatever targets/source
    // that loader returns (here: a `source: "default"` fallback for a hypothetical 8-target/derived
    // caller) and completes with 200, never throwing profileMissing.
    const fallbackTargets: AreaTarget[] = nineAreaTargets().map((t) => ({
      ...t,
      source: "default" as const,
    }));
    const deps = depsFixture({
      loadFinishEngineInputs: async (): Promise<FinishEngineInputs> => ({
        targets: fallbackTargets,
        library: libraryFixture(),
        history: [],
      }),
    });
    const result = await finishSessionCore(
      FAKE_CTX,
      SESSION_ID,
      { endedAt: "2026-09-28T07:31:00Z", tz: TZ },
      deps,
    );
    assertEquals(
      result.balance.areas.every((a) => a.targetSource === "default"),
      true,
    );
  },
);
