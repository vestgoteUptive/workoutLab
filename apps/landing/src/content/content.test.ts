import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { landing } from "./landing";
import { privacy } from "./privacy";
import type { Feature, FeatureId, LandingContent, PrivacyNotice } from "./types";

// T-0309a: content tests (AC1–AC7). The typed bindings below also make
// `astro check` fail if either module drifts from src/content/types.ts (AC7).
const l: LandingContent = landing;
const p: PrivacyNotice = privacy;

// T-0502 (D-0188 §5): the Art. 13 notice sections, in render order.
const SECTION_ORDER = [
  "who-we-are",
  "what-we-store",
  "why",
  "where",
  "how-long",
  "export-and-delete",
  "your-rights",
  "no-tracking",
  "contact",
];

const len = (s: string): number => [...s].length;

function section(id: string): string {
  const found = p.sections.find((s) => s.id === id);
  if (!found) throw new Error(`missing privacy section ${id}`);
  return `${found.heading}\n${found.body}`;
}

function feature(id: FeatureId): Feature {
  const found = l.features.find((f) => f.id === id);
  if (!found) throw new Error(`missing feature ${id}`);
  return found;
}

function collectStrings(value: unknown, path: string, out: [string, string][]): void {
  if (typeof value === "string") {
    out.push([path, value]);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out));
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collectStrings(v, `${path}.${k}`, out);
  }
}

describe("AC1 brand and meta", () => {
  it("names the product and keeps meta within search limits", () => {
    expect(l.brand.name).toBe("workout LAB");
    expect("byline" in l.brand).toBe(false);
    expect(l.meta.title).toBe("workout LAB — balanced training");
    expect(len(l.meta.title)).toBeLessThanOrEqual(60);
    expect(len(l.meta.description)).toBeGreaterThanOrEqual(50);
    expect(len(l.meta.description)).toBeLessThanOrEqual(160);
  });
});

describe("AC2 hero", () => {
  it("has bounded copy, a descriptive CTA and a free note", () => {
    const { headline, sub, ctaLabel, ctaNote } = l.hero;
    expect(len(headline)).toBeGreaterThanOrEqual(1);
    expect(len(headline)).toBeLessThanOrEqual(60);
    expect(len(sub)).toBeGreaterThanOrEqual(1);
    expect(len(sub)).toBeLessThanOrEqual(160);
    expect(len(ctaLabel)).toBeGreaterThanOrEqual(2);
    expect(len(ctaLabel)).toBeLessThanOrEqual(24);
    expect(ctaLabel).not.toMatch(/^(click here|here|learn more|more|go)$/i);
    expect(len(ctaNote)).toBeLessThanOrEqual(80);
    expect(ctaNote).toMatch(/free/i);
  });
});

