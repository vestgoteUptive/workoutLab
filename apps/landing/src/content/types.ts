/**
 * Content types for the "workout LAB by Uptive" landing (T-0309a, D-0046 §3).
 *
 * Copy lives in plain typed modules, not Astro content collections. Pages in
 * T-0309b import `landing` and `privacy` and render them; they never inline copy.
 * Rules for every string (enforced by content.test.ts, AC6): English only
 * (D-0017), kg only (NFR-I18N-3), no URLs (they come from code), no colour
 * literals (they come from @workoutlab/design-tokens), and no claim that a
 * model picks exercises (principle 3).
 */

/** Feature card ids. `balance`, `time-budget` and `focus` are required (AC3). */
export type FeatureId = "balance" | "time-budget" | "focus" | "adaptive";

export interface Brand {
  /** Wordmark, set in the display font at weight 800. */
  readonly name: string;
  /** Shown after the wordmark in the body font, `text-muted`. */
  readonly byline: string;
}

export interface Meta {
  /** `<title>`; starts with "workout LAB by Uptive", at most 60 characters. */
  readonly title: string;
  /** `<meta name="description">`; 50–160 characters. */
  readonly description: string;
}

export interface Hero {
  /** The page's only `<h1>`; 1–60 characters. */
  readonly headline: string;
  /** Supporting line under the headline; 1–160 characters. */
  readonly sub: string;
  /** Primary CTA text into the app; 2–24 characters, describes its target (WCAG 2.4.4). */
  readonly ctaLabel: string;
  /** Small note under the CTA; at most 80 characters, says the app is free. */
  readonly ctaNote: string;
}

export interface Feature {
  readonly id: FeatureId;
  /** Card `<h3>`; at most 32 characters. */
  readonly title: string;
  /** Card body; at most 160 characters. */
  readonly body: string;
}

export interface PrivacySummary {
  /** Section `<h2>`. */
  readonly heading: string;
  /** Short summary; names the EU region and no third-party analytics. */
  readonly summary: string;
  /** Text of the link to `/privacy/`. */
  readonly linkLabel: string;
}

export interface Footer {
  /** Legal line; names Uptive. */
  readonly legal: string;
  /** Text of the footer link to the app; 2–24 characters. */
  readonly appLinkLabel: string;
}

export interface NotFound {
  /** 404 `<h1>`. */
  readonly title: string;
  readonly body: string;
  /** Text of the link back to `/`; at most 24 characters. */
  readonly homeLinkLabel: string;
}

export interface LandingContent {
  readonly brand: Brand;
  readonly meta: Meta;
  readonly hero: Hero;
  /** Features section `<h2>`. */
  readonly featuresHeading: string;
  /** 3 or 4 cards with unique ids. */
  readonly features: readonly Feature[];
  readonly privacy: PrivacySummary;
  readonly footer: Footer;
  readonly notFound: NotFound;
}

/** Privacy notice section ids, in the order they render (AC5). */
export type PrivacySectionId =
  "what-we-store" | "why" | "where" | "export-and-delete" | "no-tracking" | "contact";

export interface PrivacySection {
  readonly id: PrivacySectionId;
  /** Rendered as an `<h2>`. */
  readonly heading: string;
  /** Plain text; paragraphs are separated by a blank line ("\n\n"). */
  readonly body: string;
}

export interface PrivacyNotice {
  /** Page `<h1>`. */
  readonly title: string;
  /** ISO date (YYYY-MM-DD) of the last change to this notice. */
  readonly updated: string;
  /** Short line under the title. */
  readonly intro: string;
  readonly sections: readonly PrivacySection[];
  /** Rendered as a `mailto:` link in the contact section. Mailbox pending human gate H-10. */
  readonly contactEmail: string;
}
