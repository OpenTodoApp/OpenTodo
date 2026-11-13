// Reopen a completed board card into a section (board-completed-column D3).
import { t } from '../../lib/i18n'
import { endOfSection } from '../../lib/sections'
import type { Task } from '../../lib/types'
import { applyBatch } from '../../lib/undo'
import { showUndoToast } from '../bulk/toastStore'
import { withListTransition } from '../motion'

/** Reopen a completed card last among a section's open tasks, in one undoable batch. */
export async function reopenInto(task: Task, sectionId: string | null): Promise<void> {
  const label = t('Task reopened')
  const patch = { completed_at: null, section_id: sectionId, position: await endOfSection(task, sectionId) }
  const entry = await withListTransition(1, () => applyBatch([{ entity: 'task', entityId: task.id, patch }], { source: 'action', label }))
  if (entry) showUndoToast(label, entry.id)
}
