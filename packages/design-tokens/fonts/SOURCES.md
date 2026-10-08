# Font sources (T-0544, D-0203 §1)

Both families are under the SIL Open Font License 1.1. The woff2 files are the Fontsource `latin-wght-normal`
builds (Fontsource builds them from the Google Fonts release of the upstream `google/fonts` repo), downloaded
once with `npm pack` and committed as-is. There is no runtime npm dependency. The licence texts are the upstream
`OFL.txt` files from `google/fonts`, pinned to a commit.

| File                                     | Package                                      | Version | Upstream file                                         | Bytes | sha256                                                             |
| ---------------------------------------- | -------------------------------------------- | ------- | ----------------------------------------------------- | ----- | ------------------------------------------------------------------ |
| `big-shoulders-display-latin-wght.woff2` | `@fontsource-variable/big-shoulders-display` | 5.3.0   | `files/big-shoulders-display-latin-wght-normal.woff2` | 35504 | `075292b13a638821b34726b33e49b3b711c4b9bee9b42f2bb68fa3b6ec888f2b` |
| `dm-sans-latin-wght.woff2`               | `@fontsource-variable/dm-sans`               | 5.3.0   | `files/dm-sans-latin-wght-normal.woff2`               | 36932 | `9fea608a947e67020c33cad9a6fe3d60c54119dfb8cff87768a8117a15ed7543` |

- npm tarball integrity: `@fontsource-variable/big-shoulders-display@5.3.0`
  `sha512-7k1REXMZFEa7gSWOURbmCJW5Gv9D0EbEFQgosZidM8Ob/qpPlK96vqyIzCTnNZ/C0XFZWxeKU53D3QdeHctYCA==`;
  `@fontsource-variable/dm-sans@5.3.0`
  `sha512-BpUG5bqePiDFMBM4ZtLSlPdAIOM990uB1dlXzIf4aw21yQR7BmykedLXXXMqGWsR18aMLOsbWccwJNh3ztTQaA==`.
- Fontsource metadata: Big Shoulders Display Google Fonts `v21` (axis `wght` 100–900); DM Sans `v17`
  (axes `wght` 100–1000, `opsz` 9–40, `ital`; the `wght` build carries `wght` only, `opsz` at its default).
- The D-0204 §6 fallback was not needed: `@fontsource-variable/big-shoulders-display@5.3.0` is current and not
  deprecated.

## Licences

| File                          | Source URL                                                                                                    | sha256                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `OFL-BigShouldersDisplay.txt` | https://github.com/google/fonts/blob/0e29996d5eef5be7f97a6c28aa47430b56bff606/ofl/bigshouldersdisplay/OFL.txt | `338f9c050f19daeda1d597243faf79f3a3d437c338af58cb7047617d0ce08771` |
| `OFL-DMSans.txt`              | https://github.com/google/fonts/blob/c26e50af610a8300ad53a2b4955828e329a52d39/ofl/dmsans/OFL.txt              | `9af36190332437f5ecd09974de43c1f7c77a310a996cdd8ceb25628b458840e1` |

- Copyright lines: "Copyright 2019 The Big Shoulders Project Authors (https://github.com/xotypeco/big_shoulders)";
  "Copyright 2014 The DM Sans Project Authors (https://github.com/googlefonts/dm-fonts)".
- **Reserved Font Name check:** none declared in either header. Each header is the copyright line followed directly
  by the licence text; no "with Reserved Font Name" clause. The family names are kept unchanged.

## D-0208 state fonts (T-0583)

Familjen Grotesk (plan screens) and Bricolage Grotesque (session screens), both under the SIL Open Font License
1.1, loaded through `src/fonts-state.css` (export `@workoutlab/design-tokens/fonts-state.css`). The woff2 files
were downloaded once (2026-10-08) from the official Google Fonts distribution of the `google/fonts` repo, the
latin subset served by `https://fonts.googleapis.com/css2?family=<Family>:wght@<range>`, and committed as-is.
They are byte-identical to the Fontsource `latin-wght-normal` builds (same sha256), which the T-0544 files above
also use. There is no runtime npm dependency and nothing is fetched at runtime.

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
  only, `opsz` and `wdth` at their defaults). `fonts-state.css` declares `font-weight: 400 700` and `200 800`.
- Size budget (visual-foundation §1, applied per stylesheet): each file ≤ 60 KB, and the `fonts-state.css` pair
  together ≤ 110 KB (60260 bytes). The T-0544 pair is a separate stylesheet and retires with the flat tokens.

### Licences (D-0208 fonts)

| File                         | Source URL                                                                                                   | sha256                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `OFL-FamiljenGrotesk.txt`    | https://github.com/google/fonts/blob/c5472db7405caf4c4a962843ab2d446519090161/ofl/familjengrotesk/OFL.txt    | `9708dd560d1f8aa1f006461aa447a31fda7b9aff662d152837654a388e0eb2ee` |
| `OFL-BricolageGrotesque.txt` | https://github.com/google/fonts/blob/92f1a0b2771d29dfbc73ac2c56752ba64ff85c22/ofl/bricolagegrotesque/OFL.txt | `4b5a7d8f37f5602621c8a8d7358a6a2e71317e6c231c661e15aef0275d3e07ba` |

- Copyright lines: "Copyright 2021 The Familjen Grotesk Project Authors (https://github.com/Familjen-Sthlm/Familjen-Grotesk)";
  "Copyright 2022 The Bricolage Grotesque Project Authors (https://github.com/ateliertriay/bricolage)".
- **Reserved Font Name check (D-0208 fonts):** none declared in either header. Each header is the copyright line
  followed directly by the licence text; no "with Reserved Font Name" clause. The family names are kept unchanged.
