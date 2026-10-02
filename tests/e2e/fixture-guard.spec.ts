// T-0904: the guard guards itself (D-0086). `fixtures/guarded-test.ts` is the thing that will
// catch the *next* unmocked-Supabase regression, so it needs its own tests — a guard nobody
// tests is a guard that quietly stops working.
//
// AC-6 drives `installSupabaseGuard` directly on the test's own context rather than nesting a
// Playwright run: a nested run would fight this one over the `--strictPort` preview server.
// AC-7 covers the part that cannot be reached that way — that the `auto` fixture actually fails
// a test — with Playwright's `test.fail()` annotation.
//
// T-0425 adds the same two layers for the console guard: `test.fail` tests prove the `auto`
// fixture fails a test that logs an error (red on code without the guard: "expected to fail, but
// passed"), and tests that drive `installConsoleGuard` directly pin the message, the exemptions
// and the per-test scope of `allow`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONSOLE_ERROR_MESSAGE,
  expect,
  installConsoleGuard,
  installSupabaseGuard,
  test,
  UNCLAIMED_MESSAGE,
} from "./fixtures/guarded-test.js";
import {
  allowCommentViolations,
  commentBlockAbove,
  ownConsoleListeners,
} from "./fixtures/source-rules.js";
import { mockSupabaseRest, VITE_SUPABASE_URL } from "./fixtures/supabase-mock.js";

const PLANTED_URL = `${VITE_SUPABASE_URL}/rest/v1/planted_unmocked?select=*`;

/** Fetches from page context and resolves with the response status (never throws into the test). */
async function fetchStatus(page: import("@playwright/test").Page, url: string): Promise<number> {
  return page.evaluate(async (target) => {
    const res = await fetch(target);
    return res.status;
  }, url);
}

