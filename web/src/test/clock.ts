// Waiting on the clock itself, for tests whose subject orders by timestamp (a
// position, a deletion time, an op's ts): waits until Date.now() has moved on,
// instead of sleeping a fixed few milliseconds and hoping it did.

/** Resolve once Date.now() is past the current millisecond, so the next write gets a later timestamp. */
export async function nextMillisecond(): Promise<void> {
  const start = Date.now()
  while (Date.now() <= start) await new Promise<void>((r) => setTimeout(r, 0))
}
