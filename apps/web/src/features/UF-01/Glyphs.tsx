// The icons of the lazy steps UF-01.2–.4 (`WelcomeScreen.tsx` draws its own arrow: this module must
// stay out of the splat's first chunk). The UF-01 icons (D-0211 §6): 2 px stroke, `currentColor`, `aria-hidden`, so no accessible name
// changes. The arrow ends the primary button, the tick marks a selected option or chip.
export function ArrowRight() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function Tick({ className }: { className: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
