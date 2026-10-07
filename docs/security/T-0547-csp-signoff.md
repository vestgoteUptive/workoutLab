# T-0547 AC7: landing CSP sign-off (security reviewer)

Verdict: **approve**. Reviewed `git diff main...HEAD` at b655b04 and the built `apps/landing/dist`.

- `_headers`: the only change is `font-src 'self'` added to the CSP line. HSTS, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy are untouched. Built `dist/_headers` is identical to `public/_headers`.
- No `data:` URIs and no third-party font hosts. `fonts.css` has no `local()`, `data:` or remote sources. Built `@font-face` rules use root-relative `/_astro/*.woff2` URLs (34.7K and 36.1K files, above Vite's inline limit, so they are not inlined). The only `data:` match in `dist` is the word in privacy prose.
- Preloads are `<link rel="preload" as="font" type="font/woff2" crossorigin href="/_astro/...woff2">`: same-origin, with `crossorigin`. A font preload needs `crossorigin` even for same-origin, or the browser fetches the file twice.
- `t0511-headers.test.ts` still rejects anything looser. It requires the exact header string, the exact set of 8 directives and a count of exactly 8. A new directive, a widened source or a missing `font-src` fails it. Its `url()`/`@import` check on built CSS is unchanged. `t0547-fonts.test.ts` also asserts no http(s) in CSS and no googleapis/gstatic.

No findings of any severity. Not re-run: I read the tests and the dist output but did not execute the suites.
