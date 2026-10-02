// T-0384: the `useAuth` mock for UF-04's refresh tests (D-0113 §5). Every suite that mounts a
// `refresh: true` screen does
//   vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));
// and runs signed in unless it sets `authState.status`. The mock re-reads `authState` on every
// render, so a test can flip the status mid-mount and re-render.
import type { ReactNode } from "react";
import type { AuthStatus } from "../../../lib/auth/auth-context.js";

export type { AuthStatus };

export const authState: { status: AuthStatus } = { status: "signed-in" };

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  return children;
}

export function useAuth() {
  return {
    status: authState.status,
    userId: null,
    redirectTarget: "/welcome" as const,
    signOut: () => Promise.resolve(),
  };
}
