import { defineConfig } from "astro/config";

// Domain (D-0010) and static, zero-JS output (D-0046 §4). No adapter, no
// islands: Astro's default "static" output ships plain HTML/CSS with no
// client script, which is what AC11 checks.
export default defineConfig({
  site: "https://workout.vestgote.com",
  output: "static",
  trailingSlash: "always",
});
