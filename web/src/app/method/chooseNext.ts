// Choosing an open task as a project's next action (OpenSpec change choose-next-action):
// the undoable write with its toast, and what a choice's row says it changes.
import { formatDate } from '../../lib/dates'
import { t } from '../../lib/i18n'
import type { NextChoice } from '../../lib/method/rules'
import { chooseNextActionUndoable } from '../../lib/undoActions'
import { showUndoToast } from '../bulk/toastStore'

/** Makes the choice the project's next action in one undoable edit, with "Next action for {name}" and Undo. */
export async function chooseNextAction(choice: NextChoice, projectName: string): Promise<void> {
  const { entry, label } = await chooseNextActionUndoable(choice, t('Next action for {name}', { name: projectName }))
  if (entry) showUndoToast(label, entry.id)
}

/** What choosing it changes: the start it leaves (Someday, "Starts …") and the section it moves into. */
export function choiceHint(choice: NextChoice): string | null {
  const parts: string[] = []
  if (choice.clearStart) parts.push(choice.clearStart === 'someday' ? t('Someday') : t('Starts {date}', { date: formatDate(choice.clearStart, 'compact') }))
  if (choice.toSection !== null) parts.push(choice.toSection || t('No section'))
  return parts.length ? parts.join(' · ') : null
}
