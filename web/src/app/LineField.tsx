// A one-row field that wraps a long title instead of scrolling it sideways (GitHub issue
// 1549): "Add subtask" under a task, and the list's add lines ("Add a subtask", "Add task
// below"). As in quick add's line (quick-add-notes D1), a hidden copy of the text in the
// same grid cell sets the height, up to five lines, then the field scrolls. Enter submits
// the form, as the one-line input did, and a line break never reaches the title, as in
// TitleField's multiline mode.
import type { Ref, TextareaHTMLAttributes } from 'react'
import { composingEnter } from '../lib/composeKey'

export function LineField({ value, onValue, className = '', onKeyDown, ref, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'rows'> & {
  value: string
  onValue: (value: string) => void
  ref?: Ref<HTMLTextAreaElement>
}) {
  return (
    <span className="grid min-w-0 flex-1 grid-cols-1 *:col-start-1 *:row-start-1">
      {/* The copy takes the field's classes, so it wraps the same text at the same width; index.css gives it the field's text size on a touch screen.
          Empty, it holds the placeholder, so a hint that wraps on a phone is shown whole, not cut off (issue 1980). */}
      <span aria-hidden="true" data-line-field-copy className={`invisible line-clamp-5 whitespace-pre-wrap break-words ${className}`}>{value || rest.placeholder}{'​'}</span>
      <textarea
        {...rest}
        ref={ref}
        rows={1}
        value={value}
        className={`resize-none ${className}`}
        onChange={(e) => onValue(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={(e) => {
          onKeyDown?.(e)
          if (e.defaultPrevented || e.key !== 'Enter' || composingEnter(e)) return
          e.preventDefault()
          e.currentTarget.form?.requestSubmit()
        }}
      />
    </span>
  )
}
