// What follows a task added from a list page's quick add: the `o` insertion's move
// after its anchor (vim-keybindings), the Inbox's note for a task that left it
// (inbox-means-unplaced D5), and the note for a task that landed out of sight
// (add-position D5), or else the offer to move it to another workspace.
import { currentDateTime } from '../../lib/dates'
import { getTask } from '../../lib/liveData'
import { moveTask } from '../../lib/move'
import type { Placement } from '../../lib/ops'
import type { AddedBatch } from '../../lib/pasteTasks'
import { effectiveSection } from '../../lib/sections'
import type { Section } from '../../lib/types'
import { t } from '../../lib/i18n'
import { addedWhere } from '../addedWhere'
import { ACTION_TOAST_MS, showBulkToast } from '../bulk/toastStore'
import { navigate, type Route } from '../router'
import { selectTask } from '../signals'
import { offerMoveToWorkspace } from '../workspaceNav'
import { announceIfOutOfSight } from './announceAdded'

export async function afterListAdd(id: string, c: {
  route: Route
  today: string
  /** The `o` anchor; the next entry follows the new task. */
  insertAfter: { current: string | null }
  sectionMap: () => Map<string, Section>
  /** The list's name for the note, and the placement when the list is in manual order. */
  list: string
  placement?: Placement
  root: ParentNode | null
  select: (id: string) => void
}): Promise<void> {
  const after = c.insertAfter.current
  if (after) {
    // Opened with `o`: place it right after the anchor, as its sibling; the next entry follows it.
    c.insertAfter.current = id
    const anchor = await getTask(after)
    if (anchor) {
      await moveTask(id, {
        parent_id: anchor.parent_id,
        ...(anchor.parent_id === null ? { section_id: effectiveSection(anchor, c.sectionMap()) } : {}),
        at: { after },
      })
    }
  }
  const inbox = c.route.view === 'inbox'
  // A line that scheduled the task took it out of the Inbox: say where it went.
  if (inbox) {
    const created = await getTask(id)
    const where = created ? addedWhere(created, c.today, currentDateTime()) : null
    if (where) {
      showBulkToast(where.label, null, { ttl: ACTION_TOAST_MS, action: { label: t('Open'), run: () => { selectTask.set(id); navigate({ view: where.view }) } } })
      return
    }
  }
  // Not awaited, so the quick add is free for the next line at once.
  void announceIfOutOfSight(id, { list: c.list, placement: c.placement, root: c.root, select: c.select })
    .then((announced) => { if (!announced && inbox) void offerMoveToWorkspace(id) })
}

/**
 * What follows a pasted list added from a list page (paste-to-tasks D3, D5): after an
 * `o` anchor the block moves there in order, then one toast with Undo; in the Inbox
 * it also counts the tasks the lines placed elsewhere, once, never per line.
 */
export async function afterListAddMany(added: AddedBatch, c: {
  route: Route
  today: string
  insertAfter: { current: string | null }
  sectionMap: () => Map<string, Section>
}): Promise<void> {
  let after = c.insertAfter.current
  if (after) {
    const anchor = await getTask(after)
    if (anchor) {
      for (const id of added.ids) {
        await moveTask(id, {
          parent_id: anchor.parent_id,
          ...(anchor.parent_id === null ? { section_id: effectiveSection(anchor, c.sectionMap()) } : {}),
          at: { after },
        })
        after = id
      }
      c.insertAfter.current = after
    }
  }
  let label = added.label
  if (c.route.view === 'inbox') {
    const prefs = currentDateTime()
    let elsewhere = 0
    for (const id of added.ids) {
      const task = await getTask(id)
      if (task && addedWhere(task, c.today, prefs)) elsewhere++
    }
    if (elsewhere > 0) label = t('{n, plural, one {# task added, {k} not in the Inbox} other {# tasks added, {k} not in the Inbox}}', { n: added.ids.length, k: elsewhere })
  }
  showBulkToast(label, added.undoId)
}
