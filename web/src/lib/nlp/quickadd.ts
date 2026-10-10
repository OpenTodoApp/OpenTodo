// Glue between parse() and the quick-add input; pure so it can be unit tested.
import type { Due, Priority } from '../types'
import type { Chip, ParseResult } from './parse'
import type { Span } from './tokenize'

/** Only the attributes the line set explicitly; the view fills in the rest. */
export interface QuickAddInput {
  title: string
  due?: Due
  project_id?: string
  labels?: string[]
  priority?: Priority
  estimate_minutes?: number
}

export function toTaskInput(r: ParseResult): QuickAddInput {
  const out: QuickAddInput = { title: r.title }
  if (r.due) out.due = r.due
  if (r.projectId) out.project_id = r.projectId
  if (r.labels.length) out.labels = r.labels
  if (r.priority) out.priority = r.priority
  if (r.estimateMinutes) out.estimate_minutes = r.estimateMinutes
  return out
}

/**
 * Index of the chip Backspace may highlight: the last chip, and only when its text
 * ends the line (ignoring trailing spaces) and the caret is at the very end with no
 * selection. Otherwise -1, and Backspace edits text as usual.
 */
export function chipAtCaret(chips: readonly Chip[], value: string, selStart: number | null, selEnd: number | null): number {
  if (chips.length === 0 || selStart !== value.length || selEnd !== value.length) return -1
  const end = value.trimEnd().length
  let last = -1
  let lastEnd = -1
  chips.forEach((c, i) => {
    const e = Math.max(...c.spans.map((s) => s.end))
    if (e > lastEnd) {
      lastEnd = e
      last = i
    }
  })
  return lastEnd === end ? last : -1
}

/** Add a chip's spans to the dismissed list (deduplicated). */
export function dismissChip(dismissed: readonly Span[], chip: Chip): Span[] {
  const out = [...dismissed]
  for (const s of chip.spans) if (!out.some((d) => d.start === s.start && d.end === s.end && d.text === s.text)) out.push(s)
  return out
}
