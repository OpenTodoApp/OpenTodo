// What follows a task added from a list page's quick add: the `o` insertion's move
// after its anchor (vim-keybindings), the Inbox's note for a task that left it
// (inbox-means-unplaced D5), and the note for a task that landed out of sight
// (add-position D5), or else the offer to move it to another workspace.
import { currentDateTime } from '../../lib/dates'
import { getTask } from '../../lib/liveData'
import { moveTask } from '../../lib/move'
import type { Placement } from '../../lib/ops'
import type { AddedBatch } from '../../lib/pasteTasks'
import { effectiveSection, projectSections } from '../../lib/sections'
import type { Section, Task } from '../../lib/types'
import { t } from '../../lib/i18n'
import { addedWhere } from '../addedWhere'
import { isInboxTask } from '../../lib/inbox'
import { ACTION_TOAST_MS, showBulkToast } from '../bulk/toastStore'
import { navigate, type Route } from '../router'
import { selectTask } from '../signals'
import { offerMoveToWorkspace } from '../workspaceNav'

/**
 * The section of an `o` anchor: from the list's sections, or from its own project's when it is
 * a task of an open sub-project (subproject-inline), whose sections the list does not hold.
 */
async function anchorSection(anchor: Task, sections: Map<string, Section>): Promise<string | null> {
  if (anchor.section_id && !sections.has(anchor.section_id) && anchor.project_id) {
    sections = new Map((await projectSections(anchor.project_id)).map((x) => [x.id, x]))
  }
  return effectiveSection(anchor, sections)
}

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
        ...(anchor.parent_id === null ? { section_id: await anchorSection(anchor, c.sectionMap()) } : {}),
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
  // Loaded with the first add: not needed on first load (web/bundle-budget.json).
  void import('./announceAdded').then((m) => m.announceIfOutOfSight(id, { list: c.list, placement: c.placement, root: c.root, select: c.select }))
    .catch(() => false) // offline before it was cached: no announcement
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
      const section = anchor.parent_id === null ? await anchorSection(anchor, c.sectionMap()) : null
      for (const id of added.ids) {
        await moveTask(id, { parent_id: anchor.parent_id, ...(anchor.parent_id === null ? { section_id: section } : {}), at: { after } })
        after = id
      }
      c.insertAfter.current = after
    }
  }
  let label = added.label
  if (c.route.view === 'inbox') {
    // Every task the Inbox does not list went elsewhere: a date or a project (quick-add docs).
    let elsewhere = 0
    for (const id of added.ids) {
      const task = await getTask(id)
      if (task && !isInboxTask(task)) elsewhere++
    }
    if (elsewhere > 0) label = t('{n, plural, one {# task added, {k} not in the Inbox} other {# tasks added, {k} not in the Inbox}}', { n: added.ids.length, k: elsewhere })
  }
  showBulkToast(label, added.undoId)
}
