import type { APIRoute } from "astro";
import { tokens } from "@workoutlab/design-tokens";

// Favicon built at build time from design tokens (D-0046 §7). No colour literal:
// every fill/stroke is a value of tokens.color, checked by AC13.
const { bg, accent } = tokens.color;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="${bg}" />
  <rect x="7" y="14" width="4" height="10" fill="${accent}" />
  <rect x="14" y="8" width="4" height="16" fill="${accent}" />
  <rect x="21" y="4" width="4" height="20" fill="${accent}" />
</svg>
`;

export const GET: APIRoute = () =>
  new Response(svg, {
    headers: { "Content-Type": "image/svg+xml" },
  });
