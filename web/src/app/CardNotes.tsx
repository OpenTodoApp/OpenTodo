// The notes preview on a board card (OpenSpec change board-polish, design D6, D7):
// two lines of the task's notes as plain text, between the title and the property
// row, at the metadata size in the muted tone. Read from the decrypted local
// `description`, so it works offline and on encrypted accounts; notes this device
// cannot decrypt show nothing, never ciphertext. Loaded with the first preview.
import { t } from '../lib/i18n'
import { cardNotesPreview } from '../lib/notesPreview'
import type { Task } from '../lib/types'

export default function CardNotes({ task }: { task: Pick<Task, 'id' | 'description' | '_e2ee'> }) {
  if (task._e2ee?.raw?.description) return null
  const text = cardNotesPreview(task.id, task.description)
  if (!text) return null
  return (
    <span className="user-text mt-0.5 line-clamp-2 text-meta text-muted" data-card-notes>
      <span className="sr-only">{t('Notes:')} </span>{text}
    </span>
  )
}
