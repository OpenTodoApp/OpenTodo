// Inline highlighting in the quick add (OpenSpec change moments-and-onboarding, design
// D8; natural-language-capture "Live preview chips"): a layer behind the plain
// <input>, in the same box, font and padding, mirrors the text and tints each
// recognised span in its chip's soft colour (a 1 px underline under high contrast,
// see `.quick-add-tint` in index.css). The chips stay the explanation and the place to
// dismiss a token; a dismissed or quoted span is no chip, so it has no tint. The layer
// is decorative (aria-hidden) and scrolls with the field.
import { forwardRef, type ReactNode } from 'react'
import type { Chip } from '../lib/nlp'
import { CHIP_HUE } from './ParseChips'

export interface TintSegment { text: string; kind?: Chip['kind'] }

/** The line cut into plain and tinted segments, in order; overlapping spans keep the first chip's tint. */
export function tintSegments(value: string, chips: readonly Chip[]): TintSegment[] {
  const marks = chips.flatMap((c) => c.spans.map((s) => ({ start: s.start, end: s.end, kind: c.kind })))
    .filter((m) => m.end > m.start && m.start >= 0 && m.end <= value.length)
    .sort((a, b) => a.start - b.start)
  const out: TintSegment[] = []
  let at = 0
  for (const m of marks) {
    if (m.start < at) continue
    if (m.start > at) out.push({ text: value.slice(at, m.start) })
    out.push({ text: value.slice(m.start, m.end), kind: m.kind })
    at = m.end
  }
  if (at < value.length) out.push({ text: value.slice(at) })
  return out
}

export const QuickAddTint = forwardRef<HTMLDivElement, { value: string; chips: readonly Chip[]; className?: string }>(function QuickAddTint({ value, chips, className = '' }, ref) {
  const parts: ReactNode[] = tintSegments(value, chips).map((s, i) => (s.kind
    ? <mark key={i} className="quick-add-tint" data-hue={CHIP_HUE[s.kind]} data-tint={s.kind}>{s.text}</mark>
    : <span key={i}>{s.text}</span>))
  return (
    <div ref={ref} aria-hidden="true" data-quick-add-tints
      className={`ui-input pointer-events-none absolute inset-0 overflow-hidden whitespace-pre border-transparent bg-transparent px-1 text-transparent shadow-none dark:bg-transparent ${className}`}>
      {parts}
    </div>
  )
})
