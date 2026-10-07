// C-03 Checkbox (T-0537, D-0199). A native input inside its label; the label text is the name.
// `ariaDisabled` keeps the box focusable and ignores clicks/Space (no `disabled` attribute).
import { useState } from "react";
import "./checkbox.css";

export interface CheckboxProps {
  label: string;
  /** Controlled value. Omit for an uncontrolled box (starts from `defaultChecked`). */
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  ariaDisabled?: boolean;
  /** Id of the one explanation line, referenced by `aria-describedby`. */
  describedBy?: string;
}

export function Checkbox({
  label,
  checked,
  defaultChecked = false,
  onChange,
  ariaDisabled = false,
  describedBy,
}: CheckboxProps) {
  const [inner, setInner] = useState(defaultChecked);
  const value = checked ?? inner;
  return (
    <label
      className="wl-checkbox"
      style={{ minHeight: 44 }}
      data-disabled={ariaDisabled || undefined}
    >
      <input
        type="checkbox"
        className="wl-checkbox__input"
        checked={value}
        aria-disabled={ariaDisabled ? "true" : undefined}
        aria-describedby={describedBy}
        onChange={(e) => {
          if (ariaDisabled) return;
          if (checked === undefined) setInner(e.target.checked);
          onChange?.(e.target.checked);
        }}
      />
      <span className="wl-checkbox__label">{label}</span>
    </label>
  );
}
