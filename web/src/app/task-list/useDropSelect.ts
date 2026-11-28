// A drop selects the row it moved (GitHub issue 2165). The row is in sight where the
// pointer left it, but its move renders after the selection: revealing it then would
// scroll the list back to where the row came from. The reveal asks `wasDropped` first.
import { useCallback, useRef } from 'react'

export function useDropSelect<K>(select: (key: K) => void): [onDropped: (key: K) => void, wasDropped: (key: K) => boolean] {
  const dropped = useRef<K | null>(null)
  const onDropped = useCallback((key: K) => { dropped.current = key; select(key) }, [select])
  /** Whether `key` is the selection a drop just made; true once. */
  const wasDropped = useCallback((key: K) => { const was = dropped.current === key; dropped.current = null; return was }, [])
  return [onDropped, wasDropped]
}
