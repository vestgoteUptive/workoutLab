// T-1006 UF-08.2, UF-11.4: a stateful fake of the account side of learning from edits, for the e2e
// stack (Supabase is mocked through `page.route`, D-0045). One fake is installed on every page of
// a test, so two browser contexts on one account see the same rows ("two devices", D-0281).
//
// It answers like PostgREST for the tables the feature touches: `edit_signals` (unique key
// `user_id,device_id,key`, the stale-write rule of D-0281 §1), `profiles` (the flag and the reset
// epoch, stamped server-side), `favorite_exercises` and `excluded_exercises` (idempotent upsert,
// delete, and the mutual exclusion trigger), and the account delete (the FK cascade). Every
// Supabase request is also recorded, so a spec can scan what left the device (AC8).
import type { Page, Request, Route } from "@playwright/test";
import { FAKE_USER_ID, VITE_SUPABASE_URL } from "./supabase-mock.js";
import { profile as libraryProfile } from "./uf-04-library-data.js";

export const OTHER_DEVICE = "99999999-9999-4999-8999-999999999999";
const DAY = 86_400_000;

export interface SignalRow {
  id: string;
  user_id: string;
  device_id: string;
  key: string;
  kind: "swap" | "removal";
  exercise_id: string;
  to_exercise_id: string | null;
  count: number;
  window_start: string;
  last_seen: string;
  asked_at: string | null;
}

export interface Recorded {
  /** Which page (device) sent it. */
  who: string;
  method: string;
  table: string;
  query: string;
  body: string | null;
}

export interface SeedSignal {
  from: string;
  /** The swap-in; omitted for a removal. */
  to?: string;
  count: number;
  device?: string;
  askedAt?: string | null;
  daysAgo?: number;
}

type NameRow = { exercise_id: string; created_at: string };

export class AccountFake {
  rows = new Map<string, SignalRow>();
  favorites: NameRow[] = [];
  excluded: NameRow[] = [];
  requests: Recorded[] = [];
  profile: Record<string, unknown> = {
    ...libraryProfile,
    user_id: FAKE_USER_ID,
    learn_from_edits: true,
    learn_reset_at: null,
  };
  /** Set by the account delete: the FK cascade removed every row of the user. */
  accountDeleted = false;
  private nextId = 1;

  /** Rows another device already synced (a signal count the pull must add to this device's own). */
  seed(s: SeedSignal): SignalRow {
    const now = Date.now();
    const lastSeen = new Date(now - (s.daysAgo ?? 1) * DAY).toISOString();
    const row: SignalRow = {
      id: `seed-${this.nextId++}`,
      user_id: FAKE_USER_ID,
      device_id: s.device ?? OTHER_DEVICE,
      key: s.to === undefined ? `removal:${s.from}` : `swap:${s.from}:${s.to}`,
      kind: s.to === undefined ? "removal" : "swap",
      exercise_id: s.from,
      to_exercise_id: s.to ?? null,
      count: s.count,
      window_start: lastSeen,
      last_seen: lastSeen,
      asked_at: s.askedAt ?? null,
    };
    this.rows.set(`${row.user_id}|${row.device_id}|${row.key}`, row);
    return row;
  }

  /** The rows of the user, oldest first. */
  signals(): SignalRow[] {
    return [...this.rows.values()].filter((r) => r.user_id === FAKE_USER_ID);
  }

  /** The sum of `count` over every device for a key, as D-0281 §2 reads it. */
  total(key: string): number {
    return this.signals()
      .filter((r) => r.key === key)
      .reduce((n, r) => n + r.count, 0);
  }

  writes(table: string, method?: string): Recorded[] {
    return this.requests.filter(
      (r) => r.table === table && r.method !== "GET" && (method === undefined || r.method === method),
    );
  }

  reads(table: string): Recorded[] {
    return this.requests.filter((r) => r.table === table && r.method === "GET");
  }

