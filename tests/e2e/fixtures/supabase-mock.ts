// Shared `page.route` helper so no e2e spec needs a real Supabase project (D-0045 §10).
// T-0300a's own specs don't call Supabase (auth lands in T-0300b), so this only stubs the
// GoTrue endpoints enough that an unmocked request never leaves the browser silently; T-0300b
// and T-0300c extend it with real payloads for their specs.
import type { Page } from "@playwright/test";
import { VITE_SUPABASE_URL } from "../playwright.config.js";

export { VITE_SUPABASE_URL };

/** Fails any Supabase auth call that a spec didn't expect, instead of hitting the network. */
export async function mockSupabaseAuth(page: Page): Promise<void> {
  await page.route(`${VITE_SUPABASE_URL}/auth/v1/**`, (route) =>
    route.fulfill({ status: 501, body: "unmocked supabase auth call in e2e" }),
  );
}
