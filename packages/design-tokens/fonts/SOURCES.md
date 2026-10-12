# Font sources

The design-token fonts (D-0208): Familjen Grotesk and Bricolage Grotesque. T-0625 (D-0210 §6) removed the
Chalk & Iron pair (Big Shoulders Display and DM Sans, T-0544) together with its files and licence texts; their
provenance stays in git history.

## D-0208 state fonts (T-0583)

Familjen Grotesk (plan screens) and Bricolage Grotesque (session screens), both under the SIL Open Font License
1.1, loaded through `src/fonts.css` (export `@workoutlab/design-tokens/fonts.css`; `fonts-state.css` is an alias). The woff2 files
were downloaded once (2026-10-08) from the official Google Fonts distribution of the `google/fonts` repo, the
latin subset served by `https://fonts.googleapis.com/css2?family=<Family>:wght@<range>`, and committed as-is.
They are byte-identical to the Fontsource `latin-wght-normal` builds (same sha256). There is no runtime npm dependency and nothing is fetched at runtime.

| File                                   | Upstream URL (fonts.gstatic.com)                                                                                                 | Fontsource cross-check                           | Bytes | sha256                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----- | ------------------------------------------------------------------ |
| `familjen-grotesk-latin-wght.woff2`    | https://fonts.gstatic.com/s/familjengrotesk/v11/Qw3GZR9ZHiDnImG6-NEMQ41wby8WbHoEjw.woff2                                         | `@fontsource-variable/familjen-grotesk@5.3.0`    | 18916 | `414d5dfe5f3d02a327f99ad9121bd77ae931b5b754565578fb0ce4fede2de268` |
| `bricolage-grotesque-latin-wght.woff2` | https://fonts.gstatic.com/s/bricolagegrotesque/v9/3y9H6as8bTXq_nANBjzKo3IeZx8z6up5BeSl5jBNz_19PpbpMXuECpwUxJBOm_OJWiawA1Xp.woff2 | `@fontsource-variable/bricolage-grotesque@5.3.0` | 41344 | `a97804dc9fbe5fc972a08018c5eda4dab7ef2346f64c57e61419d05e6de4ea1c` |

- npm tarball integrity: `@fontsource-variable/familjen-grotesk@5.3.0`
  `sha512-R9W0xEZRIHUV658cuOGRMAIcqX1QJ8p5/W6Boooa6zAw1BAozU//mr8C0VNggSE26/VHPwj2XNyMAG6yUJmjxA==`;
  `@fontsource-variable/bricolage-grotesque@5.3.0`
  `sha512-TLi9Q4hJjS2UvoTMRSS2nHu6c4R56lAw60NR9QYtVRCHn0XtsFpiEhNffZ8Glsoxu6wEEwLKBP8lb94J52PNBA==`.
- Google Fonts metadata: Familjen Grotesk `v11` (axis `wght` 400–700; the upright file only, no italic);
  Bricolage Grotesque `v9` (axes `wght` 200–800, `opsz` 12–96, `wdth` 75–100; the `wght` build carries `wght`
  only, `opsz` and `wdth` at their defaults). `fonts.css` declares `font-weight: 400 700` and `200 800`.
- Size budget (visual-foundation §1): each file ≤ 60 KB, and the pair together ≤ 110 KB (60260 bytes).

### Licences (D-0208 fonts)

| File                         | Source URL                                                                                                   | sha256                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `OFL-FamiljenGrotesk.txt`    | https://github.com/google/fonts/blob/c5472db7405caf4c4a962843ab2d446519090161/ofl/familjengrotesk/OFL.txt    | `9708dd560d1f8aa1f006461aa447a31fda7b9aff662d152837654a388e0eb2ee` |
| `OFL-BricolageGrotesque.txt` | https://github.com/google/fonts/blob/92f1a0b2771d29dfbc73ac2c56752ba64ff85c22/ofl/bricolagegrotesque/OFL.txt | `4b5a7d8f37f5602621c8a8d7358a6a2e71317e6c231c661e15aef0275d3e07ba` |

- Copyright lines: "Copyright 2021 The Familjen Grotesk Project Authors (https://github.com/Familjen-Sthlm/Familjen-Grotesk)";
  "Copyright 2022 The Bricolage Grotesque Project Authors (https://github.com/ateliertriay/bricolage)".
- **Reserved Font Name check (D-0208 fonts):** none declared in either header. Each header is the copyright line
  followed directly by the licence text; no "with Reserved Font Name" clause. The family names are kept unchanged.
