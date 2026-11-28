// Writing direction (OpenSpec change arabic-rtl, design D1 and D4). The interface
// language sets the document's `dir`; layout follows through logical CSS, and the few
// places that read a key, a pointer or a coordinate ask here which way "forward" is.
//
// Code that compares ArrowLeft and ArrowRight means "towards the start" and "towards
// the end" of a line: inlineKey() swaps the two keys right to left, so that code is
// right in both directions. A delta measured on the screen (a swipe, a drag, a
// resize) is turned into a delta along the line with inlineDelta().

/** The languages written right to left. Only those in SHIPPED are ever applied. */
const RTL = new Set(['ar', 'fa', 'he', 'ur'])

export type Direction = 'ltr' | 'rtl'

/** The writing direction of a language code or BCP 47 tag ("ar", "ar-EG"). */
export function directionOf(code: string): Direction {
  return RTL.has(code.toLowerCase().split(/[-_]/)[0]) ? 'rtl' : 'ltr'
}

/**
 * Whether `el` (or, without one, the document) is laid out right to left. Reads the
 * nearest `dir` attribute, so a box kept left to right inside an Arabic page (a chart,
 * a code block) answers for itself.
 */
export function isRtl(el?: Element | null): boolean {
  if (typeof document === 'undefined') return false
  // `dir="auto"` (a title that takes its own direction) says nothing about the layout: look further up.
  let box = el?.closest?.('[dir]') ?? null
  while (box && box.getAttribute('dir') === 'auto') box = box.parentElement?.closest('[dir]') ?? null
  const own = box?.getAttribute('dir')
  return (own ?? document.documentElement.getAttribute('dir')) === 'rtl'
}

function targetOf(e: { currentTarget?: unknown; target?: unknown } | undefined): Element | null {
  const el = (e?.currentTarget ?? e?.target) as Element | null | undefined
  return el && typeof (el as Element).closest === 'function' ? el : null
}

/**
 * The key as if the line ran left to right: ArrowLeft and ArrowRight swapped in a
 * right-to-left context, every other key unchanged.
 */
export function inlineKey(e: { key: string; currentTarget?: unknown; target?: unknown }): string {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return e.key
  if (!isRtl(targetOf(e))) return e.key
  return e.key === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft'
}

/** A horizontal screen delta as a delta towards the end of the line (negated right to left). */
export function inlineDelta(dx: number, el?: Element | null): number {
  return isRtl(el) ? -dx : dx
}

/** A pointer's distance from the start edge of the viewport (the left, or the right right to left). */
export function fromStartEdge(clientX: number, el?: Element | null): number {
  if (!isRtl(el)) return clientX
  const width = typeof window === 'undefined' ? 0 : window.innerWidth
  return width - clientX
}

/**
 * A key name as printed on a keycap: ← and → swapped right to left, because the
 * registry's → means "towards the end of the line" (inlineKey), which is the left
 * arrow key in an Arabic layout.
 */
export function inlineArrows(text: string, el?: Element | null): string {
  if (!isRtl(el) || !/[←→]/.test(text)) return text
  return text.replace(/[←→]/g, (c) => (c === '←' ? '→' : '←'))
}
