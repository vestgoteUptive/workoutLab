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
