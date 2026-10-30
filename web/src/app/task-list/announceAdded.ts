// A new task out of sight is announced (OpenSpec change add-position, design D5):
// after an add from a list page's quick add or a section's add row, when the new
// row is not inside the visible part of the scroll area, a toast says where it went
// with Show, which selects the task (the list scrolls a selected row into view).
import { t } from '../../lib/i18n'
import type { Placement } from '../../lib/ops'
import { ACTION_TOAST_MS, showBulkToast } from '../bulk/toastStore'
import { pinnedBottom, scrollParent } from './revealRow'

/** Whether `row` is fully inside the visible part of its scroller, below whatever is pinned at the top. */
export function rowInSight(row: HTMLElement): boolean {
  const scroller = scrollParent(row)
  const r = row.getBoundingClientRect()
  const top = scroller ? pinnedBottom(scroller, row) : 0
  const bottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight
  return r.top >= top - 1 && r.bottom <= bottom + 1
}

/** The rendered row of a task, waiting a few frames for the list to show it; null when it never appears here. */
async function renderedRow(id: string, root: ParentNode, frames = 12): Promise<HTMLElement | null> {
  const selector = `li[data-task-id="${CSS.escape(id)}"], [data-task-id="${CSS.escape(id)}"]`
  for (let i = 0; i < frames; i++) {
    const row = root.querySelector<HTMLElement>(selector)
    if (row) return row
    await new Promise<void>((done) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => done()) : setTimeout(done, 16)))
  }
  return null
}

/**
 * Shows "Added to the bottom/top of {list}" (manual lists) or "Added to {name}" (lists
 * with their own sort) with Show when the new row is out of sight. Returns whether it
 * announced, so a caller's other note can take its turn otherwise.
 */
export async function announceIfOutOfSight(id: string, opts: {
  list: string
  /** The placement used; undefined when the list sorts by its own rule. */
  placement?: Placement
  root?: ParentNode | null
  select: (id: string) => void
  inSight?: (row: HTMLElement) => boolean
}): Promise<boolean> {
  const row = await renderedRow(id, opts.root ?? document)
  if (!row || (opts.inSight ?? rowInSight)(row)) return false
  const label = opts.placement === 'top' ? t('Added to the top of {list}', { list: opts.list })
    : opts.placement === 'bottom' ? t('Added to the bottom of {list}', { list: opts.list })
    : t('Added to {name}', { name: opts.list })
  showBulkToast(label, null, { ttl: ACTION_TOAST_MS, action: { label: t('Show'), run: () => opts.select(id) } })
  return true
}