  /** Registers the routes on `page` (after `mockSupabaseData`, which they shadow). */
  async install(page: Page, who: string): Promise<void> {
    page.on("request", (request: Request) => {
      const url = new URL(request.url());
      if (!request.url().startsWith(VITE_SUPABASE_URL)) return;
      const table = url.pathname.replace(/^\/(rest|functions|auth)\/v1\//, "");
      this.requests.push({
        who,
        method: request.method(),
        table,
        query: url.search,
        body: request.postData(),
      });
    });
    const rest = (table: string) => `${VITE_SUPABASE_URL}/rest/v1/${table}*`;
    await page.route(rest("edit_signals"), (route) => this.editSignals(route));
    await page.route(rest("profiles"), (route) => this.profiles(route));
    await page.route(rest("favorite_exercises"), (route) =>
      this.nameList(route, this.favorites, this.excluded),
    );
    await page.route(rest("excluded_exercises"), (route) =>
      this.nameList(route, this.excluded, this.favorites),
    );
    await page.route(`${VITE_SUPABASE_URL}/functions/v1/account`, (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      // The FK cascade of `edit_signals` (D-0281 §5) and of every other owned table.
      this.rows.clear();
      this.favorites.length = 0;
      this.excluded.length = 0;
      this.accountDeleted = true;
      return route.fulfill({ status: 204 });
    });
    await page.route(`${VITE_SUPABASE_URL}/auth/v1/logout*`, (route) =>
      route.fulfill({ status: 204 }),
    );
  }

  private editSignals(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === "GET") {
      return route.fulfill({ status: 200, json: this.signals() });
    }
    if (method === "POST") {
      const sent = request.postDataJSON() as Omit<SignalRow, "id"> | Omit<SignalRow, "id">[];
      for (const body of Array.isArray(sent) ? sent : [sent]) this.upsert(body);
      return route.fulfill({ status: 201, body: "" });
    }
    if (method === "DELETE") {
      const ids = /^in\.\((.*)\)$/.exec(url.searchParams.get("id") ?? "")?.[1];
      const doomed = ids === undefined ? null : new Set(ids.split(",").map((s) => s.replace(/"/g, "")));
      for (const [k, r] of [...this.rows]) {
        if (r.user_id === FAKE_USER_ID && (doomed === null || doomed.has(r.id))) this.rows.delete(k);
      }
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ status: 405, body: "" });
  }

  private upsert(body: Omit<SignalRow, "id">): void {
    const k = `${body.user_id}|${body.device_id}|${body.key}`;
    const prev = this.rows.get(k);
    if (!prev) {
      this.rows.set(k, { id: `row-${this.nextId++}`, ...body });
      return;
    }
    // D-0281 §1 trigger: an update whose `last_seen` is older than the stored one is a no-op.
    if (new Date(body.last_seen).getTime() < new Date(prev.last_seen).getTime()) return;
    this.rows.set(k, { id: prev.id, ...body });
  }

  private profiles(route: Route): Promise<void> {
    const request = route.request();
    const headers = request.headers();
    const asObject = (headers.accept ?? "").includes("vnd.pgrst.object");
    if (request.method() === "GET") {
      return route.fulfill({
        status: 200,
        json: asObject ? this.profile : [this.profile],
      });
    }
    if (request.method() === "PATCH") {
      const body = request.postDataJSON() as Record<string, unknown>;
      Object.assign(this.profile, body);
      // The profiles trigger stamps the epoch whenever the flag or the epoch is written.
      if ("learn_from_edits" in body || "learn_reset_at" in body) {
        this.profile.learn_reset_at = new Date().toISOString();
      }
      if (!(headers.prefer ?? "").includes("return=representation")) {
        return route.fulfill({ status: 204, body: "" });
      }
      const out = { learn_reset_at: this.profile.learn_reset_at };
      return route.fulfill({ status: 200, json: asObject ? out : [out] });
    }
    return route.fallback();
  }

  private nameList(route: Route, list: NameRow[], opposite: NameRow[]): Promise<void> {
    const request = route.request();
    const method = request.method();
    if (method === "GET") return route.fulfill({ status: 200, json: list });
    if (method === "POST") {
      const sent = request.postDataJSON() as { exercise_id: string } | { exercise_id: string }[];
      const out: NameRow[] = [];
      for (const { exercise_id } of Array.isArray(sent) ? sent : [sent]) {
        if (!list.some((r) => r.exercise_id === exercise_id)) {
          const row = { exercise_id, created_at: new Date().toISOString() };
          list.push(row);
          out.push(row);
        }
        // The mutual exclusion trigger (D-0199, D-0202).
        const i = opposite.findIndex((r) => r.exercise_id === exercise_id);
        if (i >= 0) opposite.splice(i, 1);
      }
      return route.fulfill({ status: 201, json: out });
    }
    if (method === "DELETE") {
      const id = /^eq\.(.*)$/.exec(new URL(request.url()).searchParams.get("exercise_id") ?? "")?.[1];
      const i = list.findIndex((r) => r.exercise_id === id);
      if (i >= 0) list.splice(i, 1);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ status: 405, body: "" });
  }
}
