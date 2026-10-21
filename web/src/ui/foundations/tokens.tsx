// Shared helpers for the Foundations stories: read token values from the element's
// own theme (so side-by-side shows both), and show live contrast ratios.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { contrast } from '../tokens/contrast'
import { parseRgba, toHex } from '../tokens/resolve'

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

/** A token's computed value as the sRGB hex it draws (OKLCH and mixes resolved, tokens-v2 D2). */
export function hex(value?: string): string {
  if (!value) return '–'
  try {
    const c = parseRgba(value)
    return c.a < 1 ? `${toHex(c)} at ${Math.round(c.a * 100)}%` : toHex(c)
  } catch {
    return value
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
