// Contrast and motion presentation (OpenSpec accessibility-aaa, design D3;
// design-system "High-contrast and no-motion presentation"): the two root attributes
// the stylesheet reads, `data-contrast="high"` and `data-motion="none"`, set from the
// person's preferences. Under `auto` the contrast follows the system's request for
// more contrast and changes with it. No database here, so the public display page
// can restore the preference after its own URL options leave.

export const CONTRASTS = ['auto', 'high'] as const
export type ContrastPref = (typeof CONTRASTS)[number]
export const MOTIONS = ['system', 'none'] as const
export type MotionPref = (typeof MOTIONS)[number]

export interface Presentation { contrast: ContrastPref; motion: MotionPref }

export const DEFAULT_PRESENTATION: Presentation = { contrast: 'auto', motion: 'system' }

/** Reads stored values: an empty or unknown value is the default and the stored value is kept. */
export function readPresentation(contrast: string | undefined, motion: string | undefined): Presentation {
  return { contrast: contrast === 'high' ? 'high' : 'auto', motion: motion === 'none' ? 'none' : 'system' }
}

const MORE_CONTRAST = '(prefers-contrast: more)'
let current: Presentation = DEFAULT_PRESENTATION
let listening: { mql: MediaQueryList; doc: Document; handler: () => void } | null = null

/** Whether the system asks for more contrast; false where the query is unknown. */
export function systemWantsContrast(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia(MORE_CONTRAST).matches
  } catch {
    return false
  }
}

function paint(p: Presentation, doc: Document) {
  const root = doc.documentElement
  if (p.contrast === 'high' || (p.contrast === 'auto' && systemWantsContrast())) root.setAttribute('data-contrast', 'high')
  else root.removeAttribute('data-contrast')
  if (p.motion === 'none') root.setAttribute('data-motion', 'none')
  else root.removeAttribute('data-motion')
}

/** Applies a presentation to the document and keeps `auto` in step with the system setting. */
export function applyPresentation(p: Presentation, doc: Document = document): void {
  current = p
  paint(p, doc)
  // One listener on the current media query list: the previous one is dropped first.
  if (listening) {
    listening.mql.removeEventListener('change', listening.handler)
    listening = null
  }
  if (typeof matchMedia === 'function') {
    try {
      const mql = matchMedia(MORE_CONTRAST)
      const handler = () => paint(current, doc)
      mql.addEventListener('change', handler)
      listening = { mql, doc, handler }
    } catch {
      // No media queries (an old browser): the attribute follows the preference only.
    }
  }
}

/** Applies the last preference again, after a display route's own options leave. */
export function restorePresentation(doc: Document = document): void {
  paint(current, doc)
}

/** The presentation last applied (for tests and the display routes). */
export function currentPresentation(): Presentation {
  return current
}
