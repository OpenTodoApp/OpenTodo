import { useState } from 'react'

/**
 * Calls `reset` while rendering when one of `deps` changed since the last render
 * (compared with Object.is, as effect dependencies are): React's "adjust some state
 * when a prop changes" idiom. Unlike `useEffect(() => setX(init), [prop])`, the
 * stale state never paints: React drops this render and renders again at once, so a
 * panel switched to another task never shows the previous task's draft for a frame.
 *
 * `reset` may only set state of the component calling the hook, and does not run on
 * mount, so start that state at what `reset` would set. `deps` must not be values
 * that change on every render of this component (an unmemoised array built in it).
 */
export function useResetOnChange(deps: readonly unknown[], reset: () => void): void {
  const [seen, setSeen] = useState(deps)
  if (seen.length !== deps.length || seen.some((d, i) => !Object.is(d, deps[i]))) {
    setSeen(deps)
    reset()
  }
}
