// Amending a proposal (OpenSpec change assistant-proposal-editing): what a turn
// changed in the open proposal it sent back (D3), and the edit that moves an item
// to another day in the calendar shape (D1). Apart from assistantShape so the
// first load does not carry it: the assistant panel and the shapes load it.
import { sameValue, type Review, type ReviewItem } from './assistant'
import { editableFields, placedDate, validDate, type EditableField, type ItemEdits } from './assistantShape'
import { t } from './i18n'

const itemKey = (c: { entity: string; entityId: string }) => `${c.entity}\u0000${c.entityId}`

/**
 * The proposal a turn sent back, as the amended open one (assistant-proposal-editing
 * D3): an item the open proposal did not have is marked added, one whose values
 * differ changed; an unchanged item keeps its checkbox and edited mark; an item the
 * turn dropped is named in a line.
 */
export function amendReview(prior: Review, next: Review): Review {
  const before = new Map(prior.items.map((i) => [itemKey(i.change), i]))
  const items = next.items.map((i): ReviewItem => {
    const old = before.get(itemKey(i.change))
    if (!old) return { ...i, turn: 'added' }
    if (!!old.change.create !== !!i.change.create || !sameValue(old.change.patch, i.change.patch)) return { ...i, turn: 'changed' }
    return { ...i, checked: i.state === 'ok' ? old.checked : false, ...(old.edited ? { edited: true } : {}) }
  })
  const kept = new Set(next.items.map((i) => itemKey(i.change)))
  const removed = prior.items.filter((i) => !kept.has(itemKey(i.change))).map((i) => t('Removed this turn: {title}', { title: i.title }))
  return { items, dropped: [...next.dropped, ...removed] }
}

/** The edit that moves an item to another day in the calendar shape (D1): the date it is placed by, or null when it is already there. */
export function moveEdits(item: Pick<ReviewItem, 'change'>, date: string): ItemEdits | null {
  const p = item.change.patch
  const due = p.due as { date?: unknown } | null | undefined
  const field: EditableField | null = due && validDate(due.date) ? 'due' : validDate(p.start) ? 'start' : validDate(p.deadline) ? 'deadline' : null
  if (!field || !editableFields(item).includes(field) || placedDate(item) === date) return null
  return { [field]: date }
}
