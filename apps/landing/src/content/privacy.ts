import type { PrivacyNotice } from "./types";

/**
 * Privacy notice v2 (NFR-PRIV-6, UF-01.5; T-0502). Restates NFR-PRIV-1…7,
 * NFR-AN-1 and NFR-AN-2 from docs/specs/non-functional.md, and adds the GDPR
 * Art. 13 items the T-0406 review found missing (docs/security/privacy.md, P6-a,
 * with P2-b, P5-b and P7-b). D-0188 §5 amends D-0046 §8: these disclosures are
 * allowed as long as each one is true of the system. The Google sentence and the
 * sign-in-records retention become true in prod at H-23 (T-0503, T-0504).
 * The `{{HUMAN:…}}` facts the repo didn't hold were filled in at H-22: the
 * controller is Henrik, reachable at the privacy mailbox (no postal address is
 * published); the supervisory authority is Sweden's Integritetsskyddsmyndigheten
 * (IMY). content.test.ts (T-0502 AC-9) now pins that no such marker remains, in
 * this file or in landing.ts.
 */
export const privacy = {
  title: "Privacy",
  updated: "2026-10-05",
  intro:
    "This notice covers the workout LAB app and this website. It says who is responsible for your data, what we store and why, where it goes, how long we keep it, and how you export or delete it.",
  sections: [
    {
      id: "who-we-are",
      heading: "Who we are",
      body: "workout LAB is run by Henrik. We are the controller of your personal data: we decide why and how it is used.\n\nYou can reach us about your data at privacy@workout.vestgote.com, the privacy mailbox under Contact below.",
    },
    {
      id: "what-we-store",
      heading: "What we store",
      body: "We store your email address, your training data (sessions, exercises, sets, reps and weights in kg), your plan settings (such as your time budget and priority areas) and how long your first setup took, in milliseconds.\n\nTo keep sign-in safe, we also store, for each sign-in session, the IP address and browser (user agent) it came from, and a record of sign-ins with your email and IP address.\n\nIf you choose \"Continue with Google\", Google sends us your name and profile picture. We drop them as you sign in and don't keep them.\n\nWe don't collect your date of birth, sex, body weight, heart rate or location coordinates. A session's location is only a label you choose, such as gym or home.",
    },
    {
      id: "why",
      heading: "Why we store it",
      body: "Your email lets you sign in. Your training data and plan settings let the app work out your balance over the last 14 days and suggest your next session from fixed rules. We use your account, training data and plan settings to provide the service you asked for, under our contract with you (GDPR Art. 6(1)(b)).\n\nWe also compute aggregate usage metrics from the same tables, such as how many sessions finish within their time budget and how long first setup takes. These are totals and ratios across all users, worked out in our own database with no outside tools. We keep the sign-in records to protect your account. For these metrics and sign-in records we rely on our legitimate interest in running and securing the service (GDPR Art. 6(1)(f)).",
    },
    {
      id: "where",
      heading: "Where it goes",
      body: "Your data is hosted in an EU region, in Ireland, by our database provider, Supabase. Access rules in the database let you read and write only your own rows.\n\nThese providers process data for us:\n\nSupabase runs the database and sign-in, in the EU (Ireland).\n\nResend sends the sign-in emails. Resend is a US company, but it processes our email in its EU region (eu-west-1); any transfer to the US is covered by the EU Standard Contractual Clauses in its data processing agreement.\n\nCloudflare serves the app and this website from its global network. It sees your IP address and the pages you request, but none of your training data is stored there.\n\nGoogle is involved only if you choose Google sign-in. Google then learns that you signed in to workout LAB.",
    },
    {
      id: "how-long",
      heading: "How long we keep it",
      body: "We keep your data until you delete your account.\n\nAfter that, our database backups still hold it for up to 7 days, until they rotate out.\n\nOur database provider's logs (IP address, account id, and for sign-in your email) are kept for up to 7 days.\n\nYour sign-in session data and sign-in records are deleted with your account.",
    },
    {
      id: "export-and-delete",
      heading: "Export or delete your data",
      body: "In the app, open Plan → Account.\n\nThere you can export everything you own as one JSON file.\n\nYou can also delete your account there. After you confirm, your account and all your data are deleted from our live database straight away, and the copy on your device is cleared. Our backups still hold a copy for up to 7 days, and then it is gone.",
    },
    {
      id: "your-rights",
      heading: "Your rights",
      body: "You have the right to access your data, to correct it, to have it deleted, to get a copy in a portable format (the JSON export), to restrict how we use it, and to object to how we use it.\n\nYou can use most of these rights in the app, under Plan → Account. For anything else, email the privacy mailbox under Contact below.\n\nYou also have the right to complain to a supervisory authority: Integritetsskyddsmyndigheten (IMY), imy.se.",
    },
    {
      id: "no-tracking",
      heading: "No tracking",
      body: "No third-party analytics, trackers or ad SDKs, in the app or on this website.\n\nThe app sends your data only to our database provider. Your sign-in email comes from our email provider. If you choose Google sign-in, the app sends you to Google and back.",
    },
    {
      id: "contact",
      heading: "Contact",
      body: "Questions about your data? Email us and we will answer.",
    },
  ],
  contactEmail: "privacy@workout.vestgote.com",
} as const satisfies PrivacyNotice;