test.describe("AC-6 the guard reports exactly the requests no route claimed", () => {
  // Signed out, and `/welcome` is the one route that makes no Supabase REST call of its own, so
  // every request these tests observe is one they planted. `page.goto` also gives page context
  // for `fetch` and an origin the relative `/welcome` can resolve against.
  //
  // Note these tests install a *second* guard (the auto fixture already installed one). Both are
  // context routes and the most-recently-registered runs first, so the local one answers and the
  // auto one never sees the planted request — which is what lets these tests leak on purpose
  // without failing their own teardown. The two exceptions are the `route.continue()` and
  // `setOffline` tests, where the leak bypasses or precedes both routes; those call
  // `forgetPlantedLeaks()` and say why.
  test("a planted, unclaimed request is recorded, answered 501, and fails assertClean", async ({
    page,
    context,
  }) => {
    await page.goto("/welcome");
    const guard = installSupabaseGuard(context);

    expect(await fetchStatus(page, PLANTED_URL)).toBe(501);

    expect(guard.unclaimed()).toEqual([`GET ${PLANTED_URL}`]);
    expect(() => guard.assertClean()).toThrow(UNCLAIMED_MESSAGE);
    expect(() => guard.assertClean()).toThrow(PLANTED_URL);
  });

  test("a request claimed by a route from elsewhere is not reported", async ({ page, context }) => {
    await page.goto("/welcome");
    const guard = installSupabaseGuard(context);

    // Stands in for another branch's own fixture file: the guard must not care which file
    // registered the claim, only that the request was kept off the network.
    await page.route(`${VITE_SUPABASE_URL}/rest/v1/other_fixture*`, (route) =>
      route.fulfill({ status: 200, json: [] }),
    );

    expect(await fetchStatus(page, `${VITE_SUPABASE_URL}/rest/v1/other_fixture?select=*`)).toBe(
      200,
    );
    expect(guard.unclaimed()).toEqual([]);
    expect(() => guard.assertClean()).not.toThrow();
  });

  test("a request claimed by the 501 backstop is not reported", async ({ page, context }) => {
    await page.goto("/welcome");
    const guard = installSupabaseGuard(context);
    await mockSupabaseRest(page);

    // The backstop keeps it off the network, which is the property being enforced, so a 501 is
    // a claim. This is what keeps `offline.spec.ts` and shell's AC-6 block green under the guard.
    expect(await fetchStatus(page, `${VITE_SUPABASE_URL}/rest/v1/anything?select=*`)).toBe(501);
    expect(guard.unclaimed()).toEqual([]);
  });

  test("route.fallback() is not a claim: the request is reported", async ({ page, context }) => {
    await page.goto("/welcome");
    const guard = installSupabaseGuard(context);

    // `fallback()` explicitly defers, so the request lands on the context guard.
    await page.route(`${VITE_SUPABASE_URL}/rest/v1/fellback*`, (route) => route.fallback());

    const url = `${VITE_SUPABASE_URL}/rest/v1/fellback?select=*`;
    expect(await fetchStatus(page, url)).toBe(501);
    expect(guard.unclaimed()).toEqual([`GET ${url}`]);
  });

  test("route.continue() is not a claim: the request is reported although it bypasses the route", async ({
    page,
    context,
    supabaseGuard,
  }) => {
    await page.goto("/welcome");
    const guard = installSupabaseGuard(context);

    // `route.continue()` sends the request to the real network and, measured rather than
    // assumed, does **not** fall through to a context route — so neither guard's last-resort
    // route ever sees it. This is precisely the leak the guard exists to catch, so it must still
    // be reported; the `requestfailed` detector is what catches it. Delete that detector and
    // this test is what goes red.
    await page.route(`${VITE_SUPABASE_URL}/rest/v1/passthrough*`, (route) => route.continue());

    const url = `${VITE_SUPABASE_URL}/rest/v1/passthrough?select=*`;
    // The fetch *throws* in page context (DNS failure on the fixture's fake host), unlike every
    // other case here — which is itself the evidence that it really did leave the browser.
    await page.evaluate(async (u) => {
      await fetch(u).catch(() => undefined);
    }, url);

    await expect.poll(() => guard.unclaimed()).toEqual([`GET ${url}`]);
    // The auto guard saw the same leak, since `continue()` bypasses both context routes equally.
    // Drop it, or this test fails its own teardown for doing exactly what it set out to prove.
    supabaseGuard.forgetPlantedLeaks();
  });

  // AC-8 background. The ticket expected offline requests to bypass routing entirely; measured,
  // they do not — `setOffline(true)` leaves interception fully active, so an *unmocked* Supabase
  // fetch made while offline is still caught by the guard's route and still reported. Pinned
  // here because it is the opposite of what the ticket says, and a future reader will otherwise
  // trust the ticket. What actually keeps `offline.spec.ts` green is that its own page routes
  // claim its requests, online and offline alike — covered by the suite itself (AC-5, AC-8).
  test("setOffline does not suspend interception: an unmocked request is still reported", async ({
    page,
    context,
    supabaseGuard,
    consoleGuard,
  }) => {
    // T-0429 (web-shell) removes this allow. T-0425 finding: going offline right after the first
    // load can beat the service worker's `sw.js` fetch, and vite-plugin-pwa's injected
    // `navigator.serviceWorker.register()` (injectRegister: "auto") has no rejection handler, so
    // the app logs an error and throws an unhandled rejection. Racy, so allowed rather than
    // asserted; drop this once registration catches its failure.
    consoleGuard.allow(
      /Failed to register a ServiceWorker|An unknown error occurred when fetching the script/,
    );
    await page.goto("/welcome");
    const guard = installSupabaseGuard(context);
    await context.setOffline(true);

    const url = `${VITE_SUPABASE_URL}/rest/v1/while_offline?select=*`;
    expect(await fetchStatus(page, url)).toBe(501);

    expect(guard.unclaimed()).toEqual([`GET ${url}`]);
    supabaseGuard.forgetPlantedLeaks();
  });
});

// AC-7: the `auto` fixture's teardown is the *only* thing that can fail this test. It asserts
// nothing, so if `test.fail()` reports it as unexpectedly passing, the guard is not wired in.
test.fail(
  "AC-7 the auto fixture fails a test that leaks, with no other assertion present",
  async ({ page }) => {
    await page.goto("/welcome");
    await page.evaluate(async (url) => {
      await fetch(url).catch(() => undefined);
    }, PLANTED_URL);
  },
);

