---
id: T-0502
title: "UF-01.5: privacy notice v2 with the GDPR Art. 13 items (controller, legal basis, processors, retention, rights and complaint, the Plan → Account path); unknown facts are marked placeholders, and the human re-approves the copy (H-22) (T-0406 P6-a)"
lane: design
screens: [UF-01.5, UF-11.4]
decisions: [D-0188, D-0046, D-0017, D-0135]
deps: [T-0406]
status: ready
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main ccbae43 (D-0188 §5). Build flow:
wl-design. About ⅓ day of agent work, plus a short fill-in pass after H-22. Human gate: H-22
(facts and copy re-approval, H-10 style), and H-21 (DPAs) before done. -->

## Why
NFR-PRIV-6 requires a privacy notice. The T-0406 review (`docs/security/privacy.md`,
NFR-PRIV-6, finding P6-a) found that `apps/landing/src/content/privacy.ts` covers the four
topics the NFR names, but lacks what GDPR Art. 13 requires at collection:
- the controller;
- the legal basis;
- the processors;
- retention;
- the user's rights, including the right to complain;
- where in the app to export and delete.

Three claims are also incomplete:
- "deleted straight away" leaves out backups and platform logs (P5-b, P7-b);
- "The app talks only to our own servers and our database provider" leaves out the email
  provider and the Google redirect;
- the notice doesn't mention auth session data (P2-b).

The notice is the user's first view of how we treat their data, so it has to be complete and
true. Facts the repo doesn't hold (the controller's legal name and address, the supervisory
authority) must not be guessed. They're marked placeholders that the human fills in at H-22.

## Scope
- **In** (`apps/landing/src/content/`):
  - **Sections.** `types.ts`: the `PrivacySectionId` union becomes, in render order:
    `who-we-are`, `what-we-store`, `why`, `where`, `how-long`, `export-and-delete`,
    `your-rights`, `no-tracking`, `contact` (D-0188 §5). Remove the "Mailbox pending human gate
    H-10" comment (H-10 is done).
  - **Copy.** `privacy.ts` gets these sections. The wording is the designer's; the facts are
    fixed here:
    - `who-we-are`: the controller is `{{HUMAN:CONTROLLER_NAME}}`, at
      `{{HUMAN:CONTROLLER_ADDRESS}}`, reachable at the privacy mailbox. The page byline "by
      Uptive" stays (landing AC1).
    - `what-we-store`: today's text, plus:
      - sign-in records: for each sign-in session, the IP address and browser (user agent),
        and a record of sign-ins (email and IP);
      - **Google:** if you choose "Continue with Google", Google sends us your name and profile
        picture. We drop them as you sign in and don't keep them (D-0188 §2, true at H-23).
    - `why`, the legal basis per purpose:
      - the account, training data and plan settings: to provide the service you asked for,
        **Art. 6(1)(b)** (contract);
      - aggregate usage metrics and sign-in security records: **legitimate interest,
        Art. 6(1)(f)**.
      - Keep today's NFR-AN-2 wording ("no outside tools").
    - `where`, the processors and where they run:
      - **Supabase**, database and sign-in, EU (Ireland);
      - **Resend**, sends the sign-in emails, EU region;
      - **Cloudflare**, serves the app and this website from its global network, and sees your
        IP address and the pages you request;
      - **Google**, only if you choose Google sign-in: it learns that you signed in to workout
        LAB.
      - Keep the RLS sentence and the word "EU".
    - `how-long`:
      - your data is kept until you delete your account;
      - backups hold it for up to 7 days after that;
      - our providers' logs (IP address, account id, and for sign-in the email) are kept for up
        to 7 days;
      - sign-in session data and sign-in records are deleted with your account (true at H-23,
        D-0188 §1).
    - `export-and-delete`: today's text, plus:
      - where to find it: **Plan → Account** in the app;
      - deletion: "straight away" stays for the live data, and now also mentions the up-to-7-day
        backups.
    - `your-rights`:
      - access, correction, deletion, a copy in a portable format (the JSON export), restriction
        and objection;
      - how to use them: in the app, or by email to the privacy mailbox;
      - the right to complain to a supervisory authority: `{{HUMAN:SUPERVISORY_AUTHORITY}}`.
    - `no-tracking`: keep "No third-party analytics, trackers or ad SDKs". Replace "The app
      talks only to our own servers and our database provider" with a true sentence. The app's
      data goes only to our database provider. The sign-in email comes from our email provider.
      Google sign-in, if you choose it, sends you to Google and back.
    - `contact`: unchanged.
    - `updated`: the build date (≥ `2026-10-05`). `intro` may change.
  - **Header comment.** Rewrite the `privacy.ts` header comment: drop "pending human gate H-10",
    and cite D-0188 and `docs/security/privacy.md`.
  - **Tests.** `content.test.ts`: update AC5's section-order test, and add the ACs below.
  - **Fill-in pass** (after H-22, same ticket): replace the three markers with the human's
    facts, flip AC-9 to the empty set, and bump `updated`.
