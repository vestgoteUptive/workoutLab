import type { LandingContent } from "./types";

/**
 * Landing copy for workout.vestgote.com (T-0309a). Rendered by T-0309b.
 * Engine claims must match docs/engine-rules.md: balance is weighted hard sets
 * over the last 14 days, and suggestions come from fixed rules.
 */
export const landing = {
  brand: {
    name: "workout LAB",
    byline: "by Uptive",
  },
  meta: {
    title: "workout LAB by Uptive — balanced training",
    description:
      "Tell workout LAB how long you have. It plans a session that keeps every muscle group in balance, then guides you one step at a time. Free.",
  },
  hero: {
    headline: "Train every muscle group, in the time you have",
    sub: "Say how many minutes you have. workout LAB plans the session that best evens out your last two weeks, and shows one step at a time.",
    ctaLabel: "Open the app",
    ctaNote: "Free. Works in your browser, and installs to your home screen.",
  },
  featuresHeading: "How it works",
  features: [
    {
      id: "balance",
      title: "Balance you can see",
      body: "Every muscle area gets a score from your weighted hard sets over the last 14 days, so you see what is ahead and what is lagging.",
    },
    {
      id: "time-budget",
      title: "Fits your time",
      body: "Start by saying how many minutes you have. The plan is built to fit that time.",
    },
    {
      id: "focus",
      title: "One step at a time",
      body: "During a workout you see one thing: the current set or rest. Everything else waits behind Pause.",
    },
    {
      id: "adaptive",
      title: "Targets that adapt",
      body: "Suggestions come from clear, fixed rules, and your targets shift with what you actually train.",
    },
  ],
  privacy: {
    heading: "Your data stays yours",
    summary:
      "We store only your email, your training and your plan settings, hosted in the EU. No third-party analytics, no trackers, no ads. Export or delete everything in the app.",
    linkLabel: "Privacy",
  },
  footer: {
    legal: "© 2026 Uptive. workout LAB is free in this first version.",
    appLinkLabel: "Open the app",
  },
  notFound: {
    title: "Page not found",
    body: "This page doesn't exist or has moved.",
    homeLinkLabel: "Back to the start page",
  },
} as const satisfies LandingContent;
