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

interface State {
  failed: boolean;
}

export class RouteBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // No telemetry (T-0459 out of scope).
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" style={boxStyle}>
        <p style={{ margin: 0 }}>{en.routeError.message}</p>
        <button type="button" style={buttonStyle} onClick={() => window.location.reload()}>
          {en.routeError.reload}
        </button>
      </div>
    );
  }
}
