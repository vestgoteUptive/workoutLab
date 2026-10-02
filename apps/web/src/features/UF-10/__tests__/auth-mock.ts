// T-0383: the `useAuth` mock for UF-10's suites (D-0113 §5), mirroring UF-04's (T-0384). Every
// suite that mounts a UF-10 screen does
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
