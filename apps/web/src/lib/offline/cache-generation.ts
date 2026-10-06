// T-0530 (D-0195): a sign-out must not race an in-flight cache refresh. Every refresh reads the
// generation before its fetch and checks it again right before it writes. `signOutAndClearDevice`
// bumps it before it clears, so a refresh that resolves afterwards sees a changed generation and
// drops its rows instead of writing them back. A refresh started after the bump (the next
// sign-in) reads the new value and writes normally.
let generation = 0;

export function cacheGeneration(): number {
  return generation;
}

/** Invalidates every refresh that started before this call. */
export function invalidateCacheWrites(): void {
  generation += 1;
}

/** True while a refresh that captured `captured` may still write. */
export function cacheWriteAllowed(captured: number): boolean {
  return captured === generation;
}
