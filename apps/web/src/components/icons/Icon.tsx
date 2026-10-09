// Shared icon frame (T-0592, state-patterns "Glyphs"): a 2 px stroke in currentColor, hidden from
// assistive tech. The accessible name always comes from the control's own text, never the icon.
import type { ReactNode, SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children" | "aria-hidden" | "focusable"> & {
  /** Rendered size in px (square). Defaults to 24. */
  size?: number;
};

export function Icon({ size = 24, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      {...rest}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}
