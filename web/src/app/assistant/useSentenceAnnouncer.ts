import { useCallback, useRef, useState } from 'react'
import { takeSentences } from '../../lib/assistant'

/** Announces streamed text at sentence boundaries (debounced), not per token. */
export function useSentenceAnnouncer() {
  const [announce, setAnnounce] = useState('')
  const pending = useRef('')
  const ready = useRef('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const push = useCallback((delta: string) => {
    pending.current += delta
    const [done, rest] = takeSentences(pending.current)
    if (!done) return
    pending.current = rest
    ready.current = ready.current ? `${ready.current} ${done}` : done
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setAnnounce(ready.current)
      ready.current = ''
    }, 400)
  }, [])
  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const rest = [ready.current, pending.current.trim()].filter(Boolean).join(' ')
    pending.current = ''
    ready.current = ''
    if (rest) setAnnounce(rest)
  }, [])
  const reset = useCallback(() => { pending.current = ''; ready.current = ''; clearTimeout(timer.current) }, [])
  return { announce, push, flush, reset, setAnnounce }
}
