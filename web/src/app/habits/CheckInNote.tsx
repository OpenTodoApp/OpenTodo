// "How did it go?" (OpenSpec change habit-notes, design D2): one quiet line that opens
// in place after a check-in, on the Habits screen, the habit's page and under the
// Today strip. Focus stays where it was; Tab reaches the line. Enter saves the text as
// the day's note in its own batch (Undo keeps the check-in), Escape or leaving the
// line writes nothing. On a touch screen it is "Add a note" first, so a check-in
// stays one tap and the keyboard opens only when asked for.
import { useRef, useState } from 'react'
import { t } from '../../lib/i18n'
import { useResetOnChange } from '../../lib/useResetOnChange'
import { Button, Input, useMediaQuery } from '../../ui'
import { act } from '../actionError'
import { closeNote, usePendingNote } from './checkInNoteStore'
import { showUndoToast } from '../bulk/toastStore'

export function CheckInNote({ seriesId, title, className = '' }: { seriesId: string; title: string; className?: string }) {
  const pending = usePendingNote(seriesId)
  const coarse = useMediaQuery('(pointer: coarse)')
  const [asked, setAsked] = useState(false)
  const [text, setText] = useState('')
  const field = useRef<HTMLInputElement>(null)
  useResetOnChange([pending?.key], () => { setAsked(false); setText('') })
  if (!pending) return null
  const name = t('How did it go? {title}', { title })
  if (coarse && !asked) {
    return (
      <div className={className} data-check-in-note={seriesId}>
        <Button size="sm" variant="ghost" icon="pencil" onClick={() => { setAsked(true); requestAnimationFrame(() => field.current?.focus()) }} data-add-note>
          {t('Add a note')}
        </Button>
      </div>
    )
  }
  return (
    <div className={className} data-check-in-note={seriesId}>
      <Input ref={field} value={text} maxLength={500} placeholder={t('How did it go?')} aria-label={name}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => closeNote()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeNote(); return }
          if (e.key !== 'Enter') return
          e.preventDefault()
          const note = text.trim()
          closeNote()
          if (note) act(noteWithUndo(pending.recordId, note))
        }}
        className="h-8 text-meta" data-note-line />
    </div>
  )
}

/** Save a day's note with the Undo toast (habit-notes D2): its own batch, so Undo keeps the check-in. */
async function noteWithUndo(recordId: string, text: string): Promise<void> {
  const { setDayNote } = await import('../../lib/habitActions')
  const r = await setDayNote(recordId, text)
  if (r?.entry) showUndoToast(r.label, r.entry.id)
}
