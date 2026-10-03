// One error boundary per route element (D-0164 §7, T-0459). A lazy route chunk that fails to
// load (a stale deploy's 404, or an uncached chunk offline) rejects the import, and without a
// boundary React unmounts the whole tree. This shows a short alert and a Reload button instead.
// Reload is the one fix for a stale deploy; there is no automatic retry or reload.
import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from "react";
import { en } from "../lib/i18n/en.js";

const boxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "12px",
  margin: "24px 16px",
  padding: "16px",
  background: "var(--wl-color-surface)",
  color: "var(--wl-color-text)",
  border: "1px solid var(--wl-color-line-strong)",
  borderRadius: "8px",
};

const buttonStyle: CSSProperties = {
  minWidth: "44px",
  minHeight: "44px",
  padding: "0 16px",
  background: "transparent",
  color: "var(--wl-color-accent)",
  border: "1px solid var(--wl-color-line-strong)",
  borderRadius: "6px",
  font: "inherit",
  cursor: "pointer",
};

interface Props {
  children: ReactNode;
  /** When this changes (the pathname), a failed boundary clears and tries its children again. */
  resetKey?: string;
}

interface State {
  failed: boolean;
  resetKey: string | undefined;
}

// The fallback's one action takes focus when it mounts, so a keyboard or screen-reader user
// does not have to hunt for it (D-0167 §5).
const focusOnMount = (el: HTMLButtonElement | null): void => el?.focus();

export class RouteBoundary extends Component<Props, State> {
  override state: State = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  // D-0167 §5: a render error on one /library/:id must not stick across ids. The boundary stays
  // keyed by route pattern (a working route keeps its instance); only its failed state resets.
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey === state.resetKey) return null;
    return { resetKey: props.resetKey, failed: false };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // No telemetry (T-0459 out of scope).
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" style={boxStyle}>
        <p style={{ margin: 0 }}>{en.routeError.message}</p>
        <button
          type="button"
          style={buttonStyle}
          ref={focusOnMount}
          onClick={() => window.location.reload()}
        >
          {en.routeError.reload}
        </button>
      </div>
    );
  }
}
