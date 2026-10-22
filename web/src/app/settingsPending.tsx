// A settings section waits for its first answers (OpenSpec change motion-polish, D3):
// panels that load from the server report while they do, and the section's cards
// stay invisible until every one has answered once, at most SETTLE_MS. A page that
// shows its cards one by one as they load pushes the later ones down; drawing them
// together moves nothing. Later reloads (after a change) never hide the page again.
import { createContext, type ReactNode, useCallback, useContext, useEffect, useId, useLayoutEffect, useReducer, useRef, useState } from 'react'

export const SETTLE_MS = 600

type Report = (id: string, pending: boolean) => void
const PendingContext = createContext<Report | null>(null)

/** Wraps one section's cards; reveals them once nothing reports pending, or after SETTLE_MS. */
export function SettingsPendingGate({ children }: { children: ReactNode }) {
  const pending = useRef(new Set<string>())
  const [revealed, setRevealed] = useState(false)
  const done = useRef(false)
  const [tick, rerender] = useReducer((n: number) => n + 1, 0)
  const report = useCallback<Report>((id, isPending) => {
    if (isPending) pending.current.add(id)
    else pending.current.delete(id)
    if (!done.current) rerender()
  }, [])
  // Children's layout effects run first, so the set is current here and before paint.
  useLayoutEffect(() => {
    if (!done.current && pending.current.size === 0) { done.current = true; setRevealed(true) }
  }, [tick])
  useEffect(() => {
    const timer = setTimeout(() => { done.current = true; setRevealed(true) }, SETTLE_MS)
    return () => clearTimeout(timer)
  }, [])
  return (
    <PendingContext.Provider value={report}>
      <div className={revealed ? 'space-y-6' : 'invisible space-y-6'} aria-busy={revealed ? undefined : true} data-settings-settling={revealed ? undefined : ''}>
        {children}
      </div>
    </PendingContext.Provider>
  )
}

/** A panel reports that its first answer has not arrived yet (no effect outside a gate). */
export function useSettingsPending(isPending: boolean): void {
  const report = useContext(PendingContext)
  const id = useId()
  useLayoutEffect(() => { report?.(id, isPending) }, [report, id, isPending])
  useLayoutEffect(() => () => report?.(id, false), [report, id])
}
