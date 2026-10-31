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

/**
 * How long the list may take to show a new row before the announcement is dropped.
 * A time, not a number of frames: the write, the live query and the render take a
 * varying number of frames (about seven on a fast machine), more on a busy one.
 */
export const ROW_WAIT_MS = 3000

/** The rendered row of a task, as soon as the list shows it; null when it does not appear here within `timeout` ms. */
function renderedRow(id: string, root: ParentNode, timeout = ROW_WAIT_MS): Promise<HTMLElement | null> {
  const selector = `li[data-task-id="${CSS.escape(id)}"], [data-task-id="${CSS.escape(id)}"]`
  const found = root.querySelector<HTMLElement>(selector)
  if (found) return Promise.resolve(found)
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const row = root.querySelector<HTMLElement>(selector)
      if (row) finish(row)
    })
    const timer = setTimeout(() => finish(root.querySelector<HTMLElement>(selector)), timeout)
    function finish(row: HTMLElement | null) {
      observer.disconnect()
      clearTimeout(timer)
      resolve(row)
    }
    observer.observe(root as Node, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-task-id'] })
  })
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
  /** How long to wait for the row to show (ms). */
  wait?: number
}): Promise<boolean> {
  const row = await renderedRow(id, opts.root ?? document, opts.wait)
  if (!row || (opts.inSight ?? rowInSight)(row)) return false
  const label = opts.placement === 'top' ? t('Added to the top of {list}', { list: opts.list })
    : opts.placement === 'bottom' ? t('Added to the bottom of {list}', { list: opts.list })
    : t('Added to {name}', { name: opts.list })
  showBulkToast(label, null, { ttl: ACTION_TOAST_MS, action: { label: t('Show'), run: () => opts.select(id) } })
  return true
}