// T-0425: the console guard. `/welcome` is signed out and logs nothing of its own, so every line
// these tests see is one they planted.
test.describe("T-0425 the console guard fails a test on a console error or page error", () => {
  // AC1/AC2/AC4: only the `auto` fixture's teardown can fail these — they assert nothing.
  test.fail("T-0425 AC1 a console.error fails the test at teardown", async ({ page }) => {
    await page.goto("/welcome");
    await page.evaluate(() => console.error("t0425-planted"));
  });

  test.fail("T-0425 AC2 an uncaught exception fails the test at teardown", async ({ page }) => {
    await page.goto("/welcome");
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("t0425-uncaught");
      });
    });
    await page.waitForTimeout(100);
  });

  test.fail(
    "T-0425 AC2 an unhandled promise rejection fails the test at teardown",
    async ({ page }) => {
      await page.goto("/welcome");
      await page.evaluate(() => {
        void Promise.reject(new Error("t0425-rejected"));
      });
      await page.waitForTimeout(100);
    },
  );

  test.fail(
    "T-0425 AC4 a console.error on a page opened later fails the test",
    async ({ page, context }) => {
      await page.goto("/welcome");
      const second = await context.newPage();
      await second.goto("/welcome");
      await second.evaluate(() => console.error("t0425-second-page"));
    },
  );

  // AC1/AC2 message: `test.fail` proves *that* the test fails, not *why*. The fixture's teardown
  // is `guard.assertClean()`, so a local guard on the same context pins the message it throws.
  // The planted lines also reach the auto guard, so each test allows them there.
  test("T-0425 AC1 the failure names CONSOLE_ERROR_MESSAGE and the planted text", async ({
    page,
    context,
    consoleGuard,
  }) => {
    await page.goto("/welcome");
    const guard = installConsoleGuard(context);
    consoleGuard.allow(/t0425-planted/);
    await page.evaluate(() => console.error("t0425-planted"));

    await expect.poll(() => guard.errors().length).toBe(1);
    expect(guard.errors()[0]).toMatch(/^console\.error: t0425-planted \(.*:\d+\)$/);
    expect(CONSOLE_ERROR_MESSAGE).toBe("console error in e2e");
    expect(() => guard.assertClean()).toThrow(CONSOLE_ERROR_MESSAGE);
    expect(() => guard.assertClean()).toThrow("t0425-planted");
  });

  test("T-0425 AC2 the failure names pageerror: <message> for a throw and a rejection", async ({
    page,
    context,
    consoleGuard,
  }) => {
    await page.goto("/welcome");
    const guard = installConsoleGuard(context);
    consoleGuard.allow(/t0425-(uncaught|rejected)/);
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("t0425-uncaught");
      });
      void Promise.reject(new Error("t0425-rejected"));
    });

    await expect
      .poll(() => [...guard.errors()].sort())
      .toEqual(["pageerror: t0425-rejected", "pageerror: t0425-uncaught"]);
    expect(() => guard.assertClean()).toThrow("pageerror: t0425-uncaught");
    expect(() => guard.assertClean()).toThrow("pageerror: t0425-rejected");
  });

  // AC3: what passes. No `test.fail` here: these are green only if the auto guard stays quiet.
  test("T-0425 AC3 console.warn, console.info and console.log pass", async ({ page }) => {
    await page.goto("/welcome");
    await page.evaluate(() => {
      console.warn("t0425-warn");
      console.info("t0425-info");
      console.log("t0425-log");
    });
    await page.waitForTimeout(100);
  });

  // The same lines on a local guard: proves they were delivered and skipped, not merely late. A
  // sentinel error logged after them is the one line recorded, and it is allowed on both guards.
  test("T-0425 AC3 warn/info/log are delivered and not recorded", async ({
    page,
    context,
    consoleGuard,
  }) => {
    await page.goto("/welcome");
    const guard = installConsoleGuard(context);
    consoleGuard.allow(/t0425-sentinel/);
    await page.evaluate(() => {
      console.warn("t0425-warn");
      console.info("t0425-info");
      console.log("t0425-log");
      console.error("t0425-sentinel");
    });
    await expect.poll(() => guard.errors().length).toBe(1);
    expect(guard.errors()[0]).toContain("t0425-sentinel");
  });

  test("T-0425 AC3 a claimed 501 (Failed to load resource) passes", async ({ page, context }) => {
    await page.goto("/welcome");
    const guard = installConsoleGuard(context);
    await mockSupabaseRest(page);
    const network: string[] = [];
    page.on("console", (message) => {
      if (message.text().startsWith("Failed to load resource:")) network.push(message.text());
    });

    expect(await fetchStatus(page, `${VITE_SUPABASE_URL}/rest/v1/anything?select=*`)).toBe(501);
    // The browser did log its network-status line (so the exemption is what keeps this green,
    // not the line's absence), and the guard did not record it.
    await expect.poll(() => network.length).toBeGreaterThan(0);
    expect(network[0]).toContain("501");
    expect(guard.errors()).toEqual([]);
  });

  test("T-0425 AC3 consoleGuard.allow exempts a matching console.error", async ({
    page,
    consoleGuard,
  }) => {
    consoleGuard.allow(/t0425-allowed/);
    await page.goto("/welcome");
    await page.evaluate(() => console.error("t0425-allowed"));
    await expect.poll(() => consoleGuard.errors().length).toBe(1);
  });

  test("T-0425 AC3 errors() lists a planted console.error exactly once", async ({
    page,
    context,
    consoleGuard,
  }) => {
    await page.goto("/welcome");
    const guard = installConsoleGuard(context);
    consoleGuard.allow(/t0425-once/);
    await page.evaluate(() => console.error("t0425-once"));
    await expect.poll(() => guard.errors().length).toBe(1);
    // Settle, then check nothing arrived twice (e.g. a page attached by both pages() and "page").
    await page.waitForTimeout(100);
    expect(guard.errors().filter((line) => line.includes("t0425-once"))).toHaveLength(1);
  });

  // AC3 carry-over: serial, so the second test runs after the first in the same worker. The
  // first allows the line; the second's guard must record it and fail assertClean on it.
  test.describe.serial("T-0425 AC3 an allow does not carry over to the next test", () => {
    test("T-0425 AC3 first test: allowed", async ({ page, context, consoleGuard }) => {
      await page.goto("/welcome");
      const guard = installConsoleGuard(context);
      guard.allow(/t0425-carry/);
      consoleGuard.allow(/t0425-carry/);
      await page.evaluate(() => console.error("t0425-carry"));
      await expect.poll(() => guard.errors().length).toBe(1);
      expect(() => guard.assertClean()).not.toThrow();
    });

    test("T-0425 AC3 second test: the same line is recorded and fails", async ({
      page,
      context,
      consoleGuard,
    }) => {
      await page.goto("/welcome");
      const guard = installConsoleGuard(context);
      await page.evaluate(() => console.error("t0425-carry"));
      await expect.poll(() => guard.errors().length).toBe(1);
      expect(() => guard.assertClean()).toThrow("t0425-carry");
      // The auto guard is fresh too: it recorded the line with no allow inherited.
      expect(() => consoleGuard.assertClean()).toThrow("t0425-carry");
      consoleGuard.allow(/t0425-carry/);
    });
  });

  test("T-0425 AC2 a pageerror is never exempt, even with the network-status prefix", async ({
    page,
    context,
    consoleGuard,
  }) => {
    await page.goto("/welcome");
    const guard = installConsoleGuard(context);
    consoleGuard.allow(/t0425-prefixed/);
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("Failed to load resource: t0425-prefixed");
      });
    });
    await expect
      .poll(() => guard.errors())
      .toEqual(["pageerror: Failed to load resource: t0425-prefixed"]);
  });
});

