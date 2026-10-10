// Glue between parse() and the quick-add input; pure so it can be unit tested.
import type { Due, Priority } from '../types'
import type { Chip, ParseResult } from './parse'
import type { Span } from './tokenize'

/** Only the attributes the line set explicitly; the view fills in the rest. */
export interface QuickAddInput {
  title: string
  due?: Due
  project_id?: string
  /** Label ids (never names). */
  labels?: string[]
  priority?: Priority
  estimate_minutes?: number
}

/** The slice of a label the resolver needs. */
export interface LabelRef {
  id: string
  name: string
  color?: string
  position?: number
  created_at?: number
  deleted_at?: number | null
}

/** Same key as `labelKey` in lib/labels.ts: names are unique ignoring case and surrounding space. */
export function labelNameKey(name: string): string {
  return name.trim().toLocaleLowerCase()
}

/**
 * The existing, non-deleted label a typed `@name` refers to, ignoring case. If sync
 * produced two labels with the same name, the first in sidebar order (position,
 * created_at, id) wins, so every device resolves the same id.
 */
export function findLabel(name: string, labels: readonly LabelRef[]): LabelRef | undefined {
  const key = labelNameKey(name)
  if (!key) return undefined
  let best: LabelRef | undefined
  for (const l of labels) {
    if (l.deleted_at || labelNameKey(l.name) !== key) continue
    if (!best || compareLabels(l, best) < 0) best = l
  }
  return best
}

function compareLabels(a: LabelRef, b: LabelRef): number {
  return (a.position ?? 0) - (b.position ?? 0) || (a.created_at ?? 0) - (b.created_at ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/**
 * Turn a parse into `createTask` input. Each typed `@name` becomes the id of the
 * existing label with that name (ignoring case); a name with no label is created
 * once through `createLabel` (the picker's helper, so it syncs and gets a palette
 * colour). Ids keep the order typed, without duplicates.
 */
export async function toTaskInput(
  r: ParseResult,
  deps: { labels: readonly LabelRef[]; createLabel: (name: string) => Promise<string> },
): Promise<QuickAddInput> {
  const out: QuickAddInput = { title: r.title }
  if (r.due) out.due = r.due
  if (r.projectId) out.project_id = r.projectId
  if (r.labels.length) {
    const ids: string[] = []
    const created = new Map<string, string>()
    for (const name of r.labels) {
      const key = labelNameKey(name)
      if (!key) continue
      let id = findLabel(name, deps.labels)?.id ?? created.get(key)
      if (!id) {
        id = await deps.createLabel(name.trim())
        created.set(key, id)
      }
      if (!ids.includes(id)) ids.push(id)
    }
    if (ids.length) out.labels = ids
  }
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
