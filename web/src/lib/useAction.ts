import { useCallback, useRef, useState } from 'react'
import { errorText } from './errorText'

/** How useAction reports a failure. */
export interface ActionOptions {
  /** Called as an action starts, to clear screen state beside the error (a field error, a notice). */
  onStart?: () => void
  /** The text shown for a failure; null leaves no error (a cancelled prompt). Default errorText. */
  describe?: (err: unknown) => string | null
  /** Called with every failure before its text is shown (for example "server unreachable"). */
  onError?: (err: unknown) => void
}

/** The pending and error state of a screen's async actions (useAction). */
export interface Action {
  busy: boolean
  error: string | null
  setError: (error: string | null) => void
  /** Runs fn with busy on and the error cleared; a failure becomes `error` and resolves undefined. */
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>
  /** As run, but a failure is also rethrown, for callers that react to it. */
  act: <T>(fn: () => Promise<T>) => Promise<T>
}

/**
 * Busy and error state for a button's async action: the one wrapper behind the
 * settings panels and dialogs that each wrote `setBusy(true); setError(null);
 * try … catch … finally setBusy(false)` by hand.
 */
export function useAction(options: ActionOptions = {}): Action {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The latest options without making run change identity on every render.
  const opts = useRef(options)
  opts.current = options

  const act = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setBusy(true)
    setError(null)
    opts.current.onStart?.()
    try {
      return await fn()
    } catch (err) {
      opts.current.onError?.(err)
      setError((opts.current.describe ?? errorText)(err))
      throw err
    } finally {
      setBusy(false)
    }
  }, [])
  const run = useCallback(<T,>(fn: () => Promise<T>) => act(fn).catch(() => undefined), [act])
  return { busy, error, setError, run, act }
}