- **Out:**
  - `apps/landing/src/pages/**`. `privacy.astro` renders `privacy.sections` generically, and
    `apps/landing/test/ac14-privacy-page.test.ts:28-30` compares the h2 list to
    `privacy.sections`, so both follow on their own.
  - The landing summary (`landing.ts` AC4 stays).
  - Any web change (UF-01.5's link at `AccountScreen.tsx:16` is unchanged).
  - A cookie banner: there are no cookies to consent to.
  - Translations.

### Edge cases that are in scope
- **The release order.** Two sentences only become true at H-23 (the T-0503 and T-0504 prod
  release): the Google one and the sign-in-records one. The landing prod deploy (H-06) waits for
  H-23 anyway (D-0188 §4). The accept log must say so.
- **Placeholders on previews.** Preview builds show the `{{HUMAN:…}}` markers as visible text.
  That's intended: they can't pass for real facts.
- **Art. 9.** Whether training logs count as health data is the human's call at H-22. If they
  do, stop: explicit consent is a product change (D-0188 "Revisit when").

## Acceptance criteria
Each test title starts with `T-0502 AC-n`. All tests live in
`apps/landing/src/content/content.test.ts` and use its `section(id)` helper. The existing
AC6 copy hygiene stays green: no URLs, no "AI", trimmed strings.

- **AC-1 (order)** `p.sections.map(s => s.id)` equals the nine ids in the Scope order.
  `updated` matches `/^\d{4}-\d{2}-\d{2}$/` and is ≥ `"2026-10-05"`.

  **Red:** the current six-id list.
- **AC-2 (controller)** `section("who-we-are")` contains `{{HUMAN:CONTROLLER_NAME}}` and
  `{{HUMAN:CONTROLLER_ADDRESS}}`, and matches `/controller/i`. After H-22, it contains the
  human's name and address instead.
- **AC-3 (legal basis)** `section("why")`:
  - matches `/6\(1\)\(b\)/` and `/contract/i`;
  - matches `/6\(1\)\(f\)/` and `/legitimate interest/i`;
  - still matches `/no outside tools/i`.
- **AC-4 (processors)** `section("where")`:
  - matches each of `/Supabase/`, `/Ireland/`, `/Resend/`, `/Cloudflare/`, `/Google/` and
    `/\bEU\b/`;
  - matches `/IP address/i` (Cloudflare's view).
- **AC-5 (retention)** `section("how-long")`:
  - matches `/until you delete/i`;
  - matches `/backup/i` and `/7 days/`;
  - matches `/log/i`;
  - matches `/IP address/i`.

  `section("what-we-store")` matches `/IP address/i`, `/browser|user agent/i`, and
  `/Google/` + `/name/` + `/picture/` + `/(don't|do not) keep|drop/i`.
- **AC-6 (export and delete path)** `section("export-and-delete")`:
  - matches `/Plan → Account/` (the Plan screen's link label is `uf-11.ts:69`
    `accountLink: "Account"`, and the route is `/plan/account`, `routes.ts:123-128`);
  - still matches `/JSON/` and `/delete/i`;
  - matches `/backup/i`.
- **AC-7 (rights)** `section("your-rights")`:
  - matches `/access/i`, `/correct/i`, `/delet/i`, `/portab|copy/i`, `/restrict/i` and
    `/object/i`;
  - matches `/complain/i` and contains `{{HUMAN:SUPERVISORY_AUTHORITY}}`.
- **AC-8 (no false "only")** `section("no-tracking")`:
  - still matches `/no third-party analytics/i`;
  - doesn't match `/only to our own servers and our database provider/i`;
  - matches `/email provider/i` and `/Google/`.
- **AC-9 (placeholders are pinned)**
  - Collect every `/\{\{HUMAN:[A-Z_]+\}\}/g` match across all `privacy` strings (reuse
    `collectStrings`).
  - Before H-22, the sorted unique set equals exactly
    `["{{HUMAN:CONTROLLER_ADDRESS}}", "{{HUMAN:CONTROLLER_NAME}}", "{{HUMAN:SUPERVISORY_AUTHORITY}}"]`.
  - In the fill-in pass it becomes `[]`, and the landing `landing` strings must also hold none.
  - **Done requires the `[]` form.**
- **AC-10 (stale notes gone)** A test reads `privacy.ts` and `types.ts` as text (`node:fs`,
  relative to the test file). Neither contains `pending human gate H-10`.

**Red proof.**
- Run AC-1 to AC-8 and AC-10 on main: each must fail.
- Then plant one fault on a backup copy of `privacy.ts`: rename one marker to
  `{{HUMAN:CONTROLLER}}`. AC-9 must fail.
- Restore with `cp`. Record every run.

## Paths you may change
- **Lane `design`:** `apps/landing/src/content/**` (`privacy.ts`, `types.ts`,
  `content.test.ts`).
- **Listed extras:**
  - `docs/tickets/T-0502-privacy-notice-gdpr-art13.md`, for the build and accept logs.

## Contract impact
None. The copy restates NFR-PRIV-1…7 and the D-0188 behaviour. D-0188 §5 amends D-0046 §8
("no new promises"), so the Art. 13 disclosures are allowed.

## Definition of done
- Tests for every AC pass, with the red runs and the planted fault recorded:
  - `npx vitest run src/content/content.test.ts` in `apps/landing`, through
    `scripts/locked.sh small`;
  - `pnpm --filter @workoutlab/landing test`, which includes AC14's built page.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` are green, each through
  `scripts/locked.sh` (D-0169).
- **Human gate H-22** (H-10 style, gates 3 and 6). The human:
  1. supplies the controller's legal name and postal address, and the supervisory authority;
  2. confirms the legal bases (6(1)(b), 6(1)(f));
  3. confirms that training logs aren't treated as Art. 9 health data;
  4. re-approves the full copy.

  H-21 (the Supabase and Resend DPAs) must also be done, because the notice names them as
  processors.
- **Then the fill-in pass:**
  - AC-9 is in its `[]` form;
  - the H-22 facts appear verbatim;
  - the human's approval is quoted in the accept log.

  Until then the ticket sits in `review (needs H-22)`, not `done`.
- Commits start `T-0502` and cite UF-01.5.

## Notes
- **Parallel:** runs alongside T-0503 and the in-flight T-0404b. Neither touches
  `apps/landing/**`. T-0504 is sequenced after T-0503 and doesn't touch this ticket's paths.
- **For the orchestrator:**
  - add H-22 to `needs-human.md` when this ticket hands back with placeholders;
  - T-0403 (release check) must confirm that AC-9 is `[]` and that H-23 is done before
    H-06.
- The security reviewer re-checks P6-a against the final copy (D-0188 Consequences).

## Build / accept log

### Build 2026-10-05 (designer, branch `t/T-0502-privacy-notice-gdpr`, from `36cb41c`, clean)
- **Changed:** `types.ts` (nine `PrivacySectionId`s in D-0188 §5 order, H-10 note gone); `privacy.ts` (v2 copy, new header citing D-0188 + `docs/security/privacy.md`, `updated: 2026-10-05`); `content.test.ts` (AC5 order → nine ids, T-0502 AC-1…AC-10).
- **Fact sources:** Supabase eu-west-1/Ireland and Resend eu-west-1: `docs/security/privacy.md:40-49`. Cloudflare edge, sees IP + URL, no user data stored there: :50-58. Session IP/user agent (P2-b): :131. Backups 7 days on Pro (P5-b): :278. Supabase logs IP/sub/email, 1 day Free / 7 days Pro (P7-b): :388-391. Google name/picture dropped, sign-in records deleted with the account: D-0188 §1-2 (**true in prod only at H-23**). Plan → Account: `uf-11.ts:69` `accountLink`, export and delete in `features/UF-11/AccountSettingsBody.tsx`.
- **Narrowed on purpose:** the spec says "our providers' logs … up to 7 days". The repo only establishes that retention for Supabase (P7-b), not Cloudflare, so the copy says "our database provider's logs". Not stated, for H-22 to decide: Resend is a US company and the transfer safeguards (SCCs) depend on H-21.
- **AC→test** (all in `apps/landing/src/content/content.test.ts`, `describe("T-0502 …")`): AC-1 `T-0502 AC-1 (order)`; AC-2 `AC-2 (controller)`; AC-3 `AC-3 (legal basis)`; AC-4 `AC-4 (processors)`; AC-5 `AC-5 (retention)`; AC-6 `AC-6 (export and delete path)`; AC-7 `AC-7 (rights)`; AC-8 `AC-8 (no false only)`; AC-9 `AC-9 (placeholders are pinned)`, pre-H-22 form; AC-10 `AC-10 (stale notes gone)`.
- **Red on unfixed copy:** new tests on the old `privacy.ts`/`types.ts` → 11 failed (AC5 order, AC-1…AC-10).
- **Planted fault:** `{{HUMAN:CONTROLLER_NAME}}` → `{{HUMAN:CONTROLLER}}` on a backup copy → AC-9 failed (and AC-2), 87 passed. Restored with `cp`, green again.
- **Gate:** `locked.sh small npx vitest run src/content/content.test.ts` 89/89; `--filter @workoutlab/landing test` 13 files / 143 tests (incl. AC14's built page); `-w typecheck lint test --concurrency=1` 19/19 tasks; `-w test:repo-checks` 261 pass / 0 fail; `-w format:check` clean; `check-all.mjs` exit 0.
- **Release order:** the Google sentence and the "sign-in records deleted with your account" sentence are true in prod only after H-23 (T-0503 and T-0504 released). H-06 (landing prod deploy) must wait for H-23 (D-0188 §4).
- **Open:** markers left: `{{HUMAN:CONTROLLER_NAME}}`, `{{HUMAN:CONTROLLER_ADDRESS}}`, `{{HUMAN:SUPERVISORY_AUTHORITY}}`. Previews show them as visible text, which is intended. Status → `review (needs H-22)`. The fill-in pass, H-21 and H-22 are still needed.
