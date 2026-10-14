// Shared helpers for the Foundations stories: read token values from the element's
// own theme (so side-by-side shows both), and show live contrast ratios.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { contrast } from '../tokens/contrast'

export function useTokenValues(names: readonly string[]) {
  const ref = useRef<HTMLDivElement>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  useLayoutEffect(() => {
    if (!ref.current) return
    const cs = getComputedStyle(ref.current)
    setValues(Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(`--ot-${n}`).trim()])))
  }, [names])
  return { ref, values }
}

export function ratio(fg?: string, bg?: string): string {
  if (!fg || !bg) return '–'
  try {
    return `${contrast(fg, bg).toFixed(2)}:1`
  } catch {
    return 'translucent'
  }
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-h2 font-semibold">{title}</h2>
      {children}
    </section>
  )
}
