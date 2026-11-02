// Quick add in a reusable list (OpenSpec reusable-lists, design D3): an item that
// is already in the list is reopened or pointed at instead of added twice, with a
// four-second toast that says which and offers Add anyway. Loaded lazily by
// app/reuseAdd.ts, only when the add goes to a reusable list.
import { placeInAisle, reopenItem, reopenItems, reuseMatchFor } from '../lib/reuseAdd'
import type { NewTaskInput } from '../lib/ops'
import type { Task } from '../lib/types'
import { t } from '../lib/i18n'
import { showBulkToast } from './bulk/toastStore'
import { act } from './actionError'
import { revealRow } from './task-list/revealRow'

/** How long the toast stays (D3). */
export const REUSE_TOAST_MS = 4_000

/** Scrolls an open item into view and flashes it once (none under reduced motion). */
export function flashRow(id: string): void {
  requestAnimationFrame(() => {
    const row = document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id)}"]`)
    if (!row) return
    revealRow(row)
    row.setAttribute('data-reuse-flash', '')
    if (typeof row.animate === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      row.animate([{ backgroundColor: 'var(--ot-accent-soft)' }, { backgroundColor: 'transparent' }], { duration: 1200, easing: 'ease-out' })
    }
    setTimeout(() => row.removeAttribute('data-reuse-flash'), 1200)
  })
}

/**
 * Adds one item: reopens or points at a match in a reusable list, else creates
 * it (sorted into its aisle section when the list sorts into aisles). Returns
 * the id of the item that is now on the list.
 */
export async function addToList<T extends NewTaskInput>(input: T, create: (input: T) => Promise<string>): Promise<string> {
  const match = await reuseMatchFor(input)
  if (!match) return create(await placeInAisle(input))
  const anyway = { label: t('Add anyway'), run: () => { act(create(input)) } }
  const title = match.task.title
  if (match.state === 'open') {
    flashRow(match.task.id)
    showBulkToast(t('{title} is already on the list', { title }), null, { ttl: REUSE_TOAST_MS, action: anyway })
  } else {
    const entry = await reopenItem(match.task, input)
    showBulkToast(t('{title} is back on the list', { title }), entry?.id ?? null, { ttl: REUSE_TOAST_MS, action: anyway })
  }
  return match.task.id
}

/**
 * A pasted list (paste-to-tasks): each line follows the rule on its own; the
 * reopened items are one undoable batch, the new ones are created together, and
 * a summary toast counts the three kinds when anything was reused.
 */
export async function addManyToList<T extends NewTaskInput>(inputs: readonly T[], createMany: (inputs: T[]) => Promise<unknown>): Promise<void> {
  const fresh: T[] = []
  const reopen = new Map<string, Task>()
  const open = new Set<string>()
  for (const input of inputs) {
    const match = await reuseMatchFor(input)
    if (!match) fresh.push(await placeInAisle(input))
    else if (match.state === 'open') open.add(match.task.id)
    else reopen.set(match.task.id, match.task)
  }
  if (!reopen.size && !open.size) {
    await createMany(fresh)
    return
  }
  const entry = await reopenItems([...reopen.values()])
  if (fresh.length) await createMany(fresh)
  showBulkToast(t('{reopened, plural, one {# back on the list} other {# back on the list}}, {open, plural, one {# already there} other {# already there}}, {added, plural, one {# added} other {# added}}', {
    reopened: reopen.size, open: open.size, added: fresh.length,
  }), entry?.id ?? null, { ttl: REUSE_TOAST_MS })
}