// T-0430: unit tests for the source rules and the allow flag check. Pure functions and a local
// guard, so none of these depend on what the real spec files currently contain.
test.describe("T-0430 source rules and allow flags", () => {
  const F = "planted.spec.ts";

  test("T-0430 AC1 ownConsoleListeners reports console and pageerror listeners", () => {
    expect(ownConsoleListeners(F, 'page.on("console", f);')).toEqual([`${F}:1`]);
    expect(ownConsoleListeners(F, "x;\npage.on('pageerror', f);")).toEqual([`${F}:2`]);
    expect(ownConsoleListeners(F, 'second.on( "console", f);')).toEqual([`${F}:1`]);
  });

  test("T-0430 AC1 ownConsoleListeners ignores comments and other events", () => {
    expect(ownConsoleListeners(F, '// page.on("console")')).toEqual([]);
    expect(ownConsoleListeners(F, '  // page.on("pageerror", f)')).toEqual([]);
    expect(ownConsoleListeners(F, '/* page.on("console", f) */')).toEqual([]);
    expect(ownConsoleListeners(F, '/*\n page.on("console", f);\n*/\nx;')).toEqual([]);
    expect(ownConsoleListeners(F, 'page.on("request", f);')).toEqual([]);
    // A `//` inside a string is not a comment: the listener after it is still code.
    expect(ownConsoleListeners(F, 'go("http://x"); page.on("console", f);')).toEqual([`${F}:1`]);
    // Line numbers count lines inside a block comment.
    expect(ownConsoleListeners(F, '/*\n\n*/\npage.on("console", f);')).toEqual([`${F}:4`]);
  });

  const call = "consoleGuard.allow(/x/);";
  test("T-0430 AC3 allowCommentViolations: a T-NNNN in the block above passes", () => {
    expect(allowCommentViolations(F, `// T-0429 SW registration\n${call}`)).toEqual([]);
    expect(allowCommentViolations(F, `// T-0429 follow-up\n// more text\n${call}`)).toEqual([]);
    expect(
      allowCommentViolations(F, "    // T-0429\n    consoleGuard.allow(\n      /x/,\n    );"),
    ).toEqual([]);
  });

  test("T-0430 AC3 allowCommentViolations: code, a gap or no ticket is reported", () => {
    const literal = `const ticket = "T-0429";\n${call}`;
    expect(allowCommentViolations(F, literal)).toEqual([`${F}:2`]);
    // The T-0425 inline check (ticket text anywhere on the line above) accepted this.
    expect(/T-\d{4}/.test(literal.split("\n")[0]!)).toBe(true);
    expect(allowCommentViolations(F, `// T-0429\n\n${call}`)).toEqual([`${F}:3`]);
    expect(allowCommentViolations(F, `// see the ticket\n${call}`)).toEqual([`${F}:2`]);
    expect(allowCommentViolations(F, call)).toEqual([`${F}:1`]);
  });

  test("T-0430 AC4 allow rejects a global or sticky pattern", ({ context }) => {
    const guard = installConsoleGuard(context);
    for (const pattern of [/x/g, /x/y, /x/gi]) {
      expect(() => guard.allow(pattern), String(pattern)).toThrow(Error);
      expect(() => guard.allow(pattern), String(pattern)).toThrow("consoleGuard.allow");
      expect(() => guard.allow(pattern), String(pattern)).toThrow("global or sticky");
    }
  });

  test("T-0430 AC4 allow accepts the other flags", ({ context }) => {
    const guard = installConsoleGuard(context);
    for (const pattern of [/x/, /x/i, /x/m, /x/s, /x/u]) {
      expect(() => guard.allow(pattern), String(pattern)).not.toThrow();
    }
  });

  test("T-0430 AC4 an allowed /i pattern exempts two identical lines", async ({
    page,
    context,
    consoleGuard,
  }) => {
    await page.goto("/welcome");
    const guard = installConsoleGuard(context);
    guard.allow(/t0430-flag/i);
    consoleGuard.allow(/t0430-flag/i);
    await page.evaluate(() => {
      console.error("t0430-flag");
      console.error("t0430-flag");
    });
    await expect.poll(() => guard.errors().length).toBe(2);
    expect(() => guard.assertClean()).not.toThrow();
  });
});

