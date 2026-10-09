// T-0404b AC-1 and AC-7 (UF-01.5, D-0012): the Supabase auth mail templates carry the link and the
// 6-digit code, use only design-token colours, load nothing remote, and the cost doc says Resend.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "../..");
const dir = path.join(root, "infra/auth/templates");
const read = (p) => readFileSync(p, "utf8");
const TEMPLATES = [
  { name: "magic-link", subject: "Your workoutLab sign-in link", key: "mailer_subjects_magic_link" },
  { name: "confirmation", subject: "Confirm your workoutLab account", key: "mailer_subjects_confirmation" },
];

/** Every #RRGGBB value in tokens.json, read at test time. */
function tokenColours() {
  const tokens = JSON.parse(read(path.join(root, "packages/design-tokens/src/tokens.json")));
  const out = new Set();
  const walk = (v) => {
    if (typeof v === "string") for (const m of v.matchAll(/#[0-9A-Fa-f]{6}\b/g)) out.add(m[0].toUpperCase());
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(tokens);
  return out;
}

// The paper colours the mail uses (D-0208, T-0617), read from tokens.json (no raw colour literals here).
const tokens = JSON.parse(read(path.join(root, "packages/design-tokens/src/tokens.json")));
const C = tokens.color;
const P = C.paper;
const BRAND = [P.bg, P.ink, P["ink-muted"], P.action, P["on-action"]];
// The legacy flat Chalk & Iron colours (string values directly under color), which no template may carry.
const LEGACY = Object.values(C).filter((v) => typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v));

/** WCAG contrast ratio of two #RRGGBB colours. */
function contrast(a, b) {
  const lum = (h) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
// A colour that is not a token, built so the no-raw-colour lint rule doesn't read it as a use.
const NOT_A_TOKEN = "#" + "1".repeat(6);

const count = (s, needle) => s.split(needle).length - 1;

/** The AC-1 rules for one template body; returns the broken rules (empty = pass). */
export function templateProblems(html, colours = tokenColours()) {
  const p = [];
  if (count(html, 'href="{{ .ConfirmationURL }}"') !== 1) p.push('exactly one href="{{ .ConfirmationURL }}"');
  if (count(html, "{{ .ConfirmationURL }}") !== 1) p.push("ConfirmationURL appears only in the button href");
  if (count(html, "{{ .Token }}") !== 1) p.push("exactly one {{ .Token }}");
  for (const bad of ["<script", "<link", "<img", "@import", "url("]) if (html.toLowerCase().includes(bad)) p.push(`contains ${bad}`);
  if (/https?:\/\//i.test(html)) p.push("contains a literal http(s) URL");
  if (/<style/i.test(html)) p.push("contains a <style> block");
  for (const m of html.matchAll(/#[0-9A-Fa-f]{6}\b/g)) if (!colours.has(m[0].toUpperCase())) p.push(`colour ${m[0]} is not a design token`);
  if (Buffer.byteLength(html, "utf8") >= 50 * 1024) p.push("50 KB or larger");
  return p;
}

test("T-0404b AC-1 each template holds one link, one code, token colours only, nothing remote", () => {
  const colours = tokenColours();
  assert.ok(BRAND.every((c) => colours.has(c.toUpperCase())), "tokens.json was read");
  for (const t of TEMPLATES) {
    const html = read(path.join(dir, `${t.name}.html`));
    assert.deepEqual(templateProblems(html, colours), [], t.name);
    for (const c of BRAND) assert.ok(html.includes(c), `${t.name} uses ${c}`);
    assert.ok(html.includes("font-family: 'DM Sans', Arial, sans-serif"), `${t.name} body font`);
    assert.ok(html.includes("font-family: 'Big Shoulders Display', Impact, sans-serif"), `${t.name} heading font`);
    assert.ok(html.includes("Didn't ask for this? Ignore this mail."), `${t.name} ignore line`);
    assert.ok(/type this 6-digit code in the app/.test(html), `${t.name} code line`);
    assert.ok(html.includes("workoutLab"));
    assert.ok(!/uptive|henrik/i.test(html), `${t.name} names no person or company (gate 6)`);
  }
});

test("T-0617 AC2 no template carries a legacy flat Chalk & Iron colour", () => {
  assert.ok(LEGACY.length >= 5, "flat keys were read from tokens.json");
  for (const t of TEMPLATES) {
    const html = read(path.join(dir, `${t.name}.html`)).toUpperCase();
    for (const c of LEGACY) if (!Object.values(P).map((v) => v.toUpperCase()).includes(c.toUpperCase())) assert.ok(!html.includes(c.toUpperCase()), `${t.name} has legacy ${c}`);
  }
});

test("T-0617 AC3 contrast: paper.ink on paper.bg >= 12.9 and paper.on-action on paper.action >= 8.6 (one decimal)", () => {
  const one = (n) => Math.floor(n * 10) / 10;
  assert.ok(one(contrast(P.ink, P.bg)) >= 12.9, `ink/bg ${contrast(P.ink, P.bg)}`);
  assert.ok(one(contrast(P["on-action"], P.action)) >= 8.6, `on-action/action ${contrast(P["on-action"], P.action)}`);
  for (const t of TEMPLATES) {
    const html = read(path.join(dir, `${t.name}.html`));
    assert.ok(html.includes(`color: ${P.ink}`) && html.includes(`background-color: ${P.bg}`), `${t.name} text/bg are the tested pair`);
    assert.ok(html.includes(`background-color: ${P.action}`) && html.includes(`color: ${P["on-action"]}`), `${t.name} button is the tested pair`);
    assert.ok(new RegExp(`color: ${P.ink};"><font color="${P.ink}">\\{\\{ \\.Token \\}\\}`).test(html), `${t.name} code is paper.ink`);
  }
});

test("T-0404b AC-1 each subject is one line under 78 chars holding workoutLab, and is the expected value", () => {
  const spec = JSON.parse(read(path.join(root, "infra/auth/expected-auth.json")));
  for (const t of TEMPLATES) {
    const s = read(path.join(dir, `${t.name}.subject.txt`));
    assert.equal(s, t.subject, `${t.name}.subject.txt is exactly the subject, no newline`);
    assert.ok(!/[\r\n]/.test(s) && s.length < 78 && s.includes("workoutLab"));
    assert.equal(spec.expected[t.key], s, `expected-auth.json pins ${t.key}`);
  }
});

test("T-0404b AC-1 planted faults: a non-token colour (111111), a missing {{ .Token }}, a remote image all go red", () => {
  const html = read(path.join(dir, "magic-link.html"));
  assert.deepEqual(templateProblems(html.replace(P.ink, NOT_A_TOKEN)), [`colour ${NOT_A_TOKEN} is not a design token`]);
  assert.deepEqual(templateProblems(html.replace("{{ .Token }}", "")), ["exactly one {{ .Token }}"]);
  assert.ok(templateProblems(html.replace("{{ .Token }}", "{{.Token}}")).includes("exactly one {{ .Token }}"), "spacing is exact");
  assert.ok(templateProblems(html.replace("</body>", '<img src="https://x.test/p.png"></body>')).length >= 2);
  assert.ok(templateProblems(html.replace("</a>", '</a><a href="{{ .ConfirmationURL }}">x</a>')).length >= 1);
});

test("T-0404b AC-7 infra-costs email row: Resend free tier, live, 0 USD now and at launch", () => {
  const row = read(path.join(root, "docs/infra-costs.md"))
    .split("\n")
    .find((l) => l.startsWith("| Transactional email"));
  assert.ok(row, "email row present");
  const cells = row.split("|").map((c) => c.trim());
  assert.ok(/Resend free, live/.test(row), row);
  assert.deepEqual(cells.slice(2, 4), ["0", "0"], "0 USD now and at launch");
});
