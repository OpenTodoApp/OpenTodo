// A value that follows its source once the source has been still for a moment
// (OpenSpec change list-rendering-at-scale, design D6). Counts over every task (the
// sidebar's saved views, the workspaces) took about 60 ms of the phone profile
// after each write, so a run of completions in a long list queued one count per
// tick in front of the next click; they now count once the writes stop, in an idle
// moment. The first value shows at once.
import { useEffect, useState } from 'react'

/** How long the source stays unchanged before the value follows it, in ms. */
export const SETTLE_MS = 1000

function whenIdle(fn: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const h = requestIdleCallback(fn, { timeout: 1000 })
    return () => cancelIdleCallback(h)
  }
  const h = setTimeout(fn, 0)
  return () => clearTimeout(h)
}

export function useSettledValue<T>(value: T, ms = SETTLE_MS): T {
  const [shown, setShown] = useState<{ v: T }>(() => ({ v: value }))
  const loading = shown.v === undefined && value !== undefined
  useEffect(() => {
    if (Object.is(value, shown.v)) return
    // A source that was still loading shows at once.
    if (shown.v === undefined) { setShown({ v: value }); return }
    let cancelIdle = () => {}
    const timer = setTimeout(() => { cancelIdle = whenIdle(() => setShown({ v: value })) }, ms)
    return () => {
      clearTimeout(timer)
      cancelIdle()
    }
  }, [value, shown, ms])
  return loading ? value : shown.v
}