// Source assertions. These are cheap and they close the hole where a later edit silently opts a
// spec out of the guard or quietly buys time with a raised timeout — the two ways this fix could
// be undone without anyone noticing.
test.describe("source assertions", () => {
  // T-0425: `__dirname` rather than `test.info().file`, because AC5's spec list is built at
  // collection time, before `test.info()` exists. Playwright transpiles these specs to CJS (the
  // repo has no `"type": "module"`), so `__dirname` is this directory whatever the working
  // directory of the run.
  const read = (name: string) => readFileSync(join(__dirname, name), "utf8");

  // AC-5 (T-0904), widened by T-0425 AC5: every spec that imports the fixture takes `test` from
  // it, so both auto guards run on every one of its tests.
  const specs = readdirSync(__dirname).filter((name) => name.endsWith(".spec.ts"));
  const guarded = specs.filter((name) => read(name).includes('from "./fixtures/guarded-test.js"'));

  test("T-0425 AC5 the guarded spec list covers the T-0904 three and more", () => {
    for (const spec of ["auth.spec.ts", "shell.spec.ts", "offline.spec.ts"]) {
      expect(guarded).toContain(spec);
    }
    expect(guarded.length).toBeGreaterThan(3);
  });

  for (const spec of guarded) {
    test(`T-0425 AC5 ${spec} imports test from guarded-test.js, not @playwright/test`, () => {
      const source = read(spec);
      const fromFixture = source.match(
        /import\s*\{([^}]*)\}\s*from\s*"\.\/fixtures\/guarded-test\.js"/s,
      );
      expect(fromFixture?.[1]).toMatch(/(^|[\s,])test([\s,]|$)/);
      // A type-only import from `@playwright/test` is fine; importing `test` from it is not,
      // because that silently bypasses the auto fixtures.
      for (const bindings of source.matchAll(
        /import\s*\{([^}]*)\}\s*from\s*"@playwright\/test"/gs,
      )) {
        expect(bindings[1]).not.toMatch(/(^|[\s,])test([\s,]|$)/);
      }
    });
  }

  // T-0430 AC3 tightens this: the T-NNNN must sit in the `//` comment block directly above the
  // call (any line of it), not merely somewhere in the code line above.
  test("T-0425 AC5 every consoleGuard.allow( outside this file names a T-NNNN in the comment block above", () => {
    const missing = specs
      .filter((name) => name !== "fixture-guard.spec.ts")
      .flatMap((spec) => allowCommentViolations(spec, read(spec)));
    expect(missing).toEqual([]);
  });

  // T-0430 AC1: the `consoleGuard` auto fixture already fails a guarded test on a console error
  // or page error, so a guarded spec carrying its own listener is a duplicate that drifts. This
  // file is the one exception: it tests the guard, and T-0425 AC3 needs to see the raw lines.
  test("T-0430 AC1 no guarded spec registers its own console or pageerror listener", () => {
    const found = guarded
      .filter((name) => name !== "fixture-guard.spec.ts")
      .flatMap((spec) => ownConsoleListeners(spec, read(spec)));
    expect(found).toEqual([]);
  });

  // T-0430 AC2: the uf-08 helper is gone, not just unused.
  test("T-0430 AC2 uf-08-setup.spec.ts has no consoleErrors helper", () => {
    expect(read("uf-08-setup.spec.ts").includes("consoleErrors")).toBe(false);
  });

  // T-0430 AC5: the one allow in this file (excluded from the AC3 run above) names its ticket.
  test("T-0430 AC5 the SW allow in the setOffline test names T-0429 in its comment block", () => {
    const lines = read("fixture-guard.spec.ts").split("\n");
    const title = lines.findIndex((line) =>
      line.includes('test("setOffline does not suspend interception'),
    );
    expect(title).toBeGreaterThan(-1);
    const call = lines.findIndex((line, i) => i > title && line.includes("consoleGuard.allow("));
    expect(call).toBeGreaterThan(title);
    expect(commentBlockAbove(lines, call).join("\n")).toContain("T-0429");
  });

  // AC-9: the fix must be a real fix, not a bigger timeout. If a future edit needs more time,
  // that is the signal the cause is unfixed.
  test("auth.spec.ts raises no timeout", () => {
    // Comments are stripped first: this file *discusses* the 5 s expect timeout at length, and a
    // naive substring search would match that prose instead of code. What must not appear is a
    // `timeout:` option, `setTimeout`/`test.setTimeout`, or `test.slow()`.
    const code = read("auth.spec.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/\btimeout\s*:/);
    expect(code).not.toContain("setTimeout");
    expect(code).not.toContain(".slow(");
  });
});
