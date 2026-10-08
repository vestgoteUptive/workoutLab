# T-0584 AC8 security sign-off: landing Cobalt restyle, `_headers`

Date: 2026-10-08. Reviewer: security lane. Branch `t/T-0584-landing-cobalt-1b`, HEAD `a2282fc`, tree clean at start.

**Verdict: approve.** No findings at any severity.

## Checks

1. **`_headers` unchanged.** `git diff main... -- apps/landing/public/_headers` is empty. The built `dist/_headers` is byte-identical to `public/_headers`. The CSP is still `default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`. `font-src 'self'` is kept, and nothing looser was added: no `data:`, no remote hosts, no `'unsafe-inline'`. HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy and Permissions-Policy are all as they are on main.
2. **Self-hosted fonts.** `packages/design-tokens/src/fonts-state.css` (T-0583) has two `@font-face` rules, Familjen Grotesk and Bricolage Grotesque. Each has one relative `url("../fonts/*.woff2") format("woff2")` source, with no `local()`, no `data:` and no remote source. Both files start with the `wOF2` magic bytes, and OFL licences sit alongside them. `Layout.astro` swaps `fonts.css` for `fonts-state.css`. It has one preload, `<link rel="preload" as="font" type="font/woff2" crossorigin href={planFontUrl}>`, and that resolves to the same-origin `/_astro/familjen-grotesk-latin-wght.*.woff2`. The `crossorigin` attribute is right for font preloads and sends no credentials cross-origin, because the target is same-origin.
3. **Built output loads no third-party resource.** I ran a fresh `astro build`. Every `src`/`href`/`url()` that loads a resource is a root-relative `/_astro/*`, `/favicon.svg` or `/privacy/` path. The only absolute URLs are the navigation CTA to `https://app.workout.vestgote.com/`, the canonical links to `https://workout.vestgote.com/`, a `mailto:` link, and the SVG xmlns. None of these is fetched as a subresource. The output has no `<script>`, no inline `style=` attribute (that is compatible with `style-src 'self'`), and no `data:` URI. The only "data:" match is privacy prose ("personal data:").
4. **Hero WebP.** `src/assets/hero-set.webp` (27 KB) is a simple lossy RIFF/WEBP that contains only one `VP8 ` chunk. It has no EXIF, XMP or ICC chunk, so no metadata, author, device or location leaks. The image is a static mock of the Set screen (UF-09.3: "Back squat, Set 2 of 4, 100 kg x8"). It holds no user or personal data. It is bundled as a hashed same-origin asset and is covered by `img-src 'self'`.

## Follow-ups

None.
