// A proposal in its own shape, and edits before it applies (OpenSpec change
// assistant-generative-ui D5, D6). The shape follows what the change set does,
// never the model: a week of new dates is a calendar, a new project an outline,
// places a map, everything else the list. An edit changes a field the proposal
// already sets, with the same checks the field has when typed in the app.
import { reviewChangeSet, type Review, type ReviewItem } from './assistant'
import { addDaysISO } from './dates'

export type ProposalShape = 'list' | 'calendar' | 'outline' | 'map'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const validDate = (v: unknown): v is string => typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v)

/** The day an item is placed on in the calendar shape: its new do-on date, else its start, else its deadline. */
export function placedDate(item: Pick<ReviewItem, 'change'>): string | null {
  const p = item.change.patch
  const due = p.due as { date?: unknown } | null | undefined
  if (due && validDate(due.date)) return due.date
  if (validDate(p.start)) return p.start
  if (validDate(p.deadline)) return p.deadline
  return null
}

/** The span of days the calendar shape shows: from the first placed date to the last. */
export function calendarDays(items: readonly Pick<ReviewItem, 'change'>[]): string[] {
  const dates = items.map(placedDate).filter((d): d is string => !!d).sort()
  if (!dates.length) return []
  const out = [dates[0]]
  while (out[out.length - 1] < dates[dates.length - 1]) out.push(addDaysISO(out[out.length - 1], 1))
  return out
}

/**
 * The shape of a proposal (spec "Reviewable change sets"): an outline when it creates
 * a project; a calendar when every item is a task placed on a date and at least two
 * are, all within 7 consecutive days; a map when every item sets a place and maps
 * are on; otherwise the list.
 */
export function shapeOf(review: Pick<Review, 'items'>, mapsOn: boolean): ProposalShape {
  const items = review.items
  if (!items.length) return 'list'
  if (items.some((i) => i.change.entity === 'project' && i.change.create)) return 'outline'
  if (items.length >= 2 && items.every((i) => i.change.entity === 'task' && placedDate(i))) {
    const days = calendarDays(items)
    if (days.length <= 7) return 'calendar'
  }
  if (mapsOn && items.every((i) => i.change.entity === 'task' && i.change.patch.location)) return 'map'
  return 'list'
}

/** A field an item's proposal sets that can be edited before applying (D6). */
export type EditableField = 'title' | 'due' | 'start' | 'deadline' | 'priority'

/** The fields of an item that can be edited: only ones its proposal already sets. */
export function editableFields(item: Pick<ReviewItem, 'change'>): EditableField[] {
  const { entity, create, patch } = item.change
  if (entity !== 'task' && !(entity === 'project' && create)) return []
  const out: EditableField[] = []
  if (create && (entity === 'project' ? 'name' in patch : 'title' in patch)) out.push('title')
  if (entity === 'task') {
    const due = patch.due as { date?: unknown } | null | undefined
    if (due && validDate(due.date)) out.push('due')
    if (validDate(patch.start)) out.push('start')
    if (validDate(patch.deadline)) out.push('deadline')
    if (typeof patch.priority === 'number') out.push('priority')
  }
  return out
}

export const TITLE_MAX = 500

/** Checks an edited value as the field is checked when typed in the app; the error's words, or null. */
export function checkEdit(field: EditableField, value: string): string | null {
  if (field === 'title') return !value.trim() ? 'empty' : value.trim().length > TITLE_MAX ? 'long' : null
  if (field === 'priority') return ['1', '2', '3', '4'].includes(value) ? null : 'priority'
  return validDate(value) ? null : 'date'
}

/** Edited values of one item, by field. */
export type ItemEdits = Partial<Record<EditableField, string>>

/**
 * The review with one item's fields edited: the proposal's values replaced, the item
 * described again and marked edited; its checkbox and state are kept. A field the
 * proposal does not set, or a value that fails its check, leaves the review as it was.
 */
export async function editReviewItem(review: Review, index: number, edits: ItemEdits): Promise<Review> {
  const item = review.items[index]
  const fields = Object.keys(edits) as EditableField[]
  if (!item || !fields.length || fields.some((f) => !editableFields(item).includes(f) || checkEdit(f, edits[f]!))) return review
  const patch = { ...item.change.patch }
  for (const field of fields) {
    const value = edits[field]!
    if (field === 'title') patch[item.change.entity === 'project' ? 'name' : 'title'] = value.trim()
    else if (field === 'priority') patch.priority = Number(value)
    else if (field === 'due') patch.due = { ...(patch.due as Record<string, unknown>), date: value }
    else patch[field] = value
  }
  const change = { ...item.change, patch }
  // Described within the whole set, so names from the other items (a new project) still read.
  const key = (c: { entity: string; entityId: string }) => `${c.entity}\u0000${c.entityId}`
  const described = (await reviewChangeSet(review.items.map((it, i) => (i === index ? change : it.change)))).items.find((it) => key(it.change) === key(change))
  const next: ReviewItem = { ...item, change, title: described?.title ?? item.title, lines: described?.lines ?? item.lines, edited: true }
  return { ...review, items: review.items.map((it, i) => (i === index ? next : it)) }
}
