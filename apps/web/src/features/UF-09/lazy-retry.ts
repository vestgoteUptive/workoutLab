// A lazy component that can be made again (T-0451, D-0162 §3). `React.lazy` caches a rejected
// import for the life of the page; `reset()` swaps in a fresh lazy, so the next render imports again.
/* eslint-disable @typescript-eslint/no-explicit-any -- the component type is inferred from the loader */
import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export interface RetryableLazy<C extends ComponentType<any>> {
  /** The current lazy component. Read it at render time, never at module load. */
  readonly Component: LazyExoticComponent<C>;
  /** Make a fresh lazy: the next render that mounts it calls `load` again. */
  reset(): void;
}

export function retryableLazy<C extends ComponentType<any>>(
  load: () => Promise<{ default: C }>,
): RetryableLazy<C> {
  let current = lazy(load);
  return {
    get Component() {
      return current;
    },
    reset() {
      current = lazy(load);
    },
  };
}
