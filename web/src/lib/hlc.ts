// A minimal hybrid logical clock: wall-clock milliseconds, nudged forward so
// that timestamps issued by this device are strictly increasing even when the
// system clock jumps backwards, and corrected towards server time when the
// local clock is clearly off.

let last = 0
let offset = 0

export function hlcNow(): number {
  const now = Date.now() + offset
  last = Math.max(now, last + 1)
  return last
}

/** Called with the last timestamp persisted by this device so a reload never reuses one. */
export function hlcSeed(ts: number): void {
  if (ts > last) last = ts
}

/** Called after each sync. Only large skews are corrected to avoid jitter. */
export function hlcObserveServerTime(serverTime: number): void {
  const skew = serverTime - Date.now()
  if (Math.abs(skew) > 2000) offset = skew
}

export function hlcLast(): number {
  return last
}

/** Last-writer-wins comparison shared with the server (see internal/sync/ops.go). */
export function wins(ts: number, device: string, existing?: { ts: number; device: string }): boolean {
  if (!existing) return true
  return ts > existing.ts || (ts === existing.ts && device > existing.device)
}
