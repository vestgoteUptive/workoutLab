import { defineConfig } from "astro/config";

// Domain (D-0010) and static, zero-JS output (D-0046 §4). No adapter, no
// islands: Astro's default "static" output ships plain HTML/CSS with no
// client script, which is what AC11 checks.
export default defineConfig({
  site: "https://workout.vestgote.com",
  output: "static",
  trailingSlash: "always",
  build: {
    // Always emit a real stylesheet file rather than inlining it into every
    // page's <head> (AC11/AC12/AC22 check dist/**/*.css directly, and a
    // shared file caches once across pages instead of shipping per-page).
    inlineStylesheets: "never",
  },
});
