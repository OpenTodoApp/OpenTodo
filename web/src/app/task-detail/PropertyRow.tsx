// One field of the task panel's properties card (OpenSpec task-detail-redesign, D1):
// the value reads as text, and activating it (click, Enter or Space) swaps in the
// editor. Escape, or a committed edit, closes the editor and puts focus back on the
// value. Rows whose control is the value itself (priority, reminders) pass `control`.
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Icon, type IconName } from '../../ui/Icon'

const FOCUSABLE = 'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface PropertyRowProps {
  icon: IconName
  label: string
  /** Read mode: the current value as text (ignored when `control` is given). */
  value?: ReactNode
  /** The value is empty: `placeholder` is shown quietly instead. */
  empty?: boolean
  placeholder?: string
  /** Viewer mode: the value is plain text, never an editor. */
  readOnly?: boolean
  /** Edit mode; call `close()` after a committed edit. */
  editor?: (close: () => void) => ReactNode
  /** Always-visible control instead of read and edit modes. */
  control?: ReactNode
  /** Controlled edit mode (e.g. the `e` shortcut opens the estimate). */
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
  /** Read mode: a control beside the value button (the due row's zone chip). */
  aside?: ReactNode
  /** Helper text under the value. */
  note?: ReactNode
  testId?: string
}

export function PropertyRow({ icon, label, value, empty, placeholder, readOnly, editor, control, editing: editingProp, onEditingChange, aside, note, testId }: PropertyRowProps) {
  const id = useId()
  const labelId = `${id}-label`
  const valueId = `${id}-value`
  const [own, setOwn] = useState(false)
  const editing = !readOnly && !!editor && (editingProp ?? own)
  const setEditing = (v: boolean) => { if (editingProp === undefined) setOwn(v); onEditingChange?.(v) }
  const button = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const returnFocus = useRef(false)

  // Focus moves into the editor when it opens (unless the editor focused itself),
  // and back to the value when it closes from the keyboard or a commit.
  useEffect(() => {
    if (editing) {
      const el = box.current
      if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    } else if (returnFocus.current) {
      returnFocus.current = false
      button.current?.focus()
    }
  }, [editing])

  const close = () => {
    returnFocus.current = true
    setEditing(false)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    e.preventDefault()
    e.stopPropagation()
    close()
  }
  // Leaving the editor for somewhere else on the page closes it; its own popovers do not.
  const onBlur = (e: FocusEvent) => {
    const next = e.relatedTarget as HTMLElement | null
    if (!next || box.current?.contains(next) || next.closest('[data-overlay]')) return
    setEditing(false)
  }

  const shown = empty ? <span className="text-faint">{placeholder}</span> : value
  let body: ReactNode
  if (control !== undefined) body = control
  else if (editing) body = <div ref={box} onKeyDown={onKeyDown} onBlur={onBlur} className="min-w-0">{editor!(close)}</div>
  else if (readOnly || !editor) body = <div id={valueId} className="min-w-0 px-2 py-1.5 text-sm text-default">{shown}</div>
  else {
    body = (
      <button ref={button} type="button" id={valueId} aria-labelledby={`${labelId} ${valueId}`}
        className="flex min-h-9 w-full min-w-0 items-center rounded-control px-2 py-1.5 text-left text-sm text-default hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus dark:hover:bg-raised"
        onClick={() => setEditing(true)}>
        <span className="min-w-0 flex-1 break-words">{shown}</span>
      </button>
    )
  }
  if (aside && !editing && control === undefined) body = <div className="flex min-w-0 flex-wrap items-center gap-1"><div className="min-w-40 flex-1">{body}</div>{aside}</div>
  return (
    <div role="group" aria-labelledby={labelId} data-property={testId} className="grid gap-1 py-1 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-start sm:gap-3">
      <span id={labelId} className="flex items-center gap-2 pt-1.5 text-meta text-muted sm:min-h-9 sm:pt-0">
        <Icon name={icon} className="text-faint" />{label}
      </span>
      <div className="min-w-0">
        {body}
        {note && <p className="mt-1 px-2 text-meta text-faint">{note}</p>}
      </div>
    </div>
  )
}
