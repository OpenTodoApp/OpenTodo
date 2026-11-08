// The notes field under quick add's line (OpenSpec change quick-add-notes, design D2):
// opened by Shift+Enter in the line or the sheet's Notes tool, saved as the task's
// notes with the task. Enter adds the task from here too, Shift+Enter is a line break,
// and Backspace in the empty field closes it and returns to the end of the line. A
// hidden copy of the text in the same grid cell sizes it, up to six lines.
import { forwardRef, type RefObject, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { composingEnter } from '../../lib/composeKey'
import { t } from '../../lib/i18n'

/**
 * The notes field's state: null while closed. Opening and closing move the caret inside
 * the key press or tap that asked for it, so a phone keeps its keyboard up.
 */
export function useNotesField(line: RefObject<HTMLTextAreaElement | null>) {
  const [notes, setNotes] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const open = () => {
    flushSync(() => setNotes((n) => n ?? ''))
    ref.current?.focus()
  }
  const close = () => {
    flushSync(() => setNotes(null))
    const el = line.current
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) }
  }
  return { notes, setNotes, ref, open, close }
}

export const NotesLine = forwardRef<HTMLTextAreaElement, {
  value: string
  onChange: (value: string) => void
  /** Closes the empty field; the caret goes back to the line. */
  onClose: () => void
  className?: string
  /** The line's text size, so both fields read at one step. */
  size?: string
}>(function NotesLine({ value, onChange, onClose, className = '', size = '' }, ref) {
  const box = `ui-input border-transparent bg-transparent px-1 py-0.5 shadow-none dark:bg-transparent ${size}`
  return (
    <div className={className}>
      <span className="quick-add-grid" data-quick-add-notes>
        <span aria-hidden="true" className={`quick-add-notes-sizer invisible ${box}`}>{value}{'​'}</span>
        <textarea ref={ref} rows={1} value={value} aria-label={t('Notes')} placeholder={t('Notes')}
          className={`quick-add-notes ${box} text-muted focus:border-transparent focus:ring-0`}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (composingEnter(e)) return
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            } else if (e.key === 'Backspace' && value === '') {
              e.preventDefault()
              onClose()
            } else if (e.key === 'Escape') e.currentTarget.blur()
          }} />
      </span>
    </div>
  )
})