describe("AC3 features reflect the principles", () => {
  it("has 3–4 unique, allowed ids including balance, time-budget and focus", () => {
    const allowed = new Set(["balance", "time-budget", "focus", "adaptive"]);
    const ids = l.features.map((f) => f.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(ids.length).toBeLessThanOrEqual(4);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(allowed.has(id)).toBe(true);
    expect(ids).toEqual(expect.arrayContaining(["balance", "time-budget", "focus"]));
    expect(l.featuresHeading.trim().length).toBeGreaterThan(0);
  });

  it("keeps titles and bodies short", () => {
    for (const f of l.features) {
      expect(len(f.title), f.id).toBeLessThanOrEqual(32);
      expect(len(f.body), f.id).toBeLessThanOrEqual(160);
    }
  });

  it("describes the engine accurately", () => {
    expect(feature("balance").body).toMatch(/14/);
    expect(feature("balance").body).toMatch(/hard sets/i);
    expect(feature("time-budget").body).toMatch(/minutes|time/i);
    expect(feature("focus").body).toMatch(/\bone\b/i);
  });
});

describe("AC4 privacy summary and footer", () => {
  it("summarises privacy and names the product in the legal line", () => {
    expect(l.privacy.heading.trim().length).toBeGreaterThan(0);
    expect(l.privacy.summary).toMatch(/\bEU\b/);
    expect(l.privacy.summary).toMatch(/no third-party (analytics|trackers)/i);
    expect(l.privacy.linkLabel).toBe("Privacy");
    expect(l.footer.legal).toBe("© 2026 workout LAB. Free in this first version.");
    expect(len(l.footer.appLinkLabel)).toBeGreaterThanOrEqual(2);
    expect(len(l.footer.appLinkLabel)).toBeLessThanOrEqual(24);
  });
});

describe("AC5 privacy notice (NFR-PRIV-6)", () => {
  it("has title, ISO updated date and the nine sections in order (T-0502)", () => {
    expect(p.title).toBe("Privacy");
    expect(p.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.sections.map((s) => s.id)).toEqual(SECTION_ORDER);
    for (const s of p.sections) {
      expect(s.heading.trim().length, s.id).toBeGreaterThan(0);
      expect(s.body.trim().length, s.id).toBeGreaterThan(0);
    }
  });

  it("says what we store and what we don't (NFR-PRIV-2)", () => {
    const text = section("what-we-store");
    expect(text).toMatch(/email/i);
    expect(text).toMatch(/training/i);
    expect(text).toMatch(/plan settings/i);
    expect(text).toMatch(/date of birth/i);
    expect(text).toMatch(/body weight/i);
    expect(text).toMatch(/heart rate/i);
    // profiles.onboarding_timing_ms (NFR-AN-2) must not be left out.
    expect(text).toMatch(/first setup took/i);
    expect(text).not.toMatch(/three things/i);
  });

  it("states the first-party metric use honestly (NFR-AN-2)", () => {
    const text = section("why");
    expect(text).toMatch(/metric|usage|aggregate/i);
    expect(text).toMatch(/no outside tools/i);
    expect(text).not.toMatch(/anything else/i);
  });

  it("restates EU hosting, export/delete and no tracking", () => {
    expect(section("where")).toMatch(/\bEU\b/);
    expect(section("export-and-delete")).toMatch(/JSON/);
    expect(section("export-and-delete")).toMatch(/delete/i);
    expect(section("no-tracking")).toMatch(/no third-party analytics/i);
  });

  it("names the privacy mailbox (D-0046 §8)", () => {
    expect(p.contactEmail).toBe("privacy@workout.vestgote.com");
  });
});

describe("AC6 copy hygiene across every string", () => {
  const strings: [string, string][] = [];
  collectStrings(landing, "landing", strings);
  collectStrings(privacy, "privacy", strings);

  it("no string mentions Uptive (T-0526, D-0194)", () => {
    expect(strings.filter(([, v]) => /uptive/i.test(v)).map(([path]) => path)).toEqual([]);
  });

  it("walks a non-trivial amount of copy", () => {
    expect(strings.length).toBeGreaterThan(30);
  });

  const banned: [string, RegExp][] = [
    ["AI", /\bAI\b/],
    ["model names", /\b(LLM|GPT|artificial intelligence|machine learning)\b/i],
    ["pounds", /\blbs?\b/i],
    ["medical claims", /\b(guarantee|cure|diagnos\w*|injury-free)\b/i],
    ["URLs", /https?:\/\//],
    ["hex colours", /#[0-9a-f]{3,8}\b/i],
  ];

  it.each(strings)("%s is non-empty and trimmed", (_path, value) => {
    expect(value.length).toBeGreaterThan(0);
    expect(value).toBe(value.trim());
  });

  it.each(banned)("no string contains %s", (_label, re) => {
    const hits = strings.filter(([, v]) => re.test(v)).map(([path]) => path);
    expect(hits).toEqual([]);
  });
});

describe("AC7 404 copy", () => {
  it("has a title, body and a short home link label", () => {
    expect(l.notFound.title.trim().length).toBeGreaterThan(0);
    expect(l.notFound.body.trim().length).toBeGreaterThan(0);
    expect(l.notFound.homeLinkLabel.trim().length).toBeGreaterThan(0);
    expect(len(l.notFound.homeLinkLabel)).toBeLessThanOrEqual(24);
  });
});

// T-0502: privacy notice v2 with the GDPR Art. 13 items (UF-01.5, D-0188 §5,
// docs/security/privacy.md P6-a). Facts the repo doesn't hold are pinned markers
// that the human replaces at H-22.
describe("T-0502 privacy notice v2 (GDPR Art. 13)", () => {
  it("T-0502 AC-1 (order) has the nine sections in order and a current ISO date", () => {
    expect(p.sections.map((s) => s.id)).toEqual(SECTION_ORDER);
    expect(p.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.updated >= "2026-10-05").toBe(true);
  });

  it("T-0502 AC-2 (controller) names the controller and a contact detail, no address", () => {
    const text = section("who-we-are");
    expect(text).toMatch(/\bHenrik\b/);
    expect(text).toMatch(/controller/i);
    expect(text).toMatch(/privacy@workout\.vestgote\.com/);
    expect(text).not.toMatch(/address/i);
  });

  it("T-0502 AC-3 (legal basis) states contract and legitimate interest", () => {
    const text = section("why");
    expect(text).toMatch(/6\(1\)\(b\)/);
    expect(text).toMatch(/contract/i);
    expect(text).toMatch(/6\(1\)\(f\)/);
    expect(text).toMatch(/legitimate interest/i);
    expect(text).toMatch(/no outside tools/i);
  });

  it("T-0502 AC-4 (processors) names every processor and where it runs", () => {
    const text = section("where");
    for (const re of [/Supabase/, /Ireland/, /Resend/, /Cloudflare/, /Google/, /\bEU\b/]) {
      expect(text).toMatch(re);
    }
    expect(text).toMatch(/IP address/i);
  });

  it("T-0502 AC-5 (retention) states retention, backups, logs and sign-in data", () => {
    const howLong = section("how-long");
    expect(howLong).toMatch(/until you delete/i);
    expect(howLong).toMatch(/backup/i);
    expect(howLong).toMatch(/7 days/);
    expect(howLong).toMatch(/log/i);
    expect(howLong).toMatch(/IP address/i);

    const stored = section("what-we-store");
    expect(stored).toMatch(/IP address/i);
    expect(stored).toMatch(/browser|user agent/i);
    expect(stored).toMatch(/Google/);
    expect(stored).toMatch(/name/);
    expect(stored).toMatch(/picture/);
    expect(stored).toMatch(/(don't|do not) keep|drop/i);
  });

  it("T-0502 AC-6 (export and delete path) names Plan → Account and the backups", () => {
    const text = section("export-and-delete");
    expect(text).toMatch(/Plan → Account/);
    expect(text).toMatch(/JSON/);
    expect(text).toMatch(/delete/i);
    expect(text).toMatch(/backup/i);
  });

  it("T-0502 AC-7 (rights) lists the rights and the right to complain", () => {
    const text = section("your-rights");
    for (const re of [/access/i, /correct/i, /delet/i, /portab|copy/i, /restrict/i, /object/i]) {
      expect(text).toMatch(re);
    }
    expect(text).toMatch(/complain/i);
    expect(text).toMatch(/Integritetsskyddsmyndigheten/);
    expect(text).toMatch(/IMY/);
  });

  it("T-0502 AC-8 (no false only) names the email provider and Google", () => {
    const text = section("no-tracking");
    expect(text).toMatch(/no third-party analytics/i);
    expect(text).not.toMatch(/only to our own servers and our database provider/i);
    expect(text).toMatch(/email provider/i);
    expect(text).toMatch(/Google/);
  });

  it("T-0502 AC-9 (H-22 fill-in) no {{HUMAN:…}} marker remains, in privacy or landing", () => {
    const strings: [string, string][] = [];
    collectStrings(privacy, "privacy", strings);
    collectStrings(landing, "landing", strings);
    const markers = strings.flatMap(([, v]) => v.match(/\{\{HUMAN:[A-Z_]+\}\}/g) ?? []);
    expect([...new Set(markers)].sort()).toEqual([]);
  });

  it("T-0502 AC-10 (stale notes gone) privacy.ts and types.ts drop the H-10 note", () => {
    // Built by concatenation so a repo grep for the note doesn't hit this file.
    const stale = ["pending human gate", "H-10"].join(" ");
    for (const file of ["./privacy.ts", "./types.ts"]) {
      const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
      expect(text, file).not.toContain(stale);
    }
  });
});
