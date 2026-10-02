// The one interval in UF-09 (D-0111 §8, NFR-TIME-1): it only triggers a re-render, so the
// on-screen `m:ss` follows the wall clock. No value is counted; every time on screen is
// `remainingS(timer, Date.now())`.
import { useEffect, useState } from "react";

export const RERENDER_MS = 1000;

export function useRerenderEverySecond(): void {
  const [, setRenderedAt] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setRenderedAt(Date.now()), RERENDER_MS);
    return () => clearInterval(id);
  }, []);
}
