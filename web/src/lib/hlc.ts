// A minimal hybrid logical clock: wall-clock milliseconds, nudged forward so
// that timestamps issued by this device are strictly increasing even when the
// system clock jumps backwards, and corrected towards server time when the
// local clock is clearly off.

let last = 0
let offset = 0

/** How far ahead of the server's clock an op may be stamped (internal/sync MaxFutureSkewMs). */
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000
/** Skews up to this size are left alone, so network latency causes no jitter. */
const SKEW_TOLERANCE_MS = 2000

export function hlcNow(): number {
  const now = Date.now() + offset
  last = Math.max(now, last + 1)
  return last
}

/** Called with the last timestamp persisted by this device so a reload never reuses one. */
export function hlcSeed(ts: number): void {
  if (ts > last) last = ts
}

/**
 * Called after each sync. The offset follows the server whenever the skew is
 * large and goes back to zero once the local clock is right again (OpenSpec
 * change sync-convergence). A seed far ahead of the server (a clock that ran
 * fast before) is brought back to server time: the server refuses timestamps
 * that far ahead.
 */
export function hlcObserveServerTime(serverTime: number | undefined): void {
  if (typeof serverTime !== 'number' || !Number.isFinite(serverTime)) return
  const skew = serverTime - Date.now()
  offset = Math.abs(skew) > SKEW_TOLERANCE_MS ? skew : 0
  if (last > serverTime + MAX_FUTURE_SKEW_MS) last = serverTime
}

/**
 * Called when the server refused ops as stamped too far ahead (reason
 * `clock_skew`, sync-convergence): the clock follows the server and restarts
 * from its time, so the ops stamped again next are accepted.
 */
export function hlcClockRefused(serverTime: number): void {
  hlcObserveServerTime(serverTime)
  if (Number.isFinite(serverTime) && last > serverTime) last = serverTime
}

export function hlcLast(): number {
  return last
}

/** Test hook: forget the clock state. */
export function hlcReset(): void {
  last = 0
  offset = 0
}

/** Last-writer-wins comparison shared with the server (see internal/sync/ops.go). */
export function wins(ts: number, device: string, existing?: { ts: number; device: string }): boolean {
  if (!existing) return true
  return ts > existing.ts || (ts === existing.ts && device > existing.device)
}
