// The six glyphs of the Cobalt patterns (T-0592). Each is a 2 px stroke in currentColor.
import { Icon, type IconProps } from "./Icon.js";

export function TickIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function ArrowIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </Icon>
  );
}

export function CrossIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 6v12M15 6v12" />
    </Icon>
  );
}

const CHEVRON_ROTATE = { right: 0, down: 90, left: 180, up: 270 } as const;

export function ChevronIcon({
  direction = "right",
  ...props
}: IconProps & { direction?: keyof typeof CHEVRON_ROTATE }) {
  return (
    <Icon {...props}>
      <path d="M9 5l7 7-7 7" transform={`rotate(${CHEVRON_ROTATE[direction]} 12 12)`} />
    </Icon>
  );
}

export function DragHandleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
    </Icon>
  );
}
