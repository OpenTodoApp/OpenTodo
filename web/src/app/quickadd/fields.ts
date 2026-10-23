// The quick-add palette's field rows (OpenSpec change palette-quick-add, design D2):
// a view of the parsed line, never a second model. When, Project, Label, Priority and
// Estimate are always listed; the other attributes only when the line sets them. A
// row edits through the line: its words are selected, or its token is started.
import type { Chip } from '../../lib/nlp'
import type { IconName } from '../../ui'

/** The field a row stands for. */
export type FieldKind = 'when' | 'project' | 'label' | 'priority' | 'estimate' | 'deadline' | 'recurrence' | 'reminder' | 'spent'

export interface FieldRow {
  kind: FieldKind
  /** The chip that sets it; none for an unset row. */
  chip?: Chip
  /** That chip's index among the line's chips (the Backspace highlight uses it). */
  chipIndex?: number
}

/** The token that sets a field, typed at the end of the line; '' for words (dates). */
export const FIELD_TOKEN: Partial<Record<FieldKind, string>> = { project: '#', label: '@', priority: 'p', estimate: '+' }

export const FIELD_ICON: Record<FieldKind, IconName> = {
  when: 'calendar-days', project: 'folder', label: 'tag', priority: 'flag', estimate: 'clock',
  deadline: 'hourglass', recurrence: 'repeat', reminder: 'bell', spent: 'timer',
}

const BASE: FieldKind[] = ['when', 'project', 'label', 'priority', 'estimate']
const EXTRA: FieldKind[] = ['deadline', 'recurrence', 'reminder', 'spent']

/** The row a chip belongs to: due, someday and evening are all "When". */
export function fieldOf(kind: Chip['kind']): FieldKind {
  return kind === 'due' || kind === 'someday' || kind === 'evening' ? 'when' : kind
}

/** The rows, in order: each base field once (one row per label), then the set extras. */
export function fieldRows(chips: readonly Chip[]): FieldRow[] {
  const of = (k: FieldKind) => chips.flatMap((chip, chipIndex) => (fieldOf(chip.kind) === k ? [{ kind: k, chip, chipIndex }] : []))
  return [
    ...BASE.flatMap((k): FieldRow[] => {
      const set = of(k)
      return set.length ? set : [{ kind: k }]
    }),
    ...EXTRA.flatMap(of),
  ]
}

/** The line with a field's token started at its end, after one space, and the caret there. */
export function startToken(value: string, kind: FieldKind): { value: string; caret: number } {
  const head = value.replace(/\s+$/, '')
  const next = `${head}${head ? ' ' : ''}${FIELD_TOKEN[kind] ?? ''}`
  return { value: next, caret: next.length }
}

/** The span of the line a chip came from, from its first word to its last. */
export function chipRange(chip: Chip): { start: number; end: number } {
  return { start: Math.min(...chip.spans.map((s) => s.start)), end: Math.max(...chip.spans.map((s) => s.end)) }
}

/** A project's colour when the caller passed full project rows (the parser needs only names). */
export function projectColor(p: { id: string } | undefined): string | undefined {
  return (p as { color?: string | null } | undefined)?.color ?? undefined
}
