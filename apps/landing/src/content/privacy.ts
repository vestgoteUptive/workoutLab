import type { PrivacyNotice } from "./types";

/**
 * Privacy notice (NFR-PRIV-6, D-0046 §8). Restates NFR-PRIV-1…5, NFR-AN-1 and
 * NFR-AN-2 (first-party aggregate metrics, docs/data-model.md schema analytics)
 * from docs/specs/non-functional.md and makes no new promises. If the security
 * review text in docs/security/ (T-0406) differs, that text wins.
 * The contact mailbox is pending human gate H-10.
 */
export const privacy = {
  title: "Privacy",
  updated: "2026-09-28",
  intro:
    "This notice covers the workout LAB app and this website. It says what we store, why, where, and how you export or delete it.",
  sections: [
    {
      id: "what-we-store",
      heading: "What we store",
      body: "We store your email address, your training data (sessions, exercises, sets, reps and weights in kg), your plan settings (such as your time budget and priority areas) and how long your first setup took, in milliseconds.\n\nWe don't collect your date of birth, sex, body weight, heart rate or location coordinates. A session's location is only a label you choose, such as gym or home.",
    },
    {
      id: "why",
      heading: "Why we store it",
      body: "Your email lets you sign in. Your training data and plan settings let the app work out your balance over the last 14 days and suggest your next session from fixed rules.\n\nWe also compute aggregate usage metrics from the same tables, such as how many sessions finish within their time budget and how long first setup takes. These are totals and ratios across all users, worked out in our own database with no outside tools.",
    },
    {
      id: "where",
      heading: "Where it is stored",
      body: "Your data is hosted in an EU region by our database provider, Supabase. Access rules in the database let you read and write only your own rows.",
    },
    {
      id: "export-and-delete",
      heading: "Export or delete your data",
      body: "In the app you can export everything you own as one JSON file.\n\nYou can also delete your account in the app. After you confirm, your account and all your data are deleted straight away, and the copy on your device is cleared.",
    },
    {
      id: "no-tracking",
      heading: "No tracking",
      body: "No third-party analytics, trackers or ad SDKs, in the app or on this website. The app talks only to our own servers and our database provider.",
    },
    {
      id: "contact",
      heading: "Contact",
      body: "Questions about your data? Email us and we will answer.",
    },
  ],
  contactEmail: "privacy@workout.vestgote.com",
} as const satisfies PrivacyNotice;
